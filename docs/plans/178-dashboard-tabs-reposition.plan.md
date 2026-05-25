# Plan — SPEC-178 Reposition Project Tabs Above Cards + Project-Contextual Cards

PLAN:
  scope: Move dashboard project tabs from sidebar to a horizontal bar above the cards, add a scope marker, and wire Running/Queued/Completed counters to filter by the active project tab.
  is_new_module: false (pure presentation layer evolution; no entity/use case/gateway changes)

---

## Summary

| Layer | Count | Files |
|-------|-------|-------|
| Domain (entity / use case / gateway) | 0 | n/a — data already available on `currentData.activeReviews[]` and `currentData.reviewFiles[]` |
| Pure helper (humble object) | 1 | `src/dashboard/modules/cardCounters.js` |
| Views / markup | 1 | `src/dashboard/index.html` |
| Styles | 1 | `src/dashboard/styles.css` |
| Unit tests | 1 | `src/tests/units/dashboard/modules/cardCounters.test.ts` |
| Acceptance tests | 1 | `src/tests/acceptance/178-dashboard-tabs-reposition.acceptance.test.ts` |
| Adjustments (SPEC-177 regression-keep) | 0 (verified) | see SPEC-177 REGRESSION TABLE — no edits needed |

Total new/edited files: 5 production-touching + 2 test files = **7 files**.

---

## ENTITIES

n/a — no domain types introduced.

## USECASES

n/a — counter aggregation is pure presentation, lives in the humble helper.

## GATEWAYS

n/a — no new external I/O. The `/api/reviews` endpoint already accepts a `path=` query and is invoked with `currentProjectPath` (see `src/dashboard/index.html:910-912`), and `currentData.activeReviews[i]` includes a `project` field (string `localPath`) populated server-side by `getJobsStatus()` (`src/frameworks/queue/pQueueAdapter.ts:369,382`).

## CONTROLLERS

n/a.

---

## PRESENTERS (humble pure helper)

### `cardCounters` — pure module

- **File**: `src/dashboard/modules/cardCounters.js`
- **Purpose**: One-line — compute the three counter values and the scope marker label for the active dashboard scope.
- **Public API**:
  ```js
  /**
   * @param {object} input
   * @param {Array<{ project: string, status: string }>} input.activeReviews
   * @param {Array<unknown>} input.reviewFiles
   * @param {{ kind: 'overview' } | { kind: 'project', localPath: string, projectName: string }} input.scope
   * @returns {{ running: number, queued: number, completed: number, markerLabel: string, markerKind: 'overview'|'project' }}
   */
  export function computeCardCounters(input) { ... }
  ```
- **Marker label rule**:
  - `scope.kind === 'overview'` → `markerLabel = 'TOUS LES PROJETS'`, `markerKind = 'overview'`
  - `scope.kind === 'project'` → `markerLabel = scope.projectName.toUpperCase()`, `markerKind = 'project'`
- **Filtering rule**:
  - Overview → `running = countByStatus(activeReviews, 'running')`, `queued = countByStatus(activeReviews, 'queued')`, `completed = reviewFiles.length` (current global behavior preserved).
  - Project → filter `activeReviews` by `r.project === scope.localPath` before counting; `completed = reviewFiles.length` (because `/api/reviews?path=` already pre-filters by project — verified at `src/dashboard/index.html:910-912` and `src/modules/review-execution/interface-adapters/controllers/http/reviews.routes.ts:30-39`).
- **Why a helper, not a presenter class**: anti-overengineering — single pure function over a known data shape; no orchestration; <40 LOC; testable in isolation. Aligns with the existing `loading.js` precedent (`src/dashboard/modules/loading.js`).

### Test file

- **File**: `src/tests/units/dashboard/modules/cardCounters.test.ts`
- **Scenarios** (mirrors spec scenarios 3–10, plus marker label scenarios 8–9, and edge 11):
  1. overview totals — running/queued: `activeReviews=[{p:'A',s:'running'},{p:'B',s:'running'},{p:'A',s:'queued'}]`, scope=overview → `{running:2, queued:1}` (spec scenario 3)
  2. project tab filters running: same input, scope=project '/repo/A' → `{running:1, queued:1}` (spec scenario 4)
  3. project tab filters queued (multi-match): two A queued, one B queued, scope project A → `{queued:2}` (spec scenario 5)
  4. completed on overview: `reviewFiles.length === 5` → `{completed:5}` (spec scenario 6)
  5. completed on project: `/api/reviews?path=A` already returned 2 files → `{completed:2}` (spec scenario 7)
  6. marker label overview → `'TOUS LES PROJETS'` (spec scenario 8)
  7. marker label project → uppercased `projectName` (spec scenario 9)
  8. empty project: scope project '/repo/empty', empty `activeReviews`, empty `reviewFiles` → `{running:0, queued:0, completed:0}` (spec scenario 11)
  9. mixed statuses not in {running, queued} are ignored (defensive — e.g., `'cancelled'`)
  10. `markerKind` returned distinct from label (helps the view layer apply a CSS class without re-parsing)

---

## VIEWS — DOM Surgery in `src/dashboard/index.html`

### Markup move

**Before** (current, lines 71-115):
```
<div class="dashboard-layout">
  <aside class="dashboard-sidebar">
    <div class="sidebar-language">...</div>
    <button id="manage-projects-toggle">...</button>
    <section id="manage-panel">...</section>
    <nav id="dashboard-tabs">...</nav>
    <span id="config-status"></span>
    <div class="focus-strip">...</div>
    <section id="worktree-section"></section>
  </aside>
  ...
</div>
```

**After** (target):
```
</header>

<div class="project-bar" role="region" aria-label="Project navigation">
  <button id="manage-projects-toggle" ...>...</button>
  <section id="manage-panel" ...></section>
  <nav id="dashboard-tabs" class="dashboard-tab-bar-wrapper" ...></nav>
</div>

<div id="cards-scope-marker" class="cards-scope-marker" data-scope-kind="overview">
  <span class="cards-scope-prefix">// SCOPE</span>
  <span class="cards-scope-label">TOUS LES PROJETS</span>
</div>

<div class="cards">...</div>

<div class="dashboard-layout">
  <aside class="dashboard-sidebar">
    <div class="sidebar-language">...</div>
    <span id="config-status"></span>      <!-- stays in sidebar; co-located with project info -->
    <div class="focus-strip">...</div>
    <section id="worktree-section"></section>
  </aside>
  ...
</div>
```

**Decision on scope-marker placement**: outside `.cards`, between `.project-bar` and `.cards`. Rationale — it is a *meta-label* about the card group, not a card itself; placing it inside `.cards` would disrupt the grid auto-fit layout (`grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))` at `styles.css:411`) and force a `grid-column: 1/-1` hack. Outside keeps both layouts clean.

**Decision on `#config-status`**: it stays in the sidebar (next to `sidebar-language`) — it is a per-project loading badge, not a tab affordance. Spec scenario 13 "sidebar slimmed" greps for `dashboard-tabs|manage-projects-toggle|manage-panel`, none of which include `config-status`, so this respects the contract.

### Script wiring (inline `<script>` in `index.html`)

Three call sites must invoke a new local function `renderCardCounters()` which:
1. Calls `computeCardCounters({ activeReviews: currentData.activeReviews, reviewFiles: currentData.reviewFiles, scope: <derived> })`.
2. Writes `running`, `queued`, `completed` to `#running-count`, `#queued-count`, `#completed-count` (replacing the three lines at `src/dashboard/index.html:781-783`).
3. Updates `#cards-scope-marker` `.cards-scope-label` `textContent` and `data-scope-kind` attribute.

`<derived>` scope construction:
```
if (activeTabId === 'overview') scope = { kind: 'overview' }
else {
  const repository = availableRepositories.find(r => r.localPath === activeTabId);
  scope = { kind: 'project', localPath: activeTabId, projectName: repository?.name ?? activeTabId.split('/').pop() }
}
```

Call sites:
- Replace lines 781-783 inside `updateUI()` with `renderCardCounters()`.
- Add `renderCardCounters()` at the end of `activateOverviewTab()` (after `refreshOverviewSection()`, around line 2401).
- Add `renderCardCounters()` at the end of `activateProjectTab()` (after `loadProjectConfigFromPath(projectPath)`, around line 2411). The completed count will update again automatically once `fetchReviewFiles()` resolves and triggers `updateUI()` via `updateReviewFilesUI()` chain — confirm by inspecting that path or call `renderCardCounters()` from `updateReviewFilesUI()`.

**No new globals**. `renderCardCounters` is local, captures `currentData`, `activeTabId`, and `availableRepositories` from the surrounding closure.

### Imports

Add to the existing `<script type="module">` import block (next to `import { getLoadingPresentation } from '@/dashboard/modules/loading.js'` — already present):
```js
import { computeCardCounters } from './modules/cardCounters.js';
```
Path matches the in-browser served convention (relative path is used inside `<script type="module">` in `index.html`; the `@/` alias is for TypeScript only — the dashboard inline script already uses relative `./modules/X.js`, verified in the file).

---

## CSS — `src/dashboard/styles.css`

### New rules

```css
/* Project bar — top-level horizontal navigation */
.project-bar {
  display: flex;
  align-items: stretch;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: nowrap;
}

.project-bar > #manage-projects-toggle { flex: 0 0 auto; }
.project-bar > #manage-panel { /* anchored below toggle via existing absolute? — verify */ }
.project-bar > #dashboard-tabs {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
}

/* Scope marker label above cards */
.cards-scope-marker {
  font-family: var(--overview-mono, ui-monospace, monospace);
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--overview-text-muted, #7a716a);
  margin-bottom: 0.5rem;
  display: flex;
  gap: 0.5rem;
  transition: opacity 200ms ease-out;
}
.cards-scope-marker .cards-scope-prefix { color: var(--overview-accent-dim, #a85a25); }
.cards-scope-marker .cards-scope-label { color: var(--overview-accent, #ff8a3d); text-transform: uppercase; }
.cards-scope-marker[data-scope-kind="overview"] .cards-scope-label { color: var(--overview-text-primary, #f3eee8); }

/* Slide-down on first mount */
@keyframes project-bar-enter {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.project-bar {
  animation: project-bar-enter 250ms ease-out;
}

/* Responsive — < 900px wraps */
@media (max-width: 900px) {
  .project-bar { flex-wrap: wrap; }
  .project-bar > #dashboard-tabs { width: 100%; }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .project-bar { animation: none; }
  .cards-scope-marker { transition: none; }
}
```

### Touch-ups

- **`.dashboard-sidebar`** (line 130): no change needed structurally — flex column still applies; with two children less it just becomes shorter. Optionally reduce `gap: 1.25rem` if visually too sparse (defer — visual tweak out of scope).
- **`#manage-panel`** absolute/relative positioning: verify the existing rules at `styles.css:4937-4970` still work when the panel sits inside `.project-bar` rather than `.dashboard-sidebar`. If positioning relies on the sidebar as offset parent, add `position: relative` to `.project-bar`. The plan flags this as a known risk (see Risks section); implementation step adjusts accordingly.

---

## WIRING

No `src/main/routes.ts` changes — this is pure dashboard layer.

No new dependencies. No new env vars. No backend touch.

---

## IMPLEMENTATION_ORDER (TDD inside-out)

1. **`src/tests/units/dashboard/modules/cardCounters.test.ts`** (RED) — write the 10 scenarios above with full coverage, expecting an import from a non-existent `cardCounters.js`.
2. **`src/dashboard/modules/cardCounters.js`** (GREEN) — implement `computeCardCounters` to make the unit tests pass. Single pure function, no DOM, no fetch.
3. **`src/tests/acceptance/178-dashboard-tabs-reposition.acceptance.test.ts`** (RED) — filesystem-grep acceptance test on `index.html` + `styles.css` (see contract below). Stays RED until step 5.
4. **`src/dashboard/styles.css`** — add `.project-bar`, `.cards-scope-marker`, animations, reduced-motion block.
5. **`src/dashboard/index.html`** — DOM surgery: move 3 nodes, insert scope marker, import helper, wire `renderCardCounters()` into 3 call sites. After this commit, the SPEC-178 acceptance test (step 3) flips to GREEN.
6. **Run full suite** — `yarn test:ci` to confirm: (a) `cardCounters.test.ts` GREEN, (b) `178…acceptance.test.ts` GREEN, (c) the 19 SPEC-177 acceptance assertions remain GREEN.
7. **Manual smoke** — `yarn dev`, switch tabs, verify counter changes and marker label, then `yarn verify`.

---

## ACCEPTANCE_TEST

- **File**: `src/tests/acceptance/178-dashboard-tabs-reposition.acceptance.test.ts`
- **Note**: SDD outer loop — written first (step 3), RED during steps 4-5, GREEN at the end.
- **Style**: filesystem grep (mirror of SPEC-177 acceptance "Dashboard visual + cleanup contracts" block at `src/tests/acceptance/177-dashboard-add-project-ui.acceptance.test.ts:340-381`) + a small JSDOM-free assertion block on the helper.

### Assertions (mapped to spec scenarios)

| # | Spec scenario | Assertion |
|---|---|---|
| 1 | markup moved (sidebar) | `indexHtml` does NOT match `/<aside class="dashboard-sidebar"[\s\S]*?id="dashboard-tabs"[\s\S]*?<\/aside>/` (multiline) |
| 2 | markup moved (project-bar) | `indexHtml` matches `/<div class="project-bar"[\s\S]*?id="dashboard-tabs"[\s\S]*?<\/div>/` (multiline) |
| 3 | manage-panel co-located | `indexHtml` matches `/<div class="project-bar"[\s\S]*?id="manage-projects-toggle"[\s\S]*?id="manage-panel"[\s\S]*?<\/div>/` (multiline) |
| 4 | sidebar slimmed | `(indexHtml.match(/<aside class="dashboard-sidebar"[\s\S]*?<\/aside>/)![0])` does NOT contain any of `id="dashboard-tabs"`, `id="manage-projects-toggle"`, `id="manage-panel"` |
| 5 | exactly one project-bar | `(indexHtml.match(/class="project-bar"/g) ?? []).length === 1` |
| 6 | scope marker present | `indexHtml` matches `/id="cards-scope-marker"/` |
| 7 | scope marker default | the marker element's initial label text contains `'TOUS LES PROJETS'` |
| 8 | renderCardCounters wired | `indexHtml` matches `/renderCardCounters\(/` and `/computeCardCounters/` (import + at least one call site) |
| 9 | helper import present | `indexHtml` matches `/from\s+['"]\.\/modules\/cardCounters\.js['"]/` |
| 10 | CSS for project-bar | `stylesCss` matches `/\.project-bar\b/` |
| 11 | CSS for scope marker | `stylesCss` matches `/\.cards-scope-marker\b/` |
| 12 | responsive wrap rule | `stylesCss` matches `/@media[^{]*max-width:\s*900px[^{]*\{[\s\S]*?\.project-bar[\s\S]*?\}/` (multiline) |
| 13 | reduced-motion respected | a `@media (prefers-reduced-motion: reduce)` block contains a rule for `.project-bar` OR `.cards-scope-marker` |
| 14 | helper pure-function contract | dynamic import of `src/dashboard/modules/cardCounters.js`, call `computeCardCounters({...overview fixture})`, assert `{running:2,queued:1,markerLabel:'TOUS LES PROJETS'}` |
| 15 | helper project-scope contract | same import, call with `scope:{kind:'project',localPath:'/repo/A',projectName:'A'}`, assert `running` filtered + `markerLabel:'A'` |

The helper-level assertions (14-15) are duplicated lightweight assertions of the unit test for outer-loop coverage. They cover scenario 10 (`tab switch re-renders counters`) implicitly: by proving the helper is wired into `activateProjectTab` (assertion 8) AND the helper produces filtered output (assertion 15), the chain is covered.

Scenarios 14-15 of the spec (reduced motion + no regression) map to acceptance assertions 13 and the SPEC-177 regression table below.

---

## SPEC-177 REGRESSION TABLE

The full suite at `src/tests/acceptance/177-dashboard-add-project-ui.acceptance.test.ts` (382 lines, 19 `it` blocks) is reviewed against the proposed DOM surgery:

| SPEC-177 assertion (file:line) | Status post-SPEC-178 | Notes |
|---|---|---|
| `legacy DOM cleanup: 0 references to project-select / project-path-input` (`177…test.ts:349-352`) | **UNCHANGED** | We do not reintroduce those ids. |
| `legacy DOM cleanup: 0 references to dead legacy helpers` (`:354-360`) | **UNCHANGED** | No legacy helper resurrection. |
| `manage panel markup is present in index.html` (`:362-365`) — greps `id="manage-panel"` and `id="manage-projects-toggle"` | **UNCHANGED** | Both ids are preserved, only moved into `.project-bar`. The assertion is **container-agnostic** (no `dashboard-sidebar` context check). |
| `styles.css declares selectors for manage panel and project tab animations` (`:367-371`) — greps `#manage-panel`, `.manage-row`, `.dashboard-tab.is-entering` | **UNCHANGED** | No CSS deletions; only additions. |
| `reduced motion respected: @media block exists with rule for tabs or manage rows` (`:373-380`) | **UNCHANGED** | The existing reduced-motion blocks at `styles.css:4569,4892,5213` stay intact. We add a NEW reduced-motion block for `.project-bar` / `.cards-scope-marker`. The regex `\.dashboard-tab|\.manage-row` matches at least one existing block, so still passes. |
| All 14 HTTP/API tests (POST/DELETE/PATCH `/api/repositories`) | **UNCHANGED** | Backend untouched. |

**Verdict**: **0 SPEC-177 assertions require adjustment**. The grep-based assertions were designed to be container-agnostic, which makes them robust to this kind of DOM relocation.

---

## RISKS / OPEN QUESTIONS

1. **`#manage-panel` positioning context**: the current panel may rely on the sidebar as an offset parent for absolute/sticky behavior. If broken, add `position: relative` to `.project-bar`. → Mitigation: read `styles.css:4937-4970` during step 5, adjust if needed.
2. **`#config-status` placement**: kept in sidebar in this plan; spec scenario 13 doesn't require its move. If user feedback during implementation says otherwise, re-open scope — do not silently move it.
3. **Field name mismatch — spec vs codebase**: the spec says `activeReviews[i].projectPath`, but the actual field name from the server is `project` (see `src/frameworks/queue/pQueueAdapter.ts:369,382` and `src/main/websocket.ts:54`). **Plan adopts `project`** (the truth). This is a spec wording bug, not a code change — flag for PM during PR but no rewrite required.
4. **`reviewFiles[]` has NO project field** at the item level — neither `ReviewFileInfo` (`src/modules/review-execution/entities/review/reviewFile.gateway.ts:1-10`) nor the `/api/reviews` aggregate endpoint includes one. The spec text "completed-count = reviewFiles.filter(file => file.projectPath === activeTabId).length" is **not implementable as written** without backend changes. **Plan resolves this by leveraging the existing `path=` query**: when a project tab is active, `currentData.reviewFiles` is *already pre-filtered* (verified in `index.html:910-912`). The helper therefore uses `reviewFiles.length` for both scopes. This preserves the spec's *intent* (per-project count) without backend changes. If `fetchReviewFiles()` race-conditions cause stale counts on tab switch, that is an existing bug (out of scope). → Flag for PM, but plan ships.
5. **Initial render order**: the new `<div id="cards-scope-marker">` lives inside the static `index.html`, so it renders before any JS runs. The hard-coded initial label is `TOUS LES PROJETS` — matches the default `activeTabId = 'overview'` (`index.html:2353`). No FOUC.
6. **i18n**: per orchestrator instruction, the scope marker text stays inline-French (`TOUS LES PROJETS`). No `i18n.js` entry added. If/when the dashboard adopts an EN/FR toggle for this label, a separate spec.

---

## REFERENCE_FILES

- `docs/specs/178-dashboard-tabs-reposition.md` — source of truth.
- `src/dashboard/index.html:71-115` — current sidebar with tabs/manage panel to move.
- `src/dashboard/index.html:31-69` — header + cards; insertion point.
- `src/dashboard/index.html:776-783` — current global counter logic to refactor.
- `src/dashboard/index.html:2353-2412` — `activeTabId`, `activateOverviewTab`, `activateProjectTab`.
- `src/dashboard/index.html:2076-2092` — WS message handler invoking `updateUI()`.
- `src/dashboard/styles.css:4584-4640` — `.dashboard-tab-bar-wrapper` and `.dashboard-tab` styles (kept, will sit inside `.project-bar`).
- `src/dashboard/styles.css:409-414` — `.cards` grid layout.
- `src/dashboard/styles.css:130-139` — `.dashboard-sidebar` flex column.
- `src/dashboard/styles.css:4937-4970` — `#manage-panel` rules (positioning check).
- `src/dashboard/modules/loading.js` — humble-helper reference (precedent for `cardCounters.js`).
- `src/tests/units/dashboard/modules/loading.test.ts` — test-style reference for pure-helper tests.
- `src/tests/acceptance/177-dashboard-add-project-ui.acceptance.test.ts:340-381` — grep-style acceptance precedent + assertions to keep GREEN.
- `src/frameworks/queue/pQueueAdapter.ts:340-394` — confirms `activeReviews[].project` field name.
- `src/modules/review-execution/interface-adapters/controllers/http/reviews.routes.ts:28-50` — confirms `/api/reviews?path=` already filters by project.
- `src/modules/review-execution/entities/review/reviewFile.gateway.ts:1-18` — confirms `ReviewFileInfo` has no `projectPath` field.
