# Plan — SPEC-181 Dashboard Empty-State Restructure & Team-First Layout

PLAN:
  scope: Hide pending-reviews and active-reviews sections when empty, promote the team section to the first child of `<main class="dashboard-main">`, and migrate Claude Economics + Project Stats from `<main>` into two new sidebar-launched sheets (`#economics-sheet`, `#stats-sheet`) following the existing `#mr-sheet` / `#dev-sheet` pattern.
  is_new_module: false (pure dashboard layer evolution; no entity / use case / gateway / controller)

---

## Summary

| Layer | Count | Files |
|-------|-------|-------|
| Domain (entity / use case / gateway / controller) | 0 | n/a — purely UI-level visibility flags + DOM relocation |
| Pure helper (humble object) | 1 | `src/dashboard/modules/sectionVisibility.js` |
| Views / markup | 1 | `src/dashboard/index.html` |
| Styles | 1 | `src/dashboard/styles.css` |
| Unit tests | 2 | `src/tests/units/dashboard/modules/sectionVisibility.test.ts`, `src/tests/units/dashboard/dashboardLayout.test.ts` |
| Acceptance tests | 0 | per orchestrator instruction — dashboard SDD acceptance lives inside `src/tests/units/dashboard/`; the layout test plays the outer-loop role |

Total new/edited files: 3 production-touching + 2 test files = **5 files**.

---

## ENTITIES

n/a — no domain types introduced. The data shapes (`currentData.pendingReviews`, `currentData.activeReviews[].jobType`) already exist on the live `currentData` object inside `src/dashboard/index.html`.

## USECASES

n/a — visibility decision is pure presentation, lives in the humble helper.

## GATEWAYS

n/a — no new external I/O. Existing fetchers (`fetchTokenUsageSummary`, `fetchBudget`, `fetchProjectStats`, `recalculateStats`) are reused unchanged; only their **trigger points** move from accordion toggles to sheet open handlers.

## CONTROLLERS

n/a — dashboard is statically served HTML/JS; no Fastify route changes.

---

## PRESENTERS (humble pure helper)

### `sectionVisibility` — pure module

- **File**: `src/dashboard/modules/sectionVisibility.js`
- **Purpose**: Compute boolean hide/show flags for `#pending-reviews-section` and `#active-reviews-section` from the live `currentData` shape, with the followup-only exclusion rule for active reviews.
- **Public API** (JSDoc-typed, browser ES module — sibling style to `loading.js`):
  ```js
  /**
   * @param {{ pendingReviews?: Array<unknown> | null }} input
   * @returns {boolean}
   */
  export function shouldHidePendingReviewsSection(input) { ... }

  /**
   * @param {{ activeReviews?: Array<{ jobType?: string }> | null }} input
   * @returns {boolean}
   */
  export function shouldHideActiveReviewsSection(input) { ... }
  ```
- **Hide rules** (derived directly from spec `## Rules` and `## Scenarios`):
  - `shouldHidePendingReviewsSection({ pendingReviews })` → `true` when `pendingReviews` is `null`, `undefined`, or `Array#length === 0`; `false` otherwise.
  - `shouldHideActiveReviewsSection({ activeReviews })` → `true` when the input is nullish, empty, or contains **only** entries whose `jobType === 'followup'`; `false` when at least one non-followup entry is present.
- **Why a pure helper, not a presenter class**: anti-overengineering — two single-purpose boolean computations over a known data shape; zero DOM access; testable in isolation. Mirrors the `loading.js` / `cardCounters.js` precedent.

### Test file — visibility unit tests

- **File**: `src/tests/units/dashboard/modules/sectionVisibility.test.ts`
- **Scenarios** (mirrors spec scenarios on visibility + transitions):
  1. `shouldHidePendingReviewsSection` returns `true` for `{ pendingReviews: [] }` (spec scenario "pending empty hides panel").
  2. `shouldHidePendingReviewsSection` returns `true` for `{ pendingReviews: null }` (defensive — pre-fetch state).
  3. `shouldHidePendingReviewsSection` returns `true` for `{}` (no key — defensive).
  4. `shouldHidePendingReviewsSection` returns `false` for `{ pendingReviews: [{ id: 'p1' }] }` (spec scenario "pending non-empty shows panel").
  5. `shouldHideActiveReviewsSection` returns `true` for `{ activeReviews: [] }` (spec scenario "active reviews empty hides panel").
  6. `shouldHideActiveReviewsSection` returns `true` for `{ activeReviews: [{ id: 'r1', jobType: 'followup' }] }` (spec scenario "active reviews with only followups hides panel").
  7. `shouldHideActiveReviewsSection` returns `true` for an array of multiple followups (defensive — same rule, multiple items).
  8. `shouldHideActiveReviewsSection` returns `false` for `{ activeReviews: [{ id: 'r1', jobType: 'review', status: 'running' }] }` (spec scenario "active reviews non-empty shows panel").
  9. `shouldHideActiveReviewsSection` returns `false` for a mixed array `[{jobType:'followup'}, {jobType:'review'}]` (presence of one non-followup wins).
  10. `shouldHideActiveReviewsSection` returns `false` when `jobType` is missing on an entry (treated as non-followup — defensive against unknown future job types).
  11. `shouldHideActiveReviewsSection` returns `true` for `{ activeReviews: null }` / `{}` (defensive — pre-fetch state).

Transitions ("empty → non-empty" and "non-empty → empty" from spec) are covered implicitly: the function is pure, so reapplying it to the new state at each `updateUI()` tick toggles the class — the layout test (below) asserts the wiring is in place.

---

## VIEWS — DOM Surgery in `src/dashboard/index.html`

### Markup moves

**Before** (current, `src/dashboard/index.html:108-305`, `<main class="dashboard-main">` block):

1. `.focus-strip` (line 109)
2. `#overview-section` (line 134)
3. `#data-loading-state` (line 136)
4. `#config-info` (line 141)
5. `#claude-login-section` (line 143)
6. `#git-login-section` (line 150)
7. `#pending-reviews-section` (line 155) — **always visible**, contains `#pending-reviews-empty-state` heartbeat block
8. `#logs-section` (line 169)
9. `#stats-section` (line 179) — accordion via `toggleStats()`
10. `#team-section` (line 194) — accordion via `toggleTeamSection()`
11. `#claude-economics-section` (line 204) — accordion via `toggleSection('claude-economics-section')`
12. `#active-reviews-section` (line 238) — **always visible**, contains empty-state div `#i18n-empty-active-reviews`
13. `#active-followups-section` (line 248)
14. `#pending-fix-section` (line 259)
15. `#pending-approval-section` (line 272)
16. `#completed-reviews-section` (line 283)
17. `#cleanup-section` (line 293)
18. `.refresh-info` (line 300)

**After** (target order matches spec `### Initial render order in main`):

1. `#team-section` (moved up, stays `class="section hidden"`, default state preserved)
2. `.focus-strip`
3. `#overview-section`
4. `#data-loading-state`
5. `#config-info`
6. `#claude-login-section`
7. `#git-login-section`
8. `#pending-reviews-section` (hidden via `hidden` class when empty; `heartbeat-empty-state` div removed)
9. `#logs-section`
10. `#active-reviews-section` (hidden via `hidden` class when only followups or empty; inner `#i18n-empty-active-reviews` div removed)
11. `#active-followups-section`
12. `#pending-fix-section`
13. `#pending-approval-section`
14. `#completed-reviews-section`
15. `#cleanup-section`
16. `.refresh-info`

Removed from `<main>` entirely: `#stats-section` (line 179-192) and `#claude-economics-section` (line 204-236).

### New sidebar buttons (inside `<aside class="dashboard-sidebar">`, after `#open-settings-modal-btn` at line 99-101)

Two new buttons, same `.sidebar-settings-button` + `.sidebar-settings-button__prefix` pattern as `#open-settings-modal-btn` (verified at `index.html:99-101`):

```html
<button type="button" id="open-economics-sheet-btn" class="sidebar-settings-button" onclick="openEconomicsSheet()">
  <span class="sidebar-settings-button__prefix">// CLAUDE ECONOMICS</span>
</button>
<button type="button" id="open-stats-sheet-btn" class="sidebar-settings-button" onclick="openStatsSheet()" disabled aria-disabled="true">
  <span class="sidebar-settings-button__prefix">// PROJECT STATS</span>
</button>
```

- `#open-economics-sheet-btn` is always visible (no `hidden` attribute).
- `#open-stats-sheet-btn` starts `disabled` + `aria-disabled="true"`; the existing project-tab activation flow (around line 2378-2388) flips it to enabled by removing the `disabled` attribute when `currentProjectPath !== null`.

### New sheet containers (sibling to `#mr-sheet-overlay`/`#mr-sheet` block at `index.html:322-330`)

Verbatim re-use of the existing sheet pattern:

```html
<div id="economics-sheet-overlay" class="sheet-overlay" onclick="closeEconomicsSheet()"></div>
<div id="economics-sheet" class="sheet-panel">
  <div id="economics-sheet-content" class="sheet-content">
    <!-- Migrated #claude-economics-section innards: header + 2 economics-panel blocks + budget slider row -->
    <!-- Inner DOM ids preserved verbatim: token-usage-content, budget-tile, budget-slider, budget-slider-value, budget-slider-submit, budget-slider-status -->
  </div>
</div>

<div id="stats-sheet-overlay" class="sheet-overlay" onclick="closeStatsSheet()"></div>
<div id="stats-sheet" class="sheet-panel">
  <div id="stats-sheet-content" class="sheet-content">
    <!-- Migrated #stats-section innards: header + #recalculate-btn + #backfill-progress + #project-stats grid -->
    <!-- Inner DOM ids preserved verbatim: recalculate-btn, recalculate-label, backfill-progress, project-stats -->
  </div>
</div>
```

Critical constraint (spec `### Claude Economics becomes a sidebar button + sheet` and `### Project Stats becomes a sidebar button + sheet`): every inner id is preserved verbatim so existing functions (`fetchTokenUsageSummary`, `renderTokenUsageTile`, `fetchBudget`, `renderBudgetTile`, `fetchProjectStats`, `recalculateStats`) keep working without any signature change.

### Script wiring (inline `<script type="module">` in `index.html`)

#### New top-level functions

```js
function openEconomicsSheet() {
  document.getElementById('economics-sheet-overlay').classList.add('open');
  document.getElementById('economics-sheet').classList.add('open');
  document.body.style.overflow = 'hidden';
  // Idempotent fetch — same fetchers already used by the economics accordion
  fetchTokenUsageSummary(currentProjectPath).then(/* renderTokenUsageTile */);
  fetchBudget().then(/* renderBudgetTile */);
}
function closeEconomicsSheet() {
  document.getElementById('economics-sheet-overlay').classList.remove('open');
  document.getElementById('economics-sheet').classList.remove('open');
  document.body.style.overflow = '';
}
function openStatsSheet() {
  if (!currentProjectPath) return; // disabled state guard
  document.getElementById('stats-sheet-overlay').classList.add('open');
  document.getElementById('stats-sheet').classList.add('open');
  document.body.style.overflow = 'hidden';
  fetchProjectStats();
}
function closeStatsSheet() {
  document.getElementById('stats-sheet-overlay').classList.remove('open');
  document.getElementById('stats-sheet').classList.remove('open');
  document.body.style.overflow = '';
}
// Expose to onclick handlers — same pattern as window.toggleStats (line 3268), window.toggleSection (line 3283)
window.openEconomicsSheet = openEconomicsSheet;
window.closeEconomicsSheet = closeEconomicsSheet;
window.openStatsSheet = openStatsSheet;
window.closeStatsSheet = closeStatsSheet;
```

#### Import the new helper

Add to the existing module import block (the dashboard uses relative paths inside the inline `<script type="module">` — verified at `index.html:341-404`, e.g. `import { getLoadingPresentation } from './modules/loading.js'`):

```js
import { shouldHidePendingReviewsSection, shouldHideActiveReviewsSection } from './modules/sectionVisibility.js';
```

#### Hide/show wiring inside `updateUI()` and friends

- In the active-reviews block at `index.html:852-865`: replace the unconditional `activeReviewsSection.classList.remove('hidden')` with:
  ```js
  if (shouldHideActiveReviewsSection({ activeReviews: reviews })) {
    activeReviewsSection.classList.add('hidden');
  } else {
    activeReviewsSection.classList.remove('hidden');
    // ... existing inner render
  }
  ```
  Note: the local `reviews` variable in this scope is already the non-followup filtered list (line 871 handles followups separately), so the followup-only branch of `shouldHideActiveReviewsSection` is exercised by passing the **unfiltered** `currentData.activeReviews` — the implementer chooses which input to pass; the helper accepts both because the rule "only followups" returns the same result whether you pre-filter or not. **Decision in the plan**: pass `currentData.activeReviews` (unfiltered) so the followup-only rule lives inside the pure helper, not duplicated at the call site.
- In `updatePendingReviewsUI()` at `index.html:1905-1920`: add at the start:
  ```js
  if (shouldHidePendingReviewsSection({ pendingReviews: currentData.pendingReviews })) {
    section.classList.add('hidden');
    return; // skip inner render — nothing to show
  }
  section.classList.remove('hidden');
  // ... existing model + innerHTML render
  ```

#### Dead-code removal (spec `### Sheet wiring` and "dead code removed" scenario)

- `index.html:425` — remove `'claude-economics-section'` from the `secondarySections` array (the only entry whose section will no longer exist).
- `index.html:488` (`toggleSection`) — no signature change; spec scenario "toggleSection no longer accepts 'claude-economics-section'" is satisfied automatically because the key is no longer registered in `sectionExpandedState` (which derives from `secondarySections`).
- `index.html:1322` (`toggleStats`) — function and its `window.toggleStats = toggleStats` export at line 3268 are removed entirely (no DOM consumer left).
- `index.html:2387` — drop `document.getElementById('stats-section').classList.remove('hidden')`; keep the `team-section` reveal at line 2388.
- Inside the project-tab activation flow (around `index.html:2378-2388`): add `document.getElementById('open-stats-sheet-btn').removeAttribute('disabled')` and `setAttribute('aria-disabled','false')` so the stats sidebar button enables when a project becomes active.
- Inside the overview-tab activation flow (search for `activeTabId === 'overview'` site, mirror precedent in `docs/plans/178-dashboard-tabs-reposition.plan.md`): re-disable the stats button (`setAttribute('disabled','')` + `aria-disabled="true"`) and, if open, call `closeStatsSheet()` is NOT required (spec "closing the sheet on project tab change" is OUT OF SCOPE).
- `index.html:161-165` — remove the `<div class="heartbeat-empty-state" id="pending-reviews-empty-state">…</div>` block (no longer consumed once parent is hidden when empty — spec rule).
- `index.html:244` — remove `<div class="empty-state" id="i18n-empty-active-reviews"></div>` block (same reason).

#### Counters and i18n

- The translation keys `empty.pendingReviews`, `empty.activeReviews` remain referenced inside the inner rendering branches (e.g. line 859) — kept; only the DOM placeholders are removed. No i18n key deletions needed.
- Focus-strip counters (`focus-now-count`, `focus-next-count`, `focus-blocked-count` at lines 841-843) are unaffected — spec scenario "no regression on focus-strip counters" is preserved.

---

## VIEWS — DOM Integration Test

### Test file — DOM layout test (plays the SDD outer-loop role)

- **File**: `src/tests/units/dashboard/dashboardLayout.test.ts`
- **Approach**: jsdom-based parse of `src/dashboard/index.html` via `fs.readFileSync` + `new JSDOM(html)`. No script execution required — assertions are structural. Mirrors the existing dashboard-module test style (`src/tests/units/dashboard/modules/cardCounters.test.ts`, `pendingReviews.test.ts`).
- **Scenarios** (one bullet per spec scenario in the "DOM order / sidebar / dead-code" cluster):
  1. `team first child of main`: `document.querySelector('main.dashboard-main').firstElementChild.id === 'team-section'` (spec scenario "team first child of main").
  2. `focus-strip is second child of main`: `document.querySelector('main.dashboard-main').children[1].classList.contains('focus-strip') === true` (spec scenario "focus-strip is second child of main").
  3. `#claude-economics-section` is NOT a descendant of `<main class="dashboard-main">` — `document.querySelector('main.dashboard-main #claude-economics-section') === null` (spec scenario "claude-economics absent from main").
  4. `#stats-section` is NOT a descendant of `<main class="dashboard-main">` — `document.querySelector('main.dashboard-main #stats-section') === null` (spec scenario "stats absent from main").
  5. `#open-economics-sheet-btn` exists, is a descendant of `<aside class="dashboard-sidebar">`, and has no `hidden` attribute (spec scenario "economics button visible").
  6. `#open-stats-sheet-btn` exists, is a descendant of `<aside class="dashboard-sidebar">` (spec scenario "stats button visible").
  7. `#open-stats-sheet-btn` has the `disabled` attribute set in the static HTML (initial state — spec scenario "stats button disabled without project").
  8. `#economics-sheet-overlay`, `#economics-sheet`, `#economics-sheet-content` exist and `#economics-sheet-content` contains `#token-usage-content` and `#budget-tile` (spec scenario "economics sheet content rendered").
  9. `#stats-sheet-overlay`, `#stats-sheet`, `#stats-sheet-content` exist and `#stats-sheet-content` contains `#project-stats` and `#recalculate-btn` (spec scenario "stats sheet content rendered").
  10. `#economics-sheet-overlay[onclick]` references `closeEconomicsSheet`; `#open-economics-sheet-btn[onclick]` references `openEconomicsSheet` (spec scenarios "open economics sheet" + "close economics sheet via overlay click").
  11. `#stats-sheet-overlay[onclick]` references `closeStatsSheet`; `#open-stats-sheet-btn[onclick]` references `openStatsSheet` (spec scenarios "open stats sheet" + "close stats sheet via close button" — close affordance check below).
  12. Each new sheet contains a `<button class="sheet-close">` (spec scenarios "close economics sheet via close button" + "close stats sheet via close button" — relies on the existing close-button CSS class shared with mr-sheet / dev-sheet).
  13. `#pending-reviews-section` exists in `<main>` but `#pending-reviews-empty-state` is absent (dead-state markup removed — spec rule).
  14. `#active-reviews-section` exists in `<main>` but the inner `#i18n-empty-active-reviews` placeholder div is absent (dead-state markup removed — spec rule).
  15. Inline `<script type="module">` content contains the literal `from './modules/sectionVisibility.js'` (helper imported — wiring check).
  16. Inline `<script type="module">` content contains `shouldHidePendingReviewsSection(` and `shouldHideActiveReviewsSection(` (helper actually invoked).
  17. Inline `<script type="module">` content does **not** contain `'claude-economics-section'` outside the new sheet ids `#economics-sheet*` (spec scenario "dead code removed: grep for 'claude-economics-section' returns 0 matches outside the sheet IDs").
  18. Inline `<script type="module">` content does **not** declare or export `toggleStats` (spec scenario "toggleStats removed").
  19. `secondarySections` array literal inside the script does not contain the string `'claude-economics-section'` (spec scenario "secondarySections drops claude-economics").
  20. `<main class="dashboard-main">` child order matches the target list in spec `### Initial render order in main` — assert by collecting `main.children` ids in order and comparing against the expected array `['team-section', /* focus-strip via className */, 'overview-section', 'data-loading-state', 'config-info', 'claude-login-section', 'git-login-section', 'pending-reviews-section', 'logs-section', 'active-reviews-section', 'active-followups-section', 'pending-fix-section', 'pending-approval-section', 'completed-reviews-section', 'cleanup-section']` (with `.focus-strip` and `.refresh-info` matched by className).

Spec scenarios that require JS execution (`open economics sheet → adds .open class`, `body overflow === 'hidden'`, `fetchBudget called once`, `stats button enabled when project active`, `transition empty → non-empty`) are **covered by inspection of the onclick/handler wiring (assertions 10-11) plus the unit helper tests** — full DOM-event integration would require booting the live dashboard, which is outside the dashboard test convention (none of the existing `src/tests/units/dashboard/modules/*.test.ts` files execute the inline `<script type="module">` block). This is consistent with the precedent and the orchestrator's instruction to keep all tests under `src/tests/units/dashboard/`.

---

## CSS — `src/dashboard/styles.css`

### Existing styles reused (no new rules required for sheets)

The sheet pattern (`.sheet-overlay`, `.sheet-panel`, `.sheet-content`, `.sheet-close`, `.open` toggles) is already styled and used by `#mr-sheet` / `#dev-sheet` (verified at `index.html:322-330`). The new `#economics-sheet` and `#stats-sheet` inherit it verbatim — **no new sheet CSS needed**.

### Potential minor additions (only if the layout test or smoke pass reveals a gap)

- If the two new `.sidebar-settings-button` instances need vertical spacing distinct from `#open-settings-modal-btn`, add a `gap` or `margin-top` on a `.sidebar-settings-button + .sidebar-settings-button` selector. Defer the decision to step 4 of the implementation order (only add if visually broken).
- `disabled` state on `#open-stats-sheet-btn`: rely on the browser's default `:disabled` styling unless the dashboard's monospace dark theme overrides it. If override needed, add `.sidebar-settings-button:disabled { opacity: 0.5; cursor: not-allowed; }`.

No CSS deletions. No layout grid changes — `.dashboard-main` is a flex column; child reordering in the DOM is sufficient.

---

## WIRING

- `src/main/routes.ts`: **no change** — dashboard is statically served (verified — dashboard HTML/JS lives in `src/dashboard/` and is served as static assets, no Fastify route generates the HTML).
- No new gateway, no new use case, no new controller, no new dependency to inject.
- No new env var, no new config key.

---

## IMPLEMENTATION_ORDER (TDD inside-out)

1. **`src/tests/units/dashboard/modules/sectionVisibility.test.ts`** (RED) — write the 11 unit scenarios above against the not-yet-existing helper. Walking-skeleton's first slice: pure rule first.
2. **`src/dashboard/modules/sectionVisibility.js`** (GREEN) — implement the two boolean functions to turn step 1 GREEN. Pure ES module, JSDoc-typed, zero DOM access, sibling style to `loading.js`.
3. **`src/tests/units/dashboard/dashboardLayout.test.ts`** (RED) — write the 20 structural assertions against `index.html`. They will all fail because the DOM has not been restructured yet.
4. **`src/dashboard/index.html`** — DOM surgery in one commit:
   - Reorder `<main class="dashboard-main">` children (team-section first, remove stats-section and claude-economics-section).
   - Strip the two inner empty-state markup blocks (`#pending-reviews-empty-state`, `#i18n-empty-active-reviews`).
   - Add the two new sidebar buttons (`#open-economics-sheet-btn`, `#open-stats-sheet-btn`).
   - Add the two new sheet container blocks (`#economics-sheet-overlay`/`#economics-sheet`/`#economics-sheet-content`, plus the stats triplet) with their migrated inner DOM (ids preserved verbatim).
   - Import `shouldHide*` from `./modules/sectionVisibility.js`.
   - Wire `updateUI()` active-reviews branch and `updatePendingReviewsUI()` to use the helper for hide/show.
   - Add `openEconomicsSheet` / `closeEconomicsSheet` / `openStatsSheet` / `closeStatsSheet` + `window.*` exposures.
   - Remove `toggleStats` (function + `window.toggleStats`), the `'claude-economics-section'` entry from `secondarySections`, and the `stats-section` reveal at line 2387.
   - Toggle `disabled` on `#open-stats-sheet-btn` in project-tab activation flow.

   After this commit, step 3 (dashboardLayout.test.ts) flips to GREEN.
5. **`src/dashboard/styles.css`** — only edits surfaced during step 4 (sidebar-button spacing or `:disabled` styling). Likely zero edits.
6. **Run full suite** — `yarn test:ci` to confirm: (a) `sectionVisibility.test.ts` GREEN, (b) `dashboardLayout.test.ts` GREEN, (c) `src/tests/acceptance/178-dashboard-tabs-reposition.acceptance.test.ts` still GREEN (no regression on tabs reposition), (d) `src/tests/acceptance/177-dashboard-add-project-ui.acceptance.test.ts` still GREEN (sidebar manage panel unchanged), (e) `src/tests/units/dashboard/modules/pendingReviews.test.ts` still GREEN (helper module unchanged).
7. **Manual smoke** — `yarn dev`, open the dashboard, verify: (a) team section sits first under header; (b) empty pending and active sections are invisible; (c) sidebar shows both new buttons; (d) clicking Claude Economics button opens a sheet with token usage + budget; (e) stats button disabled on overview, enabled on a project tab; (f) overlay click and close button dismiss each sheet; (g) `yarn verify` passes.

---

## ACCEPTANCE_TEST

- **File**: `src/tests/units/dashboard/dashboardLayout.test.ts`
- **Note**: SDD outer loop — this DOM-level test plays the role of the acceptance test for SPEC-181. It is written first at step 3, stays RED throughout the DOM restructure at step 4, and turns GREEN once `index.html` matches the spec. Per the orchestrator's instruction and the existing dashboard test convention (`src/tests/units/dashboard/modules/*.test.ts`), the acceptance for UI-only dashboard work lives inside `src/tests/units/dashboard/` — no separate file under `src/tests/acceptance/` is created for this spec.

---

## SPEC-178 / SPEC-179 / SPEC-177 REGRESSION CHECK

| Existing test | Status post-SPEC-181 | Notes |
|---|---|---|
| `src/tests/acceptance/178-dashboard-tabs-reposition.acceptance.test.ts` | UNCHANGED | Asserts `project-bar`, `dashboard-tabs`, `cards-scope-marker` markup. SPEC-181 does not touch any of those nodes. |
| `src/tests/acceptance/179-dashboard-project-settings-modal.acceptance.test.ts` | UNCHANGED | Asserts `#open-settings-modal-btn` and `#settings-modal`. SPEC-181 preserves both and only adds **siblings** to the settings button. |
| `src/tests/acceptance/177-dashboard-add-project-ui.acceptance.test.ts` | UNCHANGED | Asserts `#manage-projects-toggle`, `#manage-panel`, no legacy ids. SPEC-181 leaves all of these intact. |
| `src/tests/units/dashboard/modules/cardCounters.test.ts` | UNCHANGED | Helper internal logic unchanged. |
| `src/tests/units/dashboard/modules/pendingReviews.test.ts` | UNCHANGED | Helper module unchanged; only its call-site (in `updatePendingReviewsUI`) is wrapped with the visibility check. |

**Verdict**: 0 existing assertions require adjustment.

---

## RISKS / OPEN QUESTIONS

1. **Sheet inner ids reuse** — the migrated inner DOM (`#token-usage-content`, `#budget-tile`, `#project-stats`, `#recalculate-btn`, `#backfill-progress`) must keep its exact ids so `fetchTokenUsageSummary`, `renderTokenUsageTile`, `fetchBudget`, `renderBudgetTile`, `fetchProjectStats`, `recalculateStats` remain unmodified. Mitigation: copy the markup verbatim from lines 179-192 and 204-236; do not rename.
2. **`#open-stats-sheet-btn` enable trigger** — the existing project-load flow at `index.html:2378-2388` is where the team-section reveal already lives. The plan piggybacks on that block to flip the stats button enabled. If the user lands on the overview tab first then switches to a project, the button must transition to enabled; verify this happens via `loadProjectConfigFromPath` which is the path the project tab activation already uses.
3. **`#open-stats-sheet-btn` re-disable on overview switch** — spec scenario "stats button disabled without project" implies the inverse transition (project → overview re-disables). Plan adds the `disabled` re-set inside the overview-tab activation flow; precise call site to confirm during implementation (search for the activeTabId === 'overview' branch).
4. **No JS-execution integration test** — spec scenarios "open economics sheet → `.open` class added", "body overflow === 'hidden'", "fetchBudget called once" cannot be asserted by the chosen jsdom-parse approach. They are reduced to **wiring assertions** (onclick attribute references the right function name). Full integration would need a Playwright-style harness which does not exist in this repo's dashboard test surface. Flag for PM: this is consistent with the rest of `src/tests/units/dashboard/` and matches the orchestrator's instructions; the manual smoke at step 7 covers the live behaviour.
5. **`document.body.style.overflow` restoration** — closing one sheet while another is open would set `overflow` back to `''`. Acceptable in practice because the sheets are mutually-exclusive sidebar actions; spec does not require a stacking counter.

---

## REFERENCE_FILES

- `docs/specs/181-dashboard-empty-state-restructure.md` — source of truth (rules + 28 scenarios).
- `docs/plans/178-dashboard-tabs-reposition.plan.md` — precedent UI-only plan structure and section layout.
- `docs/plans/179-dashboard-project-settings-modal.plan.md` (if present) — precedent for sidebar-button + modal/sheet pattern.
- `src/dashboard/index.html:99-101` — `.sidebar-settings-button` pattern for the two new buttons.
- `src/dashboard/index.html:108-305` — full `<main class="dashboard-main">` block to reorder.
- `src/dashboard/index.html:155-167` — `#pending-reviews-section` markup (inner empty-state to strip).
- `src/dashboard/index.html:179-192` — `#stats-section` markup to migrate verbatim into `#stats-sheet-content`.
- `src/dashboard/index.html:194-202` — `#team-section` markup (no edits beyond DOM position).
- `src/dashboard/index.html:204-236` — `#claude-economics-section` markup to migrate verbatim into `#economics-sheet-content`.
- `src/dashboard/index.html:238-246` — `#active-reviews-section` markup (inner empty-state to strip).
- `src/dashboard/index.html:322-330` — existing `#mr-sheet` / `#dev-sheet` sheet pattern reference.
- `src/dashboard/index.html:425-426` — `secondarySections` array + `sectionExpandedState` derivation.
- `src/dashboard/index.html:852-865` — `updateUI()` active-reviews branch (visibility wiring site).
- `src/dashboard/index.html:1905-1920` — `updatePendingReviewsUI()` (visibility wiring site).
- `src/dashboard/index.html:1322` + `:3268` — `toggleStats` function + `window.toggleStats` exposure to delete.
- `src/dashboard/index.html:2378-2388` — project-tab activation flow (stats-button enable point + team-section reveal kept).
- `src/dashboard/modules/loading.js` — humble-helper precedent (pure module, JSDoc, no DOM).
- `src/tests/units/dashboard/modules/cardCounters.test.ts` — pure-helper unit-test style precedent.
- `src/tests/units/dashboard/modules/pendingReviews.test.ts` — second style precedent.
- `src/tests/acceptance/178-dashboard-tabs-reposition.acceptance.test.ts` — DOM-grep precedent (will be reproduced as in-units jsdom assertions for SPEC-181).
