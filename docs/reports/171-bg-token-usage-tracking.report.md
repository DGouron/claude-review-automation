# Report — SPEC-171 Re-enable Token Usage Tracking in --bg Mode

**Spec**: `docs/specs/171-bg-token-usage-tracking.md`
**Plan**: `docs/plans/171-bg-token-usage-tracking.plan.md`
**Status**: implemented
**Worktree**: `.claude/worktrees/spec-171-token-tracking`
**Branch**: `worktree-spec-171-token-tracking`

## Summary

SPEC-171 restores post-completion token usage tracking and budget broadcasting for `--bg` mode reviews after SPEC-169 removed the legacy `stream-json` path. The solution extracts usage from the per-session JSONL transcript at `~/.claude/projects/<cwdSlug>/<sessionId>.jsonl`, sums the four token fields, computes a per-model cost from a hardcoded pricing table, and feeds the result into the existing `TrackTokenUsageUseCase` + `broadcastBudgetAfterUsage` pipeline.

Outer SDD loop: acceptance test was written FIRST and stayed RED throughout the inside-out implementation; it went GREEN at the end. All 7 spec scenarios are covered.

## Files Created (6)

| Path | Purpose |
|------|---------|
| `src/modules/token-accounting/entities/modelPricing/modelPricing.ts` | Per-model pricing table (opus/sonnet/haiku) + `computeCostUsd` pure function. JSDoc pins the source URL and refresh date. |
| `src/modules/claude-invocation/entities/claudeSession/sessionUsage.schema.ts` | Zod schema + `SessionUsageSnapshot` type — cross-layer data carrier. |
| `src/tests/units/modules/token-accounting/entities/modelPricing/modelPricing.test.ts` | 9 cases: opus/sonnet/haiku rates, mixed-tier, unknown-model fallback to opus, zero tokens, versioned suffix matching. |
| `src/tests/fixtures/claudeCli/.claude/projects/-tmp-project-fixture/abc12345.jsonl` | Pinned real-output JSONL fixture — 3 valid assistant turns + 1 user + 1 malformed line; first two sonnet, last opus (verifies R4 last-model rule). |
| `src/tests/acceptance/171-bg-token-usage-tracking.acceptance.test.ts` | Outer SDD loop. Covers all 7 scenarios from the spec. |
| `docs/reports/171-bg-token-usage-tracking.report.md` | This file. |

## Files Modified (5)

| Path | Change |
|------|--------|
| `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts` | Added `getSessionUsage(sessionId, cwd): Promise<SessionUsageSnapshot \| null>` to the interface. |
| `src/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.ts` | Implemented `getSessionUsage`. Constructor now accepts `{ homeDir? }` so tests inject a fixture root. Slug derivation `cwd.replace(/\//g, '-')`. Parses JSONL line-by-line in try/catch; filters `type:"assistant"` with `message.usage`; sums 4 token fields; takes model from last valid entry; computes costUsd via `computeCostUsd`. Returns null when file missing, empty, or all lines invalid. |
| `src/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.ts` | Extended `RunClaudeReviewJobResult` completed variant with `usage: SessionUsageSnapshot \| null`. Calls `sessionGateway.getSessionUsage(session.sessionId, input.localPath)` between `awaitSessionCompletion` and `cleanupClaudeSession`, only when completion outcome is `completed`. Propagates `usage` into the return. |
| `src/frameworks/claude/claudeInvoker.ts` | Replaced the lines 668–672 "disabled" comment block with the actual tracking flow: builds `TokenUsageRecord`, calls `deps.trackTokenUsage.execute(record)`, then `broadcastBudgetAfterUsage(...)` with `localPaths` from `getEnabledLocalPaths?.() ?? [job.localPath]`. Wrapped in try/catch (R7 — broadcast failure non-fatal). On null usage, logs a single warning (R5). Updated return at line 689 to propagate `result.usage?.usage ?? null`. Per R8: applies to all `completed` reviews including followups (no gating). |
| `src/tests/stubs/claudeSession.stub.ts` | Added `getSessionUsageCalls`, `setSessionUsage(value)`, and `async getSessionUsage(...)` implementing the new contract method. |

## Tests Appended (3 existing files)

| Path | New cases |
|------|-----------|
| `src/tests/units/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.test.ts` | +6 cases on `getSessionUsage`: pinned fixture aggregation, missing JSONL, empty file, all-malformed file, non-assistant lines ignored, no parseable usage object. |
| `src/tests/units/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.test.ts` | +4 cases under "SPEC-171" describe: gateway called once on completed + snapshot in result, null usage handled, NOT called on `failed`, NOT called on `timeout`. |
| (none added to `claudeInvoker.test.ts`) | Wiring is covered transitively by `runClaudeReviewJob.test`, `broadcastBudgetAfterUsage.test`, and the acceptance test. Adding a per-line unit test for the orchestrator wiring would have required building integration infrastructure for `invokeViaBackgroundSession` that does not exist yet — anti-overengineering decision. |

## Acceptance Test Status — GREEN (7/7)

`src/tests/acceptance/171-bg-token-usage-tracking.acceptance.test.ts`:

| Scenario | Rule(s) | Status |
|----------|---------|--------|
| `successful-review` | R1, R2, R3, R4, R7 | GREEN |
| `successful-followup` | R8 | GREEN |
| `missing-jsonl` | R5 | GREEN |
| `unparseable-jsonl` | R5 | GREEN |
| `failed-review` | R6 | GREEN |
| `timeout-review` | R6 | GREEN |
| `unknown-model` | R3 fallback | GREEN |

## Self-Review Iterations

| Iteration | Violations found | Fixes applied |
|-----------|-----------------|---------------|
| 1 | TypeScript narrowing on acceptance test `REVIEW_INPUT.jobType = 'review' as const` blocked reuse with `jobType: 'followup'`. | Switched to explicit `RunClaudeReviewJobInput` annotation; removed `as const` literal narrowing. Typecheck GREEN. |
| 2 | Fixture path `../../../../../../` was off-by-one (6 levels resolved to `src/` instead of `src/tests/`). | Corrected to 5 `..` levels. Fixture test GREEN. |

No remaining violations.

## Remaining Issues

None.

## yarn verify — final result

```
Test Files  243 passed (243)
     Tests  1717 passed | 6 todo (1723)
typecheck   OK
lint        OK  (Checked 602 files, no fixes applied)
Done in 18.64s.
```

## Spec Coverage

| Rule / Scenario | Coverage |
|-----------------|----------|
| R1 — extract from JSONL before cleanup, only on `completed` | `runClaudeReviewJob.usecase.ts` order, `runClaudeReviewJob.usecase.test.ts` "calls getSessionUsage once when outcome is completed" |
| R2 — sum 4 token fields across all assistant lines | `claudeSession.cli.gateway.test.ts` "aggregates assistant tokens" |
| R3 — costUsd computed from per-model pricing table | `modelPricing.test.ts` 9 cases |
| R4 — model from LAST assistant message | Fixture pins sonnet→sonnet→opus; gateway test asserts `model === 'claude-opus-4-7'` |
| R5 — missing/unreadable/empty/all-invalid → null + non-crashing | 4 gateway tests + 2 acceptance scenarios |
| R6 — failed/timeout → no track, no broadcast | `runClaudeReviewJob.usecase.test.ts` + 2 acceptance scenarios |
| R7 — broadcast after track, broadcast failure non-fatal | `broadcastBudgetAfterUsage.test.ts` (already existed) + try/catch in `claudeInvoker.ts` |
| R8 — followup reviews track identically | acceptance scenario `successful-followup` |

## Anti-Overengineering Notes

- `modelPricing` is a plain `const` map + one pure function — no class, no factory, no schema (per plan).
- `SessionUsageSnapshot` is a thin data carrier in `claude-invocation` bounded context — keeps `claude-invocation` from importing `token-accounting` entities.
- No new gateway, no new use case — extends existing `ClaudeSessionGateway` with one method and extends `runClaudeReviewJob` result, reuses `TrackTokenUsageUseCase` unchanged.
- Skipped per-line `claudeInvoker.test.ts` integration cases since the orchestrator has no existing integration test harness; coverage delivered transitively by the acceptance test.

## Composition Root

`src/main/routes.ts` lines 148–158 already wire `broadcastBudgetStatus`, `getBudgetStatus`, `budgetStatusPresenter`, and `getEnabledLocalPaths` into `ClaudeInvokerDependencies`. **No change required.**
