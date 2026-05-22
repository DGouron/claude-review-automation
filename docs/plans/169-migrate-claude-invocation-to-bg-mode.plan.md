# PLAN: SPEC-169 — Migrate Claude Invocation from `-p` to `--bg` Mode

**Spec**: `docs/specs/169-migrate-claude-invocation-to-bg-mode.md`
**Status**: planned
**Iteration split**: see end of file

---

## scope

Replace the entire `claude -p` dispatch path with a background-session model (`claude --bg`), with triple completion detection (MCP / polling / timeout), report retrieval from a known file, session cleanup, rate-limit retry, supervisor health monitoring, and billing-regression protection. Every review and followup flows through the new path; no rollback flag.

## is_new_module

**true** — a new module `src/modules/claude-invocation/` is justified (note the kebab-case, matching existing modules: `review-execution`, `token-accounting`, `platform-integration`, `statistics-insights`, `shared-kernel`, `tracking`).

The migration introduces a bounded context with its own entities (`ClaudeSession`, `SessionCompletion`, `BillingState`, `SupervisorHealth`), policies (rate-limit retry, supervisor health), and use cases (`dispatchClaudeSession`, `awaitSessionCompletion`, `auditBilling`). Wrapping all of it under `frameworks/claude/` would conflate framework wiring with domain rules.

The MCP completion bridge, the polling timer, the supervisor monitor, and the billing audit are coordinated by use cases, not by raw infrastructure code. The new module keeps the inward dependency rule: `entities ← usecases ← interface-adapters ← frameworks`.

The existing `src/frameworks/claude/claudeInvoker.ts` is kept as the orchestration entry point (the queue handler still calls it) but becomes a thin adapter that calls into the new module's `runClaudeReviewJob` use case. `streamJsonParser.ts` is reduced to a no-op stub for FR-8.

**Why not `src/modules/review-execution/`?** The bounded context `review-execution` owns *the review workflow itself* (job orchestration, progress, scoring, actions). The `--bg` dispatch is *infrastructure to talk to Claude Code*, with its own lifecycle (sessions, supervisor, billing) that is conceptually upstream of any review. Verified by reading `src/modules/review-execution/usecases/triggerReview.usecase.ts` and the MCP handlers — these consume an existing review workflow, they do not own the invocation mechanism.

---

## ENTITIES

All in `src/modules/claude-invocation/entities/`.

- name: `ClaudeSession`
  - file: `src/modules/claude-invocation/entities/claudeSession/claudeSession.ts`
  - schema: `src/modules/claude-invocation/entities/claudeSession/claudeSession.schema.ts`
  - guard: `src/modules/claude-invocation/entities/claudeSession/claudeSession.guard.ts`
  - gateway_contract: `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts`
  - test: `src/tests/units/modules/claude-invocation/entities/claudeSession/claudeSession.test.ts`
  - factory: `src/tests/factories/claudeSession.factory.ts`
  - purpose: represents a dispatched `claude --bg` session. Branded `SessionId = string & { __brand: 'SessionId' }`, dispatch timestamp, job reference (jobId + jobType: review/followup), reportPath, current status (`dispatched | completed | failed | timed-out | cleaned`).
  - key methods/derived: `isExpired(now, timeoutMs)`, `markCompleted`, `markFailed(reason)`, `markCleaned`.

- name: `SessionCompletion`
  - file: `src/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.ts`
  - schema: `src/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.schema.ts`
  - guard: `src/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.guard.ts`
  - test: `src/tests/units/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.test.ts`
  - factory: `src/tests/factories/sessionCompletion.factory.ts`
  - purpose: value object carrying the completion signal source (`mcp | polling | timeout`), outcome (`completed | failed | stopped`), and reason (optional string). First-wins semantics live in the use case, not here.

- name: `BillingState`
  - file: `src/modules/claude-invocation/entities/billingState/billingState.ts`
  - schema: `src/modules/claude-invocation/entities/billingState/billingState.schema.ts`
  - guard: `src/modules/claude-invocation/entities/billingState/billingState.guard.ts`
  - test: `src/tests/units/modules/claude-invocation/entities/billingState/billingState.test.ts`
  - factory: `src/tests/factories/billingState.factory.ts`
  - purpose: tracks dispatch-paused / dispatch-active, last audit timestamp, last regression reason. Single in-memory aggregate (one operator, one process).

- name: `SupervisorHealth`
  - file: `src/modules/claude-invocation/entities/supervisorHealth/supervisorHealth.ts`
  - schema: `src/modules/claude-invocation/entities/supervisorHealth/supervisorHealth.schema.ts`
  - guard: `src/modules/claude-invocation/entities/supervisorHealth/supervisorHealth.guard.ts`
  - test: `src/tests/units/modules/claude-invocation/entities/supervisorHealth/supervisorHealth.test.ts`
  - factory: `src/tests/factories/supervisorHealth.factory.ts`
  - purpose: status (`up | down`), lastCheckAt, lastDownReason. Drives the dashboard alert.

- name: `RetrySchedule` (value object only, no gateway)
  - file: `src/modules/claude-invocation/entities/retrySchedule/retrySchedule.valueObject.ts`
  - schema: `src/modules/claude-invocation/entities/retrySchedule/retrySchedule.schema.ts`
  - test: `src/tests/units/modules/claude-invocation/entities/retrySchedule/retrySchedule.test.ts`
  - purpose: pure computation of exponential backoff `nextDelayMs(attempt)` capped at 15min, max 5 attempts (FR-5). No persistence.

---

## USECASES

All in `src/modules/claude-invocation/usecases/`.

- name: `dispatchClaudeSession`
  - file: `src/modules/claude-invocation/usecases/dispatchClaudeSession.usecase.ts`
  - test: `src/tests/units/modules/claude-invocation/usecases/dispatchClaudeSession.usecase.test.ts`
  - type: command
  - input: `{ jobId, jobType, prompt, flags, localPath, mergeRequestId, attempt }`
  - output: `{ status: 'dispatched', sessionId } | { status: 'rate-limited', retryAfterMs } | { status: 'billing-regression-prevented' } | { status: 'paused' }`
  - covers: FR-1, FR-7.1, FR-5 (returns rate-limited for retry orchestration), FR-8 (no stream-json wiring).

- name: `awaitSessionCompletion`
  - file: `src/modules/claude-invocation/usecases/awaitSessionCompletion.usecase.ts`
  - test: `src/tests/units/modules/claude-invocation/usecases/awaitSessionCompletion.usecase.test.ts`
  - type: command (long-running, first-wins coordinator)
  - input: `{ session: ClaudeSession, timeoutMs, pollIntervalMs }`
  - output: `SessionCompletion`
  - covers: FR-2 (combines `McpCompletionBridge`, `ClaudeAgentsGateway.pollStatus`, and a clock for the hard timeout).

- name: `retrieveReviewReport`
  - file: `src/modules/claude-invocation/usecases/retrieveReviewReport.usecase.ts`
  - test: `src/tests/units/modules/claude-invocation/usecases/retrieveReviewReport.usecase.test.ts`
  - type: query
  - input: `{ session: ClaudeSession, today, mergeRequestId, jobType }`
  - output: `{ status: 'found', content, path } | { status: 'missing', expectedPath }`
  - covers: FR-3.

- name: `cleanupClaudeSession`
  - file: `src/modules/claude-invocation/usecases/cleanupClaudeSession.usecase.ts`
  - test: `src/tests/units/modules/claude-invocation/usecases/cleanupClaudeSession.usecase.test.ts`
  - type: command
  - input: `{ sessionId }`
  - output: `{ stopped: boolean, removed: boolean, warnings: string[] }`
  - covers: FR-4. Failures logged as warnings; never throws.

- name: `checkSupervisorHealth`
  - file: `src/modules/claude-invocation/usecases/checkSupervisorHealth.usecase.ts`
  - test: `src/tests/units/modules/claude-invocation/usecases/checkSupervisorHealth.usecase.test.ts`
  - type: command (timer-driven)
  - input: `{}`
  - output: `SupervisorHealth`
  - covers: FR-6. Updates a `SupervisorHealthGateway` (in-memory) and emits a critical log on transition to `down`.

- name: `auditBilling`
  - file: `src/modules/claude-invocation/usecases/auditBilling.usecase.ts`
  - test: `src/tests/units/modules/claude-invocation/usecases/auditBilling.usecase.test.ts`
  - type: command (timer-driven)
  - input: `{}`
  - output: `{ regression: boolean, reason?: string }`
  - covers: FR-7.2. On regression, mutates `BillingStateGateway` to paused and emits critical alert.

- name: `runClaudeReviewJob` (orchestration use case — Walking Skeleton entry)
  - file: `src/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.ts`
  - test: `src/tests/units/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.test.ts`
  - type: command
  - input: `{ jobId, jobType, prompt, flags, localPath, mergeRequestId, attempt }`
  - output: `{ status: 'completed', reportPath, content } | { status: 'failed', reason } | { status: 'retry', delayMs, attempt }`
  - composes: dispatch → await → retrieve → cleanup. This is what `claudeInvoker.ts` calls.

---

## GATEWAYS

Contracts live with their entity; implementations in `src/modules/claude-invocation/interface-adapters/gateways/`.

- name: `ClaudeSessionGateway`
  - contract: `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts`
  - implementation: `src/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.ts`
  - stub: `src/tests/stubs/claudeSession.stub.ts`
  - methods: `dispatch(prompt, flags, env): Promise<DispatchResult>`, `stop(sessionId): Promise<CleanupResult>`, `remove(sessionId): Promise<CleanupResult>`, `listAgents(): Promise<AgentStatus[]>`, `daemonStatus(): Promise<DaemonStatus>`, `usage(): Promise<UsageReport>`.
  - notes: groups all `claude` CLI commands. The existing `ExecutionGatewayBase` is action-list shaped (verified at `src/shared/foundation/executionGateway.base.ts`) and not suited to one-shot dispatch — this gateway uses `node:child_process.spawn` directly (mirroring current `claudeInvoker.ts`) via an injectable `CommandExecutor` analogue to keep tests pure. Detects rate-limit via stderr regex + exit code; returns a typed `DispatchResult`. Resolves the `claude` binary via existing `@/shared/services/claudePathResolver.js`.

- name: `McpCompletionBridge` (gateway for the inbound MCP completion signal)
  - contract: `src/modules/claude-invocation/entities/sessionCompletion/mcpCompletion.gateway.ts`
  - implementation: `src/modules/claude-invocation/interface-adapters/gateways/mcpCompletion.memory.gateway.ts`
  - stub: `src/tests/stubs/mcpCompletion.stub.ts`
  - methods: `subscribe(sessionId, callback)`, `unsubscribe(sessionId)`, `publish(sessionId, outcome)` (called by MCP `set_phase` handler).
  - notes: in-process event bus. The MCP handler for `set_phase` (already in `src/mcp/`) calls `publish`; the `awaitSessionCompletion` use case subscribes.

- name: `ReviewReportGateway`
  - contract: `src/modules/claude-invocation/entities/sessionCompletion/reviewReport.gateway.ts`
  - implementation: `src/modules/claude-invocation/interface-adapters/gateways/reviewReport.fileSystem.gateway.ts`
  - stub: `src/tests/stubs/reviewReport.stub.ts`
  - methods: `read(localPath, date, mergeRequestId, jobType): { content, path } | null`.
  - notes: encapsulates the `.claude/reviews/YYYY-MM-DD-MR-XXXX-{review,followup}.md` convention.

- name: `BillingStateGateway`
  - contract: `src/modules/claude-invocation/entities/billingState/billingState.gateway.ts`
  - implementation: `src/modules/claude-invocation/interface-adapters/gateways/billingState.memory.gateway.ts`
  - stub: `src/tests/stubs/billingState.stub.ts`
  - methods: `read(): BillingState`, `pause(reason)`, `resume()`.

- name: `SupervisorHealthGateway`
  - contract: `src/modules/claude-invocation/entities/supervisorHealth/supervisorHealth.gateway.ts`
  - implementation: `src/modules/claude-invocation/interface-adapters/gateways/supervisorHealth.memory.gateway.ts`
  - stub: `src/tests/stubs/supervisorHealth.stub.ts`
  - methods: `read(): SupervisorHealth`, `update(status, reason?)`.

- name: `EnvironmentGateway` (FR-7.1)
  - contract: `src/modules/claude-invocation/entities/billingState/environment.gateway.ts`
  - implementation: `src/modules/claude-invocation/interface-adapters/gateways/environment.process.gateway.ts`
  - stub: `src/tests/stubs/environment.stub.ts`
  - methods: `hasAnthropicApiKey(): boolean`.
  - notes: thin wrapper around `process.env.ANTHROPIC_API_KEY` so the dispatch use case stays pure and testable.

---

## CONTROLLERS

The migration does NOT introduce new HTTP/webhook controllers — the existing webhook controllers continue to enqueue jobs. We do introduce:

- name: `McpCompletionPublisherAdapter`
  - file: integrates into existing `src/modules/review-execution/usecases/mcp/setPhase.usecase.ts` (verified existing: `setPhase.handler.ts` + `setPhase.usecase.ts`)
  - test: extend existing `src/tests/units/modules/review-execution/usecases/mcp/setPhase.usecase.test.ts`
  - dependencies: `mcpCompletionBridge: McpCompletionBridge` injected into `SetPhaseDependencies`
  - purpose: when `setPhase` is called with `phase === 'completed'`, the use case calls `bridge.publish(jobId, { source: 'mcp', outcome: 'completed' })`. The jobId-to-sessionId mapping is held by the bridge (the dispatch use case calls `bridge.subscribe(jobId, sessionId, callback)`).
  - SCOPE-CHECK: this touches `review-execution` minimally (one extra optional dependency on `SetPhaseDependencies`). Justified — the publisher is the natural extension of phase-completion semantics, not a new MCP tool. If even this is deemed out of scope, an alternative is to have `awaitSessionCompletion` poll the `progressGateway` for the phase, since `setPhase` already persists it.

- name: `DashboardAlertsController` (extension, not new)
  - file: `src/interface-adapters/controllers/http/dashboardAlerts.routes.ts` (existing or new — verify in implementation; likely add a small read endpoint surfaced by the dashboard view)
  - test: `src/tests/units/interface-adapters/controllers/http/dashboardAlerts.routes.test.ts`
  - dependencies: `supervisorHealthGateway`, `billingStateGateway`
  - purpose: exposes current alerts to the dashboard. SCOPE-CHECK: only included if no existing endpoint serves these alerts. Otherwise the gateways inject directly into an existing dashboard presenter — to confirm at implementation time.

---

## FRAMEWORKS (timers, queue, MCP wiring)

- file: `src/frameworks/claude/claudeInvoker.ts` (existing — REFACTORED, not deleted)
  - test: `src/tests/units/frameworks/claude/claudeInvoker.test.ts` (existing — update)
  - change: becomes a thin orchestrator that builds the prompt + flags then delegates to `runClaudeReviewJob` use case. Removes all `spawn('claude', ['-p', ...])` logic; removes `streamJsonParser` consumption. Keeps the `current-job.json` MCP file context write (still required by MCP server).

- file: `src/frameworks/claude/streamJsonParser.ts` (existing)
  - test: `src/tests/units/frameworks/claude/streamJsonParser.test.ts`
  - change: reduced to a no-op stub exporting the same symbols. FR-8.

- file: `src/frameworks/claude/progressParser.ts` (existing)
  - test: existing
  - change: simplified to consume only MCP-originated events. FR-8.

- file: `src/frameworks/claude/timers/claudeInvocationTimers.ts` (NEW)
  - test: `src/tests/units/frameworks/claude/timers/claudeInvocationTimers.test.ts`
  - purpose: a single scheduler that owns three `setInterval`s — supervisor (5min), billing audit (1h), session polling (30s, dynamic per active session). Exposes `start(deps)` and `stop()` so Fastify lifecycle hooks can wire it. Avoids creating a new `TimerScheduler` abstraction (KISS — anti-overengineering).
  - notes: the 30s polling timer is internal to the `awaitSessionCompletion` use case (per-session). The 5min and 1h timers are global and owned here.

- file: `src/frameworks/queue/rateLimitRetry.ts` (NEW, extends existing queue)
  - test: `src/tests/units/frameworks/queue/rateLimitRetry.test.ts`
  - purpose: helper that re-enqueues a job with backoff using `RetrySchedule`. Called by `claudeInvoker.ts` when `runClaudeReviewJob` returns `status: 'retry'`. Does NOT replace the existing p-queue setup.

---

## PRESENTERS / VIEWS

- Dashboard view: existing dashboard already surfaces alerts. The new `supervisor down` and `billing regression suspected` flags are added to the existing dashboard ViewModel via a small extension of the current presenter. **Concrete path to confirm at implementation time** — read `src/interface-adapters/presenters/dashboard/` first. If a `dashboardAlerts.presenter.ts` exists, extend it; otherwise add new fields to the closest existing presenter.

No new view files unless the existing dashboard cannot accommodate the two flags — in which case a new alert pill component is added (deferred decision, flagged for implementer).

---

## WIRING

- routes: `src/main/routes.ts`
  - Instantiate (once): `ClaudeSessionGateway`, `McpCompletionBridge`, `ReviewReportGateway`, `BillingStateGateway`, `SupervisorHealthGateway`, `EnvironmentGateway`.
  - Inject all into the refactored `claudeInvoker.ts` factory (likely `createClaudeInvoker(deps)`).
  - Start `claudeInvocationTimers` via `app.addHook('onReady', ...)` and stop via `app.addHook('onClose', ...)`.
  - Wire the MCP completion publisher into the existing MCP server registration so `set_phase` calls `mcpCompletionBridge.publish`.

- dependencies (new instantiations):
  - `new ClaudeSessionCliGateway(executor)`
  - `new InMemoryMcpCompletionBridge()`
  - `new ReviewReportFileSystemGateway()`
  - `new InMemoryBillingStateGateway()`
  - `new InMemorySupervisorHealthGateway()`
  - `new ProcessEnvironmentGateway()`

---

## ACCEPTANCE_TEST

- file: `src/tests/acceptance/169-migrate-claude-invocation-to-bg-mode.acceptance.test.ts`
- note: SDD outer loop — written first by implementer, RED during impl, GREEN at the end. Covers each Gherkin scenario via in-memory stubs of all gateways, exercising `runClaudeReviewJob` with a fake `ClaudeSessionGateway` and `McpCompletionBridge`.

Scenarios mapped 1:1 from spec Gherkin:
1. Webhook triggers review dispatched via `--bg` → assert no `-p` arg in captured CLI args.
2. Completion via MCP primary → assert report read + cleanup invoked.
3. Completion via polling fallback → assert MCP silent + polling stub returns completed.
4. Hard timeout → assert `claude stop` + failed with reason `timeout`.
5. Report missing → assert failed with reason `report-missing`, cleanup still ran.
6. Rate limit on dispatch → assert retry signal + RetrySchedule values.
7. Supervisor down → assert critical log + dispatch paused.
8. Billing regression pre-dispatch (`ANTHROPIC_API_KEY` set) → assert abort + `billing-regression-prevented` reason.
9. Periodic billing audit detects API consumption → assert pause + alert.
10. Followup job uses same `--bg` path → assert same use case, different `jobType`.

---

## FR_TO_ARTEFACT_MAPPING

| FR | Artefact |
|----|----------|
| FR-1 Background dispatch | `dispatchClaudeSession.usecase.ts`, `claudeSession.cli.gateway.ts` |
| FR-2 Triple completion | `awaitSessionCompletion.usecase.ts`, `mcpCompletion.memory.gateway.ts`, `claudeSession.cli.gateway.ts#listAgents` |
| FR-3 Report retrieval | `retrieveReviewReport.usecase.ts`, `reviewReport.fileSystem.gateway.ts` |
| FR-4 Session cleanup | `cleanupClaudeSession.usecase.ts`, `claudeSession.cli.gateway.ts#stop/remove` |
| FR-5 Rate-limit retry | `retrySchedule.valueObject.ts`, `rateLimitRetry.ts`, `dispatchClaudeSession.usecase.ts` |
| FR-6 Supervisor health | `checkSupervisorHealth.usecase.ts`, `supervisorHealth.memory.gateway.ts`, `claudeInvocationTimers.ts` |
| FR-7 Billing regression | `auditBilling.usecase.ts`, `dispatchClaudeSession.usecase.ts` (pre-check), `billingState.memory.gateway.ts`, `environment.process.gateway.ts`, `claudeInvocationTimers.ts` |
| FR-8 ProgressParser simplification | `streamJsonParser.ts` (no-op), `progressParser.ts` (MCP-only), `claudeInvoker.ts` (remove consumer) |
| FR-9 Codebase cleanup | grep check in CI; verified in acceptance test + a `src/tests/units/architecture/noClaudePInProduction.test.ts` rule test |

---

## IMPLEMENTATION_ORDER

Walking Skeleton (vertical slice: dispatch → MCP completion → report → cleanup happy path) FIRST.

1. `src/tests/acceptance/169-migrate-claude-invocation-to-bg-mode.acceptance.test.ts` — outer-loop RED scaffold (scenario 1 + 2 only initially).
2. `claudeSession.schema.ts` + `claudeSession.guard.ts` + `claudeSession.ts` — entity with branded `SessionId`.
3. `claudeSession.factory.ts` — test factory.
4. `claudeSession.gateway.ts` — contract.
5. `claudeSession.stub.ts` — stub gateway.
6. `dispatchClaudeSession.usecase.ts` + test — Walking Skeleton step 1 (FR-1).
7. `sessionCompletion.schema.ts` + `.guard.ts` + `.ts` + factory.
8. `mcpCompletion.gateway.ts` (contract) + stub + `inMemoryMcpCompletionBridge` impl + test.
9. `reviewReport.gateway.ts` + stub + impl + test.
10. `awaitSessionCompletion.usecase.ts` + test (start with MCP-only path, then add polling, then timeout — three RED-GREEN cycles).
11. `retrieveReviewReport.usecase.ts` + test.
12. `cleanupClaudeSession.usecase.ts` + test.
13. `runClaudeReviewJob.usecase.ts` + test — orchestration. Walking Skeleton COMPLETE (acceptance scenario 1+2 GREEN).
14. `claudeSession.cli.gateway.ts` — real CLI implementation (uses `ExecutionGatewayBase`).
15. Refactor `claudeInvoker.ts` to delegate to `runClaudeReviewJob`. Acceptance scenarios 3+4+5 GREEN.
16. `retrySchedule.valueObject.ts` + test (FR-5).
17. `rateLimitRetry.ts` in frameworks + test. Acceptance scenario 6 GREEN.
18. `billingState.*` entity + gateway + impl + test. `environment.process.gateway.ts` + test. Pre-dispatch check wired in `dispatchClaudeSession`. Acceptance scenario 8 GREEN.
19. `supervisorHealth.*` entity + gateway + impl + test. `checkSupervisorHealth.usecase.ts`. Acceptance scenario 7 GREEN.
20. `auditBilling.usecase.ts` + test. Acceptance scenario 9 GREEN.
21. `claudeInvocationTimers.ts` + test — schedule the two global timers.
22. `streamJsonParser.ts` → no-op; `progressParser.ts` → MCP-only consumer (FR-8).
23. Wire MCP `set_phase` handler to `mcpCompletionBridge.publish` (`sessionCompletion.handler.ts`).
24. `noClaudePInProduction.test.ts` architectural rule test (FR-9).
25. Final wiring in `src/main/routes.ts` — DI for all gateways + timer start/stop hooks.
26. Acceptance scenario 10 (followup) GREEN.

---

## REFERENCE_FILES

- `src/frameworks/claude/claudeInvoker.ts` — current `-p` dispatch path; full understanding required before refactor.
- `src/frameworks/claude/streamJsonParser.ts` + `progressParser.ts` — current consumers to neutralize.
- `src/shared/foundation/executionGateway.base.ts` — base for `ClaudeSessionCliGateway`.
- `src/shared/foundation/guard.base.ts` — guard factory.
- `src/shared/foundation/usecase.base.ts` — base use case interface (if present).
- `src/main/routes.ts` — composition root, where wiring lands.
- `src/mcp/` — existing MCP server, `set_phase` handler, `current-job.json` writer.
- `src/frameworks/queue/` — current p-queue setup, retry semantics to extend (not replace).
- `src/interface-adapters/gateways/` — gateway naming and structure references (e.g., `threadFetch.gitlab.gateway.ts`).
- `docs/ddd/event-storming/review-execution.md` — bounded context fit check.
- `src/tests/factories/` — naming + pattern reference for new factories.
- `src/tests/stubs/` — stub naming + pattern reference.

---

## RISKS / UNKNOWNS

1. **MCP `set_phase` handler location** — must be located and a publish call inserted. If the handler is owned by an external package (`@modelcontextprotocol/sdk`), an adapter at the MCP server registration point is needed instead.
2. **`claude agents --json` exact output schema** — assumed but not documented in spec. Implementer must capture a real sample before writing the parser. Until then, the `claudeSession.cli.gateway.ts#listAgents` parser is behind a guard with explicit unknown-shape handling.
3. **`claude /usage` parseability** — FR-7.2 depends on a stable parseable output. If the format is unstable, fall back to a coarser regex-based detector and log raw output to the structured log.
4. **Rate-limit detection signal** — exact stderr pattern and exit code are not documented. Implementer should capture from a real session and pin the regex with a unit test. Until then, default to: exit code != 0 AND stderr contains `rate` or `429`.
5. **Dashboard alert plumbing** — current dashboard alert mechanism not yet inspected. Plan flags this; implementer reads dashboard presenter first and extends rather than creating a new alert pipeline.
6. **Worktree lifecycle** — explicitly out of scope (SPEC-170). The plan assumes `claude --bg` creates and manages its own working directory; the report path is read relative to the localPath that the job was dispatched against.
7. **Test for the 30s / 5min / 1h timers** — must use fake timers (Vitest `vi.useFakeTimers()`), never real `setInterval`.

---

## ITERATION SPLIT

**Single PR, no split.**

Rationale: the spec is INVEST-tagged `Small: WARN` (~5-8 files target, ~22 production files with Clean Architecture). The total file count below (production + tests) is high (~45 files) but each file is small and the FRs are tightly coupled — FR-2 (completion) requires FR-1 (dispatch); FR-5 (retry) requires FR-1; FR-7 pre-check requires FR-1. Splitting FR-1+2+3+4 from FR-5+6+7+8 would leave the production path in a half-migrated state on master, which the spec's Definition of Done explicitly forbids ("Zero remaining `-p` invocations" must be true at merge).

The deployment safety margin (≥5 days before 2026-06-10) absorbs any review delay. If, during implementation, the agent hits a hard wall, the natural split point is **after step 17 (acceptance scenarios 1-6 GREEN)** — i.e., FR-1, FR-2, FR-3, FR-4, FR-5, FR-9 in PR #1 and FR-6, FR-7, FR-8 in PR #2, but this is a contingency, not the default plan.

---

## FILE COUNT SUMMARY

Production files (new): ~22
- Entities: 5 × ~4 files = ~17 (entity/schema/guard/gateway-contract; RetrySchedule has 2)
- Use cases: 7
- Gateways impl: 6
- Frameworks new: 2 (`claudeInvocationTimers.ts`, `rateLimitRetry.ts`)
- Controllers (MCP wire adapter): 1

Production files (modified): ~3
- `claudeInvoker.ts`, `streamJsonParser.ts`, `progressParser.ts`, `main/routes.ts`

Test files (new): ~23
- Unit tests mirroring each new production file
- Factories: 4
- Stubs: 6
- Acceptance test: 1
- Architecture rule test: 1 (`noClaudePInProduction.test.ts`)

**Total new + modified: ~48 files**. Above the 25-file conservative estimate, but acceptable as a single PR per the rationale above; the alternative (split) leaves prod in a worse state. Implementer should keep commits granular (one per IMPLEMENTATION_ORDER step) to ease review.
