# Spec #72 — Extract Remaining Dashboard Domain Modules

**Issue**: [#72](https://github.com/DGouron/review-flow/issues/72) (absorbs [#70](https://github.com/DGouron/review-flow/issues/70), [#71](https://github.com/DGouron/review-flow/issues/71))
**Labels**: refactor, P2-important, dashboard
**Milestone**: Dashboard Modularization
**Date**: 2026-03-14

---

## Problem Statement

The dashboard `index.html` contains ~1,900 lines of inline JavaScript (lines 229-2121) mixing WebSocket lifecycle, localStorage persistence, project loading logic, review rendering, MR tracking rendering, log rendering, stats rendering, CLI status checks, toast notifications, section expansion, cancel modals, and initialization orchestration. This monolith makes it impossible to:

1. **Test domain logic in isolation** — pure rendering functions (review cards, MR items, queue lanes) are trapped inside a `<script>` block with no module boundary, so they cannot be imported by test files.
2. **Reuse modules across views** — the upcoming multi-project overview (#91) needs the same review rendering and WebSocket handling, but cannot import from inline code.
3. **Reason about change impact** — a developer modifying MR tracking rendering risks breaking WebSocket reconnection or project loader state because everything shares one scope.

Issue #69 (utility modules) is complete: 13 modules already extracted into `/modules/`. This issue extracts the remaining **domain-level** code into testable ES6 modules, leaving `index.html` as a thin orchestrator.

**User-facing benefit**: zero. This is a pure refactor. The dashboard must look and behave identically after extraction.

---

## User Story

**As** a developer maintaining the ReviewFlow dashboard,
**I want** each domain concern (WebSocket, storage, project loading, reviews, logs, stats, MR tracking, CLI status) extracted into its own ES6 module,
**So that** I can test, modify, and reuse each concern independently without risking unrelated regressions.

---

## Current State Analysis

### Already extracted (13 modules in `/modules/`)

| Module | Concern | Tested |
|--------|---------|--------|
| `constants.js` | Thresholds, storage keys | Yes |
| `formatting.js` | Date/duration/phase formatting | Yes |
| `html.js` | HTML escaping, markdown, URL sanitization | Yes |
| `icons.js` | Agent icons, Lucide refresh | Yes |
| `i18n.js` | Translation function `t()` | Yes |
| `assignee.js` | Assignee display resolution | Yes |
| `desktopNotifications.js` | Desktop notification payload/gate | Yes |
| `loading.js` | Loading state presentation logic | Yes |
| `notifications.js` | Review notification state machine | Yes |
| `priority.js` | Pending-fix ranking for Now lane | Yes |
| `quality.js` | Quality progress/trend computation | Yes |
| `queueLanes.js` | Queue lanes model builder | Yes |
| `sessionMetrics.js` | Session metrics state tracking | Yes |

### Still inline (~1,600 lines of logic after subtracting imports/init)

| Domain | Lines (approx.) | Functions | Pure? |
|--------|-----------------|-----------|-------|
| **WebSocket** | 1497-1562 | `connectWebSocket`, ping interval, `handleProgressUpdate`, `handleLogMessage` | No (I/O) |
| **Storage** | 1663-1687 | `getStoredProjects`, `saveProjects`, `addProjectToHistory`, `removeProjectFromHistory` | No (localStorage) |
| **Project loader** | 1689-1825 | `updateProjectSelect`, `onProjectSelect`, `loadProjectConfig`, `loadProjectConfigFromPath`, `showConfigStatus`, `removeCurrentProject`, `initProjectLoader` | No (DOM + fetch) |
| **Reviews rendering** | 518-621, 640-654, 656-701, 735-797, 876-915 | `renderAgentTimeline`, `renderProgressBar`, `getReviewStatusPresentation`, `renderReview`, `toggleReviewDescription`, `renderLog`, `updateUI`, `renderReviewFile`, `toggleReviewAccordion`, `updateReviewFilesUI`, `deleteReviewFile`, `fetchReviewFiles` | Mixed |
| **Stats** | 816-874, 1062-1074 | `fetchProjectStats`, `toggleStats` | No (fetch + DOM) |
| **MR tracking** | 1076-1178, 1180-1293, 1295-1470 | `renderMrItem`, `renderNowLane`, `renderQueueLanes`, `toggleMrAccordion`, `updateMrTrackingUI`, `fetchMrTracking`, `triggerFollowup`, `toggleAutoFollowup`, `approveMr`, `syncGitLabThreads` | Mixed |
| **CLI status** | 917-1044 | `checkClaudeStatus`, `updateGitCliUI`, `checkGitCliStatus` | No (fetch + DOM) |
| **Toast** | 1885-1898 | `showToast` | No (DOM) |
| **Cancel modal** | 1831-1883 | `showCancelModal`, `closeCancelModal`, `confirmCancelReview` | No (DOM + fetch) |
| **Settings** | 1589-1658 | `loadModelSetting`, `changeModel`, `loadLanguageSetting`, `changeLanguage` | No (fetch + DOM) |
| **Static labels** | 1900-2056 | `renderStaticLabels` | No (DOM) |
| **UI helpers** | 281-327, 328-427, 444-516, 723-733 | Section expansion, loading flag management, session metrics UI, connection status | Mixed |

---

## Scope Challenge & Decisions

### What gets extracted into new modules

The extraction targets **pure or near-pure logic** that can be tested without a DOM. Functions that are purely DOM-wiring (e.g., `renderStaticLabels`, which is 150 lines of `getElementById` + `textContent` assignments) stay in `index.html` as orchestration glue.

**7 new modules to create:**

| New module | What moves there | Testable logic |
|------------|-----------------|----------------|
| `websocket.js` | `connectWebSocket`, reconnect logic, ping interval, message dispatch table | Connection state machine, message routing, reconnect with backoff |
| `storage.js` | `getStoredProjects`, `saveProjects`, `addProjectToHistory`, `removeProjectFromHistory` | Project list CRUD operations (inject storage adapter) |
| `projectLoader.js` | `loadProjectConfigFromPath` response handling, `initProjectLoader` decision logic, `updateProjectSelect` model building | Config parsing, project select model, init decision |
| `reviews.js` | `renderReview`, `renderAgentTimeline`, `renderProgressBar`, `getReviewStatusPresentation`, `renderReviewFile`, `renderLog` | HTML generation functions (string in, string out) |
| `logs.js` | `renderLog`, `updateLogs` model (error count extraction) | Log rendering, error count computation |
| `stats.js` | Stats card HTML generation from summary data | HTML generation (data in, string out) |
| `mrTracking.js` | `renderMrItem`, `renderNowLane`, `renderQueueLanes` | HTML generation functions (data in, string out) |

### What stays in `index.html`

- **Orchestration**: `init` block, polling intervals, `window.X = X` bindings
- **DOM wiring**: `renderStaticLabels`, `updateLoadingStateUI`, section expansion (DOM classList toggling)
- **State variables**: `currentData`, `loadingState`, `wsConnected`, etc.
- **Fetch calls**: `fetchStatus`, `fetchReviewFiles`, `fetchProjectStats`, `fetchMrTracking` (these call modules for rendering but own the fetch/DOM update cycle)
- **Cancel modal / toast**: thin DOM operations, not worth a module boundary

### Why not extract everything?

Over-extraction would create modules with 2-3 lines that exist only to satisfy a pattern. The guiding principle: **extract when the module has testable logic**. DOM-only wiring (get element, set class) has no logic to test and should stay in the humble view.

---

## Acceptance Criteria (Gherkin)

### Scenario 1: WebSocket module encapsulates connection lifecycle (nominal)

```gherkin
Given a websocket module that exports createWebSocketManager
When I call createWebSocketManager with a URL and message handlers
Then it returns an object with connect, disconnect, and isConnected methods
And calling connect establishes a WebSocket connection
And received messages are dispatched to the matching handler by message type
And on close, it reconnects up to MAX_RECONNECT_ATTEMPTS times with RECONNECT_DELAY
```

### Scenario 2: WebSocket reconnect stops after max attempts

```gherkin
Given a WebSocket manager configured with maxAttempts = 3
When the connection closes 3 times
Then the manager stops attempting to reconnect
And the onStatusChange callback receives "disconnected"
```

### Scenario 3: Storage module wraps localStorage project operations

```gherkin
Given a storage module that exports getStoredProjects and saveProjects
When I call addProjectToHistory with path "/home/user/project-a"
Then getStoredProjects returns ["/home/user/project-a"]
When I call addProjectToHistory with path "/home/user/project-b"
Then getStoredProjects returns ["/home/user/project-b", "/home/user/project-a"]
And the most recently added project is first
```

### Scenario 4: Storage caps history at 10 projects

```gherkin
Given 10 projects already in storage
When I call addProjectToHistory with an 11th project path
Then getStoredProjects returns exactly 10 projects
And the oldest project is removed
And the newest project is first
```

### Scenario 5: Project loader builds select model from stored projects

```gherkin
Given stored projects ["/home/user/frontend", "/home/user/api"]
And the current project is "/home/user/frontend"
When I call buildProjectSelectModel
Then it returns options with shortName "user/frontend" and "user/api"
And the option for "/home/user/frontend" is marked as selected
```

### Scenario 6: Reviews module renders a running review card

```gherkin
Given a review object with status "running", mrNumber 42, project "frontend", jobType "review"
When I call renderReview with the review and isActive = true
Then the returned HTML contains "!42"
And it contains a cancel button
And it contains a duration display
And it contains the status badge with class "running"
```

### Scenario 7: Reviews module renders a GitHub review with PR prefix

```gherkin
Given a review object with id starting with "github", mrNumber 15
When I call renderReview with the review
Then the returned HTML contains "#15" (not "!15")
```

### Scenario 8: Logs module computes error count from log entries

```gherkin
Given log entries [{ level: "info" }, { level: "error" }, { level: "warn" }, { level: "info" }]
When I call getLogErrorCount with the entries
Then it returns 2
```

### Scenario 9: Stats module generates stat cards from summary data

```gherkin
Given a stats summary with totalReviews: 12, averageScore: 7.5, trend.score: "up"
When I call renderStatsCards with the summary
Then the returned HTML contains "12" for total reviews
And it contains "7.5" for average score
And it contains a trending-up icon
```

### Scenario 10: MR tracking module renders a pending-fix MR item

```gherkin
Given a tracked MR with mrNumber 88, openThreads 3, platform "gitlab"
When I call renderMrItem with the MR and type "pending-fix"
Then the returned HTML contains "!88"
And it contains a thread count showing 3 open threads
And it contains a followup button
```

### Scenario 11: MR tracking module renders queue lanes grid

```gherkin
Given a queueLanesModel with 1 nowLaneItem, 2 needsFixItems, and 1 readyToApproveItem
When I call renderQueueLanes with the model
Then the returned HTML contains 3 lane sections
And the now lane contains the priority MR
And the needs-fix lane contains 2 MR items
And the ready-to-approve lane contains 1 MR item
```

### Scenario 12: Dashboard behavior is unchanged after extraction

```gherkin
Given the dashboard with all modules extracted
When I load the dashboard in a browser
Then all sections render identically to before the refactor
And WebSocket connects and receives real-time updates
And project loading persists selection across sessions
And review accordions expand and collapse
And MR tracking shows queue lanes with followup actions
And stats cards display with trend icons
And logs section toggles visibility
```

---

## Implementation Plan (Staged)

Each stage is one commit. Stages are ordered by dependency (earlier modules are imported by later ones).

### Stage 1: `storage.js`

Extract `getStoredProjects`, `saveProjects`, `addProjectToHistory`, `removeProjectFromHistory`. Inject a storage adapter interface (defaults to `localStorage`) so tests can use an in-memory stub.

**Files**: create `modules/storage.js`, update `index.html` imports
**Tests**: `storage.test.ts`

### Stage 2: `websocket.js`

Extract WebSocket connection management into a factory function `createWebSocketManager({ url, maxAttempts, reconnectDelay, onMessage, onStatusChange })`. Exposes `connect()`, `disconnect()`, `isConnected()`. Ping interval managed internally.

**Files**: create `modules/websocket.js`, update `index.html`
**Tests**: `websocket.test.ts` (using a WebSocket stub/mock)

### Stage 3: `reviews.js`

Extract `renderReview`, `renderAgentTimeline`, `renderProgressBar`, `getReviewStatusPresentation`, `renderReviewFile`, `renderLog`. These are pure string-returning functions that take data + dependencies (formatting/html/icon functions) as parameters.

**Files**: create `modules/reviews.js`, update `index.html`
**Tests**: `reviews.test.ts`

### Stage 4: `logs.js`

Extract `renderLog` and a new `getLogErrorCount` helper. Thin module, but separates log concern from review rendering.

**Files**: create `modules/logs.js`, update `index.html`
**Tests**: `logs.test.ts`

### Stage 5: `stats.js`

Extract stats card HTML generation from `fetchProjectStats` response handler into `renderStatsCards(summary, t)`.

**Files**: create `modules/stats.js`, update `index.html`
**Tests**: `stats.test.ts`

### Stage 6: `mrTracking.js`

Extract `renderMrItem`, `renderNowLane`, `renderQueueLanes`. These are the heaviest rendering functions (~250 lines combined). They depend on existing modules (`formatting`, `html`, `icons`, `quality`, `queueLanes`).

**Files**: create `modules/mrTracking.js`, update `index.html`
**Tests**: `mrTracking.test.ts`

### Stage 7: `projectLoader.js`

Extract `buildProjectSelectModel` (new pure function derived from `updateProjectSelect`), project config response parsing, and `initProjectLoader` decision logic. DOM wiring stays in `index.html`.

**Files**: create `modules/projectLoader.js`, update `index.html`
**Tests**: `projectLoader.test.ts`

---

## Out of Scope

| Item | Why |
|------|-----|
| **Rewriting HTML structure** | This is extraction, not redesign |
| **Adding new features** | Zero behavior change |
| **Removing inline functions entirely** | Orchestration glue (`renderStaticLabels`, `updateLoadingStateUI`, fetch cycles, `window.X` bindings) stays in `index.html` |
| **TypeScript conversion** | Dashboard modules are browser-served `.js` files — TS conversion is a separate scope |
| **Bundler / build step for dashboard** | Currently served raw — adding Vite/esbuild is a different initiative |
| **Multi-project overview (#91)** | That issue consumes these modules; it does not define them |
| **Cancel modal extraction** | ~50 lines of pure DOM toggling with no testable logic |
| **Toast extraction** | ~15 lines of DOM creation with no testable logic |
| **Settings extraction** | Pure fetch+DOM, no logic worth isolating |

---

## INVEST Validation

| Criterion | Assessment |
|-----------|-----------|
| **Independent** | Yes. Depends only on #69 (done). Each stage is independently deployable. |
| **Negotiable** | Yes. Module boundaries are proposed, not prescribed. `logs.js` could merge into `reviews.js`; `stats.js` could be deferred. The 7-module split is a starting point. |
| **Valuable** | Yes. Enables testing of ~1,000 lines of rendering logic that is currently untestable. Unblocks #91 (multi-project overview) which needs reusable rendering modules. |
| **Estimable** | Yes. 7 stages, each 1-2 hours. Total: 8-12 hours. |
| **Small** | Yes. Each stage is one module + one test file + one `index.html` update. No stage exceeds 3 files. |
| **Testable** | Yes. Every new module has Gherkin scenarios above. Verification: `yarn verify` passes after each stage, dashboard visual behavior is identical. |

---

## Definition of Done

- [ ] 7 new modules created in `src/interface-adapters/views/dashboard/modules/`
- [ ] Each module has a corresponding test file in `src/tests/units/interface-adapters/views/dashboard/modules/`
- [ ] `index.html` imports all new modules and delegates to them
- [ ] `index.html` inline `<script>` reduced to orchestration only (~300-400 lines)
- [ ] No circular dependencies between modules
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] Dashboard loads and behaves identically in browser (manual verification)
- [ ] WebSocket connects with auto-reconnect
- [ ] Project selection persists across sessions via localStorage
- [ ] All 13 existing module tests still pass
- [ ] All new module tests pass
- [ ] No new runtime dependencies added

---

## Technical Notes

### Module pattern

Follow existing convention: JSDoc-typed ES6 modules with explicit exports. No default exports. Pure functions where possible; for stateful modules (WebSocket, storage), use factory functions that accept dependencies.

```javascript
// Example: modules/storage.js
/**
 * @param {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} adapter
 */
export function createStorageManager(adapter = localStorage) {
  // ...
}
```

### Dependency injection for testability

Modules that touch I/O (WebSocket, localStorage, fetch) accept their dependency as a parameter so tests can inject stubs. This follows the existing pattern in `loading.js` and `notifications.js` which accept state objects rather than reading globals.

### Rendering functions signature convention

Rendering functions that need `t()`, `escapeHtml()`, `formatDuration()`, etc. receive them as a `dependencies` object parameter rather than importing directly. This keeps modules decoupled and testable with stub translators.

```javascript
// Example: modules/reviews.js
/**
 * @param {object} review
 * @param {boolean} isActive
 * @param {{ t: Function, escapeHtml: Function, formatDuration: Function, ... }} dependencies
 * @returns {string}
 */
export function renderReview(review, isActive, dependencies) {
  // ...
}
```

### Alternative: direct imports

If dependency injection feels over-engineered for simple rendering, modules may import directly from sibling modules (`./formatting.js`, `./html.js`). The team should decide per-module. Either approach is acceptable as long as tests can verify the output.
