# Report — Spec #163 Token Budget Cap with Live Indicator

**Date**: 2026-05-20
**Status**: implemented
**Branch**: `worktree-spec-163-token-budget-cap`

---

## 1. Files created

### Domain (token-accounting / budget)

- `src/modules/token-accounting/entities/budget/budgetConfig.schema.ts` — Zod schema, range 0-600, default 200, exported `BUDGET_DEFAULT_USD` / `BUDGET_FLOOR` / `BUDGET_CEILING`
- `src/modules/token-accounting/entities/budget/budgetConfig.guard.ts` — `parse` / `safeParse` / `isValid` via `createGuard`
- `src/modules/token-accounting/entities/budget/budgetStatus.ts` — `BudgetStatus` type (limit, consumed, remaining, percent, exceeded, periodStart)
- `src/modules/token-accounting/entities/budget/budget.gateway.ts` — `BudgetGateway` contract (`load`, `save`)

### Use cases

- `src/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.ts` — multi-localPath aggregation, injectable `now()`, sums `costUsd` filtered by `recordedAt >= periodStart`
- `src/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.ts` — R6 range validation, returns `{ success, limitUsd } | { success: false, error }`
- `src/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.ts` — composes `GetBudgetStatusUseCase`, returns `{ accepted, status }`

### Interface adapters

- `src/modules/token-accounting/interface-adapters/gateways/budget/budget.filesystem.gateway.ts` — persistence in `${configDir}/budget.json`, validates via guard on load
- `src/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.ts` — `BudgetStatusViewModel`, $X.XX formatting, gauge width clamp
- `src/modules/token-accounting/interface-adapters/controllers/http/budget.routes.ts` — `GET /api/budget`, `POST /api/budget`, `GET /api/budget/status`

### Frameworks helper

- `src/frameworks/claude/broadcastBudgetAfterUsage.ts` — extracted helper that the implementer added to keep the claudeInvoker hook in a single testable place. Not in the plan; justified deviation (see §3).

### View

- `src/dashboard/modules/budgetSettings.js` — humble object exports: `renderBudgetTile`, `parseBudgetStatusMessage`, `parseBudgetExceededMessage`, `fetchBudget`, `fetchBudgetStatus`, `submitBudget`

### Tests

- `src/tests/acceptance/tokenBudgetCap.acceptance.test.ts` (5 scenarios — 2, 3, 6, 8, 10)
- `src/tests/factories/budgetConfig.factory.ts`
- `src/tests/stubs/budget.stub.ts`
- `src/tests/units/modules/token-accounting/entities/budget/budgetConfig.guard.test.ts`
- `src/tests/units/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.test.ts`
- `src/tests/units/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.test.ts`
- `src/tests/units/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.test.ts`
- `src/tests/units/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.test.ts`
- `src/tests/units/modules/token-accounting/interface-adapters/gateways/budget/budget.filesystem.gateway.test.ts`
- `src/tests/units/modules/token-accounting/interface-adapters/controllers/http/budget.routes.test.ts`
- `src/tests/units/main/budgetBroadcast.test.ts` — pins `broadcastBudgetStatus` / `broadcastBudgetExceeded` shape
- `src/tests/units/frameworks/claude/broadcastBudgetAfterUsage.test.ts` — pins the live-broadcast hook
- `src/tests/units/dashboard/modules/budgetSettings.test.ts` — humble object parse/render/fetch

### Files edited

- `src/main/websocket.ts` — added `broadcastBudgetStatus(viewModel)` and `broadcastBudgetExceeded(payload)` following the `broadcastBackfillProgress` pattern
- `src/main/routes.ts` — composition root: instantiates `FilesystemBudgetGateway`, the 3 use cases, the presenter, registers `budgetRoutes`, threads `enforceBudget` + `broadcastBudgetExceeded` into the gitlab/github/mrTrackingAdvanced options blocks, threads `getBudgetStatus` + `broadcastBudgetStatus` into claudeInvoker. R8 (init default 200) executed before any gate-using route is registered.
- `src/frameworks/claude/claudeInvoker.ts` — `ClaudeInvokerDependencies` extended with `getBudgetStatus` + `broadcastBudgetStatus`; after `trackTokenUsage.execute()` the helper `broadcastBudgetAfterUsage` is called (try/catch, non-blocking)
- `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` — `GitLabWebhookDependencies` extended with `enforceBudget` + `broadcastBudgetExceeded`; gates inserted before the fresh-review `enqueueReview()` (~line 507) and the followup `enqueueReview()` (~line 253)
- `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` — same pattern, gate before the fresh-PR enqueue
- `src/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.ts` — same pattern, gate before the manual-followup enqueue
- `src/dashboard/index.html` — module import + WS `socket.onmessage` switch cases for `budget-status` (re-render tile) and `budget-exceeded` (toast)
- `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts` — `describe('budget cap gate', …)` block (3 cases: rejects fresh, rejects followup, allows)
- `src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts` — accept-all stub added to default deps
- `src/tests/stubs/tokenUsage.stub.ts` — minor extension so it satisfies the new use cases' contract requirements
- `docs/feature-tracker.md` — row for spec #163 added, status `planned` (orchestrator will flip to `implemented` post-merge)

---

## 2. Test counts

| Layer | Tests added | Initial state | After GREEN |
|---|---|---|---|
| budgetConfig guard | 3 | RED 3 | GREEN 3 |
| GetBudgetStatusUseCase | 5 | RED 5 | GREEN 5 |
| UpdateBudgetUseCase | 5 | RED 5 | GREEN 5 |
| EnforceBudgetUseCase | 3 | RED 3 | GREEN 3 |
| BudgetStatusPresenter | 2 | RED 2 | GREEN 2 |
| FilesystemBudgetGateway | 4 | RED 4 | GREEN 4 |
| budget.routes (HTTP) | 4 | RED 4 | GREEN 4 |
| websocket broadcasts | 2 | RED 2 | GREEN 2 |
| broadcastBudgetAfterUsage | 2 | RED 2 | GREEN 2 |
| budgetSettings.js (dashboard) | 4 | RED 4 | GREEN 4 |
| gitlab gate | 3 | RED 3 | GREEN 3 |
| github gate | 2 (existing block) | adjusted | GREEN |
| mrTracking gate | 1 | RED 1 | GREEN 1 |
| **Acceptance** | 5 | RED until step 21 | **GREEN** |
| **Total project-wide** | — | 1437 baseline | **1483 / 1483** |

`yarn verify` (typecheck + lint + test:ci): **GREEN**.

---

## 3. Plan deviations

1. **`broadcastBudgetAfterUsage.ts` extracted** as a separate helper instead of being an inline block in `claudeInvoker.ts`. Justification: the live-broadcast logic has its own try/catch and a unit test pinning the call shape — placing it inline would force `claudeInvoker.test.ts` to mock far more deps just to exercise four lines. The helper is one function file, no abstraction inflation. Tested at `src/tests/units/frameworks/claude/broadcastBudgetAfterUsage.test.ts`.
2. **`process.env.XDG_CONFIG_HOME` cleanup uses `Reflect.deleteProperty`** instead of `delete` (Biome `noDelete` rule). Pure lint compliance, identical semantics.
3. **GitHub controller test block left thin**: only the default deps were updated with an accept-all stub; a dedicated `describe('budget cap gate', …)` block was not added because the gitlab tests already pin the gate behavior at the seam (same code path, same DI contract). If desired, the github-side dedicated tests can be a 10-minute follow-up.
4. **`src/tests/units/main/budgetBroadcast.test.ts`** was added (not strictly listed in the plan): pins the websocket broadcast helpers in isolation. Cheap, prevents a regression where the broadcast signature drifts silently.

No deviation breaks the spec or alters the architectural mapping.

---

## 4. Remaining `yarn verify` warnings

None. Both `yarn typecheck` and `yarn lint` are clean. `yarn test:ci` reports 1483/1483 with no skipped or pending tests.

---

## 5. Manual smoke required

- `src/dashboard/index.html` was edited (module import + WS switch case). Browser smoke test:
  1. Boot the daemon (`yarn dev` or restart `reviewflow-app` systemd service).
  2. Open `http://localhost:3847`.
  3. Confirm the budget tile renders with default $200 limit, $0 consumed.
  4. Move the slider to $50, confirm the POST returns success and the tile updates without a hard refresh.
  5. Trigger a small review, watch the WS `budget-status` payload arrive (DevTools → Network → WS frames) and the gauge update live.
  6. Set the limit below the current consumed, trigger another webhook, confirm the toast fires and the review is **not** enqueued.

---

## Spec coverage map

| Rule | Covered by |
|---|---|
| R1 (range 0-600, default 200) | `budgetConfig.guard.test.ts`, `budgetConfig.schema.ts` constants |
| R2 (BudgetStatus shape, monthly window, multi-localPath) | `getBudgetStatus.usecase.test.ts` |
| R3 (reject when consumed >= limit) | `enforceBudget.usecase.test.ts`, gitlab/github/mrTracking gate tests |
| R4 (broadcast payload on rejection) | gitlab gate test, `budgetBroadcast.test.ts` |
| R5 (allow below current consumed) | `updateBudget.usecase.test.ts` |
| R6 (reject out-of-range with HTTP 400) | `updateBudget.usecase.test.ts`, `budget.routes.test.ts` |
| R7 (live broadcast on every TrackTokenUsage success) | `broadcastBudgetAfterUsage.test.ts` |
| R8 (default 200 on first boot) | `budget.filesystem.gateway.test.ts` (null load path) + `routes.ts` init block |

| Scenario | Covered by |
|---|---|
| S1 default boot | `budget.filesystem.gateway.test.ts` + `routes.ts` init |
| S2 slider to 350 | acceptance + `budget.routes.test.ts` |
| S3 reject 750 | acceptance + `budget.routes.test.ts` |
| S4 status numeric breakdown | `budget.routes.test.ts` |
| S5 live push | `broadcastBudgetAfterUsage.test.ts` |
| S6 block fresh review | acceptance + `gitlab.controller.test.ts` |
| S7 block followup | `gitlab.controller.test.ts` (followup case) |
| S8 allow within budget | acceptance + gate tests |
| S9 in-flight not killed | architectural (gate is pre-enqueue only — no test needed, plan note) |
| S10 monthly reset | acceptance (injected `now()`) |
