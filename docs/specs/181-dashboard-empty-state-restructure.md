# Spec #181 — Dashboard Empty-State Restructure & Team-First Layout

**Labels**: enhancement, P2-important, dashboard, ux
**Date**: 2026-05-27
**Status**: implemented

---

## Status: implemented

Shipped 2026-05-27. See `docs/reports/181-dashboard-empty-state-restructure.report.md` (34/34 spec-scoped tests GREEN, +34 tests total, full suite 2341/2341, no regression on SPEC-177 / SPEC-178 / SPEC-179).

## Implementation

### Artefacts

- **Dashboard humble helper (new)**: `src/dashboard/modules/sectionVisibility.js` — pure functions `shouldHidePendingReviewsSection({ pendingReviews })` and `shouldHideActiveReviewsSection({ activeReviews })` returning a hide-boolean. JSDoc-typed, zero DOM access, zero side effects. Sibling style to `loading.js` and `cardCounters.js`.
- **Dashboard view delta**: `src/dashboard/index.html` — `#team-section` moved to first child of `<main class="dashboard-main">`; `#stats-section` and `#claude-economics-section` removed from `<main>`; two new `.sidebar-settings-button` instances added after `#open-settings-modal-btn` (`#open-economics-sheet-btn` always visible, `#open-stats-sheet-btn` initially `disabled`); two new sheet panels (`#economics-sheet-overlay` + `#economics-sheet` + `#economics-sheet-content`, `#stats-sheet-overlay` + `#stats-sheet` + `#stats-sheet-content`) reusing the `mr-sheet` / `dev-sheet` overlay-and-panel pattern verbatim, with the inner ids preserved so `fetchTokenUsageSummary`, `renderTokenUsageTile`, `fetchBudget`, `renderBudgetTile`, `fetchProjectStats`, `recalculateStats` keep working unchanged; `heartbeat-empty-state` and `i18n-empty-active-reviews` placeholder divs removed; `updateUI()` active-reviews branch wraps the reveal with `shouldHideActiveReviewsSection`; `updatePendingReviewsUI()` early-returns and toggles `hidden` based on `shouldHidePendingReviewsSection`; `toggleStats` and `window.toggleStats` removed; `'claude-economics-section'` dropped from the `secondarySections` array; `#stats-section.classList.remove('hidden')` call deleted; new `openEconomicsSheet` / `closeEconomicsSheet` / `openStatsSheet` / `closeStatsSheet` functions exposed on `window` for inline `onclick` handlers.
- **CSS**: no edits required — the existing `.sheet-overlay` / `.sheet-panel` / `.sheet-content` / `.sheet-close` rules cover the two new sheets, and `.sidebar-settings-button` accommodates three stacked buttons without adjustment.

### Architectural decisions taken

- **Pass `currentData.activeReviews` (unfiltered) to the helper**: the followup-only rule lives inside `shouldHideActiveReviewsSection` instead of being duplicated at the call site. Keeps both the spec scenario and the call site terse.
- **Pure helper over presenter class**: two single-purpose boolean computations over a known data shape — wrapping them in a class would be premature. Same precedent as `loading.js` / `cardCounters.js` / SPEC-178.
- **Re-use mr-sheet / dev-sheet pattern verbatim for the two new sheets**: no new CSS surface, no new animation primitive — `.sheet-overlay.open` + `.sheet-panel.open` + `body.style.overflow = 'hidden'` is sufficient.
- **Inner DOM ids preserved verbatim across the section-to-sheet migration**: zero change to the six existing fetcher / renderer functions.
- **Layout test (`dashboardLayout.test.ts`) plays the outer-loop SDD role inside `src/tests/units/dashboard/`**: no separate file under `src/tests/acceptance/` was introduced. Matches the existing dashboard test convention.
- **Sheet structural assertions use a balanced `<div>` extractor**: a naive non-greedy regex stops at the first nested `</div>`, so a small balanced-tag walker (~20 LOC) is colocated in the test file. Avoids pulling in `jsdom` for a pure structural check.
- **No JS-execution integration test**: spec scenarios requiring fired `onclick` events are reduced to wiring assertions (onclick attributes reference the right function names). Consistent with the rest of `src/tests/units/dashboard/`.

---

## Context

After SPEC-178 (project tabs above cards) and SPEC-179 (settings modal), the dashboard `<main>` still surfaces every section unconditionally. Two recurring issues:

1. **Noise from empty panels**: `pending-reviews-section` and `active-reviews-section` always render, even when they hold zero items. The heartbeat-pulse standby state and the "No active reviews" empty state add vertical clutter on idle dashboards.
2. **Wrong priority**: `team-section` (developer leaderboard / team insights) sits buried beneath `pending-reviews` and `stats`, while `claude-economics-section` and `stats-section` are always-expanded accordions that dominate the page even when nobody is consulting them.

This spec hides the two review panels when empty, promotes the Team section to the top of `<main>`, and converts Claude Economics and Project Stats into sidebar-launched sheets — same pattern as existing `mr-sheet` and `dev-sheet`.

The Claude Economics and Stats SECTIONS are removed from `<main>` entirely; their content moves into two new sheet panels rendered on demand.

---

## Rules

### Empty-state hiding

- When `currentData.pendingReviews.length === 0`, `#pending-reviews-section` is hidden via the `hidden` class (no DOM removal, no inner empty-state shown)
- When `currentData.pendingReviews.length > 0`, `#pending-reviews-section` is visible and renders the list as before
- When the list of non-followup active reviews (`activeReviews.filter(r => r.jobType !== 'followup')`) is empty, `#active-reviews-section` is hidden via the `hidden` class
- When that list has at least one entry, `#active-reviews-section` is visible and renders the items
- Followups, pending-fix, pending-approval, completed-reviews sections keep their existing hide/show behaviour (out of scope)
- The existing `heartbeat-empty-state` markup inside `#pending-reviews` is removed (no consumer once the parent is hidden)
- The existing `<div class="empty-state" id="i18n-empty-active-reviews">` markup inside `#active-reviews` is removed for the same reason

### Team section promoted to top

- `#team-section` is moved within `<main class="dashboard-main">` so it renders immediately after `<header>` and before `<div class="focus-strip">` — i.e. as the first child of `<main>`
- The existing toggle header (`toggleTeamSection()` + `<span id="team-toggle">`) is preserved; default collapsed state and persistence behaviour unchanged
- When no team data is available, the section retains its current `hidden` initial state and is revealed by `fetchAndRenderTeamTab` exactly as today (no new visibility logic for team)

### Claude Economics becomes a sidebar button + sheet

- `#claude-economics-section` is **removed** from `<main>`
- A new `<button id="open-economics-sheet-btn">` is added inside `<aside class="dashboard-sidebar">`, immediately after `#open-settings-modal-btn`, using the same `.sidebar-settings-button` styling pattern (label `// CLAUDE ECONOMICS`)
- The button is always visible (no `hidden` attribute)
- Clicking the button opens a new sheet `#economics-sheet` (overlay + panel + content) rendered with the same `.sheet-overlay` / `.sheet-panel` / `.sheet-content` classes as `#mr-sheet` and `#dev-sheet`
- The sheet content reproduces the two existing `economics-panel` blocks (Token Usage + Monthly Budget) verbatim, keeping the same DOM ids (`token-usage-content`, `budget-tile`, `budget-slider`, etc.) so that existing fetch / render functions (`fetchTokenUsageSummary`, `renderTokenUsageTile`, `fetchBudget`, `renderBudgetTile`) work without modification
- A `<button class="sheet-close">` closes the sheet (same affordance as MR sheet)
- Clicking the overlay closes the sheet (`closeEconomicsSheet()`)
- The sheet content is populated on open (idempotent — re-open re-fetches budget + token usage)

### Project Stats becomes a sidebar button + sheet

- `#stats-section` is **removed** from `<main>`
- A new `<button id="open-stats-sheet-btn">` is added inside `<aside class="dashboard-sidebar">`, immediately after `#open-economics-sheet-btn`, same styling (label `// PROJECT STATS`)
- The button is disabled (`disabled` attribute + `aria-disabled="true"`) when `currentProjectPath` is null (no active project) — clicking does nothing in that state
- The button is enabled as soon as a project tab is active
- Clicking the button opens a new sheet `#stats-sheet` (same overlay/panel/content pattern)
- The sheet content reproduces the stats DOM: header with `<i data-lucide="bar-chart-3">`, the `<button id="recalculate-btn">`, `<span id="backfill-progress">`, and the `<div id="project-stats" class="stats-grid">` container so that `fetchProjectStats` / `recalculateStats` work unchanged
- The sheet always shows the stats grid expanded (no internal collapse — the sheet itself IS the open/close affordance)
- A `<button class="sheet-close">` closes the sheet (`closeStatsSheet()`)
- Opening the sheet triggers `fetchProjectStats()` so data is fresh (idempotent re-open)
- When the active project changes while the sheet is open, the displayed data refreshes via the existing fetch on next open (no real-time switch — sheet is dismissed on tab change is OUT OF SCOPE)

### Sheet wiring

- Both new sheets follow the existing pattern: `document.body.style.overflow = 'hidden'` on open, restored on close
- Both sheets are added to the existing close-on-Escape handler if one exists; otherwise the existing per-sheet click handlers suffice
- The functions `toggleSection('claude-economics-section')`, `toggleStats()`, and references to `#claude-economics-section` / `#stats-section` inside JS are removed (no dead code allowed — `clean-code` rule)
- `secondarySections` array drops `'claude-economics-section'` (since the section no longer exists)
- Calls to `document.getElementById('stats-section').classList.remove('hidden')` (and the team-section equivalent) inside `updateUI`/post-project-load are updated: stats-section reference is removed; team-section reveal stays

### Initial render order in main

Final DOM order within `<main class="dashboard-main">`:

1. `#team-section` (new top position, hidden until data loaded)
2. `.focus-strip`
3. `#overview-section`
4. `#data-loading-state`
5. `#config-info`
6. `#claude-login-section`
7. `#git-login-section`
8. `#pending-reviews-section` (hidden when empty)
9. `#logs-section` (unchanged)
10. `#active-reviews-section` (hidden when empty)
11. `#active-followups-section` (unchanged)
12. `#pending-fix-section` (unchanged)
13. `#pending-approval-section` (unchanged)
14. `#completed-reviews-section` (unchanged)
15. `#cleanup-section` (unchanged)
16. `.refresh-info` (unchanged)

---

## Scenarios

- pending empty hides panel: {pendingReviews: []} → `#pending-reviews-section.classList.contains('hidden')` === true
- pending non-empty shows panel: {pendingReviews: [{id:'p1',...}]} → `#pending-reviews-section.classList.contains('hidden')` === false; one `.pending-review-card` rendered
- active reviews empty hides panel: {activeReviews: []} → `#active-reviews-section.classList.contains('hidden')` === true
- active reviews with only followups hides panel: {activeReviews: [{id:'r1', jobType:'followup'}]} → `#active-reviews-section.classList.contains('hidden')` === true (followups go to their own section)
- active reviews non-empty shows panel: {activeReviews: [{id:'r1', jobType:'review', status:'running'}]} → `#active-reviews-section.classList.contains('hidden')` === false; one `.review-item` rendered; `#active-reviews-count.textContent` === '1'
- transition empty → non-empty: dashboard updates from `{activeReviews:[]}` to `{activeReviews:[{id:'r1'}]}` → section toggles from hidden to visible without page reload
- transition non-empty → empty: dashboard updates from `{activeReviews:[{id:'r1'}]}` to `{activeReviews:[]}` → section toggles to hidden
- team first child of main: `document.querySelector('main.dashboard-main').firstElementChild.id` === 'team-section'
- focus-strip is second child of main: `document.querySelector('main.dashboard-main').children[1].classList.contains('focus-strip')` === true
- claude-economics absent from main: `document.querySelector('main.dashboard-main #claude-economics-section')` === null
- stats absent from main: `document.querySelector('main.dashboard-main #stats-section')` === null
- economics button visible: `document.getElementById('open-economics-sheet-btn')` exists, not hidden, inside `.dashboard-sidebar`
- stats button visible: `document.getElementById('open-stats-sheet-btn')` exists, inside `.dashboard-sidebar`
- stats button disabled without project: {currentProjectPath: null} → button has `disabled` attribute set; click does not open sheet
- stats button enabled with project: {currentProjectPath: '/repo/A'} → button has no `disabled` attribute
- open economics sheet: click `#open-economics-sheet-btn` → `#economics-sheet.classList.contains('open')` === true; `#economics-sheet-overlay.classList.contains('open')` === true; `document.body.style.overflow` === 'hidden'
- economics sheet content rendered: after open → `#token-usage-content` and `#budget-tile` exist inside `#economics-sheet-content`
- economics sheet calls fetchers: open triggers `fetchTokenUsageSummary` and `fetchBudget` (mock asserts call count === 1 each)
- close economics sheet via close button: click `.sheet-close` inside `#economics-sheet` → sheet `.open` class removed, body overflow restored
- close economics sheet via overlay click: click `#economics-sheet-overlay` → sheet closes
- open stats sheet: click `#open-stats-sheet-btn` with `currentProjectPath='/repo/A'` → `#stats-sheet.classList.contains('open')` === true
- stats sheet content rendered: after open → `#project-stats` exists inside `#stats-sheet-content`; `fetchProjectStats` called once
- stats sheet does nothing without project: click `#open-stats-sheet-btn` with `currentProjectPath=null` → sheet remains closed
- close stats sheet via close button: click `.sheet-close` inside `#stats-sheet` → sheet closes
- toggleSection no longer accepts 'claude-economics-section': calling `toggleSection('claude-economics-section')` is a no-op (key absent from `sectionExpandedState`)
- dead code removed: grep for `'claude-economics-section'` and `'stats-section'` in `index.html` returns 0 matches outside the sheet IDs (`economics-sheet`, `stats-sheet`)
- secondarySections drops claude-economics: `secondarySections.includes('claude-economics-section')` === false
- no regression on team toggle: clicking `#team-section .section-header.clickable` still expands / collapses `#team-tab-content`
- no regression on focus-strip counters: `nowCount`, `nextCount`, `blockedCount` continue to update from `updateUI()`
- no regression on mr-sheet: opening an MR sheet from a review item still works after the sheet wiring extension

---

## Out of Scope

- Persisting which sheet was last opened across reloads
- Animating the sheets differently from the existing mr-sheet slide-in
- Adding new metrics to Claude Economics or Stats (content moves verbatim)
- Closing the sheet automatically on project tab change
- Closing the sheet automatically on Escape key (left to existing global handler if any)
- Mobile-specific sheet behaviour (current sheet CSS already responsive)
- Hiding followups / pending-fix / pending-approval / completed sections when empty (separate spec if needed)
- Re-ordering the remaining sections beyond the team-promotion move
- Adding desktop notifications when pending reviews appear

---

## Glossary

| Term | Definition |
|------|------------|
| Sheet | Slide-in right panel using `.sheet-overlay` + `.sheet-panel` + `.sheet-content` (existing pattern from `#mr-sheet` and `#dev-sheet`) |
| Sidebar button | `.sidebar-settings-button` styling pattern — `// LABEL` prefix, monospace, full-width sidebar block |
| Empty | For `pending-reviews-section`: `currentData.pendingReviews.length === 0`. For `active-reviews-section`: no non-followup entries in `currentData.activeReviews` |
| First child | DOM order via `firstElementChild` on `<main class="dashboard-main">` |

---

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Builds on SPEC-178 (sidebar settings button pattern). No backend touch. |
| Negotiable | OK | Sidebar button label wording and sheet header copy are open |
| Valuable | OK | Removes idle-state noise; promotes most-used team view; reduces vertical scroll |
| Estimable | OK | DOM relocation + 2 new sheet wirings + visibility flags |
| Small | OK | ~3 production files modified (index.html, styles.css, 1 helper) + tests, ~0.5j IA |
| Testable | OK | 28 scenarios cover visibility, DOM order, sheet wiring, dead-code removal |

**Verdict**: READY

---

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 3 | Every dashboard user, every session |
| Impact | 2 | Real UX improvement on idle screens and team-first workflow |
| Confidence | 90% | Sheet pattern is established; visibility flags are routine |
| Effort | 1 pt | ~0.5j IA |
| **Score** | **5.4** | |

**Priority**: P2-important
