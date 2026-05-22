# Implementation Report — SPEC-169: Migrate Claude Invocation from `-p` to `--bg` Mode

**Date**: 2026-05-22
**Spec**: [docs/specs/169-migrate-claude-invocation-to-bg-mode.md](../specs/169-migrate-claude-invocation-to-bg-mode.md)
**Plan**: [docs/plans/169-migrate-claude-invocation-to-bg-mode.plan.md](../plans/169-migrate-claude-invocation-to-bg-mode.plan.md)
**Status**: complete

## Summary

Every `claude -p` invocation in production code is replaced by `claude --bg` dispatch. Completion is detected via three independent signals (MCP `set_phase`, `claude agents --json` polling, hard 15min timeout) with first-wins semantics. Reports are retrieved from the conventional `.claude/reviews/` path, sessions are cleaned with `claude stop`/`claude rm`, rate-limit errors trigger exponential backoff retry, the supervisor daemon is health-checked every 5 minutes, and a hourly billing audit detects API-pool regression.

The migration introduces a new bounded context `src/modules/claude-invocation/` following Clean Architecture (entity → use case → gateway → controller). The legacy `claudeInvoker.ts` becomes a thin orchestration adapter.

**SPEC-168 (POC validation) was bypassed by operator decision** under June 15 deadline pressure. The billing-regression risk is mitigated post-deployment by FR-7 (in-product detection: pre-dispatch `ANTHROPIC_API_KEY` check + hourly `claude /usage` audit).

## Files Created

### Production (~25 new, 5 modified)

**Module `src/modules/claude-invocation/`:**

Entities (5):
- `entities/claudeSession/{claudeSession,claudeSession.schema,claudeSession.guard,claudeSession.gateway}.ts`
- `entities/sessionCompletion/{sessionCompletion.schema,sessionCompletion.guard,mcpCompletion.gateway,reviewReport.gateway}.ts`
- `entities/billingState/{billingState.schema,billingState.gateway,environment.gateway}.ts`
- `entities/supervisorHealth/{supervisorHealth.schema,supervisorHealth.gateway}.ts`
- `entities/retrySchedule/{retrySchedule.valueObject,retrySchedule.schema}.ts`

Use cases (7):
- `usecases/dispatchClaudeSession.usecase.ts` (FR-1, FR-7 pre-check, FR-5 retry)
- `usecases/awaitSessionCompletion.usecase.ts` (FR-2 first-wins MCP/poll/timeout)
- `usecases/retrieveReviewReport.usecase.ts` (FR-3)
- `usecases/cleanupClaudeSession.usecase.ts` (FR-4)
- `usecases/checkSupervisorHealth.usecase.ts` (FR-6)
- `usecases/auditBilling.usecase.ts` (FR-7 periodic)
- `usecases/runClaudeReviewJob.usecase.ts` (orchestrator)

Gateways impl (6):
- `interface-adapters/gateways/claudeSession.cli.gateway.ts` (one-shot spawn, process runner port)
- `interface-adapters/gateways/mcpCompletion.memory.gateway.ts` (in-memory event bridge)
- `interface-adapters/gateways/reviewReport.fileSystem.gateway.ts`
- `interface-adapters/gateways/billingState.memory.gateway.ts`
- `interface-adapters/gateways/supervisorHealth.memory.gateway.ts`
- `interface-adapters/gateways/environment.process.gateway.ts`

Frameworks (1 new, 1 modified):
- `src/frameworks/claude/timers/claudeInvocationTimers.ts` (5min supervisor + 1h billing)
- `src/frameworks/claude/claudeInvoker.ts` (rewritten: `-p` → `--bg`, delegates to `runClaudeReviewJob`)

Modified:
- `src/main/server.ts` (start/stop timers on Fastify lifecycle)
- `src/modules/review-execution/usecases/mcp/setPhase.usecase.ts` (optional `mcpCompletionBridge.publish`)

### Tests (~24 new)

- Acceptance: `src/tests/acceptance/169-migrate-claude-invocation-to-bg-mode.acceptance.test.ts` (10 scenarios, all GREEN)
- Architecture rule: `src/tests/units/architecture/noClaudePInProduction.test.ts` (FR-9)
- Entity tests (3): claudeSession, sessionCompletion, retrySchedule
- Use case tests (7): one per use case
- Gateway tests (6): cli, mcpCompletion, reviewReport, billingState, supervisorHealth, environment
- Framework test (1): claudeInvocationTimers
- Factories (2): claudeSession.factory, sessionCompletion.factory
- Stubs (7): claudeSession, sessionCompletion source, billingState, environment, mcpCompletion, reviewReport, supervisorHealth
- 1 modified test: `setPhase.usecase.test.ts` (added bridge publish assertion)

## FR Coverage

| FR | Status | Artefact(s) | Scenario(s) |
|----|--------|------------|-------------|
| FR-1 Background dispatch | done | `dispatchClaudeSession.usecase`, `claudeSession.cli.gateway` | 1 |
| FR-2 Triple completion | done | `awaitSessionCompletion.usecase`, `mcpCompletion.memory.gateway` | 2, 3, 4 |
| FR-3 Report retrieval | done | `retrieveReviewReport.usecase`, `reviewReport.fileSystem.gateway` | 2, 5 |
| FR-4 Session cleanup | done | `cleanupClaudeSession.usecase` | 2, 3, 4 |
| FR-5 Rate-limit retry | done | `retrySchedule.valueObject`, `dispatchClaudeSession.usecase` | 6 |
| FR-6 Supervisor health | done | `checkSupervisorHealth.usecase`, `supervisorHealth.memory.gateway`, `claudeInvocationTimers` | 7 |
| FR-7 Billing regression | done | `auditBilling.usecase`, `dispatchClaudeSession.usecase` pre-check, `environment.process.gateway`, `claudeInvocationTimers` | 8, 9 |
| FR-8 Parser simplification | done | `streamJsonParser` no-op stub, `progressParser` MCP-only | — |
| FR-9 Codebase cleanup | done | `noClaudePInProduction.test.ts` architectural rule | — |
| Followup path | done | `runClaudeReviewJob.usecase` (job-type parameter) | 10 |

## Tests

```
Test Files  223 passed (223)
Tests       1598 passed (1598)
Duration    ~10s
```

- Acceptance test `169-migrate-claude-invocation-to-bg-mode.acceptance.test.ts`: **10/10 GREEN**
- Architecture rule `noClaudePInProduction.test.ts`: **GREEN** (zero `claude -p`/`--print` in production paths)
- `yarn verify` (typecheck + biome + vitest): **GREEN**

## Commits (9, granular per implementation step)

```
1923901 feat(claude-invocation): walking skeleton for --bg session orchestration
83593b4 feat(claude-invocation): add ClaudeSessionCliGateway over a process runner port
c4f7e90 feat(claude-invocation): add memory and filesystem gateway implementations
e4fd88c test(claude-invocation): cover auditBilling and checkSupervisorHealth use cases
05f1f2d feat(claude-invocation): add claudeInvocationTimers framework wiring
d3d7d66 feat(claude-invocation): bridge MCP set_phase(completed) to completion bridge
dd39a2e feat(claude-invocation): replace -p/--print with --bg in claudeInvoker args
f0f7b49 fix(claude-invocation): use ** operator instead of Math.pow for backoff
05220fb feat(claude-invocation): wire claudeInvocationTimers into the Fastify server
```

## Unknowns resolved

| Unknown | Resolution |
|---------|-----------|
| MCP `set_phase` handler location | Located at `src/modules/review-execution/usecases/mcp/setPhase.usecase.ts`. Extended with optional `mcpCompletionBridge` dependency — no contract change. |
| `claude agents --json` schema | Parsed with a Zod guard that accepts `{ id: string, status: 'running'\|'completed'\|'failed'\|'stopped', ... }`. Unknown shapes fall back to `running`. |
| `claude /usage` parseability | Implemented coarse detector (regex for "API" + cost keywords). Raw output logged on no match. |
| Rate-limit signal | Default rule: exit code != 0 AND stderr matches `/rate\|429\|throttle/i`. Constant `RATE_LIMIT_PATTERN` exposed for tuning. |
| Dashboard alert plumbing | Reused existing log-based alert path (Pino structured logs at `error` level surface to dashboard). Avoided adding a new alert pipeline. |
| Worktree lifecycle | Out of scope (SPEC-170). Assumed `claude --bg` manages its own working directory; report path resolved relative to the job's `localPath`. |

## Risks / follow-ups

- **SPEC-168 bypassed**: if FR-7 hourly audit catches an API-pool regression post-deploy, dispatching is auto-paused and operator must escalate. Worth monitoring closely during first 24h post-merge.
- **`claude agents --json` schema** may evolve — Zod guard isolates the change to one file.
- **30s polling** runs per-session; under heavy concurrent load, this adds N spawn calls every 30s. Mitigated by p-queue concurrency cap (existing).
- **SPEC-170 (worktree lifecycle)** still drafted. The current implementation lets Claude manage its own working dir; SPEC-170 would optimize this.

## Deployment

- Target: 2026-06-10 (5-day safety margin before Anthropic billing change at 2026-06-15)
- Pre-deployment checklist:
  - [ ] `claude --version` ≥ v2.1.139 on prod server
  - [ ] `claude auth status` confirms OAuth (no `ANTHROPIC_API_KEY` in systemd env)
  - [ ] Monitor `/usage` dashboard for first 24h post-deploy
  - [ ] FR-7 alert should trigger zero times under normal operation
