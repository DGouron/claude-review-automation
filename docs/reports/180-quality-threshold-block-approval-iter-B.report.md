# SPEC-180 — Implementation Report (Iteration B)

## Status

**Iteration B: implemented** — comment-based bypass via `/bypass-quality "raison"` covering scenarios 4, 5, 9, 10.

Iteration A: implemented (separate PR #209).
Iteration C: pending — platform unapprove + French comment on approval webhook for non-qualified MR without active bypass.

## Files created

| File | Purpose |
|------|---------|
| `src/modules/tracking/entities/bypassMarker/bypassMarker.ts` | Pure parser: regex on `/bypass-quality "..."` → `{ kind: 'no-marker' \| 'valid' (+ reason) \| 'invalid-missing-reason' }`. |
| `src/modules/tracking/usecases/tracking/recordBypass.usecase.ts` | Composes parser + tracking gateway. Returns discriminated union including FR rejection message for missing reason. Injected `now()` for deterministic tests. |
| `src/modules/platform-integration/entities/gitlab/gitlabNoteEvent.guard.ts` | Zod guard for GitLab `Note Hook` payloads (`object_kind: 'note'`, `noteable_type: 'MergeRequest'`). |
| `src/modules/platform-integration/entities/github/githubIssueCommentEvent.guard.ts` | Zod guard for GitHub `issue_comment` payloads (`action: 'created'`, `issue.pull_request` present). |
| `src/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.ts` | Gateway contract `postComment({ projectPath, mrNumber, body })`. |
| `src/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.gitlab.cli.gateway.ts` | CLI impl using `glab api .../notes` POST pattern. |
| `src/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.github.cli.gateway.ts` | CLI impl using `gh api .../comments` POST pattern. |
| `src/tests/stubs/noteCommentPost.stub.ts` | In-memory stub recording posted comments for tests. |
| `src/tests/units/modules/tracking/entities/bypassMarker/bypassMarker.test.ts` | Unit tests for parser (marker present/absent, quoted reason, empty reason, whitespace). |
| `src/tests/units/modules/tracking/usecases/recordBypass.usecase.test.ts` | Unit tests for the use case (each result branch). |
| `src/tests/units/modules/platform-integration/entities/.../gitlabNoteEvent.guard.test.ts` | Unit tests for GitLab guard. |
| `src/tests/units/modules/platform-integration/entities/.../githubIssueCommentEvent.guard.test.ts` | Unit tests for GitHub guard. |
| `src/tests/acceptance/180-quality-threshold-block-approval-iter-B.acceptance.test.ts` | SDD acceptance test for scenarios 4, 5, 9, 10. |

## Files modified

| File | Change |
|------|--------|
| `src/modules/tracking/entities/tracking/trackedMr.ts` | Added optional `bypass: { author; reason; recordedAt } \| null` field (exported `BypassRecord` type). Default `null`. |
| `src/tests/factories/trackedMr.factory.ts` | Added `bypass` to overrides (defaults to `null`). |
| `src/modules/tracking/usecases/tracking/transitionState.usecase.ts` | Short-circuits the `qualityCheck` callback when `mr.bypass !== null` (bypass active → transition allowed regardless of gate). |
| `src/tests/units/usecases/tracking/transitionState.usecase.test.ts` | New tests covering the bypass short-circuit path. |
| `src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts` | Clears `bypass: null` in the update payload on every completed review (scenario 9 reset). |
| `src/tests/units/usecases/tracking/recordReviewCompletion.usecase.test.ts` | New tests verifying bypass reset on new review. |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts` | New exports `filterGitLabNoteEvent` and `filterGitHubIssueCommentEvent` — top-of-pipeline event-type checks for note/comment payloads. |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` | Top-of-pipeline branch: when event is `Note Hook` on a MR → parse comment, call `RecordBypassUseCase`, on rejected-missing-reason post FR comment back via `NoteCommentPostGateway`. NO change to platform-approval branch (iter C scope). |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | Same as GitLab for `issue_comment` event type. |
| `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts` | New tests for note event handling. |
| `src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts` | New tests for issue_comment event handling. |
| `src/main/routes.ts` | Wires the two `NoteCommentPostGateway` impls + the `RecordBypassUseCase` instance. |

### Necessary side-effect modifications

These were touched only to keep the build green after `TrackedMr` gained the `bypass` field. No logic change beyond propagation:

| File | Reason |
|------|--------|
| `src/modules/tracking/usecases/tracking/trackAssignment.usecase.ts` | Adds `bypass: null` to the freshly created `TrackedMr`. |
| `src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts` | Updated fixture to include `bypass: null` where it asserts on a full TrackedMr shape. |
| `src/tests/units/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.test.ts` | Same factory propagation. |

## Tests

- **Acceptance**: 4 scenarios (4, 5, 9, 10) — all GREEN.
- **Unit (new)**: ~20 new tests across parser, use case, guards.
- **Unit (modified)**: existing transitionState + recordReviewCompletion test files extended for bypass paths.
- **Full suite**: `yarn verify` → 292 test files, 2213 tests, all GREEN.

## Quality gates

| Gate | Result |
|------|--------|
| `yarn typecheck` | PASS |
| `yarn lint` | PASS |
| `yarn test:ci` | PASS (2213/2213, +23 new) |
| `yarn verify` | PASS |

## Architectural decisions honored

- **Pure parser at entity layer** — `parseBypassMarker(commentBody)` returns a discriminated union, no FR message, no I/O.
- **FR rejection message owned by the use case**, not the parser. Keeps the parser context-free (reusable, no localization coupling).
- **Use case is I/O-free except for the tracking gateway** — does NOT post the rejection comment itself. The controller orchestrates the I/O (post comment via `NoteCommentPostGateway`) based on the use case's discriminated-union result.
- **Bypass short-circuit at the use-case decorator level** — `evaluateQualityGate` is untouched. The bypass is an orthogonal override composed in `transitionState.usecase`.
- **No new entity for bypass** — stored as a value attached to `TrackedMr`. DDD strategic-only scope respected.
- **Separate `NoteCommentPostGateway`** from `ReviewActionGateway` — different lifecycle (one-shot from webhook context vs batched review actions).

## Scenario coverage

| # | Behavior | Mechanism |
|---|----------|-----------|
| 4 | bypass with reason allows transition | `recordBypass` stores bypass → `transitionState` short-circuits gate when `mr.bypass !== null` |
| 5 | bypass without reason rejected with FR message | `parseBypassMarker` → `'invalid-missing-reason'` → use case returns `'rejected-missing-reason'` + FR message → controller posts comment via `NoteCommentPostGateway` |
| 9 | new review resets the bypass | `recordReviewCompletion` writes `bypass: null` on every completed review |
| 10 | bypass on already qualified MR acknowledged, no state change | `recordBypass` stores the bypass (the storage IS the acknowledgement); transition gating is unchanged because no transition is triggered by a comment alone |

## Out-of-iteration scope (deferred to Iteration C)

- Scenario 6: platform approval on non-qualified MR triggers unapprove + FR comment.

This requires:
- `Unapprove` gateway contracts + GitLab/GitHub CLI impls (`glab mr unapprove`, `gh pr review --request-changes` or equivalent).
- Detection in the platform-approval branches of `gitlab.controller.ts` / `github.controller.ts` (around line 225+).
- A FR comment template explaining the rejection and the bypass procedure.

Reuses the `NoteCommentPostGateway` introduced in iter B for the explanatory comment.
