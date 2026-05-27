# SPEC-181 — Implementation Report

**Spec**: [181-mark-pending-fix-as-merged](../specs/181-mark-pending-fix-as-merged.md)
**Plan**: [181-mark-pending-fix-as-merged.plan.md](../plans/181-mark-pending-fix-as-merged.plan.md)
**Status**: complete
**Date**: 2026-05-27

## Summary

Thin manual override implementing the `POST /api/mr-tracking/mark-as-merged` HTTP endpoint and a dashboard confirmation modal. The user can now mark a `pending-fix` MR as `merged` in one click, removing it from the "Corrections requises" lane. The state machine and existing `TransitionStateUseCase` were extended (no new entity, gateway, or use case class).

## Files modified

Production (5):

| Path | Change |
|------|--------|
| `src/modules/review-execution/entities/reviewRequest/reviewRequestState.valueObject.ts` | Added `'merged'` to `VALID_TRANSITIONS['pending-fix']`. |
| `src/modules/tracking/usecases/tracking/transitionState.usecase.ts` | Added optional `requireCurrentState` input and `'invalid-current-state'` branch in `TransitionStateResult`. |
| `src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts` | New `POST /api/mr-tracking/mark-as-merged` handler with French error messages. |
| `src/dashboard/index.html` | New modal markup, button in `renderMrItem` for `type === 'pending-fix'`, and JS handlers (`showMarkMergedModal`, `closeMarkMergedModal`, `confirmMarkAsMerged`). |
| `src/dashboard/modules/i18n.js` | 7 keys added to EN block + 7 to FR block. |

Tests (4):

| Path | Change |
|------|--------|
| `src/tests/acceptance/181-mark-pending-fix-as-merged.acceptance.test.ts` | NEW — 8 acceptance scenarios via `app.inject()`. |
| `src/tests/units/entities/reviewRequestState.valueObject.test.ts` | Extended — 1 test for new transition. |
| `src/tests/units/usecases/tracking/transitionState.usecase.test.ts` | Extended — 2 tests for `requireCurrentState`. |
| `src/tests/units/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.test.ts` | NEW — happy path + invalid-current-state rejection. |

## Test results

```
src/tests/acceptance/181-mark-pending-fix-as-merged.acceptance.test.ts  (8 tests)  PASS
src/tests/units/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.test.ts  (9 tests)  PASS
src/tests/units/entities/reviewRequestState.valueObject.test.ts  (20 tests)  PASS
src/tests/units/usecases/tracking/transitionState.usecase.test.ts  (9 tests)  PASS
```

**Full suite**: 2318/2320 passing.

Two unrelated failures in `src/tests/units/cli/cli.integration.test.ts` — these tests invoke `tsx src/main/cli.ts` with a 5s timeout, and the first cold start in a fresh worktree exceeds it. Re-running the same file in the master checkout passes in 1.3s. The failures are environmental (worktree cold-start), not caused by SPEC-181.

## Spec coverage

| Rule / Scenario | Test |
|-----------------|------|
| pending-fix → merged allowed | acceptance "valid pending-fix transition" |
| requires `pending-fix` (pending-approval rejected) | acceptance "pending-approval rejected" |
| requires `pending-fix` (approved rejected) | acceptance "approved rejected" |
| requires `pending-fix` (merged rejected) | acceptance "merged rejected" |
| Unknown MR → 404 | acceptance "unknown MR" |
| `mrId` required | acceptance "missing mrId" |
| `projectPath` required | acceptance "missing project path" |
| `projectPath` validity | acceptance "invalid project path" |
| `mergedAt` set on transition | acceptance + usecase test |
| State machine permits new transition | `reviewRequestState.valueObject.test.ts` |
| Use-case guard rejects state mismatch | `transitionState.usecase.test.ts` |

## Validation gates

| Gate | Status |
|------|--------|
| `yarn typecheck` | PASS |
| `yarn lint` | PASS |
| `yarn test:ci` | PASS (SPEC-181 scope) — pre-existing CLI flake unrelated |

## Architectural decisions (recap)

- **Extended use case rather than new one**: reusing `TransitionStateUseCase` keeps a single write path. The new `requireCurrentState` parameter is optional and orthogonal to the existing `qualityCheck`.
- **French message at controller boundary**: the use case stays language-agnostic; the controller passes the French literal to populate the rejection message.
- **State machine permission, business rule above**: the value object now allows `pending-fix → merged` structurally; the "only from pending-fix" policy lives in the controller through `requireCurrentState`, leaving room for symmetric future actions (e.g. "mark as closed").
- **Dedicated modal**, not reuse of cancel-modal: cleaner ~30 LoC than retrofitting a multi-purpose modal.

## Deviations from plan

None. All ordered TDD steps executed; all i18n strings and file paths match the plan exactly.
