---
title: "SPEC-171: Re-enable Token Usage Tracking in --bg Mode"
labels: enhancement, P2-important, observability, claude-invocation
milestone: June 15 Migration
status: IMPLEMENTED
blocked-by: SPEC-169
---

# SPEC-171: Re-enable Token Usage Tracking in --bg Mode

## Status: implemented

Shipped 2026-05-23. See `docs/reports/171-bg-token-usage-tracking.report.md` for the implementation report.

## Implementation

### Artefacts

- **Entity (new)**: `src/modules/token-accounting/entities/modelPricing/modelPricing.ts` — pure function `computeCostUsd(model, tokens)` + hardcoded Anthropic pricing table (refresh on model family bumps).
- **Entity (new)**: `src/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.ts` — `SessionUsageSnapshot` zod schema (carrier type, no logic).
- **Gateway contract (extended)**: `ClaudeSessionGateway.getSessionUsage(sessionId, cwd)` added at `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts`.
- **Gateway impl (extended)**: `ClaudeSessionCliGateway.getSessionUsage` reads JSONL transcript at `~/.claude/projects/<cwdSlug>/<sessionId>.jsonl`, sums assistant-turn usage, picks model from last turn (R4), computes cost via `modelPricing`. Source: `src/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.ts`. Hermetic-test seam: `homeDir` constructor option.
- **Use case (extended)**: `runClaudeReviewJob.usecase.ts` `RunClaudeReviewJobResult.completed` now carries `usage: SessionUsageSnapshot | null`. Usage extracted between `awaitSessionCompletion` and `cleanupClaudeSession` (R1).
- **Integration (rewired)**: `invokeViaBackgroundSession` in `src/frameworks/claude/claudeInvoker.ts` replaces the disabled-comment block with `trackTokenUsage.execute` + `broadcastBudgetAfterUsage`. R5/R7 wrap both in try/catch. R6 honored by being inside the `completed` branch only. R8 honored — followups tracked identically.

### Endpoints

N/A — no new HTTP/MCP/CLI surface. Internal wiring change only.

### Architectural decisions taken

- **Hardcoded pricing table** (not dynamic). JSDoc points to Anthropic's pricing page. Refresh on model bumps. Anti-overengineering: no HTTP fetch, no override config (YAGNI for this spec).
- **Unknown-model fallback = opus rates**. Never under-reports cost (per `Scenarios.unknown-model`).
- **Cross-context isolation**: `SessionUsageSnapshot` lives in `claude-invocation` (local carrier shape); the caller maps to `TokenUsageRecord`. `claude-invocation` does not import from `token-accounting`.
- **`getSessionUsage` added to existing gateway** (not a new one) — the JSONL is part of the same CLI surface; SRP not violated for a single read operation.
- **No composition root change**: `broadcastBudgetStatus`, `getBudgetStatus`, `budgetStatusPresenter`, `getEnabledLocalPaths` were already wired in `src/main/routes.ts:148–158`.
- **No `claudeInvoker.test.ts` integration test added** for the wired block — coverage is transitive via `runClaudeReviewJob.test.ts`, `broadcastBudgetAfterUsage.test.ts`, and the acceptance test. Adding a dedicated harness was out of scope.

### Risk mitigations actually shipped

- **Risk #1** (CLI surface uncertainty): mitigated by switching data source to the JSONL transcript instead of `claude logs <id>` (which emits unparseable ANSI). No CLI dependency beyond the on-disk file format.
- **Risk #2** (fragile parsing): pinned fixture at `src/tests/fixtures/claudeCli/.claude/projects/-tmp-project-fixture/abc12345.jsonl` with mixed cache values, malformed line, non-assistant entries. Refresh on Claude CLI bump.
- **Risk #3** (concurrent writes): existing `FilesystemTokenUsageGateway.record` uses `appendFileSync` — append-only semantics already safe under concurrency.

## Problem Statement

SPEC-169 migrated `claudeInvoker.ts` from `claude -p` (which emits `stream-json` to stdout including `{ input_tokens, output_tokens, ... }` per response) to `claude --bg` (which detaches the session into a supervised daemon and does not stream usage data back to the spawning process). As a side-effect, `deps.trackTokenUsage` is no longer called and `broadcastBudgetAfterUsage` is no longer fired.

Operationally this means:
- `BudgetStatusPresenter` reports zero post-deploy — the dashboard budget widget goes blind.
- The pre-existing `auditBilling` safety net (FR-7 of SPEC-169) is the **only** remaining cost-visibility signal, and that signal is binary (regression yes/no), not granular.
- Combined with the `/usage` CLI surface uncertainty (also a SPEC-169 follow-up), the operator loses both cost tracking AND granular regression alerting at the same time.

This is a load-bearing operational tool, not a "nice to have". The budget cap (SPEC-163) cannot enforce a cap it cannot see.

## User Story

**As** the operator of ReviewFlow,
**I want** post-completion token usage extracted from each `claude --bg` session and forwarded to `TrackTokenUsageUseCase` + budget broadcast,
**So that** the dashboard budget widget keeps working and SPEC-163 budget caps remain enforceable.

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | Capture session token usage post-completion | After `awaitSessionCompletion` settles with `outcome: 'completed'`, parse usage from `claude logs <sessionId>` (or an equivalent CLI subcommand) before `cleanupClaudeSession` removes the session |
| 2 | Map raw usage to `TokenUsage` schema | Reuse the existing Zod schema in `src/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.ts` so downstream code is unchanged |
| 3 | Call `deps.trackTokenUsage` from `invokeViaBackgroundSession` | Replace the current `// NOTE: token tracking is intentionally disabled` block with an actual usage extraction step |
| 4 | Broadcast budget after each successful review | Re-fire `broadcastBudgetAfterUsage` after a usage record is written, identical to the pre-SPEC-169 behaviour |
| 5 | Graceful degradation when extraction fails | If `claude logs` is unavailable or returns unparseable output, log a warning with the raw output and skip tracking for this session — do NOT crash the review |

### Out of Scope

| Item | Why / Where |
|------|------------|
| Real-time mid-session token broadcasting | `--bg` decouples session from caller; mid-session usage requires WebSocket from Claude daemon, not in current CLI surface |
| Replacement of `/usage` audit | Distinct concern — `auditBilling` checks the *pool* (API vs subscription), this spec tracks *consumption* |
| Migration of historical pre-SPEC-169 records | Records emitted by the previous code path are already on disk and remain consumable by `BudgetStatusPresenter` |

## Acceptance Criteria

- [ ] AC-1: After a successful `--bg` review, the `tokenUsage.filesystem.gateway` has at least one new record for that `jobId`
- [ ] AC-2: `BudgetStatusPresenter` returns a `currentSpendingUsd > 0` after at least one review since SPEC-171 ships
- [ ] AC-3: A `--bg` session that completes without parseable usage logs a single warning and does NOT block the review pipeline
- [ ] AC-4: Unit test asserts that `deps.trackTokenUsage` is called exactly once per successful review and zero times per failed/timeout review

## Rules

- R1: Token usage is extracted from the session's JSONL transcript at `~/.claude/projects/<cwdSlug>/<sessionId>.jsonl` after `awaitSessionCompletion` settles with `outcome: 'completed'` and BEFORE `cleanupClaudeSession` runs.
- R2: Total session usage is the **sum** of `message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}` across every `type:"assistant"` line in the JSONL.
- R3: `costUsd` is **computed** from token counts using a per-model pricing table (Anthropic public pricing per 1M tokens). The JSONL does NOT carry cost — the legacy CLI `result.total_cost_usd` field is unavailable in `--bg`.
- R4: The dominant model recorded in the `TokenUsageRecord.model` field is the model from the last assistant message of the session (matches Anthropic's billing-attribution behaviour).
- R5: If the JSONL file is missing, unreadable, or every assistant line fails to parse, the extractor returns `null`. The pipeline logs a single warning and continues without crashing the review.
- R6: Failed reviews (`status !== 'completed'`), timeouts, and rate-limit retries do NOT invoke `trackTokenUsage` and do NOT broadcast budget.
- R7: After a successful `trackTokenUsage.execute`, `broadcastBudgetAfterUsage` is invoked once with the project's `localPath`. A broadcast failure is non-fatal (logged warning, does not affect the review).
- R8: Followup reviews (`jobType === 'followup'`) are tracked identically to standard reviews — the legacy stats path skipped followups but token accounting must not.

## Scenarios

- successful-review: {jobType: 'review', jsonl: present with 3 assistant turns} → trackTokenUsage called 1×, broadcastBudget called 1×, summed usage recorded with computed costUsd
- successful-followup: {jobType: 'followup', jsonl: present with 1 assistant turn} → trackTokenUsage called 1×, broadcastBudget called 1×
- missing-jsonl: {outcome: 'completed', jsonl: missing} → warning logged, trackTokenUsage NOT called, pipeline returns success
- unparseable-jsonl: {outcome: 'completed', jsonl: malformed} → warning logged with raw snippet, trackTokenUsage NOT called, pipeline returns success
- failed-review: {outcome: 'failed'} → trackTokenUsage NOT called, broadcastBudget NOT called
- timeout-review: {outcome: 'timeout'} → trackTokenUsage NOT called, broadcastBudget NOT called
- unknown-model: {assistant.message.model: 'mystery-model-x'} → cost computed with fallback pricing (matches highest-tier so we never under-report), warning logged once

## Risks & Mitigations

| # | Risk | Mitigation |
|---|------|------------|
| 1 | `claude logs <sessionId>` does not exist or output is unparseable | First investigation step is a CLI surface probe; if no surface exists, this spec blocks until Anthropic exposes one (escalate via `claude doctor` / support) |
| 2 | Parsing a real CLI output is fragile (regex against unstable format) | Pin a real-output fixture in `src/tests/fixtures/claudeCli/`; refresh fixture on Claude version bumps |
| 3 | Concurrent reviews race to write to the same usage file | Existing `FilesystemTokenUsageGateway` already handles append-only semantics — verify under contention before merging |

## Glossary

| Term | Definition |
|------|------------|
| Session usage | The total `{ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }` consumed by a single `claude --bg` session, summed across all assistant turns |
| `claude logs <sessionId>` | Anthropic CLI command (assumed) that prints the session's log file content to stdout — to be verified against the deployed CLI version before implementation |
| Budget broadcast | WebSocket event emitted by `broadcastBudgetAfterUsage` to refresh the dashboard's budget widget in real time |
