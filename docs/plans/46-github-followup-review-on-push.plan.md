# Plan — Spec-46: GitHub Followup Review on Push

```
PLAN:
  scope: GitHub followup review on push (parity with GitLab) + platform-aware MCP system prompt
  is_new_module: false
  status: planned
```

## Summary

Bring GitHub PRs to parity with GitLab MRs for push-triggered followup reviews. All required entities, use cases and gateways already exist. The work is wiring + filter + system-prompt fix. Plus one bug fix in `buildMcpSystemPrompt()` so manual followup from the dashboard executes actions for GitHub instead of producing a plan.

No new entities. No new use cases. No new gateways.

---

## Files to MODIFY

### 1. `src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts`

Add a single new exported function, mirroring `filterGitLabMrUpdate` (lines 110-138):

- **New function**: `filterGitHubPrUpdate(event: GitHubPullRequestEvent): FilterResult`
  - Reject if `event.action !== 'synchronize'`  -> `reason: 'Action is X, not synchronize'`
  - Reject if `pr.state !== 'open'`             -> `reason: 'PR state is X, not open'`
  - Reject if `pr.draft === true`               -> `reason: 'PR is a draft'`
  - Return `shouldProcess: true, isFollowup: true, mergeRequestNumber: pr.number, projectPath: event.repository.full_name, mergeRequestUrl: pr.html_url, sourceBranch: pr.head.ref, targetBranch: pr.base.ref`

No existing function touched. No regression risk on GitLab side.

### 2. `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts`

Extend the `GitHubWebhookDependencies` interface (lines 33-44) with the four missing use cases:

```
recordPush: RecordPushUseCase;
transitionState: TransitionStateUseCase;
checkFollowupNeeded: CheckFollowupNeededUseCase;
syncThreads: SyncThreadsUseCase;
```

Add imports (top of file) — types only:

- `RecordPushUseCase` from `@/modules/tracking/usecases/tracking/recordPush.usecase.js`
- `TransitionStateUseCase` from `@/modules/tracking/usecases/tracking/transitionState.usecase.js`
- `CheckFollowupNeededUseCase` from `@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js`
- `SyncThreadsUseCase` from `@/modules/tracking/usecases/tracking/syncThreads.usecase.js`
- `filterGitHubPrUpdate` from `./eventFilter.js`
- `loadProjectConfig`, `getFollowupAgents` from `@/config/projectConfig.js`
- `DEFAULT_FOLLOWUP_AGENTS` from `@/modules/review-execution/entities/progress/agentDefinition.type.js`

Inside `handleGitHubWebhook`, in the branch `if (!filterResult.shouldProcess)` (current line 150-153), **before** sending the 200 reply, insert the followup path mirroring `gitlab.controller.ts` lines 202-448:

1. `const updateResult = filterGitHubPrUpdate(event)`
2. If `updateResult.shouldProcess && updateResult.isFollowup`:
   - `const repoConfig = findRepositoryByRemoteUrl(event.repository.clone_url)` (mirror existing GitHub lookup, not by projectPath like GitLab)
   - `recordPush.execute({ projectPath: repoConfig.localPath, mrNumber, platform: 'github' })`
   - `checkFollowupNeeded.execute({ ..., platform: 'github' })` -> guard
   - Check `mr.autoFollowup === false` -> 200 ignored
   - Build `followupJob` with `id = createJobId('github-followup', projectPath, mrNumber)`, `platform: 'github'`, `jobType: 'followup'`, `skill = projectConfig?.reviewFollowupSkill || 'review-followup'`
   - `enforceBudget` gate (mirror GitLab lines 262-283)
   - `enqueueReview(followupJob, async (j, signal) => { ... })` callback:
     - Create review context (`platform: 'github'`, threads via `threadFetchGateway`, diff metadata via `diffMetadataFetchGateway`, agents = `getFollowupAgents(j.localPath) ?? DEFAULT_FOLLOWUP_AGENTS`)
     - `startWatchingReviewContext` -> `invokeClaudeReview` -> `stopWatchingReviewContext`
     - On success: PRIMARY = `executeActionsFromContext(reviewContext, ...)`, FALLBACK = `executeThreadActions(parseThreadActions(result.stdout), { platform: 'github', ... })`
     - `syncThreads.execute({ projectPath: j.localPath, mrId: 'github-<projectPath>-<mrNumber>' })`
     - `recordCompletion.execute({ ..., reviewData: { type: 'followup', threadsClosed: threadResolveCount, ... } })`
   - `reply.status(202).send({ status: 'followup-queued', jobId: followupJobId, prNumber })`
3. Otherwise fall through to the existing `reply.status(200).send({ status: 'ignored', reason: filterResult.reason })`

Also: the existing "review" enqueue branch should be left untouched. The followup branch lives **inside** the `if (!filterResult.shouldProcess)` block.

**Risk identified — see Risks section**: GitHub's existing review-completion branch (lines 338-351) executes `executeActionsFromContext` WITHOUT the `baseUrl` argument. GitLab passes `extractBaseUrl(repoConfig.remoteUrl)`. For the followup branch we will mirror GitLab and pass a base URL. Not in scope to fix the existing GitHub review branch.

### 3. `src/main/routes.ts`

In the `app.post('/webhooks/github', ...)` registration (lines 229-242), inject the four additional dependencies. The instances should be shared with the GitLab webhook where they make sense:

```
recordPush: new RecordPushUseCase(trackingGw),
transitionState: new TransitionStateUseCase(trackingGw),
checkFollowupNeeded: new CheckFollowupNeededUseCase(trackingGw),
syncThreads: new SyncThreadsUseCase(trackingGw, gitHubThreadFetchGw),
```

The `trackingGw` constant is already in scope (line 205). `gitHubThreadFetchGw` is already declared at line 227. No new top-level constants needed.

### 4. `src/frameworks/claude/claudeInvoker.ts`

Modify `buildMcpSystemPrompt(job: ReviewJob)` (lines 217-320) to make the CLI command references platform-aware. The current hardcoded strings on lines 254-255 must become conditional:

```
const isGitHub = job.platform === 'github';
const diffSourceCommand = isGitHub ? `gh pr diff ${job.mrNumber}` : `glab mr diff ${job.mrNumber}`;
const metadataSourceCommand = isGitHub ? `gh pr view ${job.mrNumber}` : `glab mr view ${job.mrNumber}`;
```

Embed these in the existing template. Keep the section header "GitLab/GitHub Actions" (already accurate). Do not touch any other prompt section.

---

## Files to CREATE (tests only)

### 1. Acceptance test (outer loop — SDD)

- **File**: `src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts`
- **Note**: Written FIRST by implementer. Stays RED through the inner TDD loops. Becomes GREEN at the end.
- **Coverage**: One end-to-end happy path per top-level Gherkin scenario in the spec (push triggers followup, followup resolves threads and posts report, no followup when no threads, autoFollowup disabled, draft PR ignored, closed PR ignored, system prompt platform-aware).
- **Strategy**: Drive `handleGitHubWebhook` with mocked queue + Claude invoker, assert reply payloads + use case calls.

### 2. Unit tests (inner loops — TDD)

| Test file | Subject | Purpose |
|-----------|---------|---------|
| `src/tests/units/interface-adapters/controllers/webhook/eventFilter.test.ts` (EXTEND) | `filterGitHubPrUpdate` | RED first — pure function, fastest feedback |
| `src/tests/units/frameworks/claude/claudeInvoker.test.ts` (CREATE) | `buildMcpSystemPrompt` | GitHub job -> `gh pr diff`, GitLab job -> `glab mr diff`, no `glab` substring when github |
| `src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts` (EXTEND) | `handleGitHubWebhook` followup branch | Covers: synchronize triggers followup, autoFollowup=false skipped, no MR found ignored, no followup needed (no open threads), enforceBudget rejection |

The current `claudeInvoker.ts` is not unit-tested — adding the first test file means stubbing only the `buildMcpSystemPrompt` pure function. Avoid testing the spawn/Claude invocation; only test the prompt builder. To allow this, **either** export `buildMcpSystemPrompt` from the module (currently a non-exported function on line 217) **or** test it through an exported wrapper. Recommendation: change `function buildMcpSystemPrompt` to `export function buildMcpSystemPrompt` — a single-token change with no behavior impact.

---

## Implementation Order (TDD, inside-out)

1. **Acceptance test RED** -- `src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts`. Stays RED until end.
2. **`filterGitHubPrUpdate` test RED** -- extend `eventFilter.test.ts` with the 4 scenarios from spec section "GitHub Push Event Filtering".
3. **`filterGitHubPrUpdate` GREEN** -- implement the function in `eventFilter.ts`.
4. **`buildMcpSystemPrompt` test RED** -- create `claudeInvoker.test.ts`. Cover: github -> `gh pr diff`, gitlab -> `glab mr diff`, github prompt does NOT contain `glab`.
5. **`buildMcpSystemPrompt` GREEN** -- export and platform-conditional CLI commands.
6. **Controller followup branch test RED** -- extend `github.controller.test.ts` with the followup-path scenarios. Use `GitHubEventFactory.createPullRequestEvent({ action: 'synchronize' })` (need to add a `createSynchronizePr()` helper for clarity).
7. **Controller followup branch GREEN** -- extend `handleGitHubWebhook` with the followup path. Extend `GitHubWebhookDependencies`.
8. **Wiring** -- update `src/main/routes.ts` composition root last.
9. **Acceptance GREEN** -- once wiring is in place, the outer test passes.

---

## Risks and Hidden Coupling

1. **`findRepositoryByRemoteUrl` vs `findRepositoryByProjectPath`** — GitLab controller uses `findRepositoryByProjectPath(updateResult.projectPath)` whereas the GitHub controller uses `findRepositoryByRemoteUrl(event.repository.clone_url)`. The followup branch must use the GitHub helper (clone_url is on `event.repository`, not on the `updateResult` returned by the filter). Do NOT copy the GitLab line verbatim.

2. **`extractBaseUrl` is GitLab-only today** — declared in `gitlab.controller.ts` (lines 37-53). The GitLab followup passes its return value to `executeActionsFromContext`. The existing GitHub review branch does NOT pass a `baseUrl` (line 345). For symmetry and to keep scope tight, the new GitHub followup branch will also not pass a `baseUrl` (current GitHub review behavior). Out of scope: porting `extractBaseUrl` to GitHub.

3. **`event.repository.clone_url` availability** — confirmed by reading `githubPullRequestEvent.guard.ts`: `repository.clone_url` is required (line 23). Safe to use.

4. **`action: z.string()`** — the guard schema accepts any string for `action`. `'synchronize'` validates without schema changes. Confirmed in `githubPullRequestEvent.guard.ts:4`.

5. **`buildMcpSystemPrompt` is non-exported** — single change required (`function` -> `export function`) to enable unit testing. Mentioned in the unit-test section above.

6. **Mock surface in `github.controller.test.ts`** — current test file already mocks `@/config/loader.js`, `@/security/verifier.js`, `@/frameworks/queue/pQueueAdapter.js`, `@/claude/invoker.js`, `@/main/websocket.js`. New followup tests will additionally need to mock or stub `@/config/projectConfig.js` to control `loadProjectConfig` and `getFollowupAgents` (the GitLab test already does this on lines 51-56).

7. **`recordPush.execute` returns the `TrackedMr`** — must inspect `mr.autoFollowup` before queuing. If `mr === null`, skip silently with `reason: 'ignored'`. Confirmed by GitLab controller lines 214-237.

8. **`SyncThreadsUseCase` constructor takes a `ThreadFetchGateway`** — must pass `gitHubThreadFetchGw` in composition root, not the GitLab one. Already declared at `routes.ts:227`.

9. **No new dependencies** — confirmed. All gateways, use cases, factories, executors are existing.

---

## Acceptance Test Reference

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during inner TDD loops, GREEN at the end."
```

---

## Reference Files

| Path | Why read |
|------|----------|
| `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` | Full reference flow for followup (lines 202-448). Copy the structure. |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | Current GitHub controller — knows nothing about followup. Insertion point at line 150. |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts` | Existing GitLab `filterGitLabMrUpdate` (lines 110-138) is the template. |
| `src/modules/platform-integration/entities/github/githubPullRequestEvent.guard.ts` | Confirms `action: z.string()` accepts `'synchronize'`, `repository.clone_url` is present. |
| `src/frameworks/claude/claudeInvoker.ts` | Locate `buildMcpSystemPrompt` (line 217) — patch lines 254-255. |
| `src/main/routes.ts` | Composition root, GitHub webhook registration at line 229. |
| `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts` | Mocking patterns for the controller. Reuse the same mocks. |
| `src/tests/units/interface-adapters/controllers/webhook/eventFilter.test.ts` | Existing test patterns for filter functions. |
| `src/tests/factories/gitHubEvent.factory.ts` | Already provides `createPullRequestEvent` with action override. Add a `createSynchronizePr()` helper. |

---

## Wiring Summary (composition root)

In `src/main/routes.ts`, append to the GitHub webhook handler call (line 230):

```
recordPush: new RecordPushUseCase(trackingGw),
transitionState: new TransitionStateUseCase(trackingGw),
checkFollowupNeeded: new CheckFollowupNeededUseCase(trackingGw),
syncThreads: new SyncThreadsUseCase(trackingGw, gitHubThreadFetchGw),
```

No new top-level imports needed — `RecordPushUseCase`, `TransitionStateUseCase`, `CheckFollowupNeededUseCase`, `SyncThreadsUseCase` are already imported at lines 31-34 for the GitLab webhook.
