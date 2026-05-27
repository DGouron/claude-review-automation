# Plan — Per-project concurrency cap for reviews (spec 183)

## Scope

Cap the number of reviews that can run in parallel **per project**, instead of only globally.
A new `maxConcurrentReviews` setting (default 2, range 1-10) is added to project configuration, exposed in the settings modal, enforced at runtime by a semaphore wrapping the existing PQueue, and surfaced in a new dashboard header badge "running / total".

- `is_new_module`: false. This extends:
  - `src/config/projectConfig.ts` (domain config type + parsing)
  - `src/modules/cli-configuration/` (whitelist, PATCH route, validation)
  - `src/frameworks/queue/pQueueAdapter.ts` (runtime semaphore + global recompute)
  - `src/modules/statistics-insights/.../overview.*` (capacity exposure)
  - `src/dashboard/` (modal input + header badge)

- This plan introduces ONE small new entity/value object (`ProjectConcurrencyCap`) and ONE new use case (`RecomputeGlobalConcurrencyUseCase`) — both narrow scopes, no new module. Anti-overengineering check passes: each layer carries actual business logic (cap validation, sum arithmetic, runtime gating).

---

## ACCEPTANCE_TEST

```
file: src/tests/acceptance/183-per-project-concurrency-cap.acceptance.test.ts
note: "SDD outer loop — written FIRST by the implementer, stays RED during impl, GREEN at the end.
       Covers the 17 DSL scenarios: cap validation (range, integer, empty), runtime enforcement
       (held/released/lowered/raised), dashboard header arithmetic (sum, saturation, add/remove project)."
```

---

## ENTITIES

### 1. ProjectConcurrencyCap (value object)

- name: `ProjectConcurrencyCap`
- file: `src/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.valueObject.ts`
- schema: `src/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.schema.ts`
- guard: `src/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.guard.ts`
- test: `src/tests/units/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.valueObject.test.ts` + `.guard.test.ts`
- factory: `src/tests/factories/projectConcurrencyCap.factory.ts`
- Responsibility:
  - Zod schema: `z.number().int().min(1).max(10)`.
  - `parseProjectConcurrencyCap(value)`, `safeParseProjectConcurrencyCap(value)`, `isValidProjectConcurrencyCap(value)`.
  - Helper `effectiveProjectConcurrencyCap(config: { maxConcurrentReviews?: number }) → number` returning `config.maxConcurrentReviews ?? DEFAULT_PROJECT_CONCURRENCY_CAP (2)`.
  - Exports `DEFAULT_PROJECT_CONCURRENCY_CAP = 2`, `MIN_PROJECT_CONCURRENCY_CAP = 1`, `MAX_PROJECT_CONCURRENCY_CAP = 10`.
  - Exports French validation messages as constants (single source of truth shared by usecase + dashboard):
    - `PROJECT_CAP_REQUIRED_MESSAGE = 'La valeur est obligatoire'`
    - `PROJECT_CAP_NOT_INTEGER_MESSAGE = 'La valeur doit être un nombre entier'`
    - `PROJECT_CAP_OUT_OF_RANGE_MESSAGE = 'La valeur doit être comprise entre 1 et 10'`

### 2. Extension of `ProjectConfig`

- file: `src/config/projectConfig.ts` (existing, extend)
- Add field: `maxConcurrentReviews?: number` on the `ProjectConfig` interface (line 28 area, near `qualityThreshold`).
- Add helper `parseMaxConcurrentReviews(value: unknown): number | undefined` mirroring `parseQualityThreshold` (line 50 area). Uses the value-object schema. Throws on invalid integer / range — message in French (using the constants from the value object).
- Wire into `parseProjectConfig()` (line 208 area) right after `qualityThreshold`.
- No new file — same-scope mechanical addition.

---

## USECASES

### 1. UpdateProjectConfigUseCase (extension — no new file)

- file: `src/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.ts` (existing)
- test: `src/tests/units/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.test.ts` (existing — add cases)
- Changes:
  - Add `'maxConcurrentReviews'` to `EDITABLE_PROJECT_CONFIG_KEYS`.
  - Extend `ProjectConfigPatch`: `maxConcurrentReviews?: number | null`.
  - Add `validateMaxConcurrentReviews(value): {ok:true}|{ok:false,reason:string}` — uses the value-object schema, returns the French messages from the value object module.
  - Extend `mergeConfig`: handle `maxConcurrentReviews` (number → set; `null` → omit key).
  - Extend `execute()`: validate `maxConcurrentReviews` BEFORE reading the gateway (same pattern as qualityThreshold).
  - Add an `onCapChanged?: (path: string, newCap: number) => void` constructor callback (optional; reuse the existing `onUpdated` pattern, but a dedicated hook makes the runtime-recompute trigger explicit and testable). Decision rationale logged in OPEN_QUESTIONS.

### 2. RecomputeGlobalConcurrencyUseCase (new)

- name: `RecomputeGlobalConcurrencyUseCase`
- file: `src/modules/cli-configuration/usecases/projectConfig/recomputeGlobalConcurrency.usecase.ts`
- test: `src/tests/units/modules/cli-configuration/usecases/projectConfig/recomputeGlobalConcurrency.usecase.test.ts`
- type: command
- input: `{ }` (no args — reads gateways)
- output: `{ totalCapacity: number, perProjectCaps: Array<{ path: string, cap: number }> }`
- Dependencies (injected):
  - `RepositoriesListGateway` — returns the list of declared repository paths from `~/.claude-review/config.json` (see Gateways section).
  - `ProjectConfigGateway` — already exists; used to read each project's `maxConcurrentReviews`.
  - `QueueCapacityPort` — small port to apply `pQueue.concurrency = sum` (see Frameworks section).
- Responsibility:
  - List declared repos (from runtime config).
  - For each: read its config, resolve `effectiveProjectConcurrencyCap` (default 2 on missing/not-found/malformed).
  - Sum → set as global queue concurrency through the port.
  - Return the breakdown for observability/tests.

---

## GATEWAYS

### 1. ProjectConfigGateway (existing — UNTOUCHED contract)

- contract: `src/modules/cli-configuration/entities/projectConfig/projectConfig.gateway.ts` (no change — already returns the full `ProjectConfig` which will now include `maxConcurrentReviews`).
- implementation: `src/modules/cli-configuration/interface-adapters/gateways/projectConfig.fileSystem.gateway.ts` (no change — it delegates to `parseProjectConfig` which we extend).
- stub: `src/tests/stubs/projectConfigGateway.stub.ts` (no change — already accepts the full ProjectConfig).

### 2. RepositoriesListGateway (new — narrow port)

- name: `RepositoriesListGateway`
- contract: `src/modules/cli-configuration/entities/repositoriesList/repositoriesList.gateway.ts`
- implementation: `src/modules/cli-configuration/interface-adapters/gateways/repositoriesList.runtimeConfig.gateway.ts`
- stub: `src/tests/stubs/repositoriesListGateway.stub.ts`
- methods:
  - `list(): Array<{ name: string; localPath: string; enabled: boolean }>`
- Rationale: the use case needs the **set of declared projects** (the runtime list, not each project's own config). The composition root already calls `loadConfig().repositories` (see `src/main/routes.ts:127, 148, 197, ...`). The implementation simply wraps `loadConfig().repositories`. Both enabled AND disabled projects contribute to total capacity — spec says "declared in the runtime configuration", no enabled filter. Confirm in OPEN_QUESTIONS.

---

## CONTROLLERS

### 1. projectConfig.routes (extension)

- file: `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts` (existing)
- test: `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.test.ts` (existing — add cases)
- Changes:
  - `patchBodySchema` (line 22): add `maxConcurrentReviews: z.unknown().optional()`.
  - `extractPatch()` (line 56): accept `maxConcurrentReviews` — number, integer-string ("4"), `null`/empty-string to clear. Forward the raw parsed value; the use case owns validation.
  - The 400 path already maps `result.status === 'invalid'` to `{ success: false, error: result.reason }` — the French message bubbles up naturally.

### 2. overview.routes (extension)

- file: `src/modules/statistics-insights/interface-adapters/controllers/http/overview.routes.ts` (existing)
- test: existing — extend.
- Changes:
  - Add an option `getCapacity: () => { running: number, max: number }` to `OverviewRoutesOptions`.
  - Pass it into the presenter via the new `capacity` field on `OverviewPresenterInput`.
  - Wiring builds `getCapacity` from `getJobsStatus().active` (count where `status === 'running'`) and `RecomputeGlobalConcurrencyUseCase` snapshot (or the live value held by the QueueCapacityPort — see Frameworks).

---

## PRESENTERS

### OverviewPresenter (extension — no new file)

- file: `src/modules/statistics-insights/interface-adapters/presenters/overview.presenter.ts` (existing)
- test: existing — add cases.
- Changes:
  - Extend `OverviewPresenterInput`: add `capacity: { running: number, max: number }`.
  - Extend `OverviewViewModel`: add `headerCapacity: { runningCount: number; totalCapacity: number; label: string; isSaturated: boolean }`.
  - `label` formatted as `"<running> / <max>"` (matches spec scenario "3 / 5"). `isSaturated = runningCount >= totalCapacity && totalCapacity > 0`.

---

## VIEWS

### 1. settingsModal.js (extension — no new file)

- file: `src/dashboard/modules/settingsModal.js` (existing)
- test: `src/tests/units/dashboard/modules/settingsModal.test.js` (existing — extend)
- Changes:
  - Add `'maxConcurrentReviews'` to `EDITABLE_KEYS` (line 15).
  - Extend `SettingsModalViewModel` JSDoc + `buildSettingsViewModel` to expose `maxConcurrentReviews: string` (default '' when missing).
  - Add a numeric input in `renderSettingsModalHtml` (next to qualityThreshold) — `min="1"` `max="10"` `step="1"` `required`.
  - Add `validateMaxConcurrentReviews(value)` mirroring `validateQualityThreshold` (line 190) — empty → required message, non-integer → integer message, out-of-range → range message. All in French, all from the same constants the server uses (duplicate the strings on the JS side; cite the server constants in a comment so they stay in sync).
  - `extractFormPayload` already iterates over `EDITABLE_KEYS` — auto-picks the new field. No code change there.

### 2. Header capacity badge (new — humble object)

- name: `HeaderCapacityBadge`
- file: `src/dashboard/modules/headerCapacityBadge.js`
- test: `src/tests/units/dashboard/modules/headerCapacityBadge.test.js`
- Pattern: pure functions, no DOM access, viewmodel-in / HTML-out (mirror of `cardCounters.js`).
- Exports:
  - `buildHeaderCapacityViewModel({ running, max })` → `{ label: '3 / 5', isSaturated: false }` (delegates to the presenter contract via the API response shape).
  - `renderHeaderCapacityBadge(viewModel)` → HTML string.
- index.html change: add an element in the header (e.g. inside `.header-actions` near `#server-status`, line 38-42) with id `header-capacity-badge`. Live-updated by the existing `/api/overview` polling loop in `src/dashboard/app.js` (or equivalent — implementer to confirm and wire). Saturation visual state = a CSS class (`header-capacity-badge--saturated`).
  - Styling: add a small block to `src/dashboard/styles.css` respecting the "Agentic OS" DNA (monospace, corner-bracket frame, amber accent in normal state, red glow when saturated). Implementer to inspect existing badge styles.

---

## FRAMEWORKS

### pQueueAdapter (extension — the runtime heart)

- file: `src/frameworks/queue/pQueueAdapter.ts` (existing)
- test: `src/tests/units/frameworks/queue/pQueueAdapter.test.ts` (existing — extend with per-project cap scenarios)
- Add module-internal state:
  - `const runningByProject = new Map<string, number>()` keyed by `projectPath`.
  - `const projectChains = new Map<string, Promise<void>>()` — analogue to `mrChains` but at project scope, gating ENTRY into PQueue.add().
  - `const projectCaps = new Map<string, number>()` — last-applied cap per project; populated by `setProjectConcurrencyCap`.
- Add public API:
  - `setProjectConcurrencyCap(projectPath: string, cap: number): void` — updates `projectCaps`. Triggers `recomputeGlobalConcurrency()`. When the cap is RAISED, calls an internal `releasePendingFor(projectPath)` that resolves up to `(newCap - running)` waiters queued for that project.
  - `getRunningCount(): number` — sum of `runningByProject.values()` (used by `/api/overview`).
  - `getTotalCapacity(): number` — sum of `projectCaps.values()` (used by `/api/overview`).
  - `setGlobalConcurrency(value: number): void` — assigns `pQueue.concurrency = value`. (Wraps the unsafe direct assignment; called by the recompute use case.)
- Modify `enqueueReview()` (lines 175-283):
  - After the MR-chain `previousTail` wait, BEFORE `q.add(...)`, await a project-gate that resolves only when `runningByProject[projectPath] < projectCaps[projectPath] ?? DEFAULT_PROJECT_CONCURRENCY_CAP`.
  - Increment `runningByProject[projectPath]` when the gate resolves; decrement in the `finally` block (same place that deletes from `activeJobs` and `mrChains`).
  - Implementation pattern for the gate: a per-project FIFO queue of `() => boolean` checkers + a `Promise` resolved when the lock can be acquired. Lightweight semaphore — no library — about 30 LOC of state machine inside the adapter. Encapsulate as a private `ProjectSemaphore` class at the bottom of the file (or extract to a sibling file `projectSemaphore.ts` if it exceeds 50 LOC).
- Preserved invariants (DO NOT regress):
  - MR-chain serialization (lines 79-91, 222-271) stays intact and runs BEFORE the project gate.
  - Deduplication, abort, completed-jobs retention (`MAX_COMPLETED_JOBS = 20`), state-change/progress callbacks — unchanged.

### projectSemaphore.ts (optional small file — implementer's call)

- file: `src/frameworks/queue/projectSemaphore.ts`
- test: `src/tests/units/frameworks/queue/projectSemaphore.test.ts`
- Tiny semaphore primitive: `acquire(key)` / `release(key)` / `setCapacity(key, n)` / `pendingCountForKey(key)`. Pure logic, no PQueue knowledge. If implemented, `pQueueAdapter` only orchestrates.
- Justification: a) testable in isolation without spinning the PQueue; b) keeps `pQueueAdapter.ts` from ballooning beyond ~500 LOC. If implementer keeps logic ≤30 LOC inline in the adapter, this file can be skipped.

### QueueCapacityPort

- Defined inline in `recomputeGlobalConcurrency.usecase.ts` as an interface:
  - `setGlobalConcurrency(value: number): void`
  - `setProjectConcurrencyCap(projectPath: string, cap: number): void`
- Implemented in `pQueueAdapter` (the two public functions above). The use case never imports the adapter directly — the composition root wires the port.

---

## WIRING

### `src/main/routes.ts`

1. Instantiate `RepositoriesListGateway` (wraps `() => deps.config.repositories`).
2. Build the `QueueCapacityPort` adapter from `pQueueAdapter` exports (`setProjectConcurrencyCap`, `setGlobalConcurrency`).
3. Instantiate `recomputeGlobalConcurrency = new RecomputeGlobalConcurrencyUseCase({ repositoriesListGateway, projectConfigGateway, queueCapacityPort })`.
4. **On boot, after `initQueue(deps.logger)` but before serving traffic**, call `recomputeGlobalConcurrency.execute()` once to seed every project's cap from disk and align `pQueue.concurrency` with the sum.
5. `updateProjectConfig = new UpdateProjectConfigUseCase(projectConfigGateway, (config) => { /* existing onUpdated */ })` — extend the second arg to also call `recomputeGlobalConcurrency.execute()` whenever the patch touched `maxConcurrentReviews`. The use case knows because the change-detection callback receives `(path, newCap)`. Concretely: thread the new `onCapChanged` constructor arg.
6. `overviewRoutes` registration (line 146): add the new option `getCapacity: () => ({ running: getRunningCount(), max: getTotalCapacity() })`. Both imported from `pQueueAdapter`.
7. Repository add/remove flows (`addRepositoryFromDashboard`, `removeRepositoryFromDashboard`, line 409-432): after a successful add/remove, call `recomputeGlobalConcurrency.execute()` so the header total reflects the new declared set. Hook via a callback option on those use cases OR a thin wrapper in the route — implementer to pick the lightest path.

### Imports added (top of routes.ts)

- `RecomputeGlobalConcurrencyUseCase`
- `RepositoriesListRuntimeConfigGateway`
- `setProjectConcurrencyCap`, `setGlobalConcurrency`, `getRunningCount`, `getTotalCapacity` from `pQueueAdapter`.

---

## TESTS_SUPPORT

- **Factory**: `src/tests/factories/projectConcurrencyCap.factory.ts` — `create(overrides?)` returns a valid cap (default 2).
- **Stub**: `src/tests/stubs/repositoriesListGateway.stub.ts` — `StubRepositoriesListGateway` with `set(repos)` and `list()`.
- **Stub**: `src/tests/stubs/queueCapacityPort.stub.ts` — `StubQueueCapacityPort` recording calls to `setGlobalConcurrency` and `setProjectConcurrencyCap` for use-case unit tests.
- **Reuse**: `StubProjectConfigGateway` (already exists) — extended only via the `set(path, config)` payload now carrying `maxConcurrentReviews`.

---

## UNTOUCHED (do NOT refactor opportunistically)

- `mrChains` MR-level serialization mechanism (`pQueueAdapter.ts:79-91, 222-271`) — keep verbatim, only ADD the project gate after it.
- Deduplication system (`recentJobs`, `shouldDeduplicate`, `markJobProcessed`, `clearJobDeduplication`).
- `AbortController` flow + `cancelJob`.
- `JobStatus` shape, `getJobStatus`, `getJobsStatus`, `MAX_COMPLETED_JOBS`.
- `ProjectConfigGateway` contract — adding a key to `ProjectConfig` is backward-compatible.
- `qualityThreshold` validation pattern is mirrored — do NOT generalise the two into a shared "numeric field validator". YAGNI.
- `config.queue.maxConcurrent` from `~/.claude-review/config.json` stays as the initial seed BEFORE the recompute kicks in (acts as a fallback if no projects declared); the recompute then overrides. Document this in code comment only — no UI change.

---

## OPEN_QUESTIONS

1. **`onCapChanged` callback shape.** Two options for triggering the recompute after a PATCH:
   - (A) Pass a dedicated `onCapChanged?: (path, newCap) => void` to `UpdateProjectConfigUseCase` constructor. Pro: explicit, single-purpose. Con: yet another callback.
   - (B) Reuse the existing `onUpdated?: (config) => void` and have the wiring call recompute unconditionally on every config update. Pro: simpler. Con: recomputes on every settings save even when cap was untouched (cheap, but noisy log).
   - **Recommended**: (B). The recompute is O(N) over declared projects (~handful), and N reads from the file-system gateway. Cheap. Avoids leaking a domain-specific concept into a generic use case.
2. **Disabled projects in the total.** Spec text: "sum of `maxConcurrentReviews` across all projects declared in the runtime configuration". Strictly literal → disabled count. Operationally sensible → only enabled (disabled projects can't enqueue anyway). **Recommended**: include disabled (matches the spec verbatim; implementer can flip later if surprised).
3. **Initial seed when no projects declared.** Should the global concurrency fall back to the legacy `config.queue.maxConcurrent`? **Recommended**: yes, with a guard `Math.max(sum, 1)` so PQueue never gets `concurrency=0`.
4. **Dashboard header placement.** Spec says "header" without DOM-level placement. Two candidates: (a) inside `.header-actions` next to `#server-status` (header bar), (b) in the `.cards` row alongside `running-count`/`queued-count` (line 82-95). **Recommended**: (a) — spec text explicitly says "dashboard header indicator", and the cards row already covers per-status counts. Implementer to confirm visually.
5. **i18n.** The header label format `"running / total"` is locale-agnostic (numerals + slash); no i18n key needed per spec out-of-scope. Confirmed.

None of these block kick-off; (1)-(4) are recommendations the implementer can adopt unless the user vetoes.

---

## IMPLEMENTATION_ORDER

Inside-out, walking-skeleton bias. Each step is testable in isolation.

1. **Acceptance test skeleton** — `src/tests/acceptance/183-per-project-concurrency-cap.acceptance.test.ts` written FIRST, RED. Translates the 17 DSL scenarios into assertions. Will remain RED until step 11.
2. **ProjectConcurrencyCap value object + schema + guard + factory + tests** — pure domain, no deps. Establishes the validation contract and French messages. Walking-skeleton entry point.
3. **`parseMaxConcurrentReviews` in `projectConfig.ts` + `parseProjectConfig` integration + tests** — boundary parsing for the file format.
4. **Extend `UpdateProjectConfigUseCase`** (whitelist + validation + merge) + extend its tests with the 7 cap-validation DSL scenarios (valid update, too low, too high, negative, non-integer, non-numeric, empty, missing-key-fallback).
5. **Extend `projectConfig.routes.ts` PATCH** (schema + extractPatch) + extend route tests (HTTP edge: number, integer-string, null, empty-string, garbage).
6. **`RepositoriesListGateway` contract + runtime implementation + stub + tests**.
7. **`RecomputeGlobalConcurrencyUseCase` + `QueueCapacityPort` interface + use case tests** with `StubProjectConfigGateway` + `StubRepositoriesListGateway` + `StubQueueCapacityPort`. Covers DSL scenarios: total-capacity-equals-sum, new-project-adds, project-removed-shrinks.
8. **(Optional) `projectSemaphore.ts` primitive + tests** — only if the inline state machine in step 9 exceeds 30 LOC.
9. **Extend `pQueueAdapter.ts`** with `runningByProject` tracking + project gate + `setProjectConcurrencyCap` / `setGlobalConcurrency` / `getRunningCount` / `getTotalCapacity` exports. Extend `pQueueAdapter.test.ts` with the 4 runtime DSL scenarios (enforce cap, below cap, lower cap with running, raise cap releases queued).
10. **Extend `OverviewPresenter`** + tests with `capacity` input → `headerCapacity` viewmodel. Covers DSL scenarios: header-reflects-running, saturated-header.
11. **Extend `overview.routes.ts`** + tests with the new `getCapacity` option wiring.
12. **Dashboard `settingsModal.js`**: add field + `validateMaxConcurrentReviews` + tests. Covers DSL client-side validation scenarios.
13. **Dashboard `headerCapacityBadge.js`** + tests. Add the DOM hook in `index.html` + CSS in `styles.css`. Hook into the existing overview polling.
14. **Wire everything in `src/main/routes.ts`**: instantiate gateways, seed recompute on boot, pass `getCapacity` to overview, hook recompute into project add/remove and PATCH.
15. **Run the acceptance test** — flips GREEN. `yarn verify` clean.

---

## REFERENCE_FILES

- `src/frameworks/queue/pQueueAdapter.ts` — MR-chain pattern (the project gate mirrors it at a coarser scope); module-level state; `enqueueReview` lifecycle.
- `src/config/projectConfig.ts` — `parseQualityThreshold` is the exact template for `parseMaxConcurrentReviews`.
- `src/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.ts` — `EDITABLE_PROJECT_CONFIG_KEYS`, `validateQualityThreshold`, `mergeConfig` pattern.
- `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts` — `patchBodySchema`, `extractPatch`, French-error pass-through.
- `src/modules/cli-configuration/entities/projectConfig/projectConfig.gateway.ts` — gateway contract shape.
- `src/modules/cli-configuration/interface-adapters/gateways/projectConfig.fileSystem.gateway.ts` — implementation pattern.
- `src/tests/stubs/projectConfigGateway.stub.ts` — stub pattern to mirror for the new gateway.
- `src/modules/statistics-insights/interface-adapters/presenters/overview.presenter.ts` — viewmodel composition pattern.
- `src/modules/statistics-insights/interface-adapters/controllers/http/overview.routes.ts` — route options pattern.
- `src/dashboard/modules/settingsModal.js` — `validateQualityThreshold` is the template; `EDITABLE_KEYS` whitelist; `extractFormPayload`.
- `src/dashboard/modules/cardCounters.js` — humble-object pattern for the header badge.
- `src/dashboard/index.html` lines 27-43 (header) and 82-95 (cards row) — DOM injection sites.
- `src/main/routes.ts` lines 143-161 (overview registration) and 317 (project config registration) — composition-root wiring.
- `src/frameworks/config/configLoader.ts` — `RepositoryConfig` shape consumed by the new RepositoriesListGateway.

---

## Summary (counts)

- New files: **8**
  - `src/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.valueObject.ts`
  - `src/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.schema.ts`
  - `src/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.guard.ts`
  - `src/modules/cli-configuration/entities/repositoriesList/repositoriesList.gateway.ts`
  - `src/modules/cli-configuration/interface-adapters/gateways/repositoriesList.runtimeConfig.gateway.ts`
  - `src/modules/cli-configuration/usecases/projectConfig/recomputeGlobalConcurrency.usecase.ts`
  - `src/dashboard/modules/headerCapacityBadge.js`
  - Optional: `src/frameworks/queue/projectSemaphore.ts`
- New test files: **~10** (mirror of each + acceptance test + factory + 2 stubs).
- Extended files: **~7** (`projectConfig.ts`, `updateProjectConfig.usecase.ts`, `projectConfig.routes.ts`, `overview.presenter.ts`, `overview.routes.ts`, `settingsModal.js`, `pQueueAdapter.ts`, `index.html`, `styles.css`, `routes.ts`).
