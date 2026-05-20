# Spec #163 — Token Budget Cap with Live Indicator

**Labels**: feature, P1-critical, dashboard, token-accounting, review-execution
**Date**: 2026-05-20
**Status**: implemented

## Implementation

Artefacts (see `docs/reports/163-token-budget-cap.report.md` for the full list and test counts):

- **Entity**: `BudgetConfig` (schema + guard, range 0-600, default 200), `BudgetStatus` type, `BudgetGateway` contract.
- **Use cases**: `GetBudgetStatusUseCase` (multi-localPath sum + injectable `now`), `UpdateBudgetUseCase` (R6 validation), `EnforceBudgetUseCase` (R3 gate).
- **Gateway impl**: `FilesystemBudgetGateway` persisting at `${configDir}/budget.json`.
- **Controller**: `budget.routes.ts` — `GET /api/budget`, `POST /api/budget`, `GET /api/budget/status`.
- **WebSocket**: `broadcastBudgetStatus` (live tile) + `broadcastBudgetExceeded` (toast).
- **Gates**: `gitlab.controller.ts` (fresh + followup), `github.controller.ts`, `mrTrackingAdvanced.routes.ts`.
- **Live trigger**: `broadcastBudgetAfterUsage.ts` invoked in `claudeInvoker.ts` after every `trackTokenUsage.execute`.
- **View**: `src/dashboard/modules/budgetSettings.js` humble object + `src/dashboard/index.html` WS handlers.

Architectural decisions:

- **Multi-localPath sum from day one** (`localPaths: string[]`) so the cap is truly global, not per-repo.
- **DI for all broadcasts**: controllers receive `broadcastBudgetExceeded` via their Dependencies interface; `claudeInvoker` receives `broadcastBudgetStatus` + `getBudgetStatus` via `ClaudeInvokerDependencies`. No hard imports across `frameworks → main`.
- **Pre-enqueue gating only**: in-flight reviews are never killed mid-flight (S9 invariant).
- **R8 initialisation in composition root**: `routes.ts` calls `budgetGateway.load()` once; if `null`, saves the default `{ limitUsd: 200 }` before any gate-using route is registered.

Endpoints:

| Method | Route | Use case |
|---|---|---|
| GET | `/api/budget` | `BudgetGateway.load` (initialised default via R8) |
| POST | `/api/budget` | `UpdateBudgetUseCase` |
| GET | `/api/budget/status?projectPath=<localPath>` | `GetBudgetStatusUseCase` |

---

## Problem Statement

Spec #126 surfaced Claude token cost on the dashboard but did not act on it. Operators can watch the bill grow but cannot put a ceiling on it. A runaway loop (mis-configured webhook, flapping CI, repeated followups) can burn hundreds of dollars before being noticed.

This spec adds a **configurable monthly USD budget**: once consumed cost reaches the cap, new reviews and followups are refused (with a toast informing the operator) until the next calendar month or the cap is raised.

The information must update live so operators see consumption climbing in real time.

---

## User Story

**As a** ReviewFlow operator,
**I want** to set a monthly USD budget for Claude reviews (default $200, max $600) via a slider on the dashboard,
**So that** I cap my spend and get a clear toast when a review is blocked because the budget is reached, with live visibility into current consumption.

---

## Scope and Decisions

| Question | Decision | Why |
|---|---|---|
| Granularity | **Global** (all platforms, all projects) | User wording "200$ par défaut" is singular; matches Anthropic billing scope |
| Window | **Calendar month rolling** | Matches Anthropic billing cycle; resets on the 1st automatically |
| Counted cost | `sum(TokenUsageRecord.usage.costUsd) where recordedAt >= start of current month` | Reuses existing data from Spec #126 |
| Floor / default / ceiling | **0 / 200 / 600 USD** | Per user instruction |
| Slider granularity | **10 USD steps** | Sensible UX, no over-precision |
| Enforcement point | **Before `enqueueReview()`** | In-flight reviews are not killed mid-flight |
| Persistence | `~/.claude-review/budget.json` | Same pattern as existing config (`configDir.ts`) |
| Live update | **WebSocket** push on every recorded `TokenUsage` | Reuses `src/main/websocket.ts` broadcast pattern |
| Reject signal | New WebSocket message type `budget-exceeded` carrying the blocked job context | Dashboard turns it into a toast |
| Open question (deferred) | Per-project budgets, alerts at 80 % | Not in this spec — single global cap first |

---

## Business Rules

1. **R1** — A `BudgetConfig` has exactly one `limitUsd` field, bounded `0 <= limit <= 600`, default `200`.
2. **R2** — `BudgetStatus` returns `{ limitUsd, consumedUsd, remainingUsd, percentUsed, exceeded, periodStart }` where `periodStart` is the first day of the current calendar month at 00:00 UTC.
3. **R3** — A review or followup attempt is **rejected** when `consumedUsd >= limitUsd` (`exceeded === true`). The job is **not enqueued** and the webhook returns HTTP 200 with `status: 'rejected', reason: 'budget-exceeded'`.
4. **R4** — On rejection, a `budget-exceeded` WebSocket event is broadcast carrying `{ mrNumber, platform, projectPath, limitUsd, consumedUsd }`.
5. **R5** — Setting the budget below the current `consumedUsd` is **allowed** (operator may want to stop further spend immediately). The next attempt is rejected.
6. **R6** — Setting the budget above the ceiling (> 600) or below the floor (< 0) returns HTTP 400 with the offending bound.
7. **R7** — On every successful `TrackTokenUsageUseCase` invocation, a `budget-status` WebSocket event is broadcast carrying the recomputed status — that is the live signal.
8. **R8** — When `BudgetConfig` does not exist on disk on startup, it is initialised to `{ limitUsd: 200 }` and persisted.

---

## Gherkin Scenarios

### Feature: Configure the monthly budget

#### Scenario 1: Default budget on first boot

```gherkin
Given no budget.json file exists in ~/.claude-review/
When the server starts
Then a budget.json file is created with limitUsd = 200
  And GET /api/budget returns { limitUsd: 200 }
```

#### Scenario 2: Move the slider to 350

```gherkin
Given the current budget is { limitUsd: 200 }
When I POST /api/budget with { limitUsd: 350 }
Then the response is { success: true, limitUsd: 350 }
  And subsequent GET /api/budget returns { limitUsd: 350 }
  And budget.json on disk is updated
```

#### Scenario 3: Try to push the budget above the ceiling

```gherkin
Given the current budget is { limitUsd: 200 }
When I POST /api/budget with { limitUsd: 750 }
Then the response status is 400
  And the response body contains { success: false, error: "limitUsd must be between 0 and 600" }
  And the on-disk budget remains 200
```

### Feature: Live status

#### Scenario 4: Status reflects current consumption

```gherkin
Given the current budget is { limitUsd: 200 }
  And recorded TokenUsageRecord costs in the current month sum to $48.50
When I GET /api/budget/status
Then the response contains limitUsd 200, consumedUsd 48.5, remainingUsd 151.5, percentUsed 24.25, exceeded false
```

#### Scenario 5: Live push after a recorded usage

```gherkin
Given a connected WebSocket client
  And the current budget is { limitUsd: 200 }
  And current consumedUsd is $48.50
When TrackTokenUsageUseCase records a new $1.50 usage
Then a WebSocket message of type "budget-status" is broadcast
  And the message payload contains consumedUsd 50.0, percentUsed 25.0
```

### Feature: Enforce the cap

#### Scenario 6: Block a fresh review when over budget

```gherkin
Given the current budget is { limitUsd: 200 }
  And consumedUsd is $200.10
When a GitLab merge-request webhook arrives requesting a fresh review
Then the response status is 200 with body { status: "rejected", reason: "budget-exceeded" }
  And enqueueReview is NOT called
  And a WebSocket message of type "budget-exceeded" is broadcast carrying mrNumber, platform, projectPath, limitUsd 200, consumedUsd 200.10
```

#### Scenario 7: Block a followup when over budget

```gherkin
Given the current budget is { limitUsd: 200 }
  And consumedUsd is $200.10
When a push webhook would normally trigger a followup
Then the followup is NOT enqueued
  And a "budget-exceeded" WebSocket message is broadcast
```

#### Scenario 8: Allow when within budget

```gherkin
Given the current budget is { limitUsd: 200 }
  And consumedUsd is $199.99
When a GitLab merge-request webhook arrives
Then enqueueReview is called
  And no "budget-exceeded" message is broadcast
```

#### Scenario 9: An in-flight review at the moment of exceedance is not killed

```gherkin
Given a review job is currently running
  And consumedUsd hits exactly $200.00 mid-flight
When the running job records additional usage
Then the running job continues to completion
  And the NEXT incoming webhook is rejected with reason "budget-exceeded"
```

#### Scenario 10: New calendar month resets the period

```gherkin
Given consumedUsd was $200.50 on 2026-05-31
When the current date becomes 2026-06-01
Then BudgetStatus.consumedUsd recomputes to $0 (only records with recordedAt >= 2026-06-01)
  And new reviews are accepted again
```

---

## Non-Goals

- Per-project budgets
- Alerts at 50/80/95 %
- Email or Slack notifications
- Budget history graphs
- Carry-over of unused budget
- Per-model sub-budgets

These can come in follow-up specs if needed.

---

## Architectural Mapping

Bounded context: **token-accounting** (consumption tracking) + **review-execution** (the gate).

| Layer | Artifact | Path |
|---|---|---|
| Entity | `BudgetConfig` schema + guard | `src/modules/token-accounting/entities/budget/budgetConfig.{schema,guard}.ts` |
| Entity | `BudgetStatus` type | `src/modules/token-accounting/entities/budget/budgetStatus.ts` |
| Entity | `BudgetGateway` contract | `src/modules/token-accounting/entities/budget/budget.gateway.ts` |
| Use case | `GetBudgetStatusUseCase` | `src/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.ts` |
| Use case | `UpdateBudgetUseCase` | `src/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.ts` |
| Use case | `EnforceBudgetUseCase` (`canAccept(): boolean`) | `src/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.ts` |
| Gateway impl | Filesystem persistence (`budget.json`) | `src/modules/token-accounting/interface-adapters/gateways/budget/budget.filesystem.gateway.ts` |
| Controller | HTTP `/api/budget`, `/api/budget/status` | `src/modules/token-accounting/interface-adapters/controllers/http/budget.routes.ts` |
| WebSocket | Add `broadcastBudgetStatus()` and `broadcastBudgetExceeded()` | `src/main/websocket.ts` |
| Gating | Insert `EnforceBudgetUseCase.canAccept()` before each `enqueueReview()` | gitlab.controller.ts, github.controller.ts, mrTrackingAdvanced.routes.ts |
| Live trigger | Hook `broadcastBudgetStatus()` into `TrackTokenUsageUseCase` (via callback or direct call from caller) | composition root |
| View | New dashboard module `budgetSettings.js` (slider + live gauge) | `src/dashboard/modules/budgetSettings.js` |
| View | Toast handler for `budget-exceeded` | existing `notifications.js` or `desktopNotifications.js` |
| Composition root | Wire BudgetGateway, use cases, routes | `src/main/routes.ts` |

---

## Acceptance Test

`src/tests/acceptance/tokenBudgetCap.acceptance.test.ts` — covers scenarios 2, 3, 6, 8, 10 with stub gateways. Lives RED until end of implementation.

---

## Done When

- All 10 Gherkin scenarios are covered by passing tests.
- A new acceptance test is GREEN.
- Slider on dashboard updates in real time when a review records usage.
- A blocked webhook produces a toast on the dashboard.
- `yarn verify` is green.
- Spec status: `implemented`. Tracker updated. Report at `docs/reports/163-token-budget-cap.report.md`.
