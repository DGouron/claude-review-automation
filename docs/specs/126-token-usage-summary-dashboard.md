# Spec #126 — Token Usage Summary on Dashboard

**Labels**: enhancement, P2-important, dashboard, token-accounting
**Date**: 2026-05-20

---

## Problem Statement

The `SummarizeTokenUsageUseCase` was implemented in the Token Accounting bounded context — it can aggregate `usage.jsonl` records into a `TokenUsageSummary` (total input/output tokens, cache reads/creations, total cost in USD, per-model breakdown). It is **wired to nothing**: no HTTP route, no MCP tool, no presenter, no UI. The cost data is recorded but unreachable for users.

This was identified as a 🔴 High hot spot during the 2026-05-19 Event Storming on the Token Accounting bounded context (`docs/ddd/event-storming/token-accounting.md`).

**User impact**: ReviewFlow operators have no way to see what their Claude reviews are costing them per project. As model selection (Sonnet vs Opus) impacts cost meaningfully, this is a blind spot for cost optimization.

---

## User Story

**As** a ReviewFlow operator,
**I want** to see Claude token consumption and dollar cost per project on the dashboard, broken down by model,
**So that** I can monitor review cost, validate model-routing decisions, and identify when consumption spikes.

---

## Scope

| Layer | New artifact |
|---|---|
| **Entity** | None — `TokenUsage`, `TokenUsageRecord`, `TokenUsageSummary` already exist |
| **Use case** | None — `SummarizeTokenUsageUseCase` already exists |
| **Gateway impl** | None — `FilesystemTokenUsageGateway` already exists |
| **HTTP controller** | `tokenUsage.routes.ts` — `GET /api/token-usage/summary` |
| **Presenter** | `tokenUsageSummary.presenter.ts` — transforms `TokenUsageSummary` into a dashboard-friendly `TokenUsageSummaryViewModel` |
| **View** | `src/dashboard/modules/tokenUsage.js` — fetches the summary and renders a tile |
| **View integration** | Tile registered in the main dashboard (`index.html` or dashboard entry script) |
| **Composition root** | Wire the route into `src/main/routes.ts` |

### Open Host Service relation closed

Per the Event Storming context map, this closes the **Customer-Supplier / Open Host Service** relation from Token Accounting → Statistics & Insights / Dashboard that was previously marked as *Separate Ways (intended Customer-Supplier — link missing)*.

---

## Gherkin Scenarios

### Feature: Token usage summary endpoint

#### Scenario 1: Summary for a project with recorded usage (nominal)

```gherkin
Given the project at "/path/to/project" has 3 recorded TokenUsageRecord entries
  And one record used model "claude-sonnet-4-6" with cost $0.10
  And two records used model "claude-opus-4-7" with cost $0.30 each
When the dashboard requests GET /api/token-usage/summary?projectPath=/path/to/project
Then the response status is 200
  And the response body contains totalCostUsd $0.70
  And the response body contains recordCount 3
  And the response body's byModel field contains both model names
  And each byModel entry contains count and costUsd
```

#### Scenario 2: Summary for a project with no usage records

```gherkin
Given the project at "/path/to/project" has no TokenUsageRecord entries
When the dashboard requests GET /api/token-usage/summary?projectPath=/path/to/project
Then the response status is 200
  And the response body contains recordCount 0
  And the response body contains totalCostUsd 0
  And the response body contains an empty byModel object
```

#### Scenario 3: Summary filtered by date

```gherkin
Given the project has TokenUsageRecord entries from 2026-05-01 and 2026-05-15
When the dashboard requests GET /api/token-usage/summary?projectPath=/path&since=2026-05-10
Then the response status is 200
  And only the 2026-05-15 record is included in the totals
```

#### Scenario 4: Missing projectPath parameter

```gherkin
Given a request with no projectPath parameter
When the dashboard requests GET /api/token-usage/summary
Then the response status is 400
  And the response body contains an error message indicating projectPath is required
```

### Feature: Dashboard tile

#### Scenario 5: Tile renders the summary

```gherkin
Given the dashboard tokenUsage module fetches a summary with totalCostUsd $1.23 and 4 records
When the module renders the tile
Then the tile shows the dollar cost prominently ("$1.23")
  And the tile shows the record count ("4 reviews")
  And the tile lists each model with its count and cost
```

#### Scenario 6: Tile renders empty state

```gherkin
Given the summary has recordCount 0
When the module renders the tile
Then the tile shows a friendly empty-state message (e.g. "No reviews yet")
  And no model breakdown is shown
```

---

## Architecture Notes

### Presenter

`TokenUsageSummary` (use case output) → `TokenUsageSummaryViewModel`:

```ts
type TokenUsageSummaryViewModel = {
  totalCostUsd: string;          // formatted: "$1.23"
  recordCount: number;
  totalTokens: number;           // sum of input + output (cache excluded for clarity)
  models: ModelBreakdownItem[];  // sorted by costUsd desc
  isEmpty: boolean;
};

type ModelBreakdownItem = {
  name: string;
  count: number;
  costUsd: string;               // formatted
  costShare: string;             // percentage: "57%"
};
```

### Composition root wiring

```ts
await app.register(tokenUsageRoutes, {
  summarizeTokenUsage: new SummarizeTokenUsageUseCase(new FilesystemTokenUsageGateway()),
  presenter: new TokenUsageSummaryPresenter(),
  logger: deps.logger,
});
```

(`FilesystemTokenUsageGateway` is instantiated here in the composition root — consistent with HS-6 cleanup.)

### Dashboard integration

A single new tile, placed alongside the existing project stats tiles. Module follows the conventions of `statsCharts.js` and `mrSheet.js` (humble object — fetch + render only).

---

## Status: implemented
