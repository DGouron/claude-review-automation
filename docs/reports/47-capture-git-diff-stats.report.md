# Report — SPEC-47 Capture Git Diff Stats

**Spec**: [`docs/specs/47-capture-git-diff-stats.md`](../specs/47-capture-git-diff-stats.md)
**Plan**: [`docs/plans/47-capture-git-diff-stats.plan.md`](../plans/47-capture-git-diff-stats.plan.md)
**Implementation date**: 2026-05-27
**Branch**: `worktree-spec-47-diff-stats`

---

## Status: complete

All Definition of Done items satisfied. Full test suite GREEN (2380/2380) under `yarn verify`.

---

## Summary

The bulk of SPEC-47 (gateway contract, GitHub/GitLab implementations, persistence, `claudeInvoker` integration, stats aggregates, tracking entity extension) was **already in production code** from prior work — likely as a side-effect of the model-routing feature, where `selectModelForReview` already consumed `diffStats` to pick Claude Opus vs Sonnet based on diff size.

The planner's reconnaissance confirmed every file listed in the spec's Technical Notes section already existed and was tested. This iteration closed the remaining gap: the SDD outer-loop acceptance test, and one DoD line (`getStatsSummary()` exposing diff aggregates).

---

## Files created

| File | Purpose | Tests |
|------|---------|-------|
| `src/tests/acceptance/47-capture-git-diff-stats.acceptance.test.ts` | SDD outer loop covering the 7 Gherkin scenarios | 7/7 pass |
| `src/tests/units/services/statsService.summary.test.ts` | Unit coverage for the extended `getStatsSummary` shape | 3/3 pass |

## Files modified

| File | Change |
|------|--------|
| `src/modules/statistics-insights/services/statsService.ts` | Extended `getStatsSummary()` return shape with `totalAdditions`, `totalDeletions`, `averageAdditions` (formatted), `averageDeletions` (formatted), `totalLinesReviewed` |
| `docs/specs/47-capture-git-diff-stats.md` | Status updated to `implemented`, Implementation section added |
| `docs/feature-tracker.md` | Row 11 status `drafted` → `implemented`, date `2026-05-27` |

## Files untouched (verified existing)

- `src/modules/shared-kernel/entities/diffStats/diffStats.ts`
- `src/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.ts`
- `src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.github.gateway.ts`
- `src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.ts`
- `src/modules/tracking/entities/tracking/reviewEvent.ts`
- `src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts`
- `src/frameworks/claude/claudeInvoker.ts`
- `src/tests/stubs/diffStatsFetch.stub.ts`
- `src/tests/factories/diffStats.factory.ts`
- `src/tests/factories/projectStats.factory.ts`

---

## Acceptance scenario coverage

| Scenario | Gherkin | Result | Required code change? |
|----------|---------|--------|-----------------------|
| 1 | GitHub nominal capture (3 commits / 150 / 30) | GREEN | No |
| 2 | GitLab nominal capture (5 commits / 200 / 45) | GREEN | No |
| 3 | Fetch failure does not block review (null persisted, warning logged) | GREEN | No |
| 4 | Backward compatibility (old reviews without `diffStats`) | GREEN | No |
| 5 | Aggregated diff stats in project stats | GREEN (after `getStatsSummary` extension) | **Yes** |
| 6 | Followup reviews also capture diff stats | GREEN | No |
| 7 | Zero-diff merge request (1 commit / 0 / 0 persisted as-is) | GREEN | No |

Scenario 5 was the single RED that drove the only production change.

---

## Architectural decisions

### D1 — Platform APIs over local `git diff`
The spec rejected `git diff --shortstat` because `claudeInvoker.ts` system prompt (lines 143-155) explicitly forbids relying on local git state during reviews — concurrent reviews on the same checkout produce unreliable output. Both gateways use platform APIs (`gh api`, `glab api`) instead. Consistent with the existing `DiffMetadataFetchGateway` pattern.

### D2 — No Zod schema for `DiffStats`
Gateways perform shape narrowing (`typeof additions !== 'number'` → null) rather than runtime schema validation. KISS — the platform APIs are stable and well-typed, and the gateway already handles malformed responses gracefully.

### D3 — GitLab compound-call all-or-nothing failure
GitLab requires two sequential calls: MR detail (for additions/deletions) + commits endpoint (for count). Both are wrapped in a single try/catch; any partial failure returns `null`. Verified in `diffStatsFetch.gitlab.gateway.ts` lines 16-45.

### D4 — Aggregation excludes nulls
`updateAggregatesForNewReview` increments `diffStatsReviewCount` only when `review.diffStats` is truthy. Averages divide by this counter, so legacy reviews without diff data do not skew means.

### D5 — `diffStats` is optional everywhere
- `ReviewStats.diffStats?: DiffStats | null` (optional on the persisted entity — backward compatible with old `stats.json`)
- `ReviewEvent.diffStats: DiffStats | null` (nullable but present — tracking is forward-only)
- `RecordReviewCompletionInput.reviewData.diffStats?: DiffStats | null` (optional input)

### D6 — `getStatsSummary()` shape extension
Added 5 fields to the summary return type. Averages are formatted strings following the existing `averageScore` convention (`'-'` when no data, otherwise `.toFixed(0)`). `totalLinesReviewed` is the sum of `totalAdditions + totalDeletions`.

### D7 — Out of scope
- No dashboard rendering (separate ticket).
- No diff-size warnings or thresholds.
- No per-file breakdown — aggregates only.
- No historical backfill — old reviews remain `null`.

---

## DoD checklist

### Domain & Gateway layer
- [x] `DiffStats` type defined
- [x] `DiffStatsFetchGateway` interface defined
- [x] GitLab implementation via `glab api`
- [x] GitHub implementation via `gh api`
- [x] Gateway stub exists in `src/tests/stubs/`
- [x] Gateway unit tests verify parsing
- [x] Gateway unit tests verify graceful failure

### Data model extensions
- [x] `ReviewStats.diffStats?: DiffStats | null`
- [x] `ReviewEvent.diffStats: DiffStats | null`
- [x] `ReviewStatsFactory` and test factories updated
- [x] `ProjectStats` aggregate fields (`totalAdditions`, `totalDeletions`, `averageAdditions`, `averageDeletions`, `diffStatsReviewCount`)

### Integration
- [x] `addReviewStats()` accepts and stores diff stats
- [x] `claudeInvoker.ts` fetches diff stats with try/catch (`fetchDiffStatsSafely`)
- [x] `RecordReviewCompletionUseCase` accepts optional diffStats
- [x] `getStatsSummary()` includes diff stats in summary output **(closed this iteration)**

### Quality
- [x] All tests in English
- [x] All imports use `@/` alias + `.js` extension
- [x] No `as Type` assertions
- [x] `yarn verify` passes (typecheck + lint + tests)
- [x] Backward compatibility verified (Scenario 4)

---

## Test counts

| Suite | Result |
|-------|--------|
| Acceptance (`47-capture-git-diff-stats.acceptance.test.ts`) | 7/7 |
| Unit (`statsService.summary.test.ts`) | 3/3 |
| Full suite (`yarn verify`) | 2380/2380 |

---

## Notes for future work

- **Dashboard rendering** is a clear next step — the `getStatsSummary()` now returns the four diff fields the UI needs (`totalAdditions`, `totalDeletions`, `averageAdditions`, `averageDeletions`, `totalLinesReviewed`).
- **Diff-size warnings** (e.g., "MR too large for effective review") could ride on top of `diffStats.additions + diffStats.deletions` exceeding a threshold — see SPEC drafts for future enhancement tickets.
- The asymmetry between GitHub (single API call) and GitLab (compound call) is hidden behind the gateway interface. If future platforms are added, the contract is `Promise<DiffStats | null>` — no leaky abstraction.
