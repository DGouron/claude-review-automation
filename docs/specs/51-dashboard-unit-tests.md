# Spec #51 — Dashboard Unit Tests

**Issue**: [#51](https://github.com/DGouron/review-flow/issues/51)
**Labels**: enhancement, good first issue, P2-important, dashboard, testing
**Milestone**: Dashboard Modularization
**Date**: 2026-03-14

---

## Problem Statement

Extracted dashboard modules need automated test coverage to prevent regressions during further modularization and feature development. Without tests, refactoring the dashboard is risky: breaking changes go undetected until production.

---

## Scope Challenge & Current State

### What already exists (verified 2026-03-14)

The codebase already contains **13 test files** covering **all 13 extracted modules**, with **93 passing tests**:

| Module | Test file | Tests |
|--------|-----------|-------|
| `formatting.js` | `formatting.test.ts` | 13 (formatTime, formatDuration, formatPhase, formatLogTime) |
| `html.js` | `html.test.ts` | 9 (escapeHtml, markdownToHtml, sanitizeHttpUrl) |
| `icons.js` | `icons.test.ts` | 7 (getAgentIcon, icon) |
| `constants.js` | `constants.test.ts` | 3 (exported values) |
| `i18n.js` | `i18n.test.ts` | 14 (language switching, translations en/fr) |
| `notifications.js` | `notifications.test.ts` | 6 (collectReviewNotifications lifecycle) |
| `desktopNotifications.js` | `desktopNotifications.test.ts` | tests for shouldNotifyDesktop, getDesktopNotificationPayload |
| `assignee.js` | `assignee.test.ts` | 3 (resolveReviewAssigneeDisplay fallback chain) |
| `loading.js` | `loading.test.ts` | 7 (getLoadingPresentation, getQuietRefreshSectionIdentifiers) |
| `priority.js` | `priority.test.ts` | 3 (rankPendingFixForNowLane sorting, determinism, immutability) |
| `quality.js` | `quality.test.ts` | 7 (getQualityProgress, getQualityTrend) |
| `queueLanes.js` | `queueLanes.test.ts` | 3 (buildQueueLanesModel partitioning) |
| `sessionMetrics.js` | `sessionMetrics.test.ts` | 7 (trackSessionAction, updatePriorityItemTracking, getSessionMetricsSnapshot) |

### What the issue requests but cannot be done yet

The issue acceptance criteria include:

- **"Tests for WebSocket connection management"** — WebSocket logic (`connectWebSocket`, reconnection, message routing) is still **inline** in `index.html` (lines 1497-1562). It has not been extracted into a testable module. This is tracked by **#70** (closed) and **#72** (open).
- **"Tests for localStorage persistence"** — localStorage usage (project list save/load, current project restore, focus strip mode) is still **inline** in `index.html` (lines 1665-1816). Extraction is tracked by **#72** (open).

These cannot be unit-tested until #72 extracts them into standalone modules.

### Conclusion

The **already-completed work covers 3 of 5 acceptance criteria** (formatting utilities, HTML escaping, 80%+ branch coverage on extracted modules). The remaining 2 criteria (WebSocket, localStorage) are **blocked by #72**.

---

## Remaining User Story

**As** a maintainer of the ReviewFlow dashboard,
**I want** to verify that existing dashboard module tests provide sufficient branch coverage and close remaining gaps,
**So that** I can confidently refactor and extend dashboard modules without regressions.

---

## Acceptance Criteria (Gherkin)

### Scenario 1: Branch coverage target met on extracted modules

```gherkin
Given all 13 dashboard modules are extracted in src/interface-adapters/views/dashboard/modules/
When running `yarn coverage` scoped to dashboard module tests
Then branch coverage across all modules is 80% or higher
```

### Scenario 2: Priority ranking edge cases

```gherkin
Given a list of pending-fix merge requests with identical urgency scores and identical timestamps
When rankPendingFixForNowLane is called
Then items are sorted by mrNumber ascending as a tiebreaker
And items without mrNumber fall to the end
```

### Scenario 3: Markdown-to-HTML handles combined formatting

```gherkin
Given a markdown string containing a code block, a list, and a table
When markdownToHtml is called
Then the output contains <pre><code>, <ul><li>, and <table><tr><td> elements
And all user-provided text is HTML-escaped before rendering
```

### Scenario 4: Notification state handles large seen-keys list

```gherkin
Given a notification state with 500 seen recent keys (MAX_RECENT_KEYS)
When a 501st unique recent review arrives
Then the oldest seen key is evicted
And the new review triggers a notification
```

### Scenario 5: Session metrics handle edge case timing

```gherkin
Given a session that started at time T
And a priority item was tracked starting at T+1000
When the priority item is resolved AND replaced by a new item in the same update
Then the resolved item duration is recorded
And the new item tracking starts immediately
```

### Scenario 6: Quality progress handles extreme scores

```gherkin
Given a quality score of 0
When getQualityProgress is called with default target 8
Then progressPercent is 0
And targetDelta is -8.0
And targetDeltaLabel is "-8.0"
```

### Scenario 7: Desktop notification payload rejects unknown kinds

```gherkin
Given a notification with kind "unknownEvent"
When getDesktopNotificationPayload is called
Then it returns null
```

### Scenario 8: Assignee resolution with empty strings

```gherkin
Given a review where assignedBy.displayName is "" and assignedBy.username is ""
And no matching merge request exists in tracked list
When resolveReviewAssigneeDisplay is called
Then it returns "unknown"
```

### Scenario 9: Loading presentation handles all flags active simultaneously

```gherkin
Given loadingState has status=1, reviewFiles=1, stats=1, mrTracking=1
And hasLoadedStatusOnce is true
When getLoadingPresentation is called
Then showGlobalLoading is true (heavy refresh overrides quiet mode)
And isQuietRefresh is false
```

### Scenario 10: i18n handles nested parameter substitution

```gherkin
Given the language is "en"
When t('time.minutesAgo', { minutes: 0 }) is called
Then it returns "0 min ago" (boundary value)
```

---

## Out of Scope

| Item | Reason |
|------|--------|
| WebSocket module tests | WebSocket logic is inline in `index.html`; blocked by #72 |
| localStorage persistence tests | localStorage logic is inline in `index.html`; blocked by #72 |
| Integration tests (browser rendering) | Issue targets unit tests only |
| index.html inline code testing | Cannot unit-test inline `<script>` blocks; requires extraction first |
| New module extraction | That is #72's scope |
| Dashboard presenter tests | No presenter module exists yet; out of scope |
| Visual regression testing | Not requested; different concern |

---

## Technical Notes

### Test location

All tests live in `src/tests/units/interface-adapters/views/dashboard/modules/` mirroring the source structure.

### Test patterns to follow

Dashboard module tests use a specific pattern because modules are **browser JS** (not TypeScript, not compiled):

- Test files are TypeScript (`.test.ts`) importing JS modules via `@/` alias + `.js` extension
- No DOM mocking needed for pure logic modules (formatting, priority, quality, etc.)
- Modules depending on browser globals (`Notification`, `localStorage`) require `vi.stubGlobal()` or equivalent
- Vitest `describe/it/expect` with state-based assertions (Detroit school)

### Modules sorted by gap-closing priority

| Priority | Module | Reason |
|----------|--------|--------|
| 1 | `priority.js` | Complex sorting with multiple tiebreakers; only 3 tests currently |
| 2 | `notifications.js` | State machine with MAX_RECENT_KEYS eviction; 6 tests but no eviction boundary test |
| 3 | `sessionMetrics.js` | 4 exported functions, only 7 tests; `updatePriorityItemTracking` has multiple state transitions |
| 4 | `html.js` | `markdownToHtml` has 12+ regex transforms; only 5 tests on this function |
| 5 | `quality.js` | Edge cases around 0 scores, NaN, Infinity not covered |

---

## Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| #69 — Extract dashboard utility modules | **Closed** | All utility modules available and tested |
| #70 — Extract WebSocket module | **Closed** | WebSocket partially extracted; inline code remains |
| #71 — Extract project loader module | **Closed** | Loader extracted |
| #72 — Extract remaining domain modules | **Open** | **Blocks** WebSocket and localStorage test criteria from issue |

---

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | Can proceed now on coverage gaps; WebSocket/localStorage blocked by #72 | PASS |
| **Negotiable** | Coverage target (80% branch) is negotiable; specific gap-closing tests are flexible | PASS |
| **Valuable** | Catches regressions before they reach the dashboard; enables confident refactoring | PASS |
| **Estimable** | ~2h to close coverage gaps on existing modules; bounded by 13 known modules | PASS |
| **Small** | 93 tests already exist; remaining work is gap analysis + edge case tests | PASS |
| **Testable** | Coverage report provides objective pass/fail; Gherkin scenarios are concrete | PASS |

---

## Suggested Implementation Plan

### Phase 1: Close coverage gaps (actionable now — ~2h)

1. Run `yarn coverage` scoped to dashboard modules — measure current branch coverage
2. Identify branches not covered (early returns, edge cases, boundary values)
3. Add missing edge case tests following priority list above
4. Verify 80%+ branch coverage is met across all modules
5. `yarn verify` passes

### Phase 2: WebSocket + localStorage tests (blocked by #72)

Once #72 extracts WebSocket and localStorage logic into modules:

1. Add tests for WebSocket reconnection logic (max attempts, delay, cleanup)
2. Add tests for localStorage save/load/fallback behavior
3. Update this spec to mark remaining acceptance criteria as done

---

## Definition of Done

- [ ] All existing 93 dashboard module tests pass
- [ ] Branch coverage across all 13 extracted modules is 80%+
- [ ] Edge case tests added for `priority.js` tiebreakers (identical scores, missing fields)
- [ ] Edge case tests added for `notifications.js` MAX_RECENT_KEYS boundary
- [ ] Edge case tests added for `sessionMetrics.js` simultaneous resolve-and-track
- [ ] Edge case tests added for `html.js` combined markdown formatting
- [ ] Edge case tests added for `quality.js` extreme values (0, NaN)
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] No new production code added (test-only change)
