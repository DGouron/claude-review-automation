# Spec #77 — Standardize PR/MR Vocabulary to MergeRequest

## Status: READY

---

## Problem Statement

The codebase uses inconsistent terminology for the same concept across platform boundaries:

- **GitHub adapter layer** uses `PullRequest`, `pullRequest`, `pull_request`, `PR`, `prNumber`, `prTitle`, `prAssignee`
- **GitLab adapter layer** uses `MergeRequest`, `merge_request`, `MR`, `mrNumber`
- **Domain layer** mixes both: `ReviewRequest` entity uses `reviewRequestNumber`, `ReviewJob` uses `mrNumber`, `TrackedMr` uses `mrNumber`, `ReviewContext` uses `mergeRequestNumber`
- **Logs** say `PR #X` for GitHub and `MR !X` for GitLab — inconsistent format for the same operation

This creates cognitive overhead when reading code. A developer encountering `prNumber`, `mrNumber`, `reviewRequestNumber`, and `mergeRequestNumber` in different files has no way to know these all mean "the number identifying a merge request on a platform." The domain layer should use a single, platform-neutral vocabulary.

### Why this matters (user-facing benefit)

- **Faster onboarding**: Contributors (especially from the `good first issue` label audience) can understand the codebase faster when one concept = one name.
- **Fewer bugs at boundaries**: Mixed naming increases the risk of mapping errors in adapters (e.g., passing `prNumber` where `mrNumber` is expected).
- **Ubiquitous Language alignment**: DDD requires the domain to speak one language. The domain concept is "a request to review code changes" — not "a pull request" or "a merge request."

---

## Scope Analysis and Challenge

### Is this really needed or cosmetic?

This is **not cosmetic**. The terminology inconsistency crosses the domain layer boundary, which violates the Ubiquitous Language principle. When `TrackedMr`, `mrNumber`, `ReviewRequest`, `reviewRequestNumber`, and `mergeRequestNumber` coexist in domain types to describe the same thing, it is a genuine architectural smell.

However, the scope must be carefully bounded:

1. **GitHub API field names** (`pull_request`, `pull_request.number`, etc.) are external API contracts and **cannot be renamed**. They live in the guard schemas and adapter layer — exactly where they belong.
2. **GitLab API field names** (`merge_request`, `object_attributes.iid`, etc.) are also external and **cannot be renamed**.
3. **Internal domain types, variable names, log messages, and file names** — these are under our control and **should use consistent vocabulary**.

### Chosen vocabulary

| Layer | Convention | Example |
|-------|-----------|---------|
| Domain types | `MergeRequest` / `mergeRequestNumber` | `TrackedMergeRequest`, `mergeRequestNumber: number` |
| Internal variables | `mergeRequestNumber` | Never `prNumber`, `mrNumber` |
| Log messages | `MR #X` (both platforms) | `MR #42 - my-org/my-project` |
| File names | `mergeRequest` prefix | `trackedMergeRequest.ts`, not `trackedMr.ts` |
| GitHub guards/adapters | Keep `pullRequest` / `pull_request` | These mirror the API — correct by design |
| GitLab guards/adapters | Keep `merge_request` | These mirror the API — correct by design |
| Dashboard UI | Keep `getMrLabel()` → `PR` or `MR` | User-facing labels stay platform-aware |

---

## User Story

**As a** ReviewFlow contributor,
**I want** the internal codebase to use `MergeRequest` / `mergeRequestNumber` consistently for the domain concept of a code review request,
**so that** I can navigate the code without confusion about whether `prNumber`, `mrNumber`, and `mergeRequestNumber` refer to the same thing.

---

## Gherkin Scenarios

### Feature: Standardized MergeRequest vocabulary in domain layer

#### Scenario 1: Domain types use MergeRequest vocabulary (nominal)

```gherkin
Given the domain entity previously named TrackedMr
When I read the type definition
Then the type should be named TrackedMergeRequest
  And its number field should be named mergeRequestNumber
  And the factory function should be named createTrackedMergeRequestId
```

#### Scenario 2: ReviewJob uses mergeRequestNumber instead of mrNumber

```gherkin
Given the ReviewJob interface in pQueueAdapter.ts
When I read the interface definition
Then the field previously named mrNumber should be named mergeRequestNumber
  And the field previously named mrUrl should be named mergeRequestUrl
```

#### Scenario 3: MrTrackingData uses MergeRequest vocabulary

```gherkin
Given the MrTrackingData interface
When I read the type definition
Then it should be named MergeRequestTrackingData
  And the stats field totalMrs should be named totalMergeRequests
  And the stats field averageReviewsPerMr should be named averageReviewsPerMergeRequest
```

#### Scenario 4: GitHub adapter preserves pull_request API names

```gherkin
Given the GitHub guard schema in githubPullRequestEvent.guard.ts
When I read the Zod schema
Then it should still reference pull_request (matching the GitHub API)
  And the exported type should still be GitHubPullRequestEvent
  And the adapter class should still be named GitHubPullRequestAdapter
  And the file name should still be githubPullRequestEvent.guard.ts
```

#### Scenario 5: GitLab adapter preserves merge_request API names

```gherkin
Given the GitLab guard schema in gitlabMergeRequestEvent.guard.ts
When I read the Zod schema
Then it should still reference merge_request (matching the GitLab API)
  And the exported type should still be GitLabMergeRequestEvent
  And the file name should still be gitlabMergeRequestEvent.guard.ts
```

#### Scenario 6: Internal log messages use MR #X consistently

```gherkin
Given a GitHub PR webhook is processed
When the controller logs the review tracking
Then the log message should say "MR #42" not "PR #42"
  And structured log fields should use mergeRequestNumber not prNumber
```

#### Scenario 7: GitHub controller variables use mergeRequest vocabulary

```gherkin
Given the GitHub controller processes a webhook event
When the controller creates local variables for the MR number and title
Then variables should be named mergeRequestNumber and mergeRequestTitle
  And never prNumber, prTitle, or prAssignee
```

#### Scenario 8: eventFilter reason messages use MR consistently

```gherkin
Given a GitHub event is filtered
When the filter returns a rejection reason
Then the reason should say "MR state is closed" not "PR state is closed"
  And "MR is a draft" not "PR is a draft"
```

#### Scenario 9: Dashboard UI keeps platform-aware labels

```gherkin
Given the dashboard renders a tracked merge request
When the platform is GitHub
Then the UI should display "PR" (via getMrLabel)
When the platform is GitLab
Then the UI should display "MR" (via getMrLabel)
  And no changes should be made to i18n strings
```

#### Scenario 10: Notification messages use MR consistently

```gherkin
Given a review notification is sent
When the platform is GitHub
Then the notification should say "MR #42" not "PR #42"
When the platform is GitLab
Then the notification should say "MR !42" not "MR #42"
```

#### Scenario 11: All tests compile and pass after rename

```gherkin
Given all vocabulary changes have been applied
When I run yarn verify
Then TypeScript compilation should succeed
  And all existing tests should pass
  And no test logic should have changed (only names)
```

---

## Out of Scope

- **Renaming GitHub API guard schemas or types** (`GitHubPullRequestEvent`, `pull_request` field) — these mirror external API contracts.
- **Renaming GitLab API guard schemas or types** (`GitLabMergeRequestEvent`, `merge_request` field) — same reason.
- **Changing dashboard UI labels** — `getMrLabel()` correctly returns `PR` or `MR` based on platform for end users.
- **Changing i18n strings** — user-facing text is not part of internal vocabulary.
- **Renaming `githubPullRequest.adapter.ts`** — the adapter's job is to translate from the GitHub `PullRequest` concept to the domain `ReviewRequest` concept. Its name correctly describes its input, not its output.
- **Renaming the `ReviewRequest` domain entity** — `ReviewRequest` is already a good platform-neutral domain name. This ticket is about the `Mr`/`PR` abbreviation inconsistency, not the `ReviewRequest` entity.
- **Introducing branded types** for `MergeRequestNumber` — that is a separate concern (primitive obsession) and should be its own ticket.
- **Modifying review file name format** (`2024-01-15-MR-123-review.md` / `2024-01-15-PR-123-review.md`) — these are persisted filenames and changing them would break existing data.
- **Modifying CSS class names** (`.mr-item`, `.mr-tracking`) — cosmetic, no code impact.

---

## Inventory of Changes

### Phase 1: Domain types (entities/)

| File | Change |
|------|--------|
| `src/entities/tracking/trackedMr.ts` | Rename to `trackedMergeRequest.ts`. Rename `TrackedMr` → `TrackedMergeRequest`, `mrNumber` → `mergeRequestNumber`, `createTrackedMrId` → `createTrackedMergeRequestId` |
| `src/entities/tracking/mrTrackingData.ts` | Rename to `mergeRequestTrackingData.ts`. Rename `MrTrackingData` → `MergeRequestTrackingData`, `totalMrs` → `totalMergeRequests`, `averageReviewsPerMr` → `averageReviewsPerMergeRequest` |
| `src/entities/reviewAction/reviewAction.gateway.ts` | Rename `mrNumber` parameter → `mergeRequestNumber` |

### Phase 2: Frameworks (queue)

| File | Change |
|------|--------|
| `src/frameworks/queue/pQueueAdapter.ts` | `ReviewJob.mrNumber` → `mergeRequestNumber`, `ReviewJob.mrUrl` → `mergeRequestUrl` |

### Phase 3: Interface adapters (controllers, gateways, presenters)

| File | Change |
|------|--------|
| `src/interface-adapters/controllers/webhook/github.controller.ts` | `prNumber` → `mergeRequestNumber`, `prTitle` → `mergeRequestTitle`, `prAssignee` → `mergeRequestAssignee`. Log messages: `PR #` → `MR #`, `PR closed` → `MR closed`, `PR tracked` → `MR tracked`, `PR event` → `MR event`. Structured log keys: `prNumber` → `mergeRequestNumber` |
| `src/interface-adapters/controllers/webhook/eventFilter.ts` | Filter reason messages: `PR state` → `MR state`, `PR is a draft` → `MR is a draft`, `PR was closed` → `MR was closed` (GitHub filter functions only — GitLab already uses `MR`) |
| `src/interface-adapters/controllers/http/mrTrackingAdvanced.routes.ts` | Already uses `MR` in most places. Update `MR/PR not found` → `MR non trouvée` (French, user-facing) |
| `src/interface-adapters/presenters/jobStatus.presenter.ts` | `job.mrNumber` → `job.mergeRequestNumber`, `job.mrUrl` → `job.mergeRequestUrl` |
| `src/interface-adapters/gateways/reviewRequestTracking.gateway.ts` | Update references to `TrackedMr` → `TrackedMergeRequest` |
| `src/interface-adapters/gateways/fileSystem/reviewRequestTracking.fileSystem.ts` | Same |
| All gateway files using `mrNumber` from `ReviewJob` | Update field access |

### Phase 4: Services

| File | Change |
|------|--------|
| `src/services/contextActionsExecutor.ts` | `mrNumber: context.mergeRequestNumber` is already correct on the right side; update left side if needed by `ReviewActionGateway` rename |

### Phase 5: Tests (mechanical — rename to match)

| File pattern | Change |
|------|--------|
| `src/tests/factories/trackedMr.factory.ts` | Rename to `trackedMergeRequest.factory.ts`, update type references |
| `src/tests/factories/reviewJob.factory.ts` | Update `mrNumber` → `mergeRequestNumber` |
| `src/tests/stubs/reviewRequestTracking.stub.ts` | Update `TrackedMr` → `TrackedMergeRequest` references |
| All test files referencing renamed types | Mechanical search-and-replace |

### Phase 6: Usecases

| File | Change |
|------|--------|
| `src/usecases/tracking/*.usecase.ts` | Update `TrackedMr` → `TrackedMergeRequest`, `mrId` → `mergeRequestId` in use case inputs |
| `src/usecases/triggerReview.usecase.ts` | Update `mrNumber` → `mergeRequestNumber` in `ReviewJob` construction |
| `src/usecases/handleReviewRequestPush.usecase.ts` | Same |

---

## Implementation Strategy

**Approach**: Mikado method — start from the leaves (domain types), let the compiler guide the cascade.

**Recommended batch order**:

1. **Batch 1** — Domain types: rename `TrackedMr`, `MrTrackingData`, and their fields. This will cause ~25 compiler errors that guide all downstream changes.
2. **Batch 2** — Framework types: rename `ReviewJob.mrNumber` / `mrUrl`. Another wave of compiler errors.
3. **Batch 3** — Fix all compilation errors in interface-adapters, usecases, services, tests. This is mechanical.
4. **Batch 4** — Log messages and reason strings: search-replace `PR #` → `MR #`, `PR state` → `MR state`, etc. in GitHub controller and eventFilter.
5. **Batch 5** — File renames: `trackedMr.ts` → `trackedMergeRequest.ts`, etc. Update all imports.
6. **Final** — Run `yarn verify`, confirm all green.

**Estimated effort**: < 1 day (consistent with issue estimate). The changes are mechanical renames with compiler-guided propagation.

---

## INVEST Validation

| Criterion | Assessment | Pass? |
|-----------|-----------|-------|
| **Independent** | No dependency on other tickets. Pure rename refactoring. | Yes |
| **Negotiable** | Log message format (`MR #X` vs `PR #X` for GitHub) is negotiable. File renames could be deferred. Phases are separable. | Yes |
| **Valuable** | Eliminates a Ubiquitous Language violation. Reduces cognitive overhead for contributors (especially newcomers — labeled `good first issue`). | Yes |
| **Estimable** | Mechanical rename guided by TypeScript compiler. ~50 files affected, but changes are search-replace. < 1 day. | Yes |
| **Small** | No business logic changes. No new features. No new dependencies. Pure vocabulary alignment. | Yes |
| **Testable** | `yarn verify` passing = done. Each scenario has concrete observable outcomes (type names, field names, log strings). | Yes |

---

## Definition of Done

- [ ] `TrackedMr` type renamed to `TrackedMergeRequest` everywhere
- [ ] `MrTrackingData` type renamed to `MergeRequestTrackingData` everywhere
- [ ] `ReviewJob.mrNumber` renamed to `mergeRequestNumber`
- [ ] `ReviewJob.mrUrl` renamed to `mergeRequestUrl`
- [ ] `trackedMr.ts` file renamed to `trackedMergeRequest.ts`
- [ ] `mrTrackingData.ts` file renamed to `mergeRequestTrackingData.ts`
- [ ] `trackedMr.factory.ts` file renamed to `trackedMergeRequest.factory.ts`
- [ ] All internal variables using `prNumber`, `prTitle`, `prAssignee` renamed to `mergeRequestNumber`, `mergeRequestTitle`, `mergeRequestAssignee`
- [ ] All structured log fields use `mergeRequestNumber` (never `prNumber`)
- [ ] GitHub controller log messages use `MR #X` format (not `PR #X`)
- [ ] GitHub eventFilter reason messages use `MR` (not `PR`)
- [ ] GitHub API guard types (`GitHubPullRequestEvent`, `pull_request` field) are **not** renamed
- [ ] GitLab API guard types (`GitLabMergeRequestEvent`, `merge_request` field) are **not** renamed
- [ ] Dashboard UI labels (`getMrLabel()`) are **not** changed
- [ ] Review file name regex patterns (`MR|PR`) are **not** changed
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] No test logic changed — only type/variable/field names updated
- [ ] Single commit with conventional commit format: `refactor: standardize PR/MR vocabulary to MergeRequest (#77)`

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Large diff makes review hard | Batch by phase. Each batch is a coherent set of renames. Single commit is fine since all changes are mechanical. |
| Missed occurrences | TypeScript compiler catches type/field mismatches. `yarn verify` catches the rest. Manual grep for `mrNumber`, `prNumber`, `TrackedMr` after completion. |
| Breaking persisted data (tracking JSON files) | `reviewRequestTracking.fileSystem.ts` reads/writes JSON with field names. If field names change in the type, the serialized format must match. Verify existing tracking data files still load correctly — or add a migration note. |
| CSS class names `.mr-item` | Explicitly out of scope. No functional impact. |

### Critical note: Persisted data compatibility

The `TrackedMr` type is serialized to JSON files by `reviewRequestTracking.fileSystem.ts`. Renaming `mrNumber` to `mergeRequestNumber` in the type means existing JSON files will have the old field name. **Options**:

1. **Accept data loss** — existing tracking files are transient and can be regenerated.
2. **Add backward-compatible read** — read both `mrNumber` and `mergeRequestNumber`, write only `mergeRequestNumber`.
3. **Migration script** — one-time rename in existing JSON files.

**Recommendation**: Option 1. Tracking data is ephemeral (active MRs only). A note in the PR description suffices.
