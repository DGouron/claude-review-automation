# Plan — SPEC-175: Worktree Failure Visibility & Force-Cleanup

> Status: planned
> Spec: `docs/specs/175-worktree-failure-visibility.md`
> Module: `src/modules/worktree-management/`
> Extends: SPEC-170 (lifecycle), SPEC-173 (dashboard panel)
> Created: 2026-05-27

---

## Scope

- **is_new_module**: false
- **is_extension_of**: SPEC-170 (entities/usecases) + SPEC-173 (presenter/controller/view)
- **type**: feature-extension (new entity types, one detection use case, presenter extension, one new controller route, one in-memory lock service, dashboard view update)

---

## Anti-overengineering verdict

Challenged each proposed addition:

| Proposed | Verdict | Justification |
|----------|---------|---------------|
| State machine for 4 degraded reasons | REJECTED | Discriminated union + ordered detection (return first hit) is sufficient. 4 stateless checks, no transitions. |
| Separate gateway per signal (lock / conflict / artifacts / age) | REJECTED | Extend the existing `worktree.fileSystem.gateway.ts` with one `probeHealth(entry)` method. Same FS context, same boundary. |
| New `ForceCleanupWorktree` use case | REJECTED | Re-use `removeWorktree.usecase.ts`. Force-cleanup = same operation; what differs is the *trigger* (operator vs scheduler) and the *concurrency guard*. |
| Distributed/file lock for "one cleanup per worktree" | REJECTED | Single-process daemon. In-memory `Set<string>` of locked worktree keys + try/finally is enough. |
| Audit log entity for cleanup history | REJECTED | Structured `logger.info` / `logger.warn` calls satisfy "logs reason, timestamp, outcome". No spec rule asks to *read back* the log from UI. |
| Configurable stale threshold as a new entity | REJECTED | Optional override in `runtimeSettings.ts` (new `worktreeStaleThresholdHours` field, default 24). Falls back to the existing 7-day sweep threshold in `sweepStaleWorktrees.usecase.ts` only if absent — but the *visibility* threshold is independent (24h default per spec). |
| Confirmation modal | EXCLUDED BY SPEC | "Out of Scope" section explicitly rejects it. |

**Total new files: 10. Total modified files: 6.**

---

## Open decisions for user

- **DEC-1 — stale threshold storage**: Spec says "stale threshold is configurable (default 24h)". Existing `runtimeSettings.ts` (`~/.claude-review/settings.json`) only stores `language` and `model`. Recommendation: add `worktreeStaleThresholdHours: number` (default 24, min 1, max 720) to `runtimeSettingsSchema`. No new UI route needed for v1 — operator edits settings.json then restarts. **If user disagrees**, alternative: hardcode 24h and defer configurability to a follow-up spec.
- **DEC-2 — git lock detection scope**: A worktree git lock can be at `<worktree>/.git/index.lock`, `<worktree>/.git/HEAD.lock`, or inside the *main* repo's `.git/worktrees/<name>/`. Recommendation: probe only the worktree-local `.git` (which is actually a `.git` file pointing to the main repo's `.git/worktrees/<name>/`) — check `index.lock` and `HEAD.lock` in that resolved directory. Justifies the "orphan git lock" alert without false positives during active fetches by other worktrees.
- **DEC-3 — build artifact signal**: Spec scenario says `buildArtifactsPresent: false`. Recommendation: check existence of `<worktree>/node_modules` only (matches current ReviewFlow runtime where it's a Node project). If projects with different stacks need this, generalize later via a per-project signal list. Acceptable since `worktreeSettingsWriter.service.ts` already assumes a Node/Claude setup.

If user does not respond, defaults above are applied during implementation.

---

## ENTITIES (additions to module)

### New schema/entity types (in existing `entities/worktree/`)

- **name**: `WorktreeHealth` (discriminated union)
  - **file**: `src/modules/worktree-management/entities/worktree/worktreeHealth.schema.ts`
  - **test**: `src/tests/units/modules/worktree-management/entities/worktree/worktreeHealth.schema.test.ts`
  - **shape** (no `as`, derived via `z.infer`):
    ```
    DegradedReason =
      | { kind: 'stale'; ageMs: number; thresholdMs: number }
      | { kind: 'orphan-git-lock'; lockPath: string; lockAgeMs: number }
      | { kind: 'unresolved-conflict' }
      | { kind: 'missing-build-artifacts'; expectedPath: string }

    WorktreeHealth =
      | { status: 'healthy' }
      | { status: 'degraded'; reason: DegradedReason; detectedAt: Date }
    ```
  - **guard**: not needed — produced internally by the use case, never crosses a network boundary as raw input. Zod schema lives in the schema file and is reused for the API response shape.

- **name**: `DegradedWorktree` (presented row companion)
  - **file**: same `worktreeHealth.schema.ts`
  - **shape**: `{ entry: WorktreeEntry; health: Extract<WorktreeHealth, { status: 'degraded' }> }`

- **factory**: `src/tests/factories/worktreeHealth.factory.ts`
  - Methods: `healthy()`, `stale({ ageMs?, thresholdMs? })`, `orphanLock({ lockPath?, lockAgeMs? })`, `unresolvedConflict()`, `missingArtifacts({ expectedPath? })`.

---

## USECASES

- **name**: `detectDegradedWorktrees`
  - **file**: `src/modules/worktree-management/usecases/detectDegradedWorktrees.usecase.ts`
  - **test**: `src/tests/units/modules/worktree-management/usecases/detectDegradedWorktrees.usecase.test.ts`
  - **type**: query
  - **input**: `{ entries: WorktreeEntry[]; staleThresholdMs: number; now: () => Date }`
  - **output**: `Promise<WorktreeHealthReport[]>` where `WorktreeHealthReport = { entry: WorktreeEntry; health: WorktreeHealth }`
  - **deps**: `WorktreeHealthProbeGateway` (see Gateways) — single async `probe(entry): Promise<HealthSignals>` call per entry, then ordered detection (stale → orphan-lock → conflict → missing-artifacts → healthy).
  - **rationale**: pure orchestration, no FS code. Easy to unit-test with a stub probe.

- **name**: extension of `removeWorktree.usecase.ts`
  - **file**: `src/modules/worktree-management/usecases/removeWorktree.usecase.ts` (MODIFY)
  - **test**: `src/tests/units/modules/worktree-management/usecases/removeWorktree.usecase.test.ts` (MODIFY — add force-mode scenarios)
  - **change**: add optional `force: boolean` flag to `RemoveWorktreeInput`. When `force: true`, the use case attempts removal even if `worktreeExists` reports the path missing on disk (still issues `git worktree prune` to clear the registry entry). Returns `{ status: 'removed' }` if either FS removal or prune-only succeeded; `{ status: 'failed'; warning }` otherwise. **Backwards compatible**: default `force = false` preserves SPEC-170 behavior.

---

## GATEWAYS

- **name**: `WorktreeHealthProbeGateway` (new contract)
  - **contract**: `src/modules/worktree-management/entities/worktree/worktreeHealthProbe.gateway.ts`
  - **shape**:
    ```
    interface HealthSignals {
      mtime: Date;
      orphanLock: { present: boolean; path: string; ageMs: number } | null;
      unresolvedConflict: boolean;
      missingBuildArtifacts: { missing: boolean; expectedPath: string };
    }

    interface WorktreeHealthProbeGateway {
      probe(entry: WorktreeEntry): Promise<HealthSignals>;
    }
    ```
  - **implementation**: `src/modules/worktree-management/interface-adapters/gateways/worktreeHealthProbe.fileSystem.gateway.ts`
  - **test**: `src/tests/units/modules/worktree-management/interface-adapters/gateways/worktreeHealthProbe.fileSystem.gateway.test.ts`
  - **stub**: `src/tests/stubs/worktreeHealthProbe.stub.ts` (programmable per-path map, like `worktreeSizeProbe.stub.ts`)
  - **methods**:
    - `probe(entry)` — performs the 3 FS checks:
      1. Read `<worktree>/.git` file → resolve `<main-repo>/.git/worktrees/<name>/` → check `index.lock`/`HEAD.lock` existence + age via `statSync`.
      2. Run `git status --porcelain=v1` via the existing `GitCommandExecutor` (extend `GitCommandKind` with `'status-porcelain'`) → count lines starting with `UU`/`AA`/`DD` for unresolved conflicts.
      3. Check `existsSync(<worktree>/node_modules)`.
  - **dependency**: receives the existing `GitCommandExecutor` for the conflict check.

- **MODIFY**: `WorktreeFileSystemGateway`
  - **file**: `src/modules/worktree-management/interface-adapters/gateways/worktree.fileSystem.gateway.ts`
  - **change**: pass the new `force` flag through to `removeWorktree(...)` call inside `remove(request)` when `request.force === true`. Extend `RemoveWorktreeRequest` in `worktree.gateway.ts` with optional `force?: boolean`.

- **MODIFY**: `gitCommand.gateway.ts`
  - **file**: `src/modules/worktree-management/entities/gitCommand/gitCommand.gateway.ts`
  - **change**: add `'status-porcelain'` to `GitCommandKind` union. No new method, just one new kind for telemetry/logging clarity.

---

## SERVICES

- **name**: `ForceCleanupLockService` (in-memory concurrency guard)
  - **file**: `src/modules/worktree-management/services/forceCleanupLock.ts`
  - **test**: `src/tests/units/modules/worktree-management/services/forceCleanupLock.test.ts`
  - **API**:
    ```
    interface ForceCleanupLockService {
      tryAcquire(identityKey: string): boolean;  // false if already locked
      release(identityKey: string): void;
    }
    ```
  - **implementation**: wraps a private `Set<string>`. Key = `${platform}:${projectPath}:${mrNumber}`. No timers, no expiry — caller MUST release in `finally`.
  - **rationale**: single-process daemon, no distributed coordination needed. Mirrors the `runningSweep` flag pattern in `worktreeSweepScheduler.ts`.

---

## CONTROLLERS

- **name**: extension of `worktreeOverviewRoutes`
  - **file**: `src/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.ts` (MODIFY)
  - **test**: `src/tests/units/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.test.ts` (MODIFY)
  - **new dependencies on the route options interface**:
    - `detectDegradedWorktrees: (entries) => Promise<WorktreeHealthReport[]>`
    - `forceCleanupLock: ForceCleanupLockService`
    - `removeWorktreeForCleanup: (identity, sourceCheckoutPath) => Promise<RemoveResult>` (closure wrapping the existing gateway with `force: true`)
    - `getRepositories: () => SweepRepository[]` (needed to resolve `sourceCheckoutPath` from `identity.projectPath`)
    - `staleThresholdHours: () => number` (reads `runtimeSettings.getWorktreeStaleThresholdHours()`)
  - **new routes**:
    - **GET `/api/worktrees`** (MODIFY): response payload extended with `degraded: DegradedRowViewModel[]` produced by the presenter. Backwards-compatible field (additive).
    - **POST `/api/worktrees/:platform/:projectPath/:mrNumber/force-cleanup`**:
      - Path params validated via Zod schema (platform enum, projectPath string, mrNumber positive int).
      - 409 `{ error: 'cleanup-in-progress' }` if `forceCleanupLock.tryAcquire` returns false.
      - 404 `{ error: 'worktree-not-found' }` if no enabled repository matches the projectPath.
      - 200 `{ status: 'removed' }` on success.
      - 500 `{ error: 'cleanup-failed', warning }` on failure (lock released, alert preserved).
      - Always logs `{ identity, reason: presentedReason, outcome }` via `logger.info`/`logger.warn`.
  - **note on projectPath encoding**: GitLab projectPath contains `/` (e.g. `group/project`). Route uses Fastify wildcard `:projectPath(*)` or query parameter. Recommendation: `POST /api/worktrees/cleanup` with body `{ platform, projectPath, mrNumber }` to avoid URL-encoding pitfalls. Simpler, no wildcard.

---

## PRESENTERS

- **name**: extension of `WorktreePanelPresenter`
  - **file**: `src/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.ts` (MODIFY)
  - **test**: `src/tests/units/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.test.ts` (MODIFY — add degraded scenarios)
  - **input extension**: `WorktreePanelPresenterInput` gains `healthReports: WorktreeHealthReport[]`.
  - **output extension**: new fields on `WorktreePanelViewModel`:
    ```
    degradedCount: number
    degraded: DegradedRowViewModel[]
    ```
    where:
    ```
    interface DegradedRowViewModel {
      mrNumber: number
      platform: 'gitlab' | 'github'
      projectPath: string
      path: string                           // worktree absolute path
      reasonCode: 'stale' | 'orphan-git-lock' | 'unresolved-conflict' | 'missing-build-artifacts'
      reasonLabel: string                    // French, user-facing (per rule "error messages in French")
      detectedAtIso: string
      recommendedAction: string              // French, e.g. "Cleanup forcé recommandé"
      cleanupEndpointPayload: { platform; projectPath; mrNumber }   // ready-to-POST body
    }
    ```
  - **rendering logic**: presenter formats `ageMs` → "26h", `lockAgeMs` → "2h", picks French labels:
    - `stale` → "Worktree inactif depuis Xh"
    - `orphan-git-lock` → "Lock git orphelin depuis Xh"
    - `unresolved-conflict` → "Conflit git non résolu"
    - `missing-build-artifacts` → "Artefacts de build manquants"
  - **healthy worktrees**: NOT added to `degraded[]`. Already counted in existing `activeCount`/`idleCount`/`staleCount`. (Note: presenter's old `staleCount` is age-based UI grouping — it stays as-is for the existing metrics row; the new `degradedCount` is independent and based on the health report.)

---

## VIEWS (Dashboard)

- **name**: extension of `worktreePanel.js`
  - **file**: `src/dashboard/modules/worktreePanel.js` (MODIFY)
  - **test**: `src/tests/units/dashboard/modules/worktreePanel.test.js` (MODIFY — or create if missing; verify via Glob)
  - **changes**:
    - New JSDoc typedef `DegradedRowViewModel` matching presenter output.
    - New exported renderer `renderDegradedAlerts(degraded)` → string of HTML; one block per degraded worktree with: reason badge, age, recommended action, "FORCE CLEANUP" button with `data-action="force-cleanup"` and `data-platform`/`data-project-path`/`data-mr-number` attributes.
    - `renderWorktreeSection(viewModel)` injects the alerts block above the table when `viewModel.degradedCount > 0`.
    - New exported async `triggerForceCleanup({ platform, projectPath, mrNumber }, fetchImpl)` mirroring `triggerManualSweep` shape, returns discriminated union `{ status: 'ok' } | { status: 'conflict' } | { status: 'not-found' } | { status: 'error'; reason }`.
    - Empty state unchanged (only shown when `totalCount === 0` AND `degradedCount === 0`).
  - **dashboard wiring**: `src/dashboard/index.html` — add a `bindForceCleanupButtons()` function next to `bindWorktreeSweepButton()`. Button transitions: pending → success (alert fades from list on next poll) or → error (button gets `.worktree-cleanup-failed` class for ~1.2s, alert persists per spec rule).
  - **CSS**: extend `src/dashboard/styles.css` with `.worktree-alert` styles using the agentic-OS DNA (amber/red for degraded, corner brackets, `// LABEL` prefix, glow-pulse on `[data-severity="critical"]`).

---

## SCENARIO ↔ TEST MAPPING

| # | Scenario (from spec) | Test file | Test name |
|---|----------------------|-----------|-----------|
| 1 | healthy worktree → no alert | `detectDegradedWorktrees.usecase.test.ts` | `returns 'healthy' when no signal trips and entry is fresh` |
| 2 | stale detected (26h > 24h) | `detectDegradedWorktrees.usecase.test.ts` | `flags 'stale' when entry mtime older than threshold` |
| 3 | orphan git lock (2h old) | `detectDegradedWorktrees.usecase.test.ts` + `worktreeHealthProbe.fileSystem.gateway.test.ts` | `flags 'orphan-git-lock' when index.lock exists with non-zero age` |
| 4 | unresolved git conflict | `detectDegradedWorktrees.usecase.test.ts` + probe gateway test | `flags 'unresolved-conflict' when git status porcelain reports UU markers` |
| 5 | missing build artifacts | `detectDegradedWorktrees.usecase.test.ts` + probe gateway test | `flags 'missing-build-artifacts' when node_modules is absent` |
| 6 | force-cleanup success | `worktreeOverview.routes.test.ts` | `POST /api/worktrees/cleanup returns 200 and triggers removal` |
| 7 | force-cleanup failure (EACCES) | `worktreeOverview.routes.test.ts` + `removeWorktree.usecase.test.ts` | `returns 500 with warning when filesystem removal fails; alert preserved (lock released)` |
| 8 | force-cleanup already running | `forceCleanupLock.test.ts` + `worktreeOverview.routes.test.ts` | `returns 409 cleanup-in-progress when lock is held` |
| 9 | alert clears after success | `worktreePanel.presenter.test.ts` | `degraded list excludes worktrees no longer present on next render` (state-based, after entries list shrinks) |
| 10 | multiple degraded worktrees | `worktreePanel.presenter.test.ts` + `worktreePanel.test.js` (dashboard) | `renders N independent alert blocks with N cleanup buttons` |

**Plus** the outer-loop acceptance test (below) covers scenarios 2, 6, 7, 8, 10 end-to-end through Fastify.

---

## ACCEPTANCE_TEST

- **file**: `src/tests/acceptance/175-worktree-failure-visibility.acceptance.test.ts`
- **note**: SDD outer loop — written first by implementer, RED during impl, GREEN at the end.
- **structure** (mirrors `173-dashboard-worktree-panel.acceptance.test.ts`):
  - Build a Fastify app with `worktreeOverviewRoutes` registered.
  - Use `ConfigurableWorktreeGateway` (extended copy or shared helper) for the entry list.
  - Use `StubWorktreeHealthProbeGateway` to inject signals per worktree path.
  - Use real `ForceCleanupLockService`, `WorktreePanelPresenter`, `detectDegradedWorktrees` use case.
  - **Tests**:
    1. `GET /api/worktrees with degraded entries returns degradedCount > 0 and French reason labels`
    2. `POST /api/worktrees/cleanup succeeds and entry no longer appears in next GET`
    3. `POST twice in parallel: second receives 409 cleanup-in-progress`
    4. `POST when remove fails: 500 cleanup-failed, alert still present in next GET, lock released for retry`
    5. `Three stale worktrees produce three independent cleanup actions`

---

## WIRING

### `src/main/dependencies.ts` (MODIFY)

Add to `Dependencies` interface:
```
worktreeHealthProbeGateway: WorktreeHealthProbeGateway
forceCleanupLock: ForceCleanupLockService
```

Instantiate in `createDependencies(config)`:
```
const worktreeHealthProbeGateway = new WorktreeHealthProbeFileSystemGateway({ executor: gitCommandExecutor });
const forceCleanupLock = new InMemoryForceCleanupLockService();
```

### `src/main/routes.ts` (MODIFY)

Extend the existing `worktreeOverviewRoutes` registration:
```
await app.register(worktreeOverviewRoutes, {
  worktreeGateway: deps.worktreeGateway,
  presenter: deps.worktreePanelPresenter,
  schedulerControls: deps.sweepSchedulerControls,
  detectDegradedWorktrees: (entries) => detectDegradedWorktrees({
    entries,
    staleThresholdMs: getWorktreeStaleThresholdHours() * 3_600_000,
    now: () => new Date(),
  }, { healthProbe: deps.worktreeHealthProbeGateway }),
  forceCleanupLock: deps.forceCleanupLock,
  removeWorktreeForCleanup: (identity, sourceCheckoutPath) =>
    deps.worktreeGateway.remove({ identity, sourceCheckoutPath, force: true }),
  getRepositories: () => deps.config.repositories,
  staleThresholdHours: () => getWorktreeStaleThresholdHours(),
  logger: deps.logger,
});
```

### `src/frameworks/settings/runtimeSettings.ts` (MODIFY)

- Add `worktreeStaleThresholdHours: z.number().int().min(1).max(720).default(24)` to schema.
- Export `getWorktreeStaleThresholdHours(): number` and `setWorktreeStaleThresholdHours(value): Promise<void>`.
- Default value `24`.

### `src/dashboard/index.html` (MODIFY)

- Import `triggerForceCleanup` from `worktreePanel.js`.
- Add `bindForceCleanupButtons()` invoked after each render that contains degraded alerts.

---

## IMPLEMENTATION_ORDER

**Walking Skeleton first** — scenario 1 (healthy → no alert) + scenario 2 (stale → alert) prove the full vertical slice (entity → use case → presenter → controller → view).

1. **`worktreeHealth.schema.ts`** — entity types (discriminated union). No dependencies. Walking skeleton anchor.
2. **`worktreeHealth.factory.ts`** — test data builders.
3. **`worktreeHealthProbe.gateway.ts`** — gateway contract. Pure interface.
4. **`worktreeHealthProbe.stub.ts`** — stub for tests downstream.
5. **`detectDegradedWorktrees.usecase.ts`** + tests — covers scenarios 1–5 (logic only, stubbed probe). End of walking skeleton bottom half.
6. **`forceCleanupLock.ts`** + tests — covers scenario 8 logic (independent of HTTP).
7. **`removeWorktree.usecase.ts`** MODIFY — add `force` flag, scenario 7 reuses existing logic.
8. **`worktree.gateway.ts`** MODIFY — add `force?: boolean` to `RemoveWorktreeRequest`.
9. **`worktree.fileSystem.gateway.ts`** MODIFY — propagate `force`.
10. **`worktreePanel.presenter.ts`** MODIFY + tests — scenarios 9, 10 (presentation only). Walking skeleton top half complete.
11. **`gitCommand.gateway.ts`** MODIFY — add `'status-porcelain'` kind.
12. **`worktreeHealthProbe.fileSystem.gateway.ts`** + tests — real FS implementation. Scenarios 3, 4, 5 wired to real signals.
13. **`runtimeSettings.ts`** MODIFY + tests — `worktreeStaleThresholdHours` accessor.
14. **`worktreeOverview.routes.ts`** MODIFY + tests — GET extension + POST cleanup. Scenarios 6, 7, 8 covered at controller level.
15. **`worktreePanel.js` (dashboard)** MODIFY + tests — alert rendering, force-cleanup button, fetch helper. Scenario 10 covered at view level.
16. **`index.html` + `styles.css`** — bind handler, CSS for alerts (no test, smoke-checked by acceptance test loading the page is out of scope — covered manually).
17. **`dependencies.ts` + `routes.ts`** — composition root wiring. Final step.
18. **`175-worktree-failure-visibility.acceptance.test.ts`** — written FIRST per SDD (RED), turns GREEN at step 17. (Order: created at step 0 of implementation, asserted GREEN at end.)

---

## REFERENCE_FILES

- `src/modules/worktree-management/entities/worktree/worktree.schema.ts` — pattern for branded `WorktreePath`, discriminated `EnsureResult`/`RemoveResult`. Mirror this style for `WorktreeHealth`.
- `src/modules/worktree-management/entities/worktree/worktree.gateway.ts` — gateway contract style (interface in entities/).
- `src/modules/worktree-management/usecases/removeWorktree.usecase.ts` — must extend with `force` flag.
- `src/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.ts` — pattern for entry-list iteration with per-entry decision.
- `src/modules/worktree-management/interface-adapters/gateways/worktree.fileSystem.gateway.ts` — pattern for FS gateway delegating to use case.
- `src/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.ts` — ViewModel shape, size-cache pattern, group sorting. Extension target.
- `src/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.ts` — Fastify route plugin style; 409/500 error envelopes.
- `src/dashboard/modules/worktreePanel.js` — humble object with JSDoc, `escapeHtml`, `formatRelativeAge`, `formatBytes`. Extend with `renderDegradedAlerts`.
- `src/tests/acceptance/173-dashboard-worktree-panel.acceptance.test.ts` — outer-loop blueprint to clone.
- `src/tests/stubs/worktreeSizeProbe.stub.ts` — stub style to mirror for `worktreeHealthProbe.stub.ts`.
- `src/frameworks/scheduler/worktreeSweepScheduler.ts` — shows the `runSweepNow` lock pattern; informs `ForceCleanupLockService` shape.
- `src/frameworks/settings/runtimeSettings.ts` — pattern for adding a new persisted setting field.

---

## FILES TO CREATE vs MODIFY (summary)

### CREATE (10)

1. `src/modules/worktree-management/entities/worktree/worktreeHealth.schema.ts`
2. `src/modules/worktree-management/entities/worktree/worktreeHealthProbe.gateway.ts`
3. `src/modules/worktree-management/usecases/detectDegradedWorktrees.usecase.ts`
4. `src/modules/worktree-management/services/forceCleanupLock.ts`
5. `src/modules/worktree-management/interface-adapters/gateways/worktreeHealthProbe.fileSystem.gateway.ts`
6. `src/tests/factories/worktreeHealth.factory.ts`
7. `src/tests/stubs/worktreeHealthProbe.stub.ts`
8. `src/tests/acceptance/175-worktree-failure-visibility.acceptance.test.ts`
9. Unit tests mirroring sources (entity, use case, service, gateway impl)
10. `src/tests/units/dashboard/modules/worktreePanel.test.js` (if not already present — Glob check needed at implementation time)

### MODIFY (8)

1. `src/modules/worktree-management/entities/worktree/worktree.gateway.ts` — add `force?: boolean` to `RemoveWorktreeRequest`
2. `src/modules/worktree-management/entities/gitCommand/gitCommand.gateway.ts` — add `'status-porcelain'` kind
3. `src/modules/worktree-management/usecases/removeWorktree.usecase.ts` — accept `force` flag
4. `src/modules/worktree-management/interface-adapters/gateways/worktree.fileSystem.gateway.ts` — propagate `force`
5. `src/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.ts` — add `degraded[]`, `degradedCount`
6. `src/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.ts` — add POST cleanup, extend GET payload
7. `src/frameworks/settings/runtimeSettings.ts` — add `worktreeStaleThresholdHours`
8. `src/main/dependencies.ts` + `src/main/routes.ts` — wiring
9. `src/dashboard/modules/worktreePanel.js` + `src/dashboard/index.html` + `src/dashboard/styles.css` — view layer

### TRACKER UPDATE

Set SPEC-175 row in `docs/feature-tracker.md` from `drafted` to `planned` and append link to this plan file.
