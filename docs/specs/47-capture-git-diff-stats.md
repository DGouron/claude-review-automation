# Spec #47 — Capture Git Diff Stats (Commits, Additions, Deletions)

## Status: READY FOR IMPLEMENTATION

---

## Problem Statement

Review stats lack code volume context. A review that takes 10 minutes on a 500-line diff is efficient; the same 10 minutes on a 5-line diff is concerning. Without diff size metrics, there is no way to correlate review quality/duration with code volume, making it impossible to identify:

- Whether review time scales appropriately with diff size
- Whether large diffs produce lower quality scores (a known code review anti-pattern)
- Average lines-per-review across projects for workload planning

The data model already captures review duration, score, blocking/warning counts, and thread counts — but nothing about the *input size* of the code being reviewed.

## User Story

**As a** ReviewFlow operator,
**I want** each review to capture the number of commits, lines added, and lines deleted from the merge request diff,
**so that** I can contextualize review quality metrics against code volume and identify MRs that are too large for effective review.

---

## Current State Analysis

### Two stats systems exist in the codebase

| System | Entity | Storage | Used by |
|--------|--------|---------|---------|
| **statsService** | `ReviewStats` / `ProjectStats` | `<project>/.claude/reviews/stats.json` | `/api/stats` route, `claudeInvoker.ts` (line 516) |
| **MR tracking** | `ReviewEvent` / `TrackedMr` / `ProjectStats` | `<project>/.claude/reviews/tracking.json` | `/api/mr-tracking/*` routes, dashboard |

Both need git diff stats — `ReviewStats` for per-review history, `ReviewEvent` for per-MR event tracking.

### Existing infrastructure

- `DiffMetadata` (`reviewContext.ts`) already stores `baseSha`, `headSha`, `startSha` — but no volume stats
- `DiffMetadataFetchGateway` implementations exist for both GitLab and GitHub using platform APIs
- `addReviewStats()` in `statsService.ts` is called from `claudeInvoker.ts` after a successful review
- `RecordReviewCompletionUseCase` records `ReviewEvent` data from the MR tracking routes

### What does NOT exist

- No `git diff --shortstat` or `git rev-list --count` usage anywhere in the codebase
- No `additions`, `deletions`, or `commitsCount` fields on any stats entity
- No gateway contract for fetching diff volume stats

---

## Scope Definition

### What this ticket covers

1. **New domain type**: `DiffStats` with `commitsCount`, `additions`, `deletions`
2. **New gateway contract**: `DiffStatsFetchGateway` for retrieving diff volume stats
3. **Two gateway implementations**: GitLab (via `glab api`) and GitHub (via `gh api`)
4. **Extend `ReviewStats`**: Add optional `diffStats` field (backward compatible)
5. **Extend `ReviewEvent`**: Add optional `diffStats` field (backward compatible)
6. **Capture at review time**: Call the gateway in `claudeInvoker.ts` before saving stats
7. **Capture at tracking time**: Pass diff stats through `RecordReviewCompletionUseCase`
8. **Expose in API**: Include diff stats in `/api/stats` and `/api/mr-tracking` responses
9. **Backward compatibility**: Old reviews without diff stats show `null` — no data migration

### Design decision: platform API vs. local git commands

The issue suggests `git diff --shortstat` and `git rev-list --count`. However, the codebase explicitly forbids relying on local git state during reviews (see `claudeInvoker.ts` system prompt lines 143-155: "the local state is UNRELIABLE"). Multiple reviews can run concurrently on the same repo checkout.

**Decision**: Use platform APIs instead of local git commands.
- **GitLab**: `glab api projects/:id/merge_requests/:iid` returns `changes_count` (files changed). For line-level stats: `glab api projects/:id/merge_requests/:iid/changes` returns per-file diffs, or use the merge request `diff_refs` + git diff on the server side. Alternatively, `glab mr view` provides commit count and diff stats.
- **GitHub**: `gh api repos/:owner/:repo/pulls/:number` directly returns `additions`, `deletions`, `changed_files`, `commits`.

This approach is consistent with existing `DiffMetadataFetchGateway` patterns and safe for concurrent reviews.

---

## Gherkin Scenarios

### Feature: Capture git diff stats during review

#### Scenario 1: Successful diff stats capture on GitHub review (nominal)

```gherkin
Given a GitHub pull request #42 with 3 commits, 150 additions, and 30 deletions
  And a review job completes successfully for this PR
When the review stats are recorded
Then the ReviewStats entry should include diffStats with commitsCount 3, additions 150, and deletions 30
  And the ReviewEvent for the MR tracking should include the same diffStats
```

#### Scenario 2: Successful diff stats capture on GitLab review (nominal)

```gherkin
Given a GitLab merge request !42 with 5 commits, 200 additions, and 45 deletions
  And a review job completes successfully for this MR
When the review stats are recorded
Then the ReviewStats entry should include diffStats with commitsCount 5, additions 200, and deletions 45
```

#### Scenario 3: Diff stats fetch failure does not block the review

```gherkin
Given a merge request with an active review
  And the platform API call for diff stats fails with a network error
When the review stats are recorded
Then the ReviewStats entry should have diffStats as null
  And the review completion should NOT be affected
  And a warning should be logged
```

#### Scenario 4: Backward compatibility — old reviews without diff stats

```gherkin
Given a project with existing stats.json containing reviews without diffStats fields
When the project stats are loaded via /api/stats
Then old reviews should display with diffStats as null or undefined
  And the API response should NOT fail or crash
  And aggregated stats should exclude missing diff stats from averages
```

#### Scenario 5: Aggregated diff stats in project stats

```gherkin
Given a project with 3 reviews:
  | review | additions | deletions | commits |
  | 1      | 100       | 20        | 2       |
  | 2      | 50        | 10        | 1       |
  | 3      | null      | null      | null    |
When the project stats summary is requested
Then averageAdditions should be 75 (average of reviews with data only)
  And averageDeletions should be 15
  And totalLinesReviewed should be 180
```

#### Scenario 6: Followup reviews also capture diff stats

```gherkin
Given a merge request that has already been reviewed
  And a followup review is triggered after a push
When the followup review completes
Then the ReviewEvent for the followup should also capture diffStats
  And the diffStats should reflect the current state of the MR (not just the push delta)
```

#### Scenario 7: Zero-diff merge request

```gherkin
Given a merge request with 0 additions and 0 deletions (e.g., only commit message changes)
When the review stats are recorded
Then diffStats should be { commitsCount: 1, additions: 0, deletions: 0 }
  And this should NOT be treated as a failure or null case
```

---

## Out of Scope

- **Dashboard UI rendering of diff stats** — this ticket captures and stores the data; dashboard visualization is a separate ticket
- **Diff size warnings or thresholds** (e.g., "MR too large") — future feature that depends on this data
- **Per-file diff breakdown** — only aggregate totals (additions, deletions, commits) are captured
- **Historical backfill** — old reviews remain without diff stats; no migration script
- **Score-to-size correlation analysis** — future analytics feature
- **Diff stats for cancelled or failed reviews** — only successful reviews record stats
- **Local git commands** — platform APIs only, as discussed in Design Decision above

---

## INVEST Validation

| Criterion | Assessment | Pass? |
|-----------|-----------|-------|
| **Independent** | No dependency on other open tickets. Uses existing gateway pattern and extends existing data model. | Yes |
| **Negotiable** | Aggregated stats (scenario 5) could be deferred. Gateway implementation order (GitLab first vs GitHub first) is flexible. | Yes |
| **Valuable** | Enables code volume context for all review metrics. Foundation for future diff-size-based features (warnings, analytics). | Yes |
| **Estimable** | ~5 story points. Gateway implementations follow existing `DiffMetadataFetchGateway` pattern. Data model changes are additive (optional fields). | Yes |
| **Small** | 8-10 files modified/created. No architectural changes. Follows existing patterns. Fits within a single PR. | Yes |
| **Testable** | Each scenario has concrete inputs/outputs. Gateway implementations can be tested with stubs. Backward compatibility is verifiable. | Yes |

---

## Definition of Done

### Domain & Gateway layer
- [ ] `DiffStats` type defined (commitsCount, additions, deletions) in `src/entities/diffStats/` or alongside `DiffMetadata`
- [ ] `DiffStatsFetchGateway` interface defined in entities layer
- [ ] GitLab implementation fetches stats via `glab api` (follows `DiffMetadataFetchGateway` pattern)
- [ ] GitHub implementation fetches stats via `gh api` (follows `DiffMetadataFetchGateway` pattern)
- [ ] Gateway stub exists in `src/tests/stubs/`
- [ ] Gateway unit tests verify correct parsing of platform API responses
- [ ] Gateway unit tests verify graceful failure on API errors (returns null, does not throw)

### Data model extensions
- [ ] `ReviewStats` (in `statsService.ts`) includes optional `diffStats: DiffStats | null` field
- [ ] `ReviewEvent` (in `tracking/reviewEvent.ts`) includes optional `diffStats: DiffStats | null` field
- [ ] `ReviewStatsFactory` and test factories updated with diffStats support
- [ ] Existing `ProjectStats` type in `statsService.ts` includes aggregate diff fields (totalAdditions, totalDeletions, averageAdditions, averageDeletions)

### Integration
- [ ] `addReviewStats()` in `statsService.ts` accepts and stores diff stats
- [ ] `claudeInvoker.ts` fetches diff stats before calling `addReviewStats()` (with try/catch, failure = null)
- [ ] `RecordReviewCompletionUseCase` accepts optional diffStats in input and passes to ReviewEvent
- [ ] `getStatsSummary()` includes diff stats in the summary output

### Quality
- [ ] All tests written in English
- [ ] All imports use `@/` alias + `.js` extension
- [ ] No `as Type` assertions — use guards or type narrowing
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] Backward compatibility verified: loading stats.json without diffStats fields works correctly

---

## Technical Notes

### Files to Create

| File | Layer | Purpose |
|------|-------|---------|
| `src/entities/diffStats/diffStats.ts` | Entity | `DiffStats` type definition |
| `src/entities/diffStats/diffStats.gateway.ts` | Entity | `DiffStatsFetchGateway` interface |
| `src/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.ts` | Interface Adapter | GitLab API implementation |
| `src/interface-adapters/gateways/diffStatsFetch.github.gateway.ts` | Interface Adapter | GitHub API implementation |
| `src/tests/stubs/diffStatsFetch.stub.ts` | Test | Stub gateway |
| `src/tests/units/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.test.ts` | Test | GitLab gateway tests |
| `src/tests/units/interface-adapters/gateways/diffStatsFetch.github.gateway.test.ts` | Test | GitHub gateway tests |

### Files to Modify

| File | Change |
|------|--------|
| `src/entities/tracking/reviewEvent.ts` | Add optional `diffStats` field |
| `src/services/statsService.ts` | Add `diffStats` to `ReviewStats`, update `addReviewStats()` signature, update `ProjectStats` aggregates, update `getStatsSummary()` |
| `src/frameworks/claude/claudeInvoker.ts` | Fetch diff stats before saving review stats (line ~516) |
| `src/usecases/tracking/recordReviewCompletion.usecase.ts` | Accept optional `diffStats` in input |
| `src/tests/factories/projectStats.factory.ts` | Add `diffStats` to factory |
| `src/interface-adapters/gateways/fileSystem/stats.fileSystem.ts` | No change needed (reads/writes JSON transparently) |

### Platform API Reference

**GitHub** (`gh api repos/:owner/:repo/pulls/:number`):
```json
{
  "commits": 3,
  "additions": 150,
  "deletions": 30,
  "changed_files": 5
}
```

**GitLab** (`glab api projects/:id/merge_requests/:iid`):
```json
{
  "changes_count": "5",
  "diff_refs": { "base_sha": "...", "head_sha": "...", "start_sha": "..." }
}
```
For commit count on GitLab: `glab api projects/:id/merge_requests/:iid/commits` and count the array length.
For additions/deletions on GitLab: `glab api projects/:id/merge_requests/:iid?include_diverged_commits_count=true` or iterate `changes` endpoint for per-file stats summing `diff` lines.

### DiffStats Type

```typescript
export type DiffStats = {
  commitsCount: number;
  additions: number;
  deletions: number;
};
```

### Graceful Failure Pattern

```typescript
let diffStats: DiffStats | null = null;
try {
  diffStats = diffStatsFetchGateway.fetchDiffStats(projectPath, mrNumber);
} catch (error) {
  logger.warn({ error, mrNumber }, 'Failed to fetch diff stats, continuing without');
}
```
