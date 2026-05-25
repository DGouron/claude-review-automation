# Spec #178 — Reposition Project Tabs Above Cards + Project-Contextual Cards

**Labels**: enhancement, P2-important, dashboard, ux
**Date**: 2026-05-25
**Status**: implemented

---

## Status: implemented

Shipped 2026-05-25. See `docs/reports/178-dashboard-tabs-reposition.report.md` (15/15 acceptance GREEN, +24 tests, no regression on SPEC-177).

## Implementation

### Artefacts

- **Dashboard humble helper (new)**: `src/dashboard/modules/cardCounters.js` — pure function `computeCardCounters({ activeReviews, reviewFiles, scope })` returning `{ running, queued, completed, markerLabel, markerKind }`. <40 LOC, zero DOM access, zero side effects.
- **Dashboard view delta**: `src/dashboard/index.html` — `<nav id="dashboard-tabs">`, `<button id="manage-projects-toggle">`, `<section id="manage-panel">` moved out of `<aside class="dashboard-sidebar">` into a new `<div class="project-bar">` placed between `</header>` and `<div class="cards">`. New `<div id="cards-scope-marker">` rendered above the cards. Counter render path extended to call `computeCardCounters` from 3 sites: `updateUI()`, `activateOverviewTab()`, `activateProjectTab()`.
- **CSS layout**: `src/dashboard/styles.css` — `.project-bar` (flex horizontal, manage toggle left, tabs flex-1 with `overflow-x: auto`), `position: relative` for the manage panel offset parent, `.cards-scope-marker` styling, responsive wrap at `< 900px`, slide-down keyframe on first mount, and `@media (prefers-reduced-motion: reduce)` overrides.

### Architectural decisions taken

- **Pure helper over presenter class**: counter aggregation is a single side-effect-free function over known data shapes — wrapping it in a class would be premature. Aligns with the precedent set by `loading.js` in the same module folder.
- **`reviewFiles.length` in both scopes (no backend touch)**: `currentData.reviewFiles` is already pre-filtered by `/api/reviews?path=` when a project is activated. On overview the value reflects the last-loaded project — same as current behavior. No new endpoint introduced.
- **Field name `r.project`** (not `r.projectPath`) — matches the data shape emitted by the tracking module's HTTP routes.
- **Scope marker outside `.cards`**: a sibling element above the cards container, avoiding any disturbance to the existing grid layout.
- **`position: relative` added to `.project-bar`**: safety against the manage-panel's pre-SPEC-178 implicit offset-parent (the sidebar). No visible change, prevents a hard-to-debug positioning regression.
- **No drag-and-drop, no tab badges, no per-section project filtering** — the spec explicitly scoped these out.

---

## Context

After SPEC-91 (multi-project overview) and SPEC-177 (project CRUD UI + animations), the project tabs and the manage-projects panel sit inside the left sidebar (`<aside class="dashboard-sidebar">`). The sidebar has become cramped — language select, manage panel, tabs, focus strip, worktree pool — and the visual hierarchy is wrong: project navigation is the most-used affordance in the app but it is the deepest item visually.

This spec promotes project navigation to a top-level horizontal bar placed between `<header>` and the metric cards (`<div class="cards">`). It also wires the existing cards (Running / Queued / Completed) to filter their counters by the active project tab — so switching projects becomes a real context shift, not just a scroll target.

The bottom of the manage-projects panel (the Add form + per-row × / toggle) follows the tabs to the same top zone — they belong together. The sidebar reverts to its original purpose: focus strip + worktree pool + per-project tools.

---

## Rules

### Layout

- `<nav id="dashboard-tabs">` is moved out of `<aside class="dashboard-sidebar">` and rendered inside a new `<div class="project-bar">` placed immediately after `<header>` and before `<div class="cards">`
- `<button id="manage-projects-toggle">` and `<section id="manage-panel">` are moved with the tabs into the same `project-bar` container
- The `project-bar` lays out children horizontally: manage toggle (left) → tabs (center, horizontally scrollable on overflow) → optional right slot for future actions (kept empty for now)
- The sidebar (`<aside class="dashboard-sidebar">`) no longer contains tabs or manage panel — only `sidebar-language`, `focus-strip`, `worktree-section`
- `<div class="cards">` stays unchanged in markup; only its CSS context is adjusted so it sits below the `project-bar`

### Project-contextual cards

- When `activeTabId === 'overview'`, the three counters (Running / Queued / Completed) show GLOBAL counts across all repositories (current behavior preserved)
- When `activeTabId` is a project `localPath`, the counters filter to that project:
  - `running-count` = `activeReviews.filter(r => r.project === activeTabId && r.status === 'running').length`
  - `queued-count` = same with `status === 'queued'`
  - `completed-count` = `reviewFiles.length` (the dashboard already pre-loads `currentData.reviewFiles` filtered by the active project via `/api/reviews?path=`, so no per-item filter is needed)
- A small visual marker (label suffix or color accent) above the cards indicates which scope they reflect: "ALL PROJECTS" or the short project name
- Switching tabs re-renders the counters immediately (no full page reload)
- The other dashboard sections (active-reviews list, pending-fix, logs) keep their current per-project loading behavior — out of scope for this spec

### Animations

- The tabs container slides down with a fade-in on first mount (250ms)
- Tab switch keeps the existing 1500ms enter pulse from SPEC-177 (no regression)
- Card counters animate on value change (existing `animateCounter()` is reused; not part of this spec)
- The project-scope marker (text above cards) fades when the active tab changes (200ms)
- `@media (prefers-reduced-motion: reduce)` continues to be honored

### Responsiveness

- On viewport widths < 900px, the project-bar wraps: manage toggle on top row, tabs on the next row, both horizontally scrollable
- Tabs never break the page layout; overflow is handled by `overflow-x: auto` with subtle scroll affordance

---

## Scenarios

- markup moved: {grep: 'dashboard-tabs', container: 'dashboard-sidebar'} → 0 matches; {container: 'project-bar'} → 1 match
- manage-panel co-located: {grep: 'manage-projects-toggle', container: 'project-bar'} → 1 match; in sidebar → 0
- card counter on overview: {activeTabId: 'overview', activeReviews: [{p:'A',s:'running'},{p:'B',s:'running'}]} → running-count = 2
- card counter on project: {activeTabId: '/repo/A', activeReviews: [{p:'A',s:'running'},{p:'B',s:'running'}]} → running-count = 1
- card counter on project queued: {activeTabId: '/repo/A', activeReviews: [{p:'A',s:'queued'},{p:'A',s:'queued'},{p:'B',s:'queued'}]} → queued-count = 2
- completed counter on overview: {activeTabId: 'overview', reviewFiles: 5 files across 3 projects} → completed-count = 5
- completed counter on project: {activeTabId: '/repo/A', reviewFiles: [2 from A, 3 from B]} → completed-count = 2
- scope marker label on overview: {activeTabId: 'overview'} → marker shows "ALL PROJECTS" (or i18n equivalent)
- scope marker label on project: {activeTabId: '/repo/A', projectName: 'A'} → marker shows the short project name "A"
- tab switch re-renders counters: {previousTabId: 'overview', newTabId: '/repo/A'} → renderCounters() runs once; no full reload
- empty project counters: {activeTabId: '/repo/empty', no activeReviews for it} → running=0, queued=0, completed=0
- markup integrity: {grep: 'project-bar', file: 'index.html'} → exactly 1 occurrence (the new container)
- sidebar slimmed: {grep: 'dashboard-tabs|manage-projects-toggle|manage-panel', container: 'dashboard-sidebar'} → 0 matches
- responsive wrap at < 900px: {viewport-width: 800} → project-bar wraps without breaking layout (asserted via CSS rule presence, not visual)
- reduced motion respected: {prefers-reduced-motion: reduce} → no slide-down, opacity-only transition
- no regression on add-project: {SPEC-177 add scenario} → still GREEN after move

---

## Out of Scope

- Reordering tabs by drag-and-drop (deferred)
- Per-project filtering of the "active reviews" list, "logs", "pending fix" sections (out of scope — current per-project load already handles those panels)
- Filtering "claude-cli" / "git-cli" / "model" cards — these are global concerns, never per-project
- Mobile / touch optimizations beyond responsive wrap
- Tab badges (count per project on the tab) — separate spec if value emerges
- Settings modal UI shell (chantier #3) — SPEC-179
- Changing the manage panel's CRUD endpoints — SPEC-177 contract preserved

---

## Glossary

| Term | Definition |
|------|------------|
| Project bar | New container `<div class="project-bar">` placed between header and cards, holds manage toggle + tabs |
| Active tab | The tab whose `id` matches `activeTabId` (either `'overview'` or a `localPath`) |
| Project scope | The filter applied to counters: ALL when overview, single project when a project tab is active |
| Scope marker | A small label above the cards showing the current scope name |
| Card | One of the metric tiles in `<div class="cards">` — Running, Queued, Completed, Claude CLI, Git CLI, Model |
| Counter | The numeric `<div id="*-count">` inside a card |

---

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Depends on SPEC-177 being shipped (manage panel exists) — confirmed |
| Negotiable | OK | Marker placement and wording are open |
| Valuable | OK | Reduces sidebar cognitive load + makes context shifts real |
| Estimable | OK | DOM relocation + 1 filter helper + CSS reflow |
| Small | OK | ~2 production file modifications + 1 helper module + tests, ~0.4j IA |
| Testable | OK | 15 scenarios cover layout, counters, scope marker, edge cases |

**Verdict**: READY

---

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 3 | Every dashboard user, every interaction |
| Impact | 2 | Real UX improvement on the most-used affordance |
| Confidence | 90% | DOM move + filter pattern well understood |
| Effort | 1 pt | ~0.4j IA |
| **Score** | **5.4** | |

**Priority**: P2-important
