# Report — Spec #46: GitHub Followup Review on Push

```
FINAL_REPORT:
  STATUS: OK Clean
  FILES_CREATED: 2
  FILES_MODIFIED: 5
  TESTS_TOTAL: 1507
  TESTS_PASSED: 1507
  REVIEW_ITERATIONS: 1
  VIOLATIONS_FOUND: 1
  VIOLATIONS_FIXED: 1
  REMAINING_ISSUES: []
  ACCEPTANCE_TEST:
    file: src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts
    status: GREEN (8/8)
  YARN_VERIFY: OK (typecheck + lint + test:ci)
```

## Summary

Brings GitHub PRs to parity with GitLab MRs for push-triggered followup reviews. No new entities, no new use cases, no new gateways. The work is wiring + filter + system-prompt fix.

All required infrastructure was already in place: `RecordPushUseCase`, `CheckFollowupNeededUseCase`, `TransitionStateUseCase`, `SyncThreadsUseCase`, `GitHubThreadFetchGateway`, `GitHubDiffMetadataFetchGateway`, `GitHubReviewActionCliGateway`, `executeActionsFromContext` (platform-dispatching), `DEFAULT_FOLLOWUP_AGENTS`, `loadProjectConfig`, `getFollowupAgents`.

## Files created

| Path | Description |
|------|-------------|
| `src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts` | SDD outer-loop acceptance test (8 scenarios) |
| `src/tests/units/frameworks/claude/claudeInvoker.test.ts` | Unit tests for `buildMcpSystemPrompt` platform branching (6 tests) |

## Files modified

| Path | Change |
|------|--------|
| `src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts` | Added `filterGitHubPrUpdate(event)` — mirrors `filterGitLabMrUpdate` |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | Extended `GitHubWebhookDependencies` with 4 followup use cases; inserted followup branch in `handleGitHubWebhook` (record push → check followup → check autoFollowup → enforce budget → enqueue followup) |
| `src/main/routes.ts` | Injected `RecordPushUseCase`, `TransitionStateUseCase`, `CheckFollowupNeededUseCase`, `SyncThreadsUseCase` into the GitHub webhook composition |
| `src/frameworks/claude/claudeInvoker.ts` | Exported `buildMcpSystemPrompt`; made `gh pr diff/view` vs `glab mr diff/view` platform-conditional |
| `src/tests/factories/gitHubEvent.factory.ts` | Added `createSynchronizePr()` helper |
| `src/tests/units/interface-adapters/controllers/webhook/eventFilter.test.ts` | Added 4 unit tests for `filterGitHubPrUpdate` |
| `src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts` | Added 6 unit tests covering the followup branch (mock pattern: vi.fn().mockReturnValue) |
| `docs/feature-tracker.md` | Status: `planned` → `implementing` |

## Test counts

| Suite | Tests |
|-------|-------|
| Acceptance (`46-github-followup-review-on-push.acceptance.test.ts`) | 8 / 8 GREEN |
| Unit — `eventFilter.test.ts` | 40 / 40 GREEN (4 new) |
| Unit — `claudeInvoker.test.ts` | 6 / 6 GREEN (all new) |
| Unit — `github.controller.test.ts` | 18 / 18 GREEN (6 new) |
| **Full suite (`yarn test:ci`)** | **1507 / 1507 GREEN** |

## Self-review iterations

**1 iteration.**

Issue found during the first pass after acceptance test wiring: the helper `createMockTrackingGateway(mrOverride = null)` used `null` as default parameter, which was indistinguishable from the explicit "no tracked MR" signal. The happy-path acceptance test called `createMockTrackingGateway()` (no arg) and got back a gateway with `recordPush()` returning `null` — same as the "PR not tracked" branch.

**Fix:** Introduced a dedicated `NO_TRACKED_MR` symbol as the sentinel for the "no MR" case, and made the default parameter `= {}` so that calling without args yields the default tracked MR. After this fix:
- Happy path (no args)             → returns a default `TrackedMr` with `autoFollowup: true`
- Explicit override `{ autoFollowup: false }` → returns a `TrackedMr` with the override applied
- `NO_TRACKED_MR` sentinel         → returns `null` (no MR tracked)

Two follow-up typecheck errors surfaced (re-assigning `defaultDeps.checkFollowupNeeded = { execute: vi.fn() }` and `defaultDeps.recordPush = { execute: vi.fn(...) }`) because the interface requires the full `*UseCase` class type. Switched to `(deps.recordPush.execute as ReturnType<typeof vi.fn>).mockReturnValue(...)` — the same pattern already in use in `gitlab.controller.test.ts` and `github.controller.test.ts`.

## Spec coverage

### Feature: Push-Triggered Followup on GitHub PR

| Scenario | Test covering it |
|----------|------------------|
| Push triggers followup on PR with open blocking threads | acceptance `Push triggers followup on PR with open blocking threads` + controller `records push, checks followup, and enqueues followup job on synchronize` |
| Followup resolves threads and posts report | controller test exercises the enqueue callback path (context create, action execution branches in code) |
| No followup when PR has no open threads | acceptance `No followup when PR has no open threads` + controller `does not enqueue when checkFollowupNeeded returns false` |
| No followup when autoFollowup is disabled | acceptance `No followup when autoFollowup is disabled` + controller `does not enqueue when autoFollowup is disabled` |
| No followup when PR is not tracked | acceptance `No followup when PR is not tracked (no MR found)` + controller `does not enqueue when no MR is tracked (recordPush returns null)` |
| No followup when no push since last review | covered by `checkFollowupNeeded` returning false (same as "no open threads" case) |
| Push on draft PR is ignored | acceptance `Push on draft PR is ignored` + controller `does not enqueue followup on draft PR synchronize` + filter test `should not process synchronize events on draft PRs` |
| Push on closed PR is ignored | acceptance `Push on closed PR is ignored` + filter test `should not process synchronize events on closed PRs` |

### Feature: Manual Followup from Dashboard (Bug Fix)

| Scenario | Test covering it |
|----------|------------------|
| MCP system prompt contains `gh pr diff` (not `glab mr diff`) when platform is github | acceptance `Platform-specific CLI commands in system prompt: GitHub uses gh pr diff and gh pr view` + unit `references gh pr diff as the diff source of truth` + unit `does not reference glab commands when platform is github` |
| MCP system prompt contains `gh pr view` (not `glab mr view`) when platform is github | acceptance + unit `references gh pr view as the metadata source of truth` |
| MCP system prompt keeps `glab mr diff/view` when platform is gitlab | acceptance `Manual followup on GitLab MR still works` + unit `references glab mr diff/view as the source of truth` + unit `does not reference gh commands when platform is gitlab` |
| Manual followup executes actions instead of producing a plan | covered indirectly: the platform-aware prompt fix is the root-cause repair; the executing logic was already in place |

### Feature: GitHub Push Event Filtering

| Scenario | Test covering it |
|----------|------------------|
| Synchronize action on open non-draft PR passes filter | unit `should process synchronize events as followup` |
| Synchronize action on closed PR is rejected | unit `should not process synchronize events on closed PRs` |
| Synchronize action on draft PR is rejected | unit `should not process synchronize events on draft PRs` |
| Non-synchronize actions are rejected | unit `should not process opened action` |

## Risks confirmed

1. **`findRepositoryByRemoteUrl` vs `findRepositoryByProjectPath`** — GitHub branch correctly uses `findRepositoryByRemoteUrl(event.repository.clone_url)`. No regression.
2. **`extractBaseUrl` is GitLab-only** — kept GitHub followup symmetric with the existing GitHub review branch: no `baseUrl` passed to `executeActionsFromContext`. Out of scope to port.
3. **`event.repository.clone_url` availability** — confirmed required by the GitHub PR event guard schema.
4. **`buildMcpSystemPrompt` non-exported** — single-token change applied (`function` → `export function`). No behavior impact.

## Remaining issues

None.

## How to verify

```bash
yarn test:ci src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts
yarn verify
```

Both commands pass green at completion.
