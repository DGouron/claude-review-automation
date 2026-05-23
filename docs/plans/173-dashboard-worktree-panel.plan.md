# Plan: SPEC-173 Dashboard Worktree Panel

## Walking skeleton

Step 1 vertical slice (smallest crossing all layers):

1. `LastSweepSummary` type + schema
2. `WorktreePanelPresenter.present()` returning a viewmodel for one mock worktree
3. `GET /api/worktrees` route returning the presenter output with stubbed `WorktreeGateway.list()` + stubbed `WorktreeSizeProbeGateway` + stubbed scheduler accessors
4. Acceptance test (`173-dashboard-worktree-panel.acceptance.test.ts`) issues GET, asserts payload shape from FR-1

This proves the data plane end-to-end before adding the sweep POST, dashboard UI, SVGs.

## Anti-overengineering challenge

| Layer added | Justification |
|---|---|
| New `LastSweepSummary` type | Two layers (scheduler module-state + route response) consume it — shared definition required. Plain `type` + Zod schema, no class. |
| New `WorktreeSizeProbeGateway` | Crosses FS boundary via `du -sb`. Must be stubbable for presenter unit tests. Justified per Clean Architecture gateway pattern. |
| New `WorktreePanelPresenter` | Holds status thresholds (24h/7d) + grouping + 30s size cache. Pure logic, deserves a dedicated class so the route stays a thin transport. |
| Module-scoped state in scheduler | Spec mandates it (FR-3, Architectural Decision "in-memory in the scheduler module"). Single Map + boolean + Date refs — no Mutex/Cache abstraction. |
| New `worktreePanel.js` humble object | Mirrors `tokenUsage.js`. Required to render the section. |
| No new use case | `sweepStaleWorktrees` is shared between scheduler + manual route per Rule "duplicating sweep logic is forbidden". |
| No new entity class | `Worktree` already exists as `WorktreeEntry`. Reused as-is. |

No speculative abstractions.

```
PLAN:
  scope: dashboard worktree panel + manual sweep endpoint + scheduler state exposure
  is_new_module: false (extends worktree-management module + adds dashboard section)

ENTITIES:
  - name: LastSweepSummary (data type only — no behaviour)
    file: src/modules/worktree-management/entities/sweep/lastSweepSummary.schema.ts
    schema: src/modules/worktree-management/entities/sweep/lastSweepSummary.schema.ts
    guard: (not needed — produced internally, never crosses an external boundary)
    test: src/tests/units/modules/worktree-management/entities/sweep/lastSweepSummary.schema.test.ts
    factory: src/tests/factories/lastSweepSummary.factory.ts
    fields: { ranAt: Date, removed: number, failures: number, scanned: number }

  - name: WorktreeSizeProbeGateway (contract)
    file: src/modules/worktree-management/entities/worktree/worktreeSizeProbe.gateway.ts
    methods:
      - probe(path: string): Promise<number | null>

USECASES:
  (no new use case — sweepStaleWorktrees is reused as-is per FR-2 + Rule "shared use case")

GATEWAYS:
  - name: WorktreeSizeProbeGateway
    contract: src/modules/worktree-management/entities/worktree/worktreeSizeProbe.gateway.ts
    implementation: src/modules/worktree-management/interface-adapters/gateways/worktreeSizeProbe.cli.gateway.ts
    stub: src/tests/stubs/worktreeSizeProbe.stub.ts
    test: src/tests/units/modules/worktree-management/interface-adapters/gateways/worktreeSizeProbe.cli.gateway.test.ts
    methods:
      - probe(path: string): Promise<number | null>
    transport: child_process (du -sb), wrapped behind injectable runner (mirror of GitCommandCliGateway)

CONTROLLERS:
  - name: worktreeOverviewRoutes
    file: src/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.ts
    test: src/tests/units/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.test.ts
    routes:
      - GET  /api/worktrees       -> list + sweep summary + next ETA
      - POST /api/worktrees/sweep -> run sweep now, 409 on conflict
    dependencies (FastifyPluginAsync options):
      - worktreeGateway: WorktreeGateway          (existing)
      - sizeProbeGateway: WorktreeSizeProbeGateway (new)
      - presenter: WorktreePanelPresenter          (new)
      - getLastSweep: () => LastSweepSummary | null
      - getNextSweepEta: () => Date
      - runSweepNow: () => Promise<LastSweepSummary | { status: 'conflict'; startedAt: Date }>
      - logger: Logger

PRESENTERS:
  - name: WorktreePanelPresenter
    file: src/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.ts
    test: src/tests/units/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.test.ts
    input: { worktrees: WorktreeEntry[], lastSweep: LastSweepSummary | null, nextSweepAt: Date }
        + injected sizeProbe gateway used inside present()
    output: WorktreePanelViewModel
    responsibilities:
      - compute status (active <24h / idle 24h..7d / stale >7d) from mtime
      - group by (platform, projectPath); sort groups alpha; rows by mtime DESC
      - cache size probe 30s per path (in-presenter Map<path, { sizeBytes: number|null; expiresAt: number }>)
      - sum totalSizeBytes skipping nulls
      - format ranAt / nextSweepAt as ISO strings (relative formatting done in browser)

VIEWS:
  - name: worktreePanel (dashboard humble object)
    file: src/dashboard/modules/worktreePanel.js
    test: src/tests/units/dashboard/modules/worktreePanel.test.ts
    exports (JSDoc-typed pure functions):
      - renderWorktreeSection(viewModel) -> HTML string
      - renderWorktreeEmptyState() -> HTML string with animated SVG
      - renderWorktreeStatusBadge(status) -> HTML string with inline animated SVG
      - fetchWorktreeOverview(fetchImpl?) -> Promise<WorktreePanelViewModel>
      - triggerManualSweep(fetchImpl?) -> Promise<{ status: 'ok' | 'conflict' | 'error'; payload?: ... }>
    UI integration:
      - src/dashboard/index.html: new <section id="worktree-section"> inserted between #cleanup-section and .refresh-info (around line 260); import in the existing <script type="module">; fetch + render on initial load; 30s setInterval poll aligned with existing cadence
      - src/dashboard/styles.css: append #worktree-section block — gradient header, status-badge animations (pulse for active, fade for idle, solid for stale), row hover lift, sweep button with broom SVG, @media (prefers-reduced-motion: reduce) override that flattens every animation
      - src/dashboard/modules/i18n.js: add keys worktree.section.title, worktree.empty.title, worktree.empty.subtitle, worktree.button.sweepNow, worktree.status.active, worktree.status.idle, worktree.status.stale, worktree.lastSweep.label, worktree.lastSweep.never (EN values; FR translations TBD)

WIRING:
  src/frameworks/scheduler/worktreeSweepScheduler.ts (MODIFY):
    - Add module-private state: lastSummary, isRunning, currentStartedAt, lastRunAt, intervalMs (const)
    - Change return type to: { stop(); getLastSweep(); getNextSweepEta(); runSweepNow() }
    - runSweepNow uses isRunning flag — returns { status: 'conflict', startedAt } when busy
    - The internal setInterval handler now also writes the summary into state
    - Update test src/tests/units/frameworks/scheduler/worktreeSweepScheduler.test.ts with new cases

  src/main/dependencies.ts (MODIFY):
    - Instantiate new WorktreeSizeProbeCliGateway
    - Instantiate new WorktreePanelPresenter
    - Add fields to Dependencies: worktreeSizeProbeGateway, worktreePanelPresenter
      (scheduler accessors NOT here — they're created in server.ts during scheduler start, surfaced to routes via the registerRoutes call site)

  src/main/server.ts (MODIFY):
    - Destructure the new scheduler exports: const sweepScheduler = startWorktreeSweepScheduler(...)
    - Pass sweepScheduler.getLastSweep / getNextSweepEta / runSweepNow into registerRoutes via an extra param (or attach to deps before passing — see Operational Notes)
    - shutdown stays unchanged (sweepScheduler.stop)

  src/main/routes.ts (MODIFY):
    - Register worktreeOverviewRoutes via app.register
    - Compose options: worktreeGateway from deps, sizeProbeGateway from deps, presenter from deps,
      getLastSweep / getNextSweepEta / runSweepNow from the new server.ts-provided extension
    - Decision: extend Dependencies with `sweepSchedulerControls?: { getLastSweep; getNextSweepEta; runSweepNow }` (optional so createServer/test paths keep working without scheduler boot)

IMPLEMENTATION_ORDER:
  1. src/modules/worktree-management/entities/sweep/lastSweepSummary.schema.ts (+ test) — type/schema, no dep — Walking Skeleton step 1
  2. src/modules/worktree-management/entities/worktree/worktreeSizeProbe.gateway.ts — contract only
  3. src/tests/stubs/worktreeSizeProbe.stub.ts — happy-path + failure stub
  4. src/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.ts (+ unit tests: status thresholds 24h/7d, grouping, size cache TTL 30s, total skips null) — Walking Skeleton step 2
  5. src/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.ts (+ tests with stub gateway + stub presenter + stub scheduler controls) — Walking Skeleton step 3 (GET only)
  6. src/tests/acceptance/173-dashboard-worktree-panel.acceptance.test.ts — write RED upfront; first GET-only assertion proves Step 3
  7. src/frameworks/scheduler/worktreeSweepScheduler.ts — add getLastSweep / getNextSweepEta / runSweepNow + concurrency guard (+ tests)
  8. Extend POST in worktreeOverview.routes.ts (200 happy path + 409 conflict)
  9. src/modules/worktree-management/interface-adapters/gateways/worktreeSizeProbe.cli.gateway.ts (+ tests with stubbed runner) — concrete `du -sb`
  10. src/main/dependencies.ts + src/main/server.ts + src/main/routes.ts — composition root wiring (typecheck must pass)
  11. src/dashboard/modules/worktreePanel.js (+ tests for renderWorktreeSection / empty state / status badges / fetch + sweep helpers) — humble object
  12. src/dashboard/modules/i18n.js — add worktree.* keys
  13. src/dashboard/index.html — insert <section id="worktree-section"> + import + load/poll
  14. src/dashboard/styles.css — section styles + animations + reduced-motion override (use /frontend-design skill for the SVG choreography)
  15. Loop on acceptance test until GREEN — covers Scenarios 1, 2, 5, 6, 7 per Operational Notes

REFERENCE_FILES:
  - src/modules/worktree-management/* — existing module layout to mirror
  - src/frameworks/scheduler/worktreeSweepScheduler.ts — extend, do not rewrite
  - src/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.ts — already returns SweepSummary { inspected, removed, failures } — LastSweepSummary adds ranAt and renames inspected -> scanned (per FR-1 payload)
  - src/dashboard/modules/tokenUsage.js — humble object pattern for the new dashboard module
  - src/modules/token-accounting/interface-adapters/presenters/tokenUsageSummary.presenter.ts — presenter pattern
  - src/modules/token-accounting/interface-adapters/controllers/http/tokenUsage.routes.ts — Fastify plugin route pattern with deps
  - src/main/dependencies.ts + routes.ts + server.ts — composition root
  - src/dashboard/index.html (lines 254-265) — where to inject the new section (between #cleanup-section and .refresh-info)
  - src/modules/worktree-management/interface-adapters/gateways/gitCommand.cli.gateway.ts — pattern for child_process spawn with injectable runner (mirror for du)
  - src/shared/foundation/presenter.base.ts — Presenter interface
  - src/shared/services/daemonPaths.ts — WORKTREE_BASE_DIR if needed

ACCEPTANCE_TEST:
  file: src/tests/acceptance/173-dashboard-worktree-panel.acceptance.test.ts
  note: |
    SDD outer loop — written first by implementer, RED during impl, GREEN at the end.
    Covers Scenarios from spec: 1 (active+idle+stale row mix), 2 (empty pool), 5 (manual sweep success),
    6 (manual sweep conflict 409), 7 (lastSweep null on cold start).
    Bootstraps a Fastify instance with stubs for WorktreeGateway, WorktreeSizeProbeGateway, and a
    fake scheduler controls object. No real disk I/O, no real du, no real scheduler timer.
```

## New vs Modified files

### New (12 source + 8 test files + 1 acceptance test + 1 stub + 1 factory)

| File | Layer |
|------|-------|
| src/modules/worktree-management/entities/sweep/lastSweepSummary.schema.ts | Entity (type + schema) |
| src/modules/worktree-management/entities/worktree/worktreeSizeProbe.gateway.ts | Gateway contract |
| src/modules/worktree-management/interface-adapters/gateways/worktreeSizeProbe.cli.gateway.ts | Gateway impl |
| src/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.ts | Presenter |
| src/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.ts | Controller (HTTP plugin) |
| src/dashboard/modules/worktreePanel.js | View (humble object) |
| src/tests/stubs/worktreeSizeProbe.stub.ts | Test double |
| src/tests/factories/lastSweepSummary.factory.ts | Factory |
| src/tests/units/modules/worktree-management/entities/sweep/lastSweepSummary.schema.test.ts | Unit test |
| src/tests/units/modules/worktree-management/entities/worktree/worktreeSizeProbe.gateway.test.ts | Unit test (contract only — optional, may skip if contract has no logic) |
| src/tests/units/modules/worktree-management/interface-adapters/gateways/worktreeSizeProbe.cli.gateway.test.ts | Unit test |
| src/tests/units/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.test.ts | Unit test (24h/7d thresholds, grouping, 30s size cache, null-size aggregation) |
| src/tests/units/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.test.ts | Unit test (GET schema, POST 200, POST 409, POST 500) |
| src/tests/units/dashboard/modules/worktreePanel.test.ts | Unit test (renderSection, renderEmptyState, renderStatusBadge, fetchWorktreeOverview, triggerManualSweep) |
| src/tests/acceptance/173-dashboard-worktree-panel.acceptance.test.ts | Acceptance test |

### Modified

| File | Reason |
|------|--------|
| src/frameworks/scheduler/worktreeSweepScheduler.ts | Add module-scoped state + getLastSweep + getNextSweepEta + runSweepNow with concurrency guard |
| src/tests/units/frameworks/scheduler/worktreeSweepScheduler.test.ts | New cases: getLastSweep returns null then populated; getNextSweepEta math; runSweepNow conflict path |
| src/main/dependencies.ts | Add WorktreeSizeProbeCliGateway + WorktreePanelPresenter to Dependencies |
| src/main/server.ts | Pass scheduler controls into registerRoutes (via extended deps) |
| src/main/routes.ts | Register worktreeOverviewRoutes with composed options |
| src/dashboard/index.html | Insert `<section id="worktree-section">` between #cleanup-section and .refresh-info; import worktreePanel.js helpers in the existing inline `<script type="module">`; wire fetch on load + 30s poll |
| src/dashboard/styles.css | Append #worktree-section styles + animations + `@media (prefers-reduced-motion: reduce)` reset |
| src/dashboard/modules/i18n.js | Add worktree.* keys (EN defaults) |
| docs/feature-tracker.md | SPEC-173: drafted -> planned (now) -> implemented (after impl) |

## Open implementation decisions (for the implementer)

1. **`runSweepNow` return shape**: choosing a discriminated union `{ status: 'ok'; summary } | { status: 'conflict'; startedAt }` rather than throwing. Easier to test, clean route mapping (200 vs 409).
2. **Scheduler controls propagation**: extend `Dependencies` with an optional `sweepSchedulerControls` property populated by `server.ts` after `startWorktreeSweepScheduler`. Keeps `createServer` (used in tests without a running scheduler) compatible. Routes guard with a 503 if absent.
3. **Size probe cache**: lives inside the presenter instance (Map keyed by absolute path). Presenter must therefore be instantiated once at composition-root scope, not per request — same as `TokenUsageSummaryPresenter`.
4. **Animation choreography**: defer to `/frontend-design` skill during implementation. Plan only commits to file locations + CSS class names + reduced-motion compliance.
