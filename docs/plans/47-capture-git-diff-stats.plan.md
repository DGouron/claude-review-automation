# Plan — SPEC-47 Capture Git Diff Stats

**Spec**: `docs/specs/47-capture-git-diff-stats.md`
**Tracker status (current)**: `drafted`
**Tracker status (target)**: `implemented`
**Pattern reference**: `DiffMetadataFetchGateway` (mirrored exactly)

---

## CRITICAL FINDING — Feature is largely already implemented

A reconnaissance of the codebase reveals that **most of the spec is already in production code**. The plan therefore reframes from "build from scratch" to "close the gap + add the missing acceptance test + finalize DoD checklist".

### What ALREADY exists (verified by file read)

| File | Status |
|------|--------|
| `src/modules/shared-kernel/entities/diffStats/diffStats.ts` | EXISTS — type `{commitsCount, additions, deletions}` |
| `src/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.ts` | EXISTS — interface `DiffStatsFetchGateway` |
| `src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.github.gateway.ts` | EXISTS — gh api impl with try/catch |
| `src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.ts` | EXISTS — compound call (MR detail + commits) with try/catch |
| `src/tests/stubs/diffStatsFetch.stub.ts` | EXISTS — `StubDiffStatsFetchGateway` |
| `src/tests/factories/diffStats.factory.ts` | EXISTS — `DiffStatsFactory.create()` |
| `src/tests/units/entities/diffStats/diffStats.test.ts` | EXISTS — 3 cases |
| `src/tests/units/interface-adapters/gateways/diffStatsFetch.github.gateway.test.ts` | EXISTS — 6 cases (incl. error, malformed, zero-diff) |
| `src/tests/units/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.test.ts` | EXISTS — 7 cases (incl. partial-call failure) |
| `src/modules/statistics-insights/entities/stats/projectStats.ts` | EXISTS — `ReviewStats.diffStats?` + `ProjectStats.totalAdditions/totalDeletions/averageAdditions/averageDeletions/diffStatsReviewCount` |
| `src/modules/statistics-insights/services/statsService.ts` | EXISTS — `addReviewStats(..., diffStats?)`, `initializeCumulativeCounters`, `updateAggregatesForNewReview` with diff aggregation excluding nulls |
| `src/modules/tracking/entities/tracking/reviewEvent.ts` | EXISTS — `diffStats: DiffStats \| null` field on `ReviewEvent` |
| `src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts` | EXISTS — `reviewData.diffStats?` accepted and forwarded |
| `src/tests/factories/projectStats.factory.ts` | EXISTS — `ReviewStatsFactory.withDiffStats()` + `ProjectStatsFactory.withReviews()` aggregating diffStats |
| `src/frameworks/claude/claudeInvoker.ts` | EXISTS — `diffStatsFetchFactory(platform)` injected via deps, `fetchDiffStatsSafely()` wraps with try/catch+warn, `diffStats` threaded through `BackgroundDispatchContext` |

### What is MISSING (the actual scope of this plan)

| Gap | Location | Why |
|-----|----------|-----|
| **Acceptance test for SPEC-47** | `src/tests/acceptance/47-capture-git-diff-stats.acceptance.test.ts` | SDD outer loop — does not exist |
| **`getStatsSummary()` does not expose diff aggregates** | `src/modules/statistics-insights/services/statsService.ts` (lines 289-338) | DoD line 203: "getStatsSummary() includes diff stats in the summary output" — currently absent |
| **Tracker status not updated** | `docs/feature-tracker.md` line 11 | Status `drafted` → `implemented` |
| **Implementation report missing** | `docs/reports/47-capture-git-diff-stats.report.md` | SDD pipeline expects a report |

---

PLAN:
  scope: Close the gap on SPEC-47 — add acceptance test, expose diff aggregates in `getStatsSummary()`, update tracker + report
  is_new_module: false (everything required by the spec already exists, except `getStatsSummary` enrichment)

  ENTITIES:
    (none new — `DiffStats` already exists at `src/modules/shared-kernel/entities/diffStats/diffStats.ts`)

  USECASES:
    (none new — `RecordReviewCompletionUseCase` already accepts optional `diffStats` in input)

  GATEWAYS:
    (none new — `GitHubDiffStatsFetchGateway` and `GitLabDiffStatsFetchGateway` already implemented and tested)

  CONTROLLERS:
    (none new)

  PRESENTERS:
    (none — Dashboard UI rendering of diff stats is explicitly out of scope per spec)

  VIEWS:
    (none — out of scope)

  WIRING:
    routes: (already wired — `claudeInvoker.ts` already receives `diffStatsFetchFactory` via `ClaudeInvokerDependencies`)
    dependencies: (already instantiated in composition root — verified by Grep on `GitLabDiffStatsFetchGateway` and `GitHubDiffStatsFetchGateway` imports)

  MODIFICATIONS_REQUIRED:
    - file: src/modules/statistics-insights/services/statsService.ts
      change: |
        Extend the return shape of `getStatsSummary()` to include diff aggregates:
          totalAdditions: number
          totalDeletions: number
          averageAdditions: string  (formatted, '-' when null per `averageScore` convention)
          averageDeletions: string  (formatted, '-' when null)
          totalLinesReviewed: number  (= totalAdditions + totalDeletions, only for diff-stats-bearing reviews — already enforced by `updateAggregatesForNewReview`)
        Update unit test alongside (RED first).
      test: src/tests/units/services/statsService.test.ts (or wherever existing tests live — verify and extend)

    - file: docs/feature-tracker.md (line 11)
      change: Status `drafted` → `implemented`, add link to plan + report.

  NEW_FILES:
    - file: src/tests/acceptance/47-capture-git-diff-stats.acceptance.test.ts
      purpose: SDD outer loop covering all 7 Gherkin scenarios.
      strategy: |
        Use `StubDiffStatsFetchGateway` + `RecordReviewCompletionUseCase` + `addReviewStats()` + in-memory tracking gateway.
        DO NOT spin up Fastify routes — exercise the use case + service layer directly. The integration with `claudeInvoker` is verified by inspection (already wired) and out of acceptance test scope (would require process spawning).
      scenarios_mapping:
        - "Scenario 1 — GitHub nominal":
            stub returns {commitsCount:3, additions:150, deletions:30}
            call `addReviewStats(projectPath, 42, duration, stdout, 'user', stub.fetch())`
            assert ReviewStats.diffStats matches; call `RecordReviewCompletionUseCase` with same diffStats; assert ReviewEvent.diffStats matches.
        - "Scenario 2 — GitLab nominal":
            identical pattern with {commitsCount:5, additions:200, deletions:45}.
        - "Scenario 3 — fetch failure does not block review":
            stub.setFailure(mrNumber) → caller wraps in try/catch (mirrors `fetchDiffStatsSafely` pattern from claudeInvoker.ts:273-285) → addReviewStats called with `null`.
            Assert ReviewStats.diffStats === null, no exception, the rest of the review payload persists correctly.
        - "Scenario 4 — backward compatibility":
            Build a `ProjectStats` fixture with reviews lacking `diffStats` field. Pass through `loadProjectStats()` round-trip via temp file.
            Assert no crash, aggregates exclude missing entries from averages (i.e. `averageAdditions === null` if no review has diffStats, or correct average if some do).
        - "Scenario 5 — aggregation excludes nulls":
            Add 3 reviews via `addReviewStats()`: (100/20/2), (50/10/1), (null).
            Assert `stats.averageAdditions === 75`, `stats.averageDeletions === 15`, sum of non-null = 180. `diffStatsReviewCount === 2`.
        - "Scenario 6 — followup also captures diffStats":
            Call `RecordReviewCompletionUseCase` twice for same mrId — once with `type: 'review'` then `type: 'followup'` — each with current-state diffStats.
            Assert both `ReviewEvent` entries carry diffStats.
        - "Scenario 7 — zero-diff MR":
            stub returns {commitsCount:1, additions:0, deletions:0}.
            Assert it is persisted as-is (not coerced to null), `diffStatsReviewCount` increments, `totalAdditions/totalDeletions` remain unchanged (+0).

    - file: docs/reports/47-capture-git-diff-stats.report.md
      purpose: SDD implementation report. Documents that the feature was already mostly implemented in prior work (likely as part of model routing — `selectModelForReview` consumes diffStats), and this iteration closes the spec's DoD checklist.

  IMPLEMENTATION_ORDER:
    1. Write `src/tests/acceptance/47-capture-git-diff-stats.acceptance.test.ts` with all 7 scenarios — most pass immediately (RED only on Scenario 5 if `diffStatsReviewCount` is not initialized on a fresh stats object — verify; and on whatever `getStatsSummary` checks the test asserts).
    2. Identify the first FAILING scenario — that drives the next change.
    3. If `getStatsSummary()` is asserted to include diff aggregates (recommended — DoD line 203), extend it (RED → GREEN) along with its existing unit test.
    4. Re-run `yarn verify`.
    5. Write `docs/reports/47-capture-git-diff-stats.report.md`.
    6. Update `docs/feature-tracker.md` row 11 to `implemented` + link plan + report.

  REFERENCE_FILES:
    - src/modules/platform-integration/entities/diffMetadata/diffMetadata.gateway.ts — original pattern reference (matched exactly by diffStatsFetch.gateway.ts)
    - src/modules/platform-integration/interface-adapters/gateways/diffMetadataFetch.gitlab.gateway.ts — original GitLab pattern (mirrored by diffStatsFetch.gitlab.gateway.ts with compound call)
    - src/modules/platform-integration/interface-adapters/gateways/diffMetadataFetch.github.gateway.ts — original GitHub pattern (mirrored)
    - src/modules/statistics-insights/services/statsService.ts — extension point for `getStatsSummary()`
    - src/modules/statistics-insights/entities/stats/projectStats.ts — already extended with diff aggregates
    - src/modules/tracking/entities/tracking/reviewEvent.ts — already extended
    - src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts — already extended
    - src/frameworks/claude/claudeInvoker.ts (~line 273-285, ~line 433) — `fetchDiffStatsSafely` integration verified
    - src/tests/stubs/diffStatsFetch.stub.ts — to be used in acceptance test
    - src/tests/factories/diffStats.factory.ts — to be used in acceptance test
    - src/tests/factories/projectStats.factory.ts — to be used in acceptance test
    - docs/feature-tracker.md — tracker row 11 to update

ACCEPTANCE_TEST:
  file: src/tests/acceptance/47-capture-git-diff-stats.acceptance.test.ts
  note: |
    SDD outer loop — written FIRST. Expected behavior: most scenarios will GREEN immediately because the
    implementation is already in place. Any scenario that goes RED reveals a true gap to close — likely
    Scenario 4 (backward compat with malformed JSON without diffStats) or Scenario 5 if `diffStatsReviewCount`
    is undefined when loading legacy stats files.

---

## Architectural Decisions (validated against existing code)

### D1 — Platform APIs over local git — DONE
`fetchDiffStatsSafely()` in `claudeInvoker.ts:273` uses `diffStatsFetchFactory(platform)` to pick the right gateway. Local git is never touched.

### D2 — No Zod schema for DiffStats — DONE
Gateways use shape-narrowing (`typeof additions !== 'number'` returns null) rather than runtime schema validation. Consistent with existing `DiffMetadataFetchGateway` pattern. KISS.

### D3 — GitLab all-or-nothing on compound failure — DONE
`diffStatsFetch.gitlab.gateway.ts` wraps both API calls in a single try/catch; any failure returns `null`. Verified at file lines 16-45.

### D4 — Aggregation excludes nulls — DONE
`updateAggregatesForNewReview` increments `diffStatsReviewCount` only when `review.diffStats` is truthy (line 274); averages divide by this counter (lines 280-283).

### D5 — `diffStats` is optional everywhere — DONE
- `ReviewStats.diffStats?: DiffStats | null` (optional)
- `ReviewEvent.diffStats: DiffStats | null` (nullable — chosen non-optional for tracking entity, optional for stats — minor inconsistency but backward-compatible)
- `RecordReviewCompletionInput.reviewData.diffStats?: DiffStats | null` (optional)

### D6 — Single `fetchDiffStats` method — DONE
Gateway returns the full aggregate or null. GitLab's compound call is hidden internally.

### D7 — Out of scope: presenter/view — DONE
No `diffStatsPresenter`, no dashboard widget. Data-only ticket.

### NEW — D8 — Surface diff aggregates in `getStatsSummary()`
The spec's DoD line 203 ("getStatsSummary() includes diff stats in the summary output") is the only DoD item currently unsatisfied. This plan adds the four fields and updates the summary's TypeScript return type.

---

## Walking Skeleton

The vertical slice already exists end-to-end:

1. `DiffStats` type — DONE
2. `DiffStatsFetchGateway` contract — DONE
3. `GitHubDiffStatsFetchGateway` impl — DONE
4. `claudeInvoker.ts` calls the gateway with try/catch — DONE (line 273-285)
5. `ReviewStats.diffStats` persists — DONE
6. **Acceptance Scenario 1 (GitHub nominal) — to write, expected GREEN immediately**

The remaining work is to close the spec's DoD checklist, not build a new vertical slice.

---

## Notes for the implementer

- **Do NOT rebuild files that already exist**. Read each file first; if the behavior is already there, write the acceptance assertion and move on.
- The implementer's first job is the acceptance test. It will likely surface 0-2 small gaps (probably in `getStatsSummary` and edge cases for legacy stats.json deserialization).
- The GitLab gateway is structurally more complex than GitHub: two sequential `glab api` calls (MR detail + commits) versus a single `gh api` call returning `{additions, deletions, commits}`. This asymmetry is hidden behind the unified `DiffStatsFetchGateway` interface — the acceptance test should treat both via the same stub.
- Tracker update + report writing belong to the final commit, after `yarn verify` passes.
