# SPEC-180 — Implementation Report (Iteration A)

## Status

**Iteration A: implemented** — internal quality gate covering scenarios 1, 2, 3, 7, 8.
**Iteration B: pending** — comment-based bypass (scenarios 4, 5, 9, 10).
**Iteration C: pending** — platform unapprove + French explanatory comment (scenario 6).

## Files created

| File | Purpose |
|------|---------|
| `src/modules/tracking/entities/qualityGate/qualityGate.ts` | Pure evaluator: `evaluateQualityGate({ latestScore, blockingIssues, threshold }) → { allowed: true } \| { allowed: false; reason; message }`. French messages produced here. |
| `src/tests/units/modules/tracking/entities/qualityGate/qualityGate.test.ts` | Unit tests covering: threshold=null, latestScore=null, blockers>0, score<threshold, score>=threshold, boundary cases. |
| `src/tests/units/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.test.ts` | Unit tests for the `POST /api/mr-tracking/approve` gate (200/409 + French messages). |
| `src/tests/acceptance/180-quality-threshold-block-approval.acceptance.test.ts` | SDD acceptance test, 5 scenarios exercising the Fastify route end-to-end via `app.inject()`. |

## Files modified

| File | Change |
|------|--------|
| `src/config/projectConfig.ts` | Added optional `qualityThreshold?: number` (integer 0-10) parsed with defensive validation. Absent → undefined → no gating. |
| `src/tests/factories/projectConfig.factory.ts` | Propagates the new optional field in `ProjectConfigOverrides`. |
| `src/tests/units/config/projectConfig.test.ts` | New tests for threshold parsing + range validation. |
| `src/modules/tracking/usecases/tracking/transitionState.usecase.ts` | Added optional `qualityCheck` callback. Return type now `{ ok: true } \| { ok: false; reason: string }`. Gate runs only when `targetState === 'approved'`. |
| `src/tests/units/usecases/tracking/transitionState.usecase.test.ts` | Tests for new return shape + gate rejection/acceptance paths. |
| `src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts` | Accepts optional `qualityThreshold`. Uses `evaluateQualityGate` to decide between `pending-fix` and `pending-approval`. |
| `src/tests/units/usecases/tracking/recordReviewCompletion.usecase.test.ts` | New tests: low score keeps `pending-fix`, no threshold preserves legacy behavior. |
| `src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts` | New `getQualityThreshold` option. Gate enforced on `POST /api/mr-tracking/approve` → returns HTTP 409 + French message on rejection. |
| `src/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.ts` | Adapted to the new discriminated-union return shape of `transitionState`. |
| `src/main/routes.ts` | Wires the `getQualityThreshold` closure reading from `loadProjectConfig(projectPath).qualityThreshold`. |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` | Passes `qualityThreshold` from ProjectConfig to `recordCompletion.execute`. No change to platform-approval branch (Iteration C scope). |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | Same as GitLab controller. |

## Tests

- **Acceptance**: 5 scenarios — all GREEN.
- **Unit (new)**: ~15 new tests across `qualityGate.test.ts` and `mrTracking.routes.test.ts`.
- **Unit (modified)**: existing `transitionState` and `recordReviewCompletion` test files updated for the new return shape; existing assertions preserved.
- **Full suite**: `yarn verify` → 287 test files, 2190 tests, all GREEN.

## Quality gates

| Gate | Result |
|------|--------|
| `yarn typecheck` | PASS |
| `yarn lint` | PASS |
| `yarn test:ci` | PASS (2190/2190) |
| `yarn verify` | PASS (24.69s) |

## Architectural decisions honored

- Quality-gate evaluator lives in the **entity layer** as a pure function — no class, no value object, no I/O.
- Gate enforced in the **use-case layer** (`TransitionStateUseCase` and `RecordReviewCompletionUseCase`); the `ReviewRequestState` value object stays a pure structural state machine.
- Threshold reaches the system through `ProjectConfig` (single source of truth, backward compatible).
- French messages produced by the pure evaluator, returned untouched to the HTTP client; tests/logs/code remain English.
- `transitionState` modified rather than wrapping in a new `ApproveMr` use case — preserves single-write semantics.

## Naming/convention notes

- "Blockers" in the spec map to the existing `openThreads` field on `TrackedMr` (unresolved discussion threads). The evaluator's input is named `blockingIssues` to remain agnostic; the controllers/use cases bind it to `openThreads`.

## Out-of-iteration scope (deferred, documented)

The following scenarios from the spec remain unimplemented and are explicitly out of Iteration A's scope:

- **Scenario 4** — bypass with reason allows transition (Iteration B).
- **Scenario 5** — bypass without reason rejected (Iteration B).
- **Scenario 6** — platform approval on non-qualified MR triggers unapprove + French comment (Iteration C).
- **Scenarios 9, 10** — bypass reset on new review, bypass on already-qualified MR (Iteration B).

These will be tackled in follow-up iterations and do not block shipping Iteration A.

## Self-review iterations

Two self-review passes inside the implementer agent. No architectural violations surfaced. One naming adjustment: `blockingIssues` (parameter) vs `openThreads` (entity field) was confirmed as intentional decoupling, not a hallucination.

## Notes for next iteration (B)

- Webhook note/comment event filters do NOT exist today — `eventFilter.ts` is MR-event scoped. Iteration B will need to extend the webhook event surface.
- Bypass storage: candidate location is a new optional field `bypass: { author, reason, timestamp } | null` on `TrackedMr`, with reset logic plugged into `RecordReviewCompletionUseCase`.
- Re-use the existing `evaluateQualityGate` evaluator — bypass acts as a wrapping decorator at the use-case layer, not inside the pure evaluator.
