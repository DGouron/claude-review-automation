# Spec #91 — Dashboard Multi-Project Overview with Tabs

**Issue**: [#91](https://github.com/DGouron/review-flow/issues/91)
**Labels**: enhancement, P1-critical, dashboard
**Milestone**: Dashboard Modularization
**Date**: 2026-03-14

---

## Problem Statement

Users managing multiple repositories cannot see cross-project activity at a glance. The dashboard is currently scoped to a single project via `currentProjectPath` — switching requires manual selection each time. The backend already handles multi-project reviews (concurrent queue, per-job context), but the UI is single-project.

**User impact**: a developer running reviews on 3-4 repos wastes time cycling between project selections to understand what is active, what just finished, and how each project scores.

---

## User Story

**As** a developer running ReviewFlow for multiple repositories,
**I want** a unified overview dashboard with tabs per project,
**So that** I can monitor all review activity, scores, and active jobs in one place without switching context.

---

## Scope Challenge & Decisions

### Deferred to v2: Per-process RAM monitoring

The issue requests per-Claude-CLI-process RAM bars and a `GET /api/system/resources` endpoint. After codebase analysis, this is **deferred** for three reasons:

1. **No child PID tracking exists.** The `claudeInvoker.ts` memory guard calls `process.memoryUsage()` which measures the **Node.js parent process**, not the spawned child. Child PIDs are not stored or exposed. Implementing per-child RSS requires: tracking PIDs from `spawn()`, reading `/proc/<pid>/status` (Linux-only), handling process trees (Claude CLI spawns sub-processes), and cleaning up on exit. This is a feature in itself.

2. **Cross-platform portability.** Reading RSS via `/proc` is Linux-only. macOS requires `ps` or `mach` APIs. Adding this introduces platform-specific code that deserves its own testing and scope.

3. **Separate concern.** Resource monitoring solves a different problem (capacity planning / debugging OOM kills) than project overview (understanding review activity). Bundling them inflates the ticket beyond INVEST-Small.

**v1 keeps**: the existing memory guard in `claudeInvoker.ts` (kill at 4 GB, warn at 80%). No new resource endpoint, no RAM bars, no server footer.

### In scope for v1

- Tab bar replacing project selector dropdown
- Overview tab (default on load) with 3 sections
- Per-project tabs with existing dashboard behavior
- `GET /api/stats` multi-project mode (already partially exists)
- WebSocket `state` messages already include `project` — no protocol change needed

---

## Acceptance Criteria (Gherkin)

### Scenario 1: Overview tab is default on load (nominal)

```gherkin
Given the dashboard loads for the first time (no localStorage state)
When the page finishes loading
Then the Overview tab is active
And the tab bar shows "Overview" plus one tab per configured repository with reviews
And the project selector dropdown is no longer visible
```

### Scenario 2: Active reviews across all projects

```gherkin
Given project "frontend" has 1 running review (MR !142, started 3 minutes ago)
And project "api" has 1 running review (PR #28, started 7 minutes ago)
When the Overview tab is displayed
Then the "Active Reviews" section shows 2 entries
And each entry displays: project name, MR/PR number, elapsed time
And the entries are ordered by most recently started first
```

### Scenario 3: Active reviews update in real-time

```gherkin
Given the Overview tab is displayed with 1 active review
When a new review starts (WebSocket "state" message received)
Then the "Active Reviews" section updates without page reload
And the new review appears in the list
```

### Scenario 4: Project cards with stats

```gherkin
Given project "frontend" has 24 reviews with average score 7.2
And project "api" has 8 reviews with average score 8.1
When the Overview tab is displayed
Then the "Projects" section shows 2 cards
And the "frontend" card displays: name "frontend", "24 reviews", "Score 7.2"
And the "api" card displays: name "api", "8 reviews", "Score 8.1"
And each card shows an SVG sparkline of the last 10 review scores
```

### Scenario 5: Clicking a project card navigates to its tab

```gherkin
Given the Overview tab is displayed with a card for project "frontend"
When the user clicks the "frontend" card
Then the "frontend" tab becomes active
And the dashboard displays existing per-project content (stats, MR tracking, reviews) scoped to "frontend"
```

### Scenario 6: Recent reviews feed across all projects

```gherkin
Given project "frontend" completed MR !137 with score 6/10 at 14:05
And project "api" completed PR #28 with score 8/10 at 14:10
When the Overview tab is displayed
Then the "Recent Reviews" section shows entries ordered newest first
And each entry displays: project name, MR/PR number, score, status icon
And the feed shows at most 10 entries
```

### Scenario 7: Per-project tab retains existing functionality

```gherkin
Given the user navigates to the "frontend" project tab
When the tab is active
Then the dashboard displays stats, MR tracking, review history for "frontend" only
And all existing functionality (cancel review, sync threads, followup tracking) works unchanged
```

### Scenario 8: Tab state persistence

```gherkin
Given the user is viewing the "api" project tab
When the user reloads the page
Then the "api" tab is active (not Overview)
And the dashboard restores the "api" project view
```

### Scenario 9: No configured projects (edge case)

```gherkin
Given no repositories are configured in config.json
When the dashboard loads
Then the Overview tab is displayed
And the "Active Reviews" section shows an empty state message
And the "Projects" section shows an empty state message
And the "Recent Reviews" section shows an empty state message
```

### Scenario 10: Project with no review history (edge case)

```gherkin
Given project "new-project" is configured but has 0 reviews
When the Overview tab is displayed
Then the "new-project" card shows: "0 reviews", "Score -"
And the sparkline is empty (no SVG polyline rendered)
And a tab for "new-project" still appears in the tab bar
```

### Scenario 11: Stats API returns all projects when no path specified

```gherkin
Given project "frontend" and "api" both have stats
When the client calls GET /api/stats (no query parameter)
Then the response contains a "projects" array with entries for both projects
And each entry includes: project name, path, stats object, summary object
```

### Scenario 12: Review completes while Overview is visible (edge case)

```gherkin
Given the Overview tab is displayed with 1 active review for MR !142
When MR !142 completes (WebSocket "state" message with empty active, MR in recent)
Then the "Active Reviews" section removes MR !142
And the "Recent Reviews" section adds MR !142 at the top with its score
```

---

## Out of Scope

| Item | Reason |
|------|--------|
| Per-process RAM bars | Requires child PID tracking not yet implemented (see Scope Challenge) |
| Server footer with RAM stats | Coupled to resource monitoring — deferred with RAM bars |
| `GET /api/system/resources` endpoint | Deferred with resource monitoring |
| CPU monitoring | Explicitly out of scope in issue |
| Disk usage | Explicitly out of scope in issue |
| Pie charts / complex visualizations | Explicitly out of scope in issue |
| Per-project RAM history / trends | Explicitly out of scope in issue |
| Drag-and-drop tab reordering | Not requested, no user need identified |
| Cross-project search | Not requested |

---

## Technical Notes

### What already exists and can be reused

| Component | Location | Reuse |
|-----------|----------|-------|
| `GET /api/stats` multi-project | `stats.routes.ts` | Already returns all projects when no `path` query param — ready to use |
| `GET /api/reviews` multi-project | `reviews.routes.ts` | Already returns all reviews when no `path` — ready to use |
| WebSocket `state` messages | `websocket.ts` | Already includes `project` field in active/recent jobs — no protocol change |
| Dashboard utility modules | `views/dashboard/modules/` | Extracted via #69 — formatting, icons, i18n, etc. |
| Config repositories list | `configLoader.ts` | `RepositoryConfig[]` with `name`, `localPath`, `platform`, `enabled` |

### What needs to be created

| Component | Description |
|-----------|-------------|
| Tab bar UI | HTML/CSS replacing the `<select>` project dropdown — vanilla JS |
| Overview tab module | New `modules/overview.js` — renders 3 sections from API data |
| Sparkline renderer | SVG `<polyline>` from last 10 scores — ~50 lines in a utility function |
| Tab navigation logic | Switch between Overview and per-project tabs, restore `currentProjectPath` per tab |
| `GET /api/repositories` or equivalent | Endpoint to list configured repos for the tab bar (or reuse existing project-config) |

### What needs to be modified

| Component | Change |
|-----------|--------|
| `index.html` | Replace project-loader `<div>` with tab bar; add Overview container |
| `styles.css` | Tab bar styles, project card styles, sparkline styles |
| WebSocket handler (client-side) | Overview mode: update all-project sections on `state` messages |
| `loadProjectConfigFromPath()` | Move into per-tab context instead of global |

### Constraints

- No new frontend dependencies (vanilla JS/CSS/SVG only — project convention)
- No new npm packages on the server side for this feature
- Dashboard views are Humble Objects: zero logic, render only (presenter does logic)
- All new JS modules use JSDoc typing (browser-served, not compiled TypeScript)

---

## Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| #69 — Extract dashboard utility modules | Closed | Utility modules already available |
| #70 — Extract WebSocket module | Open | Nice-to-have; not blocking — current inline WS code works |

---

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | No blockers; #69 done, #70 nice-to-have | PASS |
| **Negotiable** | Resource monitoring deferred to keep scope clean; sparkline and card layout negotiable | PASS |
| **Valuable** | Directly solves multi-project visibility pain; no more manual switching | PASS |
| **Estimable** | Tab bar + 3 sections + existing APIs = bounded work; XL but decomposable | PASS |
| **Small** | After deferring RAM monitoring: 1 new module (overview), 1 UI restructure (tabs), 0 new server endpoints. Fits in 1-2 sprint days | PASS |
| **Testable** | 12 Gherkin scenarios with concrete assertions | PASS |

---

## Suggested Decomposition

Given the XL effort label, recommended sub-tasks:

1. **Tab bar infrastructure** — Replace project dropdown with tab bar, handle navigation, persistence in localStorage
2. **Overview: Active Reviews section** — Fetch from existing WebSocket state, render cross-project active jobs with elapsed time
3. **Overview: Project Cards section** — Fetch from `GET /api/stats`, render cards with sparklines, handle click navigation
4. **Overview: Recent Reviews feed** — Fetch from `GET /api/reviews` (no path), render chronological feed (max 10)
5. **Per-project tab integration** — Wire existing dashboard behavior into per-tab context, restore `currentProjectPath` per tab

Each sub-task is independently shippable and testable.

---

## Definition of Done

- [ ] Overview tab is the default view on dashboard load
- [ ] Tab bar shows "Overview" + one tab per configured project
- [ ] Active Reviews section shows all running reviews with project name, MR/PR number, elapsed time
- [ ] Active Reviews section updates in real-time via WebSocket
- [ ] Project cards show total reviews, average score, and SVG sparkline
- [ ] Clicking a project card navigates to its project tab
- [ ] Recent Reviews feed shows last 10 completed reviews across all projects
- [ ] Per-project tabs retain all existing dashboard functionality
- [ ] Tab state is persisted in localStorage across page reloads
- [ ] No new frontend dependencies added
- [ ] `GET /api/stats` (no path) returns all project stats — already works, verified
- [ ] Empty states are handled (no projects, project with 0 reviews)
- [ ] `yarn verify` passes (typecheck + lint + tests)
