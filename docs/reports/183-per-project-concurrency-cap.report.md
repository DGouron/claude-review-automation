# Spec 183 — Per-project concurrency cap — Implementation report

## Status

**Complete.** All 17 DSL scenarios from the spec are covered by an outer-loop acceptance test (`src/tests/acceptance/183-per-project-concurrency-cap.acceptance.test.ts`) that flips RED → GREEN as the inside-out layers wire together. Final pipeline state: `yarn verify` = 309 test files, 2460 tests, zero typecheck/lint failures.

## Files created

| Path | Purpose |
|------|---------|
| `src/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.schema.ts` | Branded type + min/max/default constants for the cap. |
| `src/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.valueObject.ts` | `validateProjectConcurrencyCap` (server) + `effectiveProjectConcurrencyCap` (fallback to default 2) + French error message constants. |
| `src/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.guard.ts` | Zod guard mirroring the value object. |
| `src/modules/cli-configuration/entities/repositoriesList/repositoriesList.gateway.ts` | Contract `list(): DeclaredRepository[]` consumed by the recompute use case. |
| `src/modules/cli-configuration/interface-adapters/gateways/repositoriesList.runtimeConfig.gateway.ts` | Runtime-config-backed implementation wrapping `~/.claude-review/config.json`. |
| `src/modules/cli-configuration/usecases/projectConfig/recomputeGlobalConcurrency.usecase.ts` | Sums per-project effective caps, pushes per-project caps to the semaphore, and sets the global PQueue concurrency. |
| `src/frameworks/queue/projectSemaphore.ts` | Per-project semaphore primitive (acquire/release/setCapacity) that serialises projects without blocking others. |
| `src/dashboard/modules/headerCapacityBadge.js` | Pure module: `buildHeaderCapacityViewModel` + `renderHeaderCapacityBadgeHtml` for the header "running / total" badge. |
| `src/tests/factories/projectConcurrencyCap.factory.ts` | Test factory for cap inputs. |
| `src/tests/stubs/repositoriesListGateway.stub.ts` | Stub for `RepositoriesListGateway`. |
| `src/tests/stubs/queueCapacityPort.stub.ts` | Stub for the queue capacity port (records calls). |
| `src/tests/acceptance/183-per-project-concurrency-cap.acceptance.test.ts` | Outer-loop SDD test grouping the 17 DSL scenarios into 7 `describe` blocks. |
| `src/tests/units/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.valueObject.test.ts` | Value object unit tests. |
| `src/tests/units/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.guard.test.ts` | Guard unit tests. |
| `src/tests/units/modules/cli-configuration/interface-adapters/gateways/repositoriesList.runtimeConfig.gateway.test.ts` | Runtime gateway unit tests. |
| `src/tests/units/modules/cli-configuration/usecases/projectConfig/recomputeGlobalConcurrency.usecase.test.ts` | Recompute use case unit tests. |
| `src/tests/units/frameworks/queue/projectSemaphore.test.ts` | Semaphore primitive unit tests. |
| `src/tests/units/dashboard/modules/headerCapacityBadge.test.ts` | Frontend humble module unit tests. |

## Files modified

| Path | Change |
|------|--------|
| `src/config/projectConfig.ts` | Added optional `maxConcurrentReviews: number` to `ProjectConfig` and its parser. |
| `src/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.ts` | Patch contract extended with `maxConcurrentReviews`; validation delegated to the value object; returns `'invalid'` with French reason on bad input. |
| `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts` | `PATCH /api/project-config` now accepts `maxConcurrentReviews` (number or stringified integer or `""` for "required" rejection); calls optional `onSaved` hook after a successful save. |
| `src/modules/statistics-insights/interface-adapters/presenters/overview.presenter.ts` | Added `OverviewCapacityInput` + `HeaderCapacityViewModel` to the contract and computed `headerCapacity` (`"N / M"` label + `isSaturated`). |
| `src/modules/statistics-insights/interface-adapters/controllers/http/overview.routes.ts` | `GET /api/overview` exposes `capacity` via the new `getCapacity` option. |
| `src/frameworks/queue/pQueueAdapter.ts` | Added per-project semaphore layer between MR-chain serialization and `PQueue.add()`, plus public functions `setProjectConcurrencyCap`, `setGlobalConcurrency`, `getRunningCount`, `getTotalCapacity`. |
| `src/main/routes.ts` | Wires `RecomputeGlobalConcurrencyUseCase` once at boot (seeds caps + global concurrency) and again as `onSaved` hook of `projectConfigRoutes`. Injects `getCapacity` into `overviewRoutes`. |
| `src/dashboard/modules/settingsModal.js` | `EDITABLE_KEYS` extended with `maxConcurrentReviews`; viewmodel gets `maxConcurrentReviews` (default `"2"`); HTML gets a numeric input bounded to `min=1` / `max=10`; new `validateMaxConcurrentReviews(value)` mirrors server validation. |
| `src/dashboard/index.html` | Imports `headerCapacityBadge` + `validateMaxConcurrentReviews`; adds `#header-capacity-badge-slot` in the header; new helpers `applyHeaderCapacityViewModel` + `refreshHeaderCapacityBadge`; settings modal submit validates the cap and re-fetches the badge after save; badge refreshed at boot via `initOverviewAndTabs`. |
| `src/dashboard/styles.css` | New `.header-capacity-badge` + `.header-capacity-badge--saturated` (pulse). |
| `src/dashboard/modules/i18n.js` | New keys `settings.maxConcurrentReviews` and `settings.maxConcurrentReviewsHint` (EN + FR). |
| `src/tests/units/dashboard/modules/settingsModal.test.ts` | Existing viewmodels updated to include the new required `maxConcurrentReviews` field. |
| `src/tests/units/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.test.ts` | Cases added for cap validation / persistence / `null` clear. |
| `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.test.ts` | HTTP cases added for the three French rejections and the success path. |
| `src/tests/units/modules/statistics-insights/interface-adapters/controllers/http/overview.routes.test.ts` | Asserts `capacity` is forwarded from the option. |
| `src/tests/units/modules/statistics-insights/interface-adapters/presenters/overview.presenter.test.ts` | Asserts the `headerCapacity` viewmodel shape and saturation logic. |
| `src/tests/units/frameworks/queue/pQueueAdapter.test.ts` | New cases for the per-project semaphore behaviour inside the queue adapter. |
| `docs/feature-tracker.md` | Spec 183 appended (`drafted` → `planned` → `implemented`). |

## Tests

- Total: **2460 passed / 0 failed** across **309 test files**.
- Acceptance file: 17 DSL scenarios, all GREEN.
- Self-review iterations: **2** (one to fix a lint diagnostic on an empty interface in the recompute use case, one to extend the dashboard settings modal viewmodel typedef to include the new property).
- Remaining issues: **none**.

## Acceptance test trajectory

1. RED — file created at the very start of the implementation; only the spec was in place.
2. RED — entity + use cases land; acceptance imports of frontend symbols still fail.
3. RED — backend complete (semaphore wired, presenter exposes capacity); dashboard modules missing.
4. GREEN — `validateMaxConcurrentReviews` exported + `headerCapacityBadge` module created.

## Spec coverage

| Rule (spec 183) | Covered by |
|-----------------|------------|
| Each project owns a `maxConcurrentReviews` setting | `projectConfig.ts` extension + acceptance `valid update` scenario. |
| Default 2 when absent | `effectiveProjectConcurrencyCap` + acceptance `missing key falls back`. |
| Accepted range `[1, 10]` | Value object + acceptance `value too low`, `value too high`, `value negative`. |
| Editable from the settings modal | `settingsModal.js` input + acceptance `settings modal exposes maxConcurrentReviews input`. |
| Out-of-range rejected with French message | Acceptance `value too low/high/negative` returning `PROJECT_CAP_OUT_OF_RANGE_MESSAGE`. |
| Non-numeric rejected with French message | Acceptance `value non integer`, `value not a number`. |
| Empty rejected with French message | Acceptance `value empty` returning `PROJECT_CAP_REQUIRED_MESSAGE`. |
| Persisted on save | `UpdateProjectConfigUseCase` + acceptance `valid update`. |
| Per-project running count capped | Semaphore + acceptance `enforce cap at runtime`, `below cap accepts new review`. |
| New review held when at cap | Same acceptance scenarios. |
| Lowering cap doesn't interrupt | `ProjectSemaphore.setCapacity` + acceptance `lower cap with running reviews`. |
| Raising cap releases queued | Same + acceptance `raise cap releases queued`. |
| Header total = sum of effective caps | `RecomputeGlobalConcurrencyUseCase` + acceptance `total capacity equals sum`. |
| Header running = sum running across projects | `getRunningCount` + presenter + acceptance `header reflects running count`. |
| Header indicator `running / total` | Presenter + acceptance `header reflects running count`. |
| Recompute on cap change | `onSaved` hook in `routes.ts` (wiring) + acceptance `new project adds to total`, `project removed shrinks total`. |
| Recompute on project add/remove | Same — runtime config list is the source of truth. |

## Architectural decisions taken during implementation

1. **No `onCapChanged` hook** — the existing project-config save flow is reused. A new optional `onSaved(projectPath)` callback is added to `ProjectConfigRoutesOptions`; `routes.ts` wires it to the recompute use case. Cheap, no extra event bus.
2. **`RecomputeGlobalConcurrencyInput = Record<string, never>`** — the use case takes no input, but `UseCase<Input, Output>` from `shared/foundation/usecase.base.ts` requires a typed input. A type alias instead of an empty interface keeps Biome happy.
3. **Semaphore lives in its own file** — `src/frameworks/queue/projectSemaphore.ts` rather than inlined in `pQueueAdapter.ts`. Lets the primitive be unit-tested in isolation and keeps `pQueueAdapter` shorter.
4. **Boot-time recompute** — `recomputeGlobalConcurrency.execute({})` is called once in `routes.ts` (right after the use case is constructed). Server boot already calls `initQueue` first, so `setGlobalConcurrency` lands on a live PQueue.
5. **`Math.max(totalCapacity, 1)`** — if no projects are declared (fresh install), the global concurrency stays at 1 so any future review can still run.
6. **`onSaved` is fired on every successful PATCH**, not only when the cap changes. The recompute is O(repositories) and reading `.claude/reviews/config.json` is local I/O; the simplicity of "save → recompute" outweighs the optimisation of diffing the patch.
7. **Frontend default in viewmodel** — when a project config has no `maxConcurrentReviews`, the settings modal shows `"2"` (the documented default) instead of an empty input, so the user sees what's currently in effect rather than guessing.
8. **Saturation animation reuses `pulse`** — same keyframes as the connecting status dot. Avoids introducing a new visual primitive.

## Wiring summary (post-implementation)

```
boot
 └─ initQueue(logger)                                   ← unchanged
 └─ registerRoutes(app, deps)
     └─ new RecomputeGlobalConcurrencyUseCase({...})
         └─ execute({})                                 ← seeds projectCaps + pQueue.concurrency
     └─ overviewRoutes.register({
          ...,
          getCapacity: () => ({ running, max })         ← reads from pQueueAdapter
        })
     └─ projectConfigRoutes.register({
          updateProjectConfig,
          onSaved: () => recompute.execute({})          ← live update
        })
```
