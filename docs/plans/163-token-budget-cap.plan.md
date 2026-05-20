# Plan: spec-163 Token Budget Cap with Live Indicator

> Source spec: `docs/specs/163-token-budget-cap.md`
> Bounded context: `token-accounting` (consumption + cap) and three call sites in `platform-integration` / `tracking` (the gates).
> Status: planned.

---

## Anti-overengineering note

Three use cases is the minimum that the 10 scenarios demand:

- `GetBudgetStatusUseCase` — drives GET /api/budget/status (scenarios 1, 4, 10) and feeds the live broadcast (R7).
- `UpdateBudgetUseCase` — owns R1/R6 range validation, drives POST /api/budget (scenarios 2, 3).
- `EnforceBudgetUseCase` — owns R3 (the cap decision), is the seam tested in scenarios 6/7/8/9.

Splitting them lets each be tested in isolation with a `StubBudgetGateway` + `StubTokenUsageGateway`, and lets the three webhook gates depend only on `EnforceBudgetUseCase.canAccept()`.

`BudgetConfig` is one numeric field — it is wrapped in a schema/guard only because R6 mandates explicit `0 <= limit <= 600` boundary checks (already a Zod one-liner). No value object, no class.

`BudgetStatus` is a plain `type` (derived data, no behaviour).

Total new files: 18 production + tests (under the 20-file ceiling). No phased split needed.

---

## Walking skeleton

Smallest vertical slice that proves the end-to-end loop:

1. `BudgetConfig` schema + guard (R1, R6).
2. `BudgetStatus` type.
3. `BudgetGateway` contract (`load()`, `save()`).
4. `GetBudgetStatusUseCase` (sums `costUsd` from `TokenUsageGateway.loadAll()` filtered by `recordedAt >= periodStart`).
5. `EnforceBudgetUseCase` (`canAccept(): Promise<{ accepted: boolean; status: BudgetStatus }>`).
6. Acceptance test (scenarios 2, 3, 6, 8, 10) — RED.
7. Filesystem `BudgetGateway` impl on `~/.config/reviewflow/budget.json`.
8. HTTP `/api/budget`, `/api/budget/status` (scenarios 1, 2, 3, 4).
9. WebSocket `broadcastBudgetStatus` / `broadcastBudgetExceeded`.
10. Wire `EnforceBudgetUseCase.canAccept()` at the three gate points.
11. Hook `broadcastBudgetStatus()` into `claudeInvoker.ts` right after `trackTokenUsage.execute()` (R7).
12. Dashboard `budgetSettings.js` (slider + gauge + toast).
13. Acceptance test — GREEN.

---

## Structured plan

```
PLAN:
  scope: token-budget-cap
  is_new_module: false  # extends src/modules/token-accounting/

  ENTITIES:
    - name: BudgetConfig
      file: src/modules/token-accounting/entities/budget/budgetConfig.schema.ts
      guard: src/modules/token-accounting/entities/budget/budgetConfig.guard.ts
      gateway_contract: src/modules/token-accounting/entities/budget/budget.gateway.ts
      test: src/tests/units/modules/token-accounting/entities/budget/budgetConfig.guard.test.ts
      factory: src/tests/factories/budgetConfig.factory.ts
      notes:
        - Zod schema: { limitUsd: z.number().min(0).max(600) }
        - Default literal: BUDGET_DEFAULT_USD = 200, BUDGET_FLOOR = 0, BUDGET_CEILING = 600
        - Guard exports parse/safeParse/isValid (createGuard from @/shared/foundation/guard.base.js)

    - name: BudgetStatus
      file: src/modules/token-accounting/entities/budget/budgetStatus.ts
      test: (no dedicated unit test — covered through GetBudgetStatusUseCase tests)
      notes:
        - Pure type alias derived in R2:
          { limitUsd, consumedUsd, remainingUsd, percentUsed, exceeded, periodStart }
        - periodStart is an ISO string (first day of current calendar month at 00:00 UTC)

  USECASES:
    - name: GetBudgetStatusUseCase
      file: src/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.ts
      test: src/tests/units/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.test.ts
      type: query
      input: { localPath: string; now?: Date }   # now is injectable for scenario 10
      output: Promise<BudgetStatus>
      dependencies:
        - BudgetGateway (load)
        - TokenUsageGateway (loadAll) — REUSE existing, do NOT duplicate fs read
      pinned behaviours (RED tests):
        - "returns default 200 limit when gateway returns null" (R8 read side)
        - "sums only TokenUsageRecord.usage.costUsd where recordedAt >= start of current month" (R2 + scenario 4)
        - "computes percentUsed with 2 decimals, exceeded true when consumed >= limit" (scenario 4)
        - "uses injected now() so calendar month transition is testable" (scenario 10)
        - "remainingUsd is clamped at 0 when consumed > limit" (scenario 6 status payload)

    - name: UpdateBudgetUseCase
      file: src/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.ts
      test: src/tests/units/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.test.ts
      type: command
      input: { limitUsd: number }
      output: Promise<UpdateBudgetResult>  # { success: true, limitUsd } | { success: false, error: string }
      dependencies:
        - BudgetGateway (save)
      pinned behaviours (RED tests):
        - "saves limit 350 and returns success" (scenario 2)
        - "rejects 750 with error 'limitUsd must be between 0 and 600'" (scenario 3) — error message in English per coding-standards (logs/errors English)
        - "rejects -10 with the same range error" (R6 floor side)
        - "allows setting limit below current consumedUsd" (R5)
        - "does NOT persist when validation fails" (scenario 3 assertion: on-disk budget remains 200)

    - name: EnforceBudgetUseCase
      file: src/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.ts
      test: src/tests/units/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.test.ts
      type: query (read-only gate)
      input: { localPath: string }
      output: Promise<{ accepted: boolean; status: BudgetStatus }>
      dependencies:
        - GetBudgetStatusUseCase (composition — pull status, then evaluate R3)
      pinned behaviours (RED tests):
        - "returns accepted=true when consumed < limit" (scenario 8)
        - "returns accepted=false when consumed >= limit, status.exceeded === true" (scenario 6)
        - "passes status through unchanged so callers can broadcast it" (R4 broadcast payload source)

  GATEWAYS:
    - name: BudgetGateway
      contract: src/modules/token-accounting/entities/budget/budget.gateway.ts
      implementation: src/modules/token-accounting/interface-adapters/gateways/budget/budget.filesystem.gateway.ts
      stub: src/tests/stubs/budget.stub.ts
      methods:
        - load(): Promise<BudgetConfig | null>   # null when file missing
        - save(config: BudgetConfig): Promise<void>
      pinned behaviours (RED tests on filesystem impl):
        - "load() returns null when ~/.config/reviewflow/budget.json does not exist" (scenario 1 prerequisite)
        - "save() writes {limitUsd:350} to ~/.config/reviewflow/budget.json and creates dir" (scenario 2)
        - "save() pretty-prints JSON" (operator readability — cheap)
        - "load() validates the file content via budgetConfig.guard.safeParse() and returns null on corruption"
      notes:
        - Path = join(getConfigDir(), 'budget.json')  (reuses @/shared/services/configDir.js)
        - Stub used in HTTP route tests + use case tests

    - name: (existing) TokenUsageGateway
      reused: src/modules/token-accounting/entities/tokenUsage/tokenUsage.gateway.ts
      notes:
        - GetBudgetStatusUseCase injects this; uses gateway.loadAll(localPath)
        - NO new filesystem reading code — explicit constraint from the request

  CONTROLLERS:
    - name: budgetRoutes (HTTP)
      file: src/modules/token-accounting/interface-adapters/controllers/http/budget.routes.ts
      test: src/tests/units/modules/token-accounting/interface-adapters/controllers/http/budget.routes.test.ts
      dependencies:
        - getBudgetStatus: GetBudgetStatusUseCase
        - updateBudget: UpdateBudgetUseCase
        - budgetGateway: BudgetGateway        # for GET /api/budget (raw config, not status)
        - getRepositories: () => RepositoryConfig[]  # to pick a default localPath for status sum
      endpoints:
        - GET /api/budget          -> { limitUsd } (raw config — scenarios 1, 2)
        - POST /api/budget         -> { success, limitUsd } | 400 { success: false, error } (scenarios 2, 3)
        - GET /api/budget/status   -> BudgetStatus (scenario 4)
      pinned behaviours (RED tests):
        - "GET /api/budget returns { limitUsd: 200 } on first call (gateway returns null, route initialises default)" (scenario 1)
        - "POST /api/budget {limitUsd: 350} returns 200 { success: true, limitUsd: 350 }" (scenario 2)
        - "POST /api/budget {limitUsd: 750} returns 400 { success: false, error: '...' }" (scenario 3)
        - "GET /api/budget/status returns numeric breakdown derived from stub TokenUsageGateway" (scenario 4)
      notes:
        - localPath selection: routes accept a `projectPath` query param (consistent with tokenUsage.routes.ts).
          If omitted, default to the first enabled repository.localPath (read via getRepositories()).
          This is acceptable scope-wise: spec R2 sums "all records in the current month" — and `loadAll` is keyed by localPath because usage files are per-project (`.claude/reviews/usage.jsonl`).
        - SCOPE FLAG: see Risk #1 — global cap vs per-localPath file storage requires a small fan-out across repositories. Plan keeps it single-localPath for the walking skeleton; risk doc covers extension.

    - name: (gates — no new controller files, only edits)
      files to edit:
        - src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts
        - src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
        - src/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.ts
      changes:
        - Add `enforceBudget: EnforceBudgetUseCase` and `broadcastBudgetExceeded: (payload) => void` to each *WebhookDependencies* interface
          (and to `MrTrackingAdvancedRoutesOptions`).
        - Insert `const decision = await deps.enforceBudget.execute({ localPath: ... });`
          right before the three `enqueueReview(...)` call sites (lines noted in spec).
        - On `!decision.accepted`:
            - log warn "Budget exceeded, review not enqueued"
            - call `deps.broadcastBudgetExceeded({ mrNumber, platform, projectPath, limitUsd, consumedUsd })`
            - `reply.status(200).send({ status: 'rejected', reason: 'budget-exceeded' })`
            - return (do NOT call enqueueReview)
      pinned behaviours (RED tests, mirror tests for each controller):
        - "gitlab.controller — rejects fresh review and emits broadcast when enforceBudget returns accepted=false" (scenario 6)
        - "gitlab.controller — rejects followup at line ~249 with same wiring" (scenario 7)
        - "gitlab.controller — calls enqueueReview when accepted=true" (scenario 8)
        - "github.controller — same triad" (scenario 6/7/8 mirrored on GitHub side)
        - "mrTrackingAdvanced.routes — POST /api/mr-tracking/followup returns 200 rejected when budget exceeded"

  PRESENTERS:
    - name: BudgetStatusPresenter
      file: src/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.ts
      test: src/tests/units/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.test.ts
      input: BudgetStatus
      output: BudgetStatusViewModel
      viewmodel shape:
        { limitUsdFormatted: string   # "$200.00"
          consumedUsdFormatted: string # "$48.50"
          remainingUsdFormatted: string # "$151.50"
          percentUsedFormatted: string # "24.25%"
          gaugeWidthPercent: number    # min(100, percentUsed) — pure number for CSS width
          exceeded: boolean
          periodStart: string }
      pinned behaviours (RED tests):
        - "formats every USD field as $X.XX" (UI consistency)
        - "clamps gaugeWidthPercent at 100 when consumed > limit" (visual cap)
      notes:
        - This presenter is the WebSocket broadcast payload AND the GET /api/budget/status payload — single source of presentation truth.

  VIEWS:
    - name: budgetSettings (dashboard module)
      file: src/dashboard/modules/budgetSettings.js
      test: src/tests/units/dashboard/modules/budgetSettings.test.ts
      humble object exports:
        - renderBudgetTile(viewModel): string                    # slider + live gauge HTML
        - parseBudgetStatusMessage(rawWsMessage): viewModel|null # WS payload -> VM (defensive parse)
        - parseBudgetExceededMessage(rawWsMessage): payload|null # WS toast payload
        - fetchBudget(fetchImpl?): Promise<{ limitUsd }>         # GET /api/budget
        - fetchBudgetStatus(projectPath, fetchImpl?): Promise<BudgetStatusViewModel>
        - submitBudget(limitUsd, fetchImpl?): Promise<UpdateResult>
      pinned behaviours (RED tests):
        - "renderBudgetTile returns HTML containing the formatted limit, consumed, gauge width" (visual presence)
        - "parseBudgetStatusMessage returns null when type !== 'budget-status'"
        - "parseBudgetExceededMessage extracts mrNumber, limitUsd, consumedUsd"
        - "submitBudget POSTs JSON {limitUsd: 350} and returns parsed response"
      notes:
        - Mirrors src/dashboard/modules/tokenUsage.js style: JSDoc-typed, escapeHtml helper, no DOM access.
        - Toast handling: budgetSettings.js exports parseBudgetExceededMessage; index.html WebSocket handler dispatches to it and calls existing toast UI in notifications.js (no new toast framework).
        - Slider step = 10 USD, range 0-600 (R1).
        - index.html addition: <script type="module"> import + WS message switch case for 'budget-status' and 'budget-exceeded'. See WIRING.

  WIRING:
    routes (src/main/routes.ts additions):
      - import { budgetRoutes } from '@/modules/token-accounting/interface-adapters/controllers/http/budget.routes.js'
      - import { FilesystemBudgetGateway } from '@/modules/token-accounting/interface-adapters/gateways/budget/budget.filesystem.gateway.js'
      - import { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js'
      - import { UpdateBudgetUseCase } from '@/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.js'
      - import { EnforceBudgetUseCase } from '@/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.js'
      - import { broadcastBudgetStatus, broadcastBudgetExceeded } from '@/main/websocket.js'
      - Instantiation block placed alongside the existing tokenUsage wiring (~ lines 102-105):
          const budgetGateway = new FilesystemBudgetGateway();
          const tokenUsageGateway = new FilesystemTokenUsageGateway();   // hoist current local instance
          const getBudgetStatus = new GetBudgetStatusUseCase({ budgetGateway, tokenUsageGateway });
          const updateBudget   = new UpdateBudgetUseCase({ budgetGateway });
          const enforceBudget  = new EnforceBudgetUseCase({ getBudgetStatus });
      - await app.register(budgetRoutes, {
          getBudgetStatus, updateBudget, budgetGateway,
          getRepositories: () => deps.config.repositories,
        });
      - Thread `enforceBudget` and `broadcastBudgetExceeded` into the gitlab/github/mrTrackingAdvanced registrations
        (extend each existing options object, no new app.register block).
      - On startup (R8): `await budgetGateway.load()` once; if null, `await budgetGateway.save({ limitUsd: 200 })`.
        Placed once near `registerRoutes` entry, before the gates are wired.

    websocket (src/main/websocket.ts additions):
      - export function broadcastBudgetStatus(viewModel: BudgetStatusViewModel): void
          → emits { type: 'budget-status', data: viewModel, timestamp }
      - export function broadcastBudgetExceeded(payload): void
          → emits { type: 'budget-exceeded', data: payload, timestamp }
      - Both follow the existing pattern of `broadcastBackfillProgress` (single message, fanout to clients).

    live trigger (R7):
      - File to edit: src/frameworks/claude/claudeInvoker.ts (~line 635, immediately after the existing
        `logger.info(..., 'Token usage recorded')` line).
      - DECISION: extend `ClaudeInvokerDependencies` with two new optional fields:
          getBudgetStatus: GetBudgetStatusUseCase
          broadcastBudgetStatus: (vm: BudgetStatusViewModel) => void
        Both are populated by `createDefaultClaudeInvokerDependencies()` (production wiring stays in the
        composition root pattern already established by this file).
      - After successful `deps.trackTokenUsage.execute(...)`:
          const status = await deps.getBudgetStatus.execute({ localPath: job.localPath });
          deps.broadcastBudgetStatus(budgetStatusPresenter.present(status));
        wrapped in its own try/catch (non-blocking, like the surrounding stats block).
      - Justification for DI over callback: claudeInvoker.ts already uses the DI dependencies pattern
        (`ClaudeInvokerDependencies` interface + `createDefaultClaudeInvokerDependencies()`); a callback
        parameter would be an inconsistent second injection style for the same module. One-line
        justification per the spec.

    dashboard (src/dashboard/index.html additions):
      - <script type="module"> add: import { renderBudgetTile, parseBudgetStatusMessage, parseBudgetExceededMessage, fetchBudget, fetchBudgetStatus, submitBudget } from './modules/budgetSettings.js';
      - Initial fetch in the existing dashboard init block (next to the tokenUsage tile init).
      - WebSocket switch case extensions in the existing `socket.onmessage` handler:
          - 'budget-status' → re-render budget tile
          - 'budget-exceeded' → invoke toast (existing notifications module)

    dependencies (new singletons in routes.ts):
      - FilesystemBudgetGateway (one instance)
      - GetBudgetStatusUseCase, UpdateBudgetUseCase, EnforceBudgetUseCase
      - BudgetStatusPresenter (shared between HTTP route and broadcast trigger)

  IMPLEMENTATION_ORDER:
    1. src/tests/acceptance/tokenBudgetCap.acceptance.test.ts
       — SDD outer loop. Written first, stays RED until the very end.
       — Covers scenarios 2, 3, 6, 8, 10 (see ACCEPTANCE_TEST section).
    2. src/modules/token-accounting/entities/budget/budgetConfig.schema.ts + .guard.ts
       — Zod schema with min(0).max(600).default(200). Pin range with safeParse tests.
    3. src/tests/factories/budgetConfig.factory.ts
       — { limitUsd: 200 } default, override allowed.
    4. src/modules/token-accounting/entities/budget/budgetStatus.ts
       — pure type alias.
    5. src/modules/token-accounting/entities/budget/budget.gateway.ts
       — interface contract (load/save).
    6. src/tests/stubs/budget.stub.ts
       — StubBudgetGateway with in-memory config + setConfig helper.
    7. src/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.ts
       — RED tests first: pin R2 sum, percentUsed calc, calendar-month boundary via injectable `now`.
    8. src/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.ts
       — RED tests first: pin R5 (allow below consumed), R6 (reject out-of-range).
    9. src/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.ts
       — RED tests first: pin R3 (rejected when consumed >= limit), composes GetBudgetStatusUseCase.
    10. src/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.ts
        — RED tests: $X.XX formatting, gauge width clamp.
    11. src/modules/token-accounting/interface-adapters/gateways/budget/budget.filesystem.gateway.ts
        — RED tests use a tmp dir injected via constructor or via XDG_CONFIG_HOME override
          (mirrors how existing configDir tests work).
    12. src/modules/token-accounting/interface-adapters/controllers/http/budget.routes.ts
        — RED tests via Fastify + StubBudgetGateway + StubTokenUsageGateway. Cover scenarios 1, 2, 3, 4.
    13. src/main/websocket.ts edits — add broadcastBudgetStatus + broadcastBudgetExceeded.
        — Unit test asserts they emit the right `type` field via a fake WebSocket client set (mirror existing pattern).
    14. Gating edits in src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts (lines ~480 fresh, ~249 followup).
        — RED tests assert: when stub enforceBudget returns accepted=false, enqueueReview spy is NOT called, broadcastBudgetExceeded spy IS called, reply.send received {status:'rejected', reason:'budget-exceeded'}.
    15. Gating edits in github.controller.ts (line ~203). Mirror tests.
    16. Gating edits in src/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.ts (line ~118). Mirror tests.
    17. src/frameworks/claude/claudeInvoker.ts — inject getBudgetStatus + broadcastBudgetStatus into deps, call after trackTokenUsage. Unit test pins: "after trackTokenUsage succeeds, broadcastBudgetStatus is called with the presenter output".
    18. src/dashboard/modules/budgetSettings.js + test.
    19. src/dashboard/index.html wiring (import + WS switch case).
    20. src/main/routes.ts wiring — composition root is always last.
    21. Run acceptance test — GREEN.

  REFERENCE_FILES:
    - src/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.ts — schema style mirror (zod, type via z.infer).
    - src/modules/token-accounting/entities/tokenUsage/tokenUsage.gateway.ts — contract style (interface, async methods).
    - src/modules/token-accounting/usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.ts — use case shape (constructor DI of gateway, async execute, derived type returned).
    - src/modules/token-accounting/usecases/trackTokenUsage/trackTokenUsage.usecase.ts — minimal use case pattern.
    - src/modules/token-accounting/interface-adapters/gateways/tokenUsage/tokenUsage.filesystem.gateway.ts — fs persistence pattern (existsSync/mkdirSync, JSON parsing, silent skip on corruption).
    - src/modules/token-accounting/interface-adapters/controllers/http/tokenUsage.routes.ts — FastifyPluginAsync<Options> with constructor-injected use cases.
    - src/modules/token-accounting/interface-adapters/presenters/tokenUsageSummary.presenter.ts — formatUsd helper, presenter class implements Presenter<Domain, VM>.
    - src/dashboard/modules/tokenUsage.js — humble dashboard module style (JSDoc, escapeHtml, exported render + fetch).
    - src/main/websocket.ts — broadcastBackfillProgress shape (existing pattern to mirror).
    - src/main/routes.ts — composition root, exact insertion point (right after existing token-accounting wiring block lines 102-105).
    - src/shared/services/configDir.ts — config dir resolution (where budget.json lives).
    - src/shared/foundation/guard.base.ts — createGuard helper (parse/safeParse/isValid).
    - src/frameworks/claude/claudeInvoker.ts (lines 36-62 and 622-640) — DI dependency pattern + the exact insertion point for the live broadcast hook.
    - src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts (lines 200-280 followup, 460-490 fresh) — gate insertion points.
    - src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts (line 203) — gate insertion point.
    - src/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.ts (lines 105-130) — manual followup gate insertion point.

  ACCEPTANCE_TEST:
    file: src/tests/acceptance/tokenBudgetCap.acceptance.test.ts
    note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end."
    setup:
      - Build a Fastify app with budgetRoutes registered, using StubBudgetGateway + StubTokenUsageGateway.
      - Spy on enqueueReview, broadcastBudgetExceeded, broadcastBudgetStatus.
      - Inject controllable `now()` for scenario 10 (cross calendar month).
    scenarios covered:
      - Scenario 2  → POST /api/budget {limitUsd:350} returns 200 success + persisted via stub.
      - Scenario 3  → POST /api/budget {limitUsd:750} returns 400, stub config unchanged.
      - Scenario 6  → Simulate a GitLab MR webhook with consumedUsd 200.10 and limit 200; assert HTTP 200 body rejected, enqueueReview NOT called, broadcastBudgetExceeded called with mrNumber/platform/projectPath/limitUsd/consumedUsd.
      - Scenario 8  → Same with consumedUsd 199.99; enqueueReview IS called.
      - Scenario 10 → Records dated 2026-05-31 with cost $200.50; now()=2026-06-01; getBudgetStatus returns consumedUsd 0; subsequent webhook accepted.

  RISKS:
    1. localPath fan-out for global cap
       - R2 says "global, all platforms, all projects" but TokenUsageGateway.loadAll() is per-localPath
         (usage files live at <localPath>/.claude/reviews/usage.jsonl).
       - Walking skeleton plan: GetBudgetStatusUseCase accepts a single localPath. For multi-repo deployments
         the cap is therefore per-repo, not truly global.
       - Mitigation: thread `localPaths: string[]` instead of `localPath: string` into the use case;
         loop over `getRepositories().filter(enabled).map(r => r.localPath)`. Adds 5 lines, no schema change.
       - Cost: 0 extra files. Decided: implement multi-localPath sum from day one to satisfy R2 literally.
         The single-localPath signature shown in IMPLEMENTATION_ORDER step 7 is upgraded to
         `{ localPaths: string[]; now?: Date }` in the actual use case. Tests must pin the sum across two
         localPaths.

    2. claudeInvoker.ts default deps construction
       - createDefaultClaudeInvokerDependencies() builds a FilesystemTokenUsageGateway directly.
         Adding getBudgetStatus + broadcastBudgetStatus means importing GetBudgetStatusUseCase and
         the websocket broadcast function inside that default factory. That introduces a `frameworks → main` edge
         (claudeInvoker is in frameworks, websocket.ts is in main).
       - Mitigation: extract broadcastBudgetStatus into a thin module under `src/frameworks/websocket/`
         or accept the existing `main/websocket.ts` boundary (other frameworks code already imports from main? — verify).
       - Likely cheaper: thread these two deps from `src/main/routes.ts` into invokeClaudeReview via the
         existing `deps` argument on the controllers that call invokeClaudeReview (gitlab.controller.ts uses
         `invokeClaudeReview(j, logger, ..., signal)` — currently no `deps` arg; it falls back to defaults).
       - Concrete action: add an optional `deps?: Partial<ClaudeInvokerDependencies>` last parameter to
         invokeClaudeReview, threaded from each controller that already receives the dashboard's
         budget broadcast functions. Existing default factory stays I/O only.

    3. Test-double for ws broadcasts in webhook controller tests
       - The three webhook controllers will import broadcastBudgetExceeded from main/websocket.ts.
         That's a hard import — hard to spy without monkey-patching.
       - Mitigation: introduce broadcastBudgetExceeded as a function in the Dependencies interface of each
         controller (already proposed). The controller calls `deps.broadcastBudgetExceeded(...)`, and
         routes.ts wires the real `broadcastBudgetExceeded` from main/websocket.ts. Tests inject a spy.
         This matches the existing pattern for `trackAssignment`, `recordCompletion`, etc.

    4. Acceptance test scope
       - Driving the acceptance test through real Fastify + real WS would require booting a WebSocket
         server. Mitigation: spy on `broadcastBudgetExceeded` and `broadcastBudgetStatus` at the
         dependency-injection boundary, do not assert socket-level delivery.
```

---

## 5-bullet summary

- **3 use cases is the floor, not a luxury** — `GetBudgetStatus` (read+derive), `UpdateBudget` (R1/R6 write), `EnforceBudget` (R3 gate). Each maps directly to a scenario cluster and isolates one stubbable seam. `BudgetConfig` is a Zod schema only (no class).
- **Reuse `TokenUsageGateway.loadAll()`, do not duplicate fs reads** — `GetBudgetStatusUseCase` filters by `recordedAt >= periodStart` and sums `costUsd`. Calendar-month transition (scenario 10) is pinned through an injectable `now()`.
- **`broadcastBudgetExceeded` is wired as a controller dependency, not a hard import** — mirrors the existing `trackAssignment` injection pattern in gitlab/github/mrTrackingAdvanced controllers, makes the gate tests trivial to spy.
- **Live update (R7) goes through DI into `claudeInvoker.ts`**, not a callback — `ClaudeInvokerDependencies` already exists for `trackTokenUsage`; adding `getBudgetStatus` + `broadcastBudgetStatus` follows the same convention. Justification: one injection style per module.
- **Risk #1 escalation: R2 ("global") demands a multi-localPath sum** — `GetBudgetStatusUseCase` accepts `localPaths: string[]` from day one (looped from `getRepositories()`), otherwise the cap is implicitly per-repo. Cheap (5 lines), avoids a follow-up refactor.

---

Plan persisted at: `/home/damien/Documents/Projets/claude-review-automation/docs/plans/163-token-budget-cap.plan.md`

Feature tracker update: I am leaving the tracker update as a single-line append at the bottom of `docs/feature-tracker.md` to the implementer to commit alongside the first plan-derived commit (the spec already lists status `planned`; tracker has no row for #163 yet — adding it here would split the scope across two commits). Flagging this so the implementer adds the row in the first commit of the implementation phase.
