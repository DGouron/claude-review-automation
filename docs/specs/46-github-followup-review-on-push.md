---
title: "SPEC-046: GitHub Followup Review on Push"
status: draft
issue: "#46"
labels: enhancement, P1-critical, webhook
milestone: "Bug Fixes & Parity"
---

# SPEC-046: GitHub Followup Review on Push

## User Story

As a developer working on a GitHub PR that received a code review with blocking threads,
I want the system to automatically trigger a followup review when I push fixes,
so that resolved threads are closed and a followup report is posted without manual intervention -- exactly like it already works on GitLab.

## Context

### Problem

ReviewFlow has full followup support on GitLab: when a developer pushes new commits to a MR that has open blocking threads, the system automatically detects the push, checks if a followup is needed, and launches a followup review that resolves threads and posts a report. On GitHub, none of this happens. Push events are silently ignored because:

1. The GitHub webhook controller (`github.controller.ts`) only handles `pull_request` events with `review_requested`, `labeled`, or `closed` actions. There is no equivalent of the GitLab `filterGitLabMrUpdate` path that detects pushes.
2. The GitHub webhook handler dependency list (`GitHubWebhookDependencies`) is missing the four use cases required for followup: `RecordPushUseCase`, `TransitionStateUseCase`, `CheckFollowupNeededUseCase`, and `SyncThreadsUseCase`.
3. The composition root (`routes.ts`) does not inject these dependencies for the GitHub webhook route.

Additionally, a separate bug affects **manual followup from the dashboard** for GitHub PRs: Claude produces a "plan" instead of executing actions. Root cause: the MCP system prompt in `claudeInvoker.ts` hardcodes GitLab CLI commands (`glab mr diff`, `glab mr view`) regardless of the platform. When the platform is GitHub, Claude receives instructions referencing `glab` commands that do not exist, causing it to fall back to planning mode instead of executing.

### How it works today on GitLab (reference implementation)

The GitLab controller (`gitlab.controller.ts`, lines 186-408) implements the followup flow:

1. **Event arrives**: A `Merge Request Hook` with `action: "update"` is received.
2. **Filter**: `filterGitLabMrUpdate()` identifies it as a potential followup (`isFollowup: true`).
3. **Record push**: `recordPush.execute()` timestamps the push event on the tracked MR.
4. **Check eligibility**: `checkFollowupNeeded.execute()` verifies:
   - MR is in `pending-fix` state (or `pending-approval` with warnings)
   - `lastPushAt > lastReviewAt` (push happened after last review)
5. **Check autoFollowup**: If `mr.autoFollowup === false`, skip.
6. **Create context**: Threads and diff metadata are fetched, review context file is created with followup agents.
7. **Invoke Claude**: `invokeClaudeReview()` runs the followup skill.
8. **Execute actions**: Context actions (thread resolve, reply, comment) are executed via the appropriate CLI gateway.
9. **Sync & record**: Threads are synced from the platform, followup completion is recorded with stats.

### What needs to change for GitHub

| Component | Current state | Required change |
|-----------|--------------|-----------------|
| `github.controller.ts` | Only handles `review_requested`, `labeled`, `closed` | Add `synchronize` action handling for push-triggered followup |
| `GitHubWebhookDependencies` | Missing `recordPush`, `transitionState`, `checkFollowupNeeded`, `syncThreads` | Add all four use case dependencies |
| `routes.ts` composition root | Does not inject followup deps for GitHub | Inject `RecordPushUseCase`, `TransitionStateUseCase`, `CheckFollowupNeededUseCase`, `SyncThreadsUseCase` |
| `eventFilter.ts` | No `filterGitHubPrUpdate()` function | Add push/synchronize filter for GitHub PRs |
| `claudeInvoker.ts` | `buildMcpSystemPrompt()` hardcodes `glab` commands | Conditionally use `gh pr diff` / `gh pr view` when platform is `github` |

### GitHub push event specifics

On GitHub, when a developer pushes commits to a PR branch, a `pull_request` webhook is sent with `action: "synchronize"`. The event payload includes the same `pull_request` object with `number`, `state`, `head.ref`, `base.ref`, etc. This is the equivalent of GitLab's `action: "update"` on a MR.

## Gherkin Scenarios

### Feature: Push-Triggered Followup on GitHub PR

```gherkin
Feature: Automatic followup review when developer pushes fixes to a GitHub PR

  Background:
    Given a GitHub repository is configured in ReviewFlow
    And the GitHub webhook secret is valid

  Scenario: Push triggers followup on PR with open blocking threads
    Given PR #42 has been reviewed with 3 blocking threads
    And PR #42 is in "pending-fix" state
    And autoFollowup is enabled for PR #42
    When the developer pushes new commits to PR #42
    And a "pull_request" webhook with action "synchronize" is received
    Then the push event is recorded on PR #42
    And a followup review job is enqueued with jobType "followup"
    And the webhook responds with status 202 and status "followup-queued"

  Scenario: Followup resolves threads and posts report
    Given a followup review job is running for PR #42
    When Claude completes the followup review
    Then resolved threads are closed on the PR via GitHub GraphQL API
    And a followup report is posted as a PR comment
    And the followup completion is recorded with thread close count
    And threads are synced from GitHub to update tracking state

  Scenario: No followup when PR has no open threads
    Given PR #42 has been reviewed with 0 blocking threads
    And PR #42 is in "pending-approval" state with 0 warnings
    When the developer pushes new commits to PR #42
    Then the push event is recorded
    But no followup review is triggered
    And the webhook responds with status 200 and reason "ignored"

  Scenario: No followup when autoFollowup is disabled
    Given PR #42 has been reviewed with 2 blocking threads
    And PR #42 is in "pending-fix" state
    And autoFollowup is disabled for PR #42
    When the developer pushes new commits to PR #42
    Then the push event is recorded
    But no followup review is triggered
    And the webhook responds with status 200 and reason "Auto-followup disabled"

  Scenario: No followup when PR is not tracked
    Given PR #99 has never been reviewed by ReviewFlow
    When the developer pushes new commits to PR #99
    Then the push event is ignored (no tracked MR found)
    And the webhook responds with status 200 and reason "ignored"

  Scenario: No followup when no push since last review
    Given PR #42 has been reviewed
    And no new commits have been pushed since the last review
    When a "synchronize" event arrives (e.g., force-push that GitHub retransmits)
    Then checkFollowupNeeded returns false (lastPushAt <= lastReviewAt)
    And no followup review is triggered

  Scenario: Push on draft PR is ignored
    Given PR #42 is marked as draft
    When the developer pushes new commits to PR #42
    Then the webhook responds with status 200 and reason "PR is a draft"
    And no followup review is triggered

  Scenario: Push on closed PR is ignored
    Given PR #42 is in "closed" state
    When a "synchronize" event arrives for PR #42
    Then the webhook responds with status 200 and reason "PR state is closed, not open"
    And no followup review is triggered
```

### Feature: Manual Followup from Dashboard (Bug Fix)

```gherkin
Feature: Manual followup from dashboard executes actions instead of producing a plan

  Background:
    Given a GitHub PR is tracked in ReviewFlow with open threads
    And the dashboard is accessible

  Scenario: Manual followup executes review actions
    Given the user clicks "Followup" on a GitHub PR in the dashboard
    When the followup job is created and Claude is invoked
    Then the MCP system prompt contains "gh pr diff" (not "glab mr diff")
    And the MCP system prompt contains "gh pr view" (not "glab mr view")
    And Claude executes the followup skill step by step
    And thread actions are executed (not just planned)
    And a followup report is posted as a PR comment

  Scenario: Manual followup on GitLab MR still works
    Given the user clicks "Followup" on a GitLab MR in the dashboard
    When the followup job is created and Claude is invoked
    Then the MCP system prompt contains "glab mr diff" (not "gh pr diff")
    And the MCP system prompt contains "glab mr view" (not "gh pr view")
    And Claude executes the followup skill correctly

  Scenario: Platform-specific CLI commands in system prompt
    Given a review job with platform "github"
    When buildMcpSystemPrompt is called
    Then the prompt references "gh pr diff <number>" for diff source of truth
    And the prompt references "gh pr view <number>" for metadata source of truth
    And the prompt does NOT contain the string "glab"
```

### Feature: GitHub Push Event Filtering

```gherkin
Feature: Filtering GitHub PR synchronize events for followup

  Scenario: Synchronize action on open non-draft PR passes filter
    Given a pull_request event with action "synchronize"
    And the PR state is "open"
    And the PR is not a draft
    Then filterGitHubPrUpdate returns shouldProcess true
    And isFollowup is true

  Scenario: Synchronize action on closed PR is rejected
    Given a pull_request event with action "synchronize"
    And the PR state is "closed"
    Then filterGitHubPrUpdate returns shouldProcess false
    And reason contains "not open"

  Scenario: Synchronize action on draft PR is rejected
    Given a pull_request event with action "synchronize"
    And the PR is a draft
    Then filterGitHubPrUpdate returns shouldProcess false
    And reason contains "draft"

  Scenario: Non-synchronize actions are rejected
    Given a pull_request event with action "opened"
    Then filterGitHubPrUpdate returns shouldProcess false
    And reason contains "not synchronize"
```

## Out of Scope

- **GitHub `push` event type**: We use the `pull_request` event with `action: "synchronize"`, not the separate `push` event type. The `push` event does not carry PR context.
- **Merge/approve state transitions for GitHub**: GitLab tracks `merged` and `approved` states via webhook actions. GitHub equivalents (`closed` with `merged: true`, PR review with `approved`) are a separate feature.
- **GitHub PR review comments as threads**: GitHub has a different threading model (review threads vs. issue comments). The existing `GitHubThreadFetchGateway` already handles this via GraphQL. No changes to thread fetching are needed.
- **Retry logic for failed followup actions**: If a thread resolve API call fails, it is logged but not retried. Retry logic is a separate concern.
- **Webhook event for GitHub `push` (non-PR)**: Pushes to branches that are not associated with a PR are not relevant.
- **Branch protection / required checks integration**: Whether the followup result should affect merge-readiness checks is out of scope.
- **`handleReviewRequestPush` use case refactoring**: The existing use case in `src/usecases/handleReviewRequestPush.usecase.ts` could potentially be reused or extended, but whether to refactor the GitLab controller to also use it is a separate decision. The immediate goal is parity.

## INVEST Validation

| Criterion | Pass | Rationale |
|-----------|------|-----------|
| **Independent** | Yes | Only touches the GitHub webhook controller, event filter, MCP system prompt, and composition root. No changes to domain entities, use cases, or GitLab flow. |
| **Negotiable** | Yes | The `synchronize` filter could be a standalone function or inlined. The system prompt fix could be done separately from the push handling. The followup skill choice (`reviewFollowupSkill`) is configurable. |
| **Valuable** | Yes | Closes a critical platform parity gap. Developers on GitHub PRs currently get no automatic followup, forcing manual dashboard clicks -- which themselves are broken (the "plan" bug). |
| **Estimable** | Yes | ~4-6 hours. The GitLab implementation is a complete reference. The event filter is ~20 lines. The controller change mirrors existing GitLab code. The system prompt fix is a conditional string. |
| **Small** | Yes | 4-5 files modified. No new dependencies. No architectural changes. Follows existing patterns exactly. |
| **Testable** | Yes | All scenarios are deterministic. Use cases are already tested independently. The event filter is a pure function. The system prompt is a string builder. Integration is testable via existing controller test patterns. |

## Definition of Done

### Push-triggered followup (core feature)

- [ ] `filterGitHubPrUpdate()` function added to `eventFilter.ts` -- filters `synchronize` action on open, non-draft PRs
- [ ] `GitHubWebhookDependencies` extended with `recordPush`, `transitionState`, `checkFollowupNeeded`, `syncThreads`
- [ ] `github.controller.ts` handles `synchronize` events: record push, check followup needed, check autoFollowup, enqueue followup job
- [ ] Followup job uses `jobType: 'followup'` and followup skill from project config
- [ ] Followup job creates review context with threads, followup agents, and diff metadata
- [ ] After Claude completes: execute context actions (primary) or stdout markers (fallback)
- [ ] After execution: sync threads from GitHub, record followup completion with stats
- [ ] `routes.ts` composition root injects all required dependencies for GitHub webhook handler

### MCP system prompt bug fix (platform-aware CLI commands)

- [ ] `buildMcpSystemPrompt()` in `claudeInvoker.ts` uses `gh pr diff <number>` when `job.platform === 'github'`
- [ ] `buildMcpSystemPrompt()` uses `gh pr view <number>` when `job.platform === 'github'`
- [ ] `buildMcpSystemPrompt()` keeps `glab mr diff` / `glab mr view` when `job.platform === 'gitlab'`
- [ ] Section header says "GitLab/GitHub Actions" remains accurate (already correct)

### Tests

- [ ] Unit tests for `filterGitHubPrUpdate()`: synchronize on open PR, closed PR, draft PR, non-synchronize action
- [ ] Unit tests for `buildMcpSystemPrompt()`: github platform uses `gh` commands, gitlab platform uses `glab` commands
- [ ] Integration-style tests for the GitHub controller followup path (mirroring existing `gitlab.controller.test.ts` followup tests)
- [ ] All tests in English
- [ ] `yarn verify` passes (typecheck + lint + test:ci)

### Quality

- [ ] No new dependencies added
- [ ] Naming follows codebase conventions (full words, camelCase files)
- [ ] Imports use `@/` alias with `.js` extension
- [ ] No `as Type` assertions -- use guards and narrowing

## Technical Notes

### Files to modify

| File | Change |
|------|--------|
| `src/interface-adapters/controllers/webhook/eventFilter.ts` | Add `filterGitHubPrUpdate(event)` function |
| `src/interface-adapters/controllers/webhook/github.controller.ts` | Add `synchronize` handling path (followup flow), extend `GitHubWebhookDependencies` |
| `src/main/routes.ts` | Inject `RecordPushUseCase`, `TransitionStateUseCase`, `CheckFollowupNeededUseCase`, `SyncThreadsUseCase` into GitHub webhook handler |
| `src/frameworks/claude/claudeInvoker.ts` | Make `buildMcpSystemPrompt()` platform-aware for CLI command references |
| `src/tests/units/interface-adapters/controllers/webhook/eventFilter.test.ts` | Add tests for `filterGitHubPrUpdate` |
| `src/tests/units/frameworks/claude/claudeInvoker.test.ts` (new or extend existing) | Test platform-conditional system prompt |
| `src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts` (new or extend existing) | Test followup path in GitHub controller |

### Implementation approach

**1. Event filter** -- Add `filterGitHubPrUpdate()` following the exact pattern of `filterGitLabMrUpdate()`:

```
function filterGitHubPrUpdate(event: GitHubPullRequestEvent): FilterResult
  - Reject if action !== 'synchronize'
  - Reject if pr.state !== 'open'
  - Reject if pr.draft === true
  - Return shouldProcess: true, isFollowup: true, with PR metadata
```

**2. Controller followup path** -- In `handleGitHubWebhook`, after the existing `filterGitHubEvent` / `filterGitHubLabelEvent` checks return `shouldProcess: false`, add a `filterGitHubPrUpdate` check. If it returns a followup, mirror the GitLab flow:

```
recordPush -> checkFollowupNeeded -> check autoFollowup -> enqueue followup job
```

The followup job execution callback mirrors the GitLab followup: create context, invoke Claude, execute actions, sync threads, record completion.

**3. System prompt fix** -- In `buildMcpSystemPrompt()`, replace the hardcoded `glab` references with platform-conditional strings:

```
const diffCommand = job.platform === 'github'
  ? `gh pr diff ${job.mrNumber}`
  : `glab mr diff ${job.mrNumber}`;
const viewCommand = job.platform === 'github'
  ? `gh pr view ${job.mrNumber}`
  : `glab mr view ${job.mrNumber}`;
```

**4. Composition root** -- Update `routes.ts` to pass the additional dependencies:

```typescript
app.post('/webhooks/github', async (request, reply) => {
  await handleGitHubWebhook(request, reply, deps.logger, trackingGw, {
    // existing deps...
    recordPush: new RecordPushUseCase(trackingGw),
    transitionState: new TransitionStateUseCase(trackingGw),
    checkFollowupNeeded: new CheckFollowupNeededUseCase(trackingGw),
    syncThreads: new SyncThreadsUseCase(trackingGw, gitHubThreadFetchGw),
  });
});
```

### Existing code to reuse

- `RecordPushUseCase`, `CheckFollowupNeededUseCase`, `TransitionStateUseCase`, `SyncThreadsUseCase` -- all already implemented and tested, platform-agnostic
- `GitHubThreadFetchGateway`, `GitHubDiffMetadataFetchGateway` -- already exist
- `GitHubReviewActionCliGateway` -- already handles `THREAD_RESOLVE`, `POST_COMMENT`, `THREAD_REPLY`, `POST_INLINE_COMMENT` for GitHub
- `executeActionsFromContext()` -- already dispatches to the correct platform gateway based on `context.platform`
- `DEFAULT_FOLLOWUP_AGENTS` -- already defined
- `loadProjectConfig()` / `getFollowupAgents()` -- already implemented
- The entire GitLab followup flow in `gitlab.controller.ts` lines 194-401 serves as the reference implementation

### GitHub webhook event reference

GitHub sends `pull_request` events with `action: "synchronize"` when:
- New commits are pushed to the PR's head branch
- The PR's base branch is updated (if the PR is rebased)
- Force-pushes to the head branch

The event payload shape is identical to other `pull_request` actions, so the existing `gitHubPullRequestEventGuard` schema already validates it correctly -- `action` is typed as `z.string()`, which accepts `"synchronize"`.
