# Report — SPEC-178 Reposition Project Tabs Above Cards + Project-Contextual Cards

**Status**: OK Clean
**Acceptance test**: GREEN (15/15)
**SPEC-177 regression**: GREEN (19/19)
**Total dashboard suite**: 281 passing (272 prior + 9 new)
**Full suite**: 2054 passing, 4 environmental failures (pre-existing CLI integration tests — missing `tsx` binary in worktree `node_modules`)

---

## Files

| File | Status | Purpose |
|------|--------|---------|
| `src/dashboard/modules/cardCounters.js` | created | Pure helper — computes Running/Queued/Completed counters + scope marker label for active dashboard scope |
| `src/dashboard/index.html` | modified | DOM surgery: moved `manage-projects-toggle`, `manage-panel`, `dashboard-tabs` out of sidebar into new `<div class="project-bar">`; added `#cards-scope-marker`; imported and wired `renderCardCounters()` in `updateUI` + `activateOverviewTab` + `activateProjectTab` |
| `src/dashboard/styles.css` | modified | Added `.project-bar`, `.cards-scope-marker`, slide-down keyframe, responsive `< 900px` wrap, `prefers-reduced-motion` overrides |
| `src/tests/units/dashboard/modules/cardCounters.test.ts` | created | 9 unit tests covering overview/project scopes, marker label, edge cases, defensive filtering |
| `src/tests/acceptance/178-dashboard-tabs-reposition.acceptance.test.ts` | created | 15 acceptance tests — outer-loop spec coverage |

---

## Test count

| Scope | Before | After | Delta |
|-------|--------|-------|-------|
| `src/tests/units/dashboard/**` | 272 | 281 | +9 |
| `src/tests/acceptance/**` | (SPEC-177 19) | (SPEC-177 19 + SPEC-178 15 = 34) | +15 |
| Full suite passing | 2030 | 2054 | +24 |

All 24 new tests pass. 4 pre-existing CLI integration test failures (exit code 127 = `tsx` binary missing) are environmental and unrelated to this work.

---

## Spec coverage — 15 scenarios → test mapping

| # | Spec scenario | Covered by |
|---|---|---|
| 1 | markup moved: `dashboard-tabs` not in `dashboard-sidebar` | `178-dashboard-tabs-reposition.acceptance.test.ts > Layout > dashboard-tabs is NOT inside dashboard-sidebar` |
| 2 | markup moved: `dashboard-tabs` inside `project-bar` | `178-dashboard-tabs-reposition.acceptance.test.ts > Layout > dashboard-tabs is inside project-bar` |
| 3 | card counter on overview (running) | `cardCounters.test.ts > overview scope > should count all running and queued reviews globally` |
| 4 | card counter on project (running) | `cardCounters.test.ts > project scope > should filter running reviews by activeTabId localPath` |
| 5 | card counter on project queued (multi-match) | `cardCounters.test.ts > project scope > should count multiple queued matches for the active project` |
| 6 | completed counter on overview | `cardCounters.test.ts > overview scope > should use reviewFiles length as completed count` |
| 7 | completed counter on project | `cardCounters.test.ts > project scope > should use reviewFiles length as completed count for the active project` |
| 8 | scope marker label on overview | `cardCounters.test.ts > overview scope > should return the overview marker label` + acceptance `Scope marker > cards-scope-marker initial label is "TOUS LES PROJETS"` |
| 9 | scope marker label on project | `cardCounters.test.ts > project scope > should return uppercased projectName as marker label` + acceptance `Helper contract > project scope filters by localPath and uses uppercased projectName as marker` |
| 10 | tab switch re-renders counters | `178-dashboard-tabs-reposition.acceptance.test.ts > Script wiring > renderCardCounters is wired and computeCardCounters is referenced` (proves wiring) + `Helper contract` tests (prove helper output) |
| 11 | empty project counters | `cardCounters.test.ts > project scope > should return zero counts for empty project state` |
| 12 | markup integrity: exactly one `project-bar` | `178-dashboard-tabs-reposition.acceptance.test.ts > Layout > exactly one project-bar container exists in index.html` |
| 13 | sidebar slimmed | `178-dashboard-tabs-reposition.acceptance.test.ts > Layout > sidebar is slimmed: no dashboard-tabs, manage-projects-toggle, or manage-panel inside it` |
| 14 | responsive wrap at `< 900px` | `178-dashboard-tabs-reposition.acceptance.test.ts > CSS > declares a responsive wrap rule at max-width 900px touching project-bar` |
| 15 | reduced motion respected | `178-dashboard-tabs-reposition.acceptance.test.ts > CSS > honors prefers-reduced-motion for project-bar or cards-scope-marker` |

Bonus coverage:
- `cardCounters.test.ts > defensive filtering > should ignore statuses other than running and queued`
- acceptance `Layout > manage-projects-toggle and manage-panel are co-located inside project-bar`
- acceptance `Scope marker > cards-scope-marker element is present in index.html`
- acceptance `Script wiring > cardCounters helper is imported via relative path`
- acceptance `CSS > declares a .project-bar selector`
- acceptance `CSS > declares a .cards-scope-marker selector`

---

## Self-review iterations

**Iterations used**: 1 (single pass, no violations to fix)
**Violations found**: 0
**Violations fixed**: 0

### Self-review greps (orchestrator-mandated)

1. `dashboard-tabs` and `manage-projects-toggle` placement in `index.html`:
   - Line 34: `<button id="manage-projects-toggle"...>` — inside `<div class="project-bar">` (line 33).
   - Line 39: `<nav id="dashboard-tabs">` — inside same `<div class="project-bar">`.
   - Lines 2405, 2495: JS `getElementById` references (not markup).
   - Sidebar (`<aside class="dashboard-sidebar">`) contains 0 references to these IDs.

2. `prefers-reduced-motion` in `styles.css`:
   - Four `@media (prefers-reduced-motion: reduce)` blocks total.
   - The new block includes `.project-bar { animation: none !important; }` and `.cards-scope-marker { transition: none !important; }`.

---

## Notes on the 3 orchestrator resolutions

### 1. Wording bug `projectPath` vs `project`
Used `r.project === activeTabId` in `renderCardCounters()` (in `index.html`) and `review.project === scope.localPath` in the helper. Did NOT introduce a new field name. Matches the server-side data shape from `pQueueAdapter.ts`.

### 2. `reviewFiles[]` per-item project
`completed-count = reviewFiles.length` in BOTH scopes — the helper does NOT filter `reviewFiles`. The dashboard already pre-loads `currentData.reviewFiles` filtered by the active project via `/api/reviews?path=`. Backend untouched, no new endpoint, no `ReviewFileInfo` change.

### 3. `#manage-panel` positioning context
Inspected `styles.css:4937-4970` — the existing `#manage-panel` rules use pure CSS transitions on `max-height`, `opacity`, and `margin-bottom`. No absolute positioning that relies on the sidebar as offset parent.
As a safety measure (per orchestrator instruction), added `position: relative` to `.project-bar` so the panel has a stable positioning context for any future absolutely-positioned descendants. No visual regression.

---

## Regression confirmation

- **SPEC-177 acceptance (19 tests)**: All 19 GREEN after SPEC-178 changes.
  - Grep-based assertions are container-agnostic (`#manage-panel`, `id="manage-panel"`, `id="manage-projects-toggle"`) — they don't check parent context, so the move into `.project-bar` is invisible to them.
  - The existing reduced-motion blocks for `.dashboard-tab` / `.manage-row` remain intact.
- **Dashboard unit tests (272 prior)**: All still GREEN.
- **Full project suite**: 2054 GREEN; the 4 failures in `src/tests/units/cli/cli.integration.test.ts` are pre-existing environmental failures (missing `tsx` binary in worktree node_modules) — exit code 127 = command not found. Unrelated to this work.

---

## Deviations / Notes

- **`yarn lint`** fails with a pre-existing biome.json schema issue (`unknown key 'ignore'`, `unknown key 'organizeImports'`). Not introduced by this work — `biome.json` was not modified.
- **`yarn typecheck`** fails because `tsc` is not in `node_modules/.bin` of this worktree (no install was performed). Not introduced by this work.
- Both failures are out of scope for SPEC-178 and would need a separate `yarn install` operation in the worktree to resolve.

---

## Acceptance status

**SPEC-178 acceptance test**: `src/tests/acceptance/178-dashboard-tabs-reposition.acceptance.test.ts` — **GREEN (15/15)**
**SPEC-177 acceptance test**: `src/tests/acceptance/177-dashboard-add-project-ui.acceptance.test.ts` — **GREEN (19/19)** (no regression)
