# SPEC-180 — Implementation Report (Iteration C)

## Status

**Iteration C: implemented** — platform-side approval revocation + French explanatory comment on a platform `approved` event reaching a non-qualified merge request without an active bypass. Covers spec scenario 6 on both GitLab and GitHub.

Iter A (internal gate) and iter B (comment-based bypass) remain green; nothing in their behaviour changed.

## Scope honoured

| Item | Status |
|------|--------|
| Spec scenario 6 (GitLab) | covered by acceptance test + use-case unit tests |
| Spec scenario 6 (GitHub) | covered by acceptance test + new `pull_request_review` event branch |
| Iter A scenarios (1, 2, 3, 7, 8) | unchanged, still GREEN |
| Iter B scenarios (4, 5, 9, 10) | unchanged, still GREEN |
| `evaluateQualityGate` signature | untouched |
| `parseBypassMarker` signature | untouched |
| `RecordBypassUseCase` body | untouched |
| `mrTracking.routes.ts` HTTP approve | untouched (iter A scope) |

## Files created

| File | Purpose |
|------|---------|
| `src/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.ts` | Use case: composes `evaluateQualityGate` + bypass check + tracking-gateway read. Returns discriminated union `{ kind: 'allowed' \| 'bypass-active' \| 'mr-not-found' \| 'reverted' }`. Owns the FR explanatory message literal. |
| `src/modules/platform-integration/entities/approvalRevocation/approvalRevocation.gateway.ts` | Gateway contract `revoke({ projectPath, mrNumber, reviewId?, dismissalMessage? })`. |
| `src/modules/platform-integration/interface-adapters/gateways/cli/approvalRevocation.gitlab.cli.gateway.ts` | GitLab CLI impl via `glab api --method POST .../approvals/unapprove`. |
| `src/modules/platform-integration/interface-adapters/gateways/cli/approvalRevocation.github.cli.gateway.ts` | GitHub CLI impl via `gh api --method PUT .../reviews/<id>/dismissals`. Requires `reviewId`. |
| `src/modules/platform-integration/entities/github/githubPullRequestReviewEvent.guard.ts` | Zod guard for GitHub `pull_request_review` payloads. |
| `src/tests/stubs/approvalRevocation.stub.ts` | In-memory stub recording revoke calls (with optional throw mode). |
| `src/tests/units/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.test.ts` | 8 unit tests: mr-not-found, bypass-active, no-review-yet, no-threshold, score≥threshold, boundary, below-threshold, blockers-present. |
| `src/tests/units/modules/platform-integration/entities/github/githubPullRequestReviewEvent.guard.test.ts` | 4 unit tests for the guard. |
| `src/tests/acceptance/180-quality-threshold-block-approval-iter-C.acceptance.test.ts` | SDD outer-loop acceptance test, 2 scenarios (GitLab + GitHub) for spec scenario 6. |

## Files modified

| File | Change |
|------|--------|
| `src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts` | Added `PullRequestReviewFilterResult` + `filterGitHubPullRequestReviewEvent`. |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` | Approve branch (lines 300-311 in original) replaced with gate-aware flow. `GitLabWebhookDependencies` extended with `handlePlatformApproval`, `approvalRevocationGateway`, `getQualityThreshold`. Best-effort I/O: try/catch around `revoke()` and `postComment()` — log + continue. |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | New `handleGitHubPullRequestReviewHook` helper dispatched on `eventType === 'pull_request_review'`. `GitHubWebhookDependencies` extended with the same three new fields. Dismissal label localised to FR. |
| `src/main/routes.ts` | Wired two new gateways (`GitLab/GitHubApprovalRevocationCliGateway`), one new use case per webhook registration (`HandlePlatformApprovalUseCase`), and the `getQualityThreshold` closure (reuses `loadProjectConfig`). |
| `src/tests/units/interface-adapters/controllers/webhook/eventFilter.test.ts` | 5 new tests for `filterGitHubPullRequestReviewEvent` (submitted+approved, changes_requested, commented, dismissed, edited). |
| `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts` | `createDefaultDeps` extended with the new fields (HandlePlatformApprovalUseCase, StubApprovalRevocationGateway, `getQualityThreshold: () => null`). Existing assertions preserved. |
| `src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts` | `createMockDeps` extended with stub versions of the three new dependencies. |
| `docs/feature-tracker.md` | SPEC-180 status `planned` → `implemented`. |

## Tests

- **Acceptance** (iter C only): 2 scenarios (GitLab + GitHub) — both GREEN.
- **Acceptance (all SPEC-180)**: iter A (5), iter B (4), iter C (2) — 11 GREEN.
- **Unit (new)**: 8 use-case + 4 guard + 5 eventFilter = 17 new tests.
- **Unit (modified)**: gitlab.controller.test (14) and github.controller.test (23) still pass.
- **Full suite**: `yarn test:ci` → 295 test files, **2232 tests**, all GREEN (+19 vs iter B baseline of 2213).

## Quality gates

| Gate | Result |
|------|--------|
| `yarn typecheck` | PASS |
| `yarn lint` | PASS |
| `yarn test:ci` | PASS (2232/2232) |
| `yarn verify` | PASS (~27s) |

## Architectural decisions honoured

- **Use-case-driven verdict, controller-driven I/O** — `HandlePlatformApprovalUseCase` is pure (only reads the tracking gateway). The controller reacts to the `kind: 'reverted'` verdict by orchestrating the platform-side `revoke()` + FR comment post, mirroring iter B's `RecordBypassUseCase` pattern.
- **No new entity, no new value object** — the policy is the same iter-A `evaluateQualityGate` + iter-B `mr.bypass !== null` short-circuit, composed at the use-case layer. No `ApprovalGuard` aggregate, no `RevocationDirective` value object.
- **Separate `ApprovalRevocationGateway`** from `NoteCommentPostGateway` (iter B) and `ReviewActionGateway` (review pipeline) — different lifecycle (one-shot webhook call, no batching, no ExecutionContext), explicit per-platform CLI shape.
- **No new state in the state machine** — internal `TrackedMr.state` remains `pending-approval` after a revert (iter A's gate already blocks the `approved` transition). The revert is purely a platform-side side effect + an FR comment.
- **Best-effort I/O with log-and-continue** — both `revoke()` and `postComment()` are wrapped in try/catch. Failure on one does NOT abort the other; both failures only log at `warn` level. Internal tracking state is never reverted on I/O failure (it stays consistent with iter A's "transition rejected" outcome).
- **FR template owned by the use case** — same pattern as iter A's `evaluateQualityGate` messages and iter B's `MISSING_REASON_MESSAGE`. Two strings: below-threshold (spec literal) + blockers-present (derived for spec-rule symmetry).
- **GitHub event surface** — new `pull_request_review` event branch in `github.controller.ts`. GitLab continues to use its existing `Merge Request Hook` payload with `action: 'approved'`.

## Failure modes for the revoke / comment I/O

| Failure | Effect | Log |
|---------|--------|-----|
| GitLab `glab api .../unapprove` fails (auth, 403, network) | Approval stays on the platform. FR comment is still posted. Internal tracking unchanged. | `warn` with `{ mrNumber, error: <message> }` and message `Failed to revoke GitLab approval; continuing with FR comment`. |
| GitHub `gh api .../dismissals` fails (e.g. branch-protection forbids dismissal, missing reviewId edge case) | Approval review stays visible. FR comment is still posted. Internal tracking unchanged. | `warn` with `{ prNumber, error: <message> }` and message `Failed to dismiss GitHub approval review; continuing with FR comment`. |
| `NoteCommentPostGateway.postComment` fails (auth, 403, network) | Platform revocation already attempted (success or fail). User has no FR explanation surface. Internal tracking unchanged. | `warn` with `{ mrNumber/prNumber, error: <message> }` and message `Failed to post FR explanation comment after ...`. |
| `transitionState` returns `{ ok: false, reason: 'not-found' }` (MR not tracked) | No revoke, no comment. Reply 200 with `status: 'ignored', reason: 'not-found'`. | `info` log `GitLab approval ignored (MR not tracked)`. |
| `handlePlatformApproval` returns `kind: 'bypass-active'` | No revoke, no comment. Reply 200 with `status: 'ignored', reason: 'bypass-active'`. | No additional log. |

No retry, no backoff — per the iter-C plan's `error_handling_on_unapprove_failure` decision. Documented in the use-case test (`StubApprovalRevocationGateway.shouldThrow` is available for future error-path tests).

## Confirmation: iter A + B acceptance tests still pass

```
yarn test:ci src/tests/acceptance/180-quality-threshold-block-approval*.acceptance.test.ts
  ✓ iter A: 5 tests
  ✓ iter B: 4 tests
  ✓ iter C: 2 tests
  Total: 11/11 GREEN
```

## Scenario coverage matrix

| # | Behaviour | Mechanism (iter) |
|---|-----------|------------------|
| 1 | score above threshold + no blockers → pending-approval | iter A `evaluateQualityGate` |
| 2 | score below threshold → reject FR | iter A `evaluateQualityGate` + `transitionState` |
| 3 | blockers present → reject FR | iter A `evaluateQualityGate` |
| 4 | bypass with reason allows transition | iter B `RecordBypassUseCase` + `transitionState` short-circuit |
| 5 | bypass without reason → reject FR | iter B `parseBypassMarker` + `RecordBypassUseCase` + `NoteCommentPostGateway` |
| 6 | platform approval on non-qualified MR → revoke + FR comment | **iter C** `transitionState` → `HandlePlatformApprovalUseCase` → `ApprovalRevocationGateway` + `NoteCommentPostGateway` |
| 7 | no review yet → allow | iter A `evaluateQualityGate` (latestScore=null) |
| 8 | no threshold configured → allow | iter A `evaluateQualityGate` (threshold=null) |
| 9 | new review resets bypass | iter B `recordReviewCompletion` writes `bypass: null` |
| 10 | bypass on already-qualified MR → recorded, no state change | iter B `recordBypass` |

## Final summary

SPEC-180 is now end-to-end implemented across the three planned iterations:

1. internal quality gate (iter A);
2. comment-based bypass mechanism (iter B);
3. platform-side revocation with FR explanatory comment (iter C — this report).

Total new SPEC-180 surface delivered: 14 production files + 11 test files spread across the three iterations. The codebase remains green on `yarn verify` (295 test files, 2232 tests, ~27s).
