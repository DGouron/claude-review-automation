# Plan — SPEC-171 Re-enable Token Usage Tracking in --bg Mode

**Spec**: `docs/specs/171-bg-token-usage-tracking.md`
**Status**: planned
**Worktree**: `.claude/worktrees/spec-171-token-tracking`

## Open Design Questions

1. **Pricing table seed (R3)** — Recommend hardcoding three families with public Anthropic per-1M-token rates as `const MODEL_PRICING_USD_PER_MILLION` in `modelPricing.ts`:
   - `claude-opus-4*` → input 15, output 75, cacheCreation 18.75, cacheRead 1.50
   - `claude-sonnet-4*` → input 3, output 15, cacheCreation 3.75, cacheRead 0.30
   - `claude-haiku-4-5*` → input 1, output 5, cacheCreation 1.25, cacheRead 0.10
   - Unknown model → fallback to opus rates (never under-reports; matches Scenarios.unknown-model).
   - Matching is **prefix-based** (`startsWith`) so versioned suffixes (`claude-opus-4-7[1m]`, `-20251022`, etc.) all hit. Document the source URL inline as JSDoc.
   - Anti-overengineering: keep it a plain `const` map + one pure function. No class, no factory.

2. **Cross-context type dependency for `getSessionUsage` return shape** — Recommend a **local shape** in `claude-invocation` rather than importing `TokenUsage` from `token-accounting`:
   - Define `SessionUsageSnapshot` in `src/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.ts` with `{ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, model, costUsd }`.
   - The caller (`invokeViaBackgroundSession`) maps `SessionUsageSnapshot` → `TokenUsageRecord` by adding `jobId`, `mrNumber`, `platform`, `projectPath`, `recordedAt`, `localPath`.
   - Justification: keeps `claude-invocation` from importing a sibling module's entity. Mapping is trivial (one factory call) and keeps the bounded-context boundary clean.

3. **`cwd` as explicit gateway argument vs derive from session-state** — Recommend **explicit `cwd` argument** to `getSessionUsage(sessionId, cwd)`:
   - The JSONL path is `~/.claude/projects/<cwdSlug>/<sessionId>.jsonl` where `<cwdSlug>` is the worktree path (post-`ensureWorktree`).
   - Explicit argument keeps the gateway pure (no hidden state lookup), makes the unit test trivially fixture-driven, and aligns with the rest of the gateway interface which is stateless.

## PLAN

scope: re-enable token usage tracking + cost computation for `--bg` mode review jobs
is_new_module: false (extends `claude-invocation` and `token-accounting` modules)

### ENTITIES

- name: `ModelPricing` (pure function module)
  - file: `src/modules/token-accounting/entities/modelPricing/modelPricing.ts`
  - test: `src/tests/units/modules/token-accounting/entities/modelPricing/modelPricing.test.ts`
  - exports: `computeCostUsd(model: string, tokens: TokenUsageBreakdown) → number`, `MODEL_PRICING_USD_PER_MILLION` const table
  - depends on: `TokenUsage` from `tokenUsage.schema.ts` (same module — intra-module import OK)
  - NO schema/guard/factory — value-less, table-driven; types come from existing `TokenUsage`

- name: `SessionUsageSnapshot`
  - file: `src/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.ts`
  - schema: same file (`sessionUsageSnapshotSchema` zod)
  - test: covered indirectly via gateway test (single-shape data carrier, no validation logic)
  - shape: `{ model: string, usage: { inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, costUsd } }`

### USECASES

- No new use case. `TrackTokenUsageUseCase` is reused as-is.
- `runClaudeReviewJob.usecase.ts` is **modified** to extend its result with `usage: SessionUsageSnapshot | null`. See WIRING.

### GATEWAYS

- name: `ClaudeSessionGateway` (extended — 7th method)
  - contract: `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts`
  - implementation: `src/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.ts`
  - stub: `src/tests/stubs/claudeSession.stub.ts` — add `setSessionUsage(SessionUsageSnapshot | null)` + tracking calls
  - new method: `getSessionUsage(sessionId: SessionId, cwd: string): Promise<SessionUsageSnapshot | null>`
  - parsing logic (CLI impl):
    1. Compute slug: `cwd.replace(/\//g, '-')` (leading `/` becomes leading `-`)
    2. Resolve path: `path.join(os.homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`)`
    3. If file missing → return `null`
    4. Read file, split by `\n`, parse each non-empty line as JSON in a try/catch (skip malformed lines, do not throw)
    5. Filter `type === 'assistant'` entries with `message.usage` present
    6. If zero valid entries → return `null`
    7. Sum the four token fields across all entries (per R2)
    8. `model` = `message.model` from the **last** valid assistant entry (per R4)
    9. `costUsd` = `computeCostUsd(model, tokens)`

### CONTROLLERS

- No controller changes. Wiring stays in composition root.

### PRESENTERS

- Reuse existing `BudgetStatusPresenter` via `broadcastBudgetAfterUsage` helper. No new presenter.

### VIEWS

- N/A (dashboard polls budget via existing REST + WebSocket plumbing).

### WIRING

Modified files (composition root + integration points):

- `src/main/routes.ts` — verify `broadcastBudgetStatus`, `getBudgetStatus`, `budgetStatusPresenter` are already passed to `ClaudeInvokerDependencies` (lines 148–158). They ARE. No change required to composition root.

- `src/frameworks/claude/claudeInvoker.ts`:
  - Replace the comment block at lines 668–672 with the actual usage-extraction flow:
    1. Call `await runClaudeReviewJob(...)` returns `{ status: 'completed', ..., usage: SessionUsageSnapshot | null }`.
    2. If `result.usage !== null`, build `TokenUsageRecord` from `{ jobId: job.id, mrNumber: job.mrNumber, platform: job.platform, projectPath: job.projectPath, model: result.usage.model, recordedAt: new Date().toISOString(), localPath: job.localPath, usage: result.usage.usage }`.
    3. Call `await deps.trackTokenUsage.execute(record)`.
    4. Call `await broadcastBudgetAfterUsage({ getBudgetStatus: deps.getBudgetStatus, broadcastBudgetStatus: deps.broadcastBudgetStatus, presenter: deps.budgetStatusPresenter }, { localPaths: deps.getEnabledLocalPaths?.() ?? [job.localPath] }, logger)`.
    5. Wrap steps 3–4 in try/catch; warn on failure, do not propagate (R7).
  - Update the `return { ..., usage: ... }` to populate `usage` from `result.usage?.usage ?? null` instead of literal `null` (line 689).
  - Per R8: do NOT gate this block on `job.jobType !== 'followup'`. Token tracking applies to all completed jobs.

- `src/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.ts`:
  - Extend `RunClaudeReviewJobResult` completed variant: `{ status: 'completed'; reportPath: string; content: string; usage: SessionUsageSnapshot | null }`.
  - Extend `RunClaudeReviewJobDependencies` is unchanged — `sessionGateway` already in scope.
  - Between `awaitSessionCompletion` (line 109) and `cleanupClaudeSession` (line 127), when `completion.outcome === 'completed'`, call `await deps.sessionGateway.getSessionUsage(session.sessionId, input.localPath)` and store in a `const usage`.
  - The order MUST be: await completion → fetch usage → cleanup → return. Cleanup deletes the JSONL transient state, so usage extraction must precede it.
  - Pass `usage` into the `completed` return object.

- `src/tests/stubs/claudeSession.stub.ts`:
  - Add `getSessionUsageCalls: Array<{sessionId, cwd}>`, `private sessionUsageResult: SessionUsageSnapshot | null = null`, `setSessionUsage(value)`, and implement `async getSessionUsage(sessionId, cwd)`.

### TEST FILES

New tests:

- `src/tests/units/modules/token-accounting/entities/modelPricing/modelPricing.test.ts`
  - opus pricing: 1M input → 15 USD
  - sonnet pricing: 1M input → 3 USD
  - haiku pricing: 1M input → 1 USD
  - mixed-tier breakdown with cache fields
  - unknown model (`mystery-model-x`) → opus fallback rates
  - zero tokens → returns 0
  - versioned suffix matching (`claude-opus-4-7[1m]` → opus tier)

- `src/tests/units/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.test.ts` (existing file — append cases)
  - `getSessionUsage` happy path: 3 assistant turns aggregated, model from last turn
  - missing JSONL file → returns null
  - malformed lines mixed with valid lines → returns aggregate of valid lines
  - all lines malformed → returns null
  - empty file → returns null
  - non-assistant lines ignored (user, system, tool_use, etc.)

- `src/tests/units/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.test.ts` (existing — append)
  - completed outcome: `getSessionUsage` called once before cleanup, returned in result
  - completed outcome + usage null: result.usage is null, no crash
  - failed outcome: `getSessionUsage` NOT called
  - timeout outcome: `getSessionUsage` NOT called

- `src/tests/units/frameworks/claude/claudeInvoker.test.ts` (likely existing — append)
  - successful review: `deps.trackTokenUsage.execute` called exactly once with mapped record (AC-4)
  - successful followup: `deps.trackTokenUsage.execute` called exactly once (R8)
  - failed review: `deps.trackTokenUsage.execute` NOT called (R6)
  - timeout review: `deps.trackTokenUsage.execute` NOT called (R6)
  - usage null from gateway: warning logged, `trackTokenUsage` NOT called, no broadcast, no crash (R5)
  - `broadcastBudgetAfterUsage` throws: warning logged, returns success anyway (R7)

### FIXTURES

- `src/tests/fixtures/claudeCli/sessionTranscript.jsonl` — pinned real-output sample (Risk #2):
  - 3 `type:"assistant"` messages with mixed `usage` values (varying cache_creation, cache_read)
  - 1 `type:"user"` message (must be ignored)
  - 1 malformed/truncated line (must be skipped without crashing)
  - Models: first two `claude-sonnet-4-5`, last `claude-opus-4-7` (verify R4 picks opus)

### ACCEPTANCE_TEST

file: `src/tests/acceptance/171-bg-token-usage-tracking.acceptance.test.ts`
note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end"

Scenarios covered (from spec):
- successful-review → trackTokenUsage 1×, broadcast 1×, costUsd > 0
- successful-followup → trackTokenUsage 1×, broadcast 1×
- missing-jsonl → warning + pipeline success
- unparseable-jsonl → warning + pipeline success
- failed-review → no trackTokenUsage, no broadcast
- timeout-review → no trackTokenUsage, no broadcast
- unknown-model → cost computed with opus fallback

### IMPLEMENTATION_ORDER

1. **`modelPricing.ts` + test** (purest entity, zero deps)
   - RED: `modelPricing.test.ts` with table-driven cases
   - GREEN: const table + prefix-match function
   - Justification: walking skeleton starts at the deepest layer

2. **`sessionUsage.schema.ts`** (carrier type for cross-layer transport)
   - Add zod schema + type. No test (data carrier with no logic — covered by gateway test).

3. **Extend `ClaudeSessionGateway` contract** (add `getSessionUsage`)
   - File: `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts`
   - Pure interface addition.

4. **Implement `getSessionUsage` in `ClaudeSessionCliGateway`** (fixture-driven)
   - Add fixture file `src/tests/fixtures/claudeCli/sessionTranscript.jsonl` first
   - RED: gateway test covering happy path + 4 edge cases
   - GREEN: filesystem read + line parse + sum + model pick + cost compute
   - Inject `path.join(homedir(), ...)` via the gateway constructor (default = real homedir) so tests can point at the fixture dir

5. **Update `StubClaudeSessionGateway`** (add stub method)
   - File: `src/tests/stubs/claudeSession.stub.ts`
   - Required before step 6.

6. **Extend `runClaudeReviewJob` result + call sequence**
   - File: `src/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.ts`
   - RED: append cases to `runClaudeReviewJob.usecase.test.ts`
   - GREEN: call `getSessionUsage` between completion-check and cleanup; propagate `usage` to `completed` return

7. **Wire usage capture in `invokeViaBackgroundSession`** (claudeInvoker.ts)
   - Replace lines 668–672 comment block with extraction + tracking + broadcast block
   - Update line 689 to return `usage: result.usage?.usage ?? null`
   - RED: append cases to `claudeInvoker.test.ts`
   - GREEN: implement, ensuring failure paths skip tracking

8. **Composition root verification** (`src/main/routes.ts`)
   - Read-only verification that `broadcastBudgetStatus`, `getBudgetStatus`, `budgetStatusPresenter`, `getEnabledLocalPaths` are wired (they are at lines 148–158). No code change expected.

9. **Acceptance test GREEN** — `src/tests/acceptance/171-bg-token-usage-tracking.acceptance.test.ts` exercises the full path via stubs and verifies the 7 scenarios.

### REFERENCE_FILES

- `src/frameworks/claude/claudeInvoker.ts` lines 60–200 (deps interface), 531–724 (invokeViaBackgroundSession) — main integration site
- `src/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.ts` — orchestrator to extend
- `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts` — contract to extend
- `src/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.ts` — CLI impl pattern reference
- `src/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.ts` — TokenUsage shape (reused unchanged)
- `src/modules/token-accounting/usecases/trackTokenUsage/trackTokenUsage.usecase.ts` — use case to invoke (unchanged)
- `src/frameworks/claude/broadcastBudgetAfterUsage.ts` — broadcast helper (unchanged)
- `src/tests/factories/tokenUsage.factory.ts` — factory pattern + already provides `TokenUsageRecordFactory`
- `src/tests/stubs/claudeSession.stub.ts` — stub pattern to extend
- `src/main/routes.ts` lines 140–160 — composition root wiring verification

### SUMMARY OF FILES TOUCHED

**New (4 files + 1 fixture + 1 acceptance test = 6)**:
- `src/modules/token-accounting/entities/modelPricing/modelPricing.ts`
- `src/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.ts`
- `src/tests/units/modules/token-accounting/entities/modelPricing/modelPricing.test.ts`
- `src/tests/fixtures/claudeCli/sessionTranscript.jsonl`
- `src/tests/acceptance/171-bg-token-usage-tracking.acceptance.test.ts`

**Modified (5)**:
- `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts` (+ getSessionUsage signature)
- `src/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.ts` (+ getSessionUsage impl)
- `src/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.ts` (extend result + call sequence)
- `src/frameworks/claude/claudeInvoker.ts` (replace comment block lines 668–672)
- `src/tests/stubs/claudeSession.stub.ts` (+ stub for getSessionUsage)

**Tests appended (3 existing files)**:
- `src/tests/units/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.test.ts`
- `src/tests/units/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.test.ts`
- `src/tests/units/frameworks/claude/claudeInvoker.test.ts`
