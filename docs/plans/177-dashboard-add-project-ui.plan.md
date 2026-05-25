# Plan — SPEC-177 Dashboard Project CRUD UI + Sidebar Animations

> Status: planned
> Spec: `docs/specs/177-dashboard-add-project-ui.md`
> Worktree: `.claude/worktrees/spec-177-add-project-ui/`
> Type: fix on top of SPEC-91 (PR #200)
> is_new_module: false (extends `modules/cli-configuration`)

## Summary

| Metric | Count |
|--------|-------|
| New production files | 4 (2 usecases, 1 dashboard module, 0 entity) |
| Modified production files | 4 (routes, repositories.routes, index.html, styles.css) + 1 (`main/routes.ts` wiring) |
| New test files | 5 (2 usecase tests, 1 routes test extension, 1 dashboard module test, 1 acceptance) |
| Modified test files | 1 (`repositories.routes.test.ts` — add POST/DELETE/PATCH cases) |
| Scenarios mapped | 20 / 20 |

### Layer breakdown

| Layer | Action |
|-------|--------|
| Entities | none (reuses `RepositoryConfig` from `frameworks/config/configLoader.ts` — already in place) |
| Use cases | +2 new (`removeRepositoryFromConfig`, `toggleRepositoryEnabled`); existing `AddRepositoriesToConfigUseCase` reused |
| Controllers / Routes | extend `repositories.routes.ts` (GET → GET + POST + DELETE + PATCH) |
| Dashboard module | new humble module `managePanel.js` |
| CSS | extend `styles.css` (animations + manage panel styling + `prefers-reduced-motion`) |
| index.html | wire `managePanel` + remove 5 dead legacy helpers |
| Composition root | `src/main/routes.ts` — instantiate 2 new usecases, expand `RepositoriesRoutesOptions` |

---

## Scope

Restore CRUD on `config.repositories` from the dashboard sidebar and layer purposeful CSS animations on the project tabs. Reuse the existing `AddRepositoriesToConfigUseCase`; add minimal symmetric usecases for delete and toggle. Persist via `config.json` and mutate `deps.config.repositories` in place so the running pipeline picks up the change without restart.

---

## ENTITIES

No new entity. Reuses:

- `RepositoryConfig` — `src/frameworks/config/configLoader.ts:29` (enriched type)
- `RepositoryInput` shape `{ name, localPath, enabled }` — already the contract used by `AddRepositoriesToConfigUseCase`

**No new schema, guard, gateway contract.** The two new usecases follow the exact same constructor pattern as `AddRepositoriesToConfigUseCase` (raw filesystem deps).

> Decision rationale (anti-overengineering): the existing usecase already does file IO with `readFileSync` / `writeFileSync` / `existsSync` injected as deps — no gateway abstraction. We mirror that for the two new usecases. Wrapping these primitives behind a `RepositoryConfigStore` gateway would be premature given the spec is purely CRUD on a single JSON file.

---

## USECASES

### 1. `AddRepositoriesToConfigUseCase` (REUSED, not modified)

- File: `src/modules/cli-configuration/usecases/cli/addRepositoriesToConfig.usecase.ts`
- Already covers: append entry, dedupe by `localPath`, write to disk
- Used by both CLI (`reviewflow add-repository`) and the new POST route
- The route will call it with a single-element `newRepositories: [{ name, localPath, enabled: true }]` and translate `skipped` into HTTP 409

### 2. `RemoveRepositoryFromConfigUseCase` (NEW)

- File: `src/modules/cli-configuration/usecases/cli/removeRepositoryFromConfig.usecase.ts`
- Purpose: remove a single repository entry from `config.json` by `localPath`
- Public API:
  ```
  interface RemoveRepositoryFromConfigDependencies {
    readFileSync: (path: string, encoding: BufferEncoding) => string;
    writeFileSync: (path: string, content: string) => void;
    existsSync: (path: string) => boolean;
  }
  interface RemoveRepositoryFromConfigInput { configPath: string; localPath: string; }
  interface RemoveRepositoryFromConfigResult { removed: RepositoryEntry | null; configPath: string; }
  class RemoveRepositoryFromConfigUseCase implements UseCase<Input, Result> {
    constructor(deps: RemoveRepositoryFromConfigDependencies);
    execute(input: Input): Result; // removed=null when not found
  }
  ```
- Test: `src/tests/units/modules/cli-configuration/usecases/cli/removeRepositoryFromConfig.usecase.test.ts`
  - Scenarios (mapped from spec):
    - "nominal delete": removes the matching entry, persists the new array, returns `removed`
    - "delete unknown": returns `removed: null`, does not touch disk (or writes identical content — assertion: writeFileSync called 0 times)
    - "config file missing": throws (symmetric with add usecase)
    - "invalid JSON": throws
    - "preserves siblings": removing one of three leaves the other two in order

### 3. `ToggleRepositoryEnabledUseCase` (NEW)

- File: `src/modules/cli-configuration/usecases/cli/toggleRepositoryEnabled.usecase.ts`
- Purpose: set `enabled` boolean of an entry by `localPath`
- Public API:
  ```
  interface ToggleRepositoryEnabledDependencies { readFileSync; writeFileSync; existsSync; }
  interface ToggleRepositoryEnabledInput { configPath: string; localPath: string; enabled: boolean; }
  interface ToggleRepositoryEnabledResult { updated: RepositoryEntry | null; configPath: string; }
  class ToggleRepositoryEnabledUseCase implements UseCase<Input, Result> {
    constructor(deps);
    execute(input): Result; // updated=null when not found
  }
  ```
- Test: `src/tests/units/modules/cli-configuration/usecases/cli/toggleRepositoryEnabled.usecase.test.ts`
  - Scenarios:
    - "enable an entry": flips `false` → `true`, persists
    - "disable an entry": flips `true` → `false`, persists
    - "idempotent": setting `true` on already-true entry still writes the same content (acceptable; assert returned `updated`)
    - "unknown localPath": returns `updated: null`
    - "preserves other fields": `name`, etc. untouched

> Risks: both new usecases re-implement the JSON parse/write boilerplate (same pattern as the existing one). Acceptable per anti-overengineering — extracting a shared helper is a separate refactor.

---

## CONTROLLERS / ROUTES

### `repositoriesRoutes` (EXTENDED)

- File: `src/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.ts`
- Currently exposes: `GET /api/repositories`
- New endpoints: `POST`, `DELETE`, `PATCH` on `/api/repositories`

**Expanded options interface**:
```ts
export interface RepositoriesRoutesOptions {
  getRepositories: () => RepositoryConfig[];
  // In-place mutation of the in-memory repositories array (so review pipeline lambdas see the change without restart)
  mutateRepositories: (mutator: (repos: RepositoryConfig[]) => void) => void;
  addRepository: (input: { localPath: string }) => AddRepositoryRouteResult;
  removeRepository: (input: { localPath: string }) => RemoveRepositoryRouteResult;
  patchRepository: (input: { localPath: string; enabled: boolean }) => PatchRepositoryRouteResult;
}
```

> Decision: route-level wrappers (`addRepository`, `removeRepository`, `patchRepository`) are injected as functions from the composition root rather than building usecases inside the route. This keeps `repositoriesRoutes` framework-agnostic, lets us mock at the route boundary, and contains the `validateAndEnrichConfig` re-enrichment in `routes.ts` (where the env vars + dotenv state already live). The route's only responsibility becomes input validation + status code mapping.

**Route definitions**:

| Method | Path | Body / Query | Status mapping |
|--------|------|--------------|----------------|
| GET | `/api/repositories` | — | 200 (unchanged) |
| POST | `/api/repositories` | `{ localPath: string }` | 200 success / 400 invalid path / 404 dossier absent / 409 already added / 500 write failure |
| DELETE | `/api/repositories` | query `localPath` | 200 success / 400 missing query / 404 unknown / 500 write failure |
| PATCH | `/api/repositories` | `{ localPath: string; enabled: boolean }` | 200 / 400 invalid body / 404 unknown / 500 |

**Validation in route (POST)**:
- `localPath` non-empty → else 400 "Chemin du projet requis"
- `localPath` starts with `/` (POSIX absolute) → else 400 "Le chemin doit être absolu"
- `existsSync(localPath)` (folder check uses `fs.statSync(localPath).isDirectory()`) → else 400 "Dossier introuvable"
- Duplicate detection deferred to `addRepository` adapter — translates `skipped.length > 0` to 409 "Projet déjà ajouté"

**Test file**: `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.test.ts` (EXTEND existing)

New `describe` blocks + scenarios:

| Scenario (spec) | Test name |
|-----------------|-----------|
| nominal add | `POST creates a repository and returns the updated list` |
| empty path | `POST 400 when localPath is empty` |
| relative path | `POST 400 when localPath is not absolute` |
| non-existent path | `POST 400 when folder does not exist` |
| duplicate path | `POST 409 when repository already present` |
| write failure | `POST 500 when adapter throws on disk write` |
| name derivation | `POST derives name from last path segment` (asserts adapter called with `name=basename(localPath)`) |
| nominal delete | `DELETE removes the entry by localPath` |
| delete unknown | `DELETE 404 when localPath unknown` |
| nominal disable | `PATCH disables the entry` |
| nominal enable | `PATCH enables the entry` |
| disable unknown | `PATCH 404 when localPath unknown` |
| missing query | `DELETE 400 when localPath query missing` |
| invalid body | `PATCH 400 when enabled is not boolean` |

> Note: in-memory mutation visibility (scenario "in-memory mutation visible") is verified by passing a real array to `getRepositories` and asserting `getRepositories().length` after the POST. The test does NOT exercise live config enrichment (`getGitRemoteUrl` + `validateAndEnrichConfig`) — that path is covered indirectly by the acceptance test and the existing `configLoader` tests.

---

## DASHBOARD MODULE

### `managePanel.js` (NEW — humble object)

- File: `src/dashboard/modules/managePanel.js`
- Pattern: same as `tabBar.js` — pure functions, no DOM access in builders, JSDoc-typed
- Purpose: build viewmodel + render HTML for the manage panel (slide-down section above the tab bar with the add form + per-repo rows)

**Public API**:
```js
/**
 * @typedef {Object} ManagePanelRepositoryInput
 * @property {string} name
 * @property {string} localPath
 * @property {boolean} enabled
 */

/**
 * @typedef {Object} ManagePanelRowViewModel
 * @property {string} localPath
 * @property {string} name
 * @property {string} shortPath   // last two segments
 * @property {boolean} enabled
 */

/**
 * @typedef {Object} ManagePanelViewModel
 * @property {ManagePanelRowViewModel[]} rows
 * @property {boolean} isOpen
 */

export function buildManagePanelModel(input): ManagePanelViewModel;
export function renderManagePanelHtml(viewModel): string;       // form input + Add button + rows + per-row × + toggle
export function buildOptimisticAddedRow(repository): ManagePanelRowViewModel;
export function validateLocalPathInput(rawInput): { ok: true } | { ok: false, reason: 'empty' | 'relative' };
```

> Decision: client-side path validation duplicates the server check (defense-in-depth + immediate shake animation). Folder existence remains a server-only check (the dashboard cannot stat the filesystem from the browser).

**Test file**: `src/tests/units/dashboard/modules/managePanel.test.ts`

Scenarios:
- `buildManagePanelModel returns rows in repository order`
- `buildManagePanelModel exposes shortPath (last two segments of localPath)`
- `buildManagePanelModel marks enabled flag per row`
- `renderManagePanelHtml escapes name and localPath`
- `renderManagePanelHtml emits one row per repository with data-local-path attribute`
- `renderManagePanelHtml emits a form with input + Add button`
- `validateLocalPathInput rejects empty input with reason "empty"` (maps spec "empty path")
- `validateLocalPathInput rejects relative path with reason "relative"` (maps spec "relative path")
- `validateLocalPathInput accepts absolute path` (maps spec "nominal add")
- `buildOptimisticAddedRow shapes a row from a repository entry` (used for instant slide-in before server confirmation)

> `tabBar.js` itself stays untouched. The dimmed-disabled visual is achieved via a `data-enabled="false"` attribute we will add to the rendered `<button>` — that IS a one-line change to `tabBar.js`. **Reclassified**: `tabBar.js` gets one tiny change — add `data-enabled="${tab.enabled}"` + an `enabled` field on the viewmodel. This requires extending `TabBarRepositoryInput` JSDoc and adding 1-2 test cases (`builds tab with enabled=false attribute`). Acceptable in-scope because dimming is a SPEC-177 requirement.

**`tabBar.js` delta**:
- Add `enabled: boolean` to `TabBarRepositoryInput` and `TabBarTabViewModel`
- Default Overview tab gets `enabled: true`
- `renderTabBarHtml` emits `data-enabled="${tab.enabled}"`
- New tests in `src/tests/units/dashboard/modules/tabBar.test.ts` (EXTEND existing): `propagates enabled flag to viewmodel and rendered button`

### `index.html` integration (inline `<script type="module">`)

New responsibilities for the inline script:
- Add `<button id="manage-projects-toggle">` and `<section id="manage-panel">` markup above `<nav id="dashboard-tabs">`
- Import `buildManagePanelModel`, `renderManagePanelHtml`, `buildOptimisticAddedRow`, `validateLocalPathInput` from `./modules/managePanel.js`
- Wire event handlers:
  - Toggle button → slide panel (CSS class `is-open`)
  - Form submit / Enter on input → call `validateLocalPathInput`, shake on rejection, POST on success, render server-side error message on 4xx/5xx, optimistic prepend on 2xx
  - Escape key → clear input
  - × button on row → DELETE, then collapse row + fade tab; if active tab was deleted, call `activateOverviewTab()`
  - Toggle on row → PATCH, then dim/restore matching tab via `data-enabled` rerender

> Risk: the inline script in `index.html` is already 2500+ lines. Adding ~80-120 lines of wiring is acceptable; the heavy logic stays in `managePanel.js` (humble object compliance).

---

## CSS / VISUAL CONTRACTS

- File: `src/dashboard/styles.css` (EXTEND, no new file)
- Append new rules at the end (the file already has a 2-section `@media (prefers-reduced-motion: reduce)` block — extend or add a 3rd, both acceptable)

**New animations & rules** (Agentic OS DNA: amber `#fbbf24`, success green `#34d399`, error red `#f87171`, monospace, corner-brackets where suitable):

| Selector / class | Behavior | Duration |
|------------------|----------|----------|
| `#manage-panel` | `max-height` 0 ↔ `400px` + opacity 0 ↔ 1 transition | 250ms open, 200ms close |
| `.dashboard-tab.is-entering` | `transform: translateX(20px)` → 0 + green box-shadow pulse | 1500ms total |
| `.dashboard-tab[data-enabled="false"]` | `opacity: 0.4` permanent | 200ms transition |
| `.dashboard-tab.is-leaving` | `opacity: 0` + `max-width: 0` collapse | 250ms |
| `.manage-row.is-entering` | slide from top + green glow | 1500ms |
| `.manage-row.is-leaving` | collapse height + opacity | 250ms |
| `.manage-row .row-toggle.is-on` | `transform: rotate(180deg)` | 200ms |
| `.add-form-submit.is-busy` | border breathing pulse keyframes | 1200ms loop |
| `.add-form-submit.is-error` (or `.add-form.is-error`) | shake `translateX(-4px, 4px, -4px, 0)` | 300ms |
| `.add-form-input.is-success` | green check overlay flash | 1500ms |
| `@media (prefers-reduced-motion: reduce)` | all `transform`/`box-shadow` animations replaced with `opacity` 0↔1 transitions (no slide, no shake, no glow pulse, no breathing) | — |

**No dashboard CSS visual contract test file** is added. CSS is verified manually via the acceptance test scenario "reduced motion respected" → assert the `@media (prefers-reduced-motion: reduce)` block exists in `styles.css` (grep) and "legacy DOM cleanup" → assert legacy IDs absent in `index.html` (grep). Both done in the acceptance test using `readFileSync`.

> Risk: visual fidelity cannot be unit-tested without a headless browser. Accepted — same constraint applies to all existing dashboard CSS.

---

## WIRING DELTA (`src/main/routes.ts`)

Current block (line 359-361):
```ts
await app.register(repositoriesRoutes, {
  getRepositories: () => deps.config.repositories,
});
```

**Replace with**:
```ts
import { AddRepositoriesToConfigUseCase } from '@/modules/cli-configuration/usecases/cli/addRepositoriesToConfig.usecase.js';
import { RemoveRepositoryFromConfigUseCase } from '@/modules/cli-configuration/usecases/cli/removeRepositoryFromConfig.usecase.js';
import { ToggleRepositoryEnabledUseCase } from '@/modules/cli-configuration/usecases/cli/toggleRepositoryEnabled.usecase.js';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolveActiveConfigPath } from '@/frameworks/config/configLoader.js'; // NEW exported helper
import { basename } from 'node:path';
import { validateAndEnrichConfig } from '@/frameworks/config/configLoader.js';

const repositoryConfigDeps = { readFileSync, writeFileSync, existsSync };
const addRepoUseCase = new AddRepositoriesToConfigUseCase(repositoryConfigDeps);
const removeRepoUseCase = new RemoveRepositoryFromConfigUseCase(repositoryConfigDeps);
const toggleRepoUseCase = new ToggleRepositoryEnabledUseCase(repositoryConfigDeps);
const configPath = resolveActiveConfigPath(); // already used internally by loadConfig — expose it

await app.register(repositoriesRoutes, {
  getRepositories: () => deps.config.repositories,
  mutateRepositories: (mutator) => mutator(deps.config.repositories),
  addRepository: ({ localPath }) => {
    if (!statSync(localPath).isDirectory()) {
      return { status: 'not-a-directory' };
    }
    const name = basename(localPath);
    const result = addRepoUseCase.execute({
      configPath,
      newRepositories: [{ name, localPath, enabled: true }],
    });
    if (result.skipped.length > 0) return { status: 'duplicate' };
    // Re-enrich the freshly added entry and push into in-memory config
    const rawConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const enriched = validateAndEnrichConfig(rawConfig);
    deps.config.repositories.length = 0;
    deps.config.repositories.push(...enriched.repositories);
    return { status: 'ok', repositories: deps.config.repositories };
  },
  removeRepository: ({ localPath }) => {
    const result = removeRepoUseCase.execute({ configPath, localPath });
    if (!result.removed) return { status: 'not-found' };
    const index = deps.config.repositories.findIndex((r) => r.localPath === localPath);
    if (index >= 0) deps.config.repositories.splice(index, 1);
    return { status: 'ok', repositories: deps.config.repositories };
  },
  patchRepository: ({ localPath, enabled }) => {
    const result = toggleRepoUseCase.execute({ configPath, localPath, enabled });
    if (!result.updated) return { status: 'not-found' };
    const target = deps.config.repositories.find((r) => r.localPath === localPath);
    if (target) target.enabled = enabled;
    return { status: 'ok', repositories: deps.config.repositories };
  },
});
```

**New export from `configLoader.ts`**: `resolveActiveConfigPath(): string` — wraps the existing private `resolveConfigPath()` so the composition root can pass the canonical config path to the usecases without environment drift. This is a 1-line addition (`export { resolveConfigPath as resolveActiveConfigPath };` or rename `resolveConfigPath` to public). Test: not required (pure passthrough; covered by the existing config tests indirectly).

> Risk: re-enrichment after add relies on `validateAndEnrichConfig` which calls `getGitRemoteUrl` (spawn `git remote get-url origin`). This is slow (~50-200ms) but symmetric with `loadConfig`. The POST handler accepts this latency — flagged for `enrichedRepositories` to drop the new entry if git remote fails (`enrichRepository` returns `null`), which means the in-memory array may NOT contain the new entry even though `config.json` does. **Open question** below.

---

## CLEANUP (dead legacy DOM helpers)

In-scope deletions in `src/dashboard/index.html`:

| Line range (approx) | Symbol |
|---------------------|--------|
| 2288-2294 | `function addProjectToHistory(path)` |
| 2296-2300 | `function removeProjectFromHistory(path)` |
| 2302-2318 | `function updateProjectSelect()` |
| 2320-2326 | `function onProjectSelect(path)` |
| 2328-2339 | `function loadProjectConfig()` (legacy wrapper, NOT `loadProjectConfigFromPath`) |
| 2434-2451 | `syncServerRepositories()` — touches `getStoredProjects` + `saveProjects` + `updateProjectSelect`; reassess: only the `updateProjectSelect()` call needs removal, the rest is still used by `getStoredProjects()` (kept for now) — **decision: delete `syncServerRepositories` entirely**, the SPEC-91 fetch path (`fetchAvailableRepositories`) is the canonical one |
| 2359-2362 | the legacy DOM fallback (`legacySelect`, `legacyInput`) inside `loadProjectConfigFromPath` — pure dead code |
| 2417-2422 | `removeCurrentProject` — calls `removeProjectFromHistory`; **assess separately** — if no callsite remains, delete; otherwise keep with a TODO. Grep shows it's wired to a button that no longer exists, so **delete** |
| 2955-2956 | `window.onProjectSelect = onProjectSelect; window.loadProjectConfig = loadProjectConfig;` |

Also delete `STORAGE_KEY_PROJECTS` usage if `getStoredProjects` becomes unused after the deletions above. **Open question** below — `getStoredProjects` may still be referenced by overview / other init code; check via grep before deleting.

Acceptance test asserts `0` occurrences of: `project-select`, `project-path-input`, `addProjectToHistory`, `updateProjectSelect`, `removeProjectFromHistory`, `onProjectSelect`, `loadProjectConfig(` (parenthesis to avoid matching `loadProjectConfigFromPath`).

---

## IMPLEMENTATION_ORDER (TDD inside-out)

1. **`removeRepositoryFromConfig.usecase.test.ts`** (RED) — write tests covering the 5 scenarios listed above
2. **`removeRepositoryFromConfig.usecase.ts`** (GREEN) — minimal impl mirroring `addRepositoriesToConfig.usecase.ts`
3. **`toggleRepositoryEnabled.usecase.test.ts`** (RED)
4. **`toggleRepositoryEnabled.usecase.ts`** (GREEN)
5. **`tabBar.test.ts`** (EXTEND, RED) — add 2 test cases for `enabled` propagation
6. **`tabBar.js`** (GREEN) — add `enabled` field to viewmodel + `data-enabled` attribute
7. **`managePanel.test.ts`** (RED, NEW) — write the 10 test cases listed above
8. **`managePanel.js`** (GREEN, NEW) — humble object implementation
9. **`repositories.routes.test.ts`** (EXTEND, RED) — add POST + DELETE + PATCH scenarios using stub `addRepository / removeRepository / patchRepository` injected functions
10. **`repositories.routes.ts`** (GREEN, EXTEND) — implement POST/DELETE/PATCH, validation, status mapping
11. **`main/routes.ts`** (wiring) — instantiate usecases, expand the `repositoriesRoutes` registration with the adapter closures (manual test: `yarn dev` + curl POST/DELETE/PATCH)
12. **Acceptance test** `177-dashboard-add-project-ui.acceptance.test.ts` was already written in step 0 (RED throughout TDD) — verify GREEN
13. **`index.html`** wiring (manual + visual) — add manage panel markup, wire event handlers, import `managePanel.js`
14. **`styles.css`** — append animations, `prefers-reduced-motion` block
15. **Cleanup pass** — grep + delete 5 dead helpers; rerun acceptance to confirm `legacy DOM cleanup` scenario passes
16. `yarn verify` — final green

---

## ACCEPTANCE_TEST

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/177-dashboard-add-project-ui.acceptance.test.ts
  note: "SDD outer loop — written FIRST during step 0 of TDD, RED throughout impl, GREEN at the end"
```

The acceptance test exercises:
- HTTP integration: register `repositoriesRoutes` with stubbed adapters backed by an in-memory `RepositoryConfig[]` mutated via the closures defined above; assert POST/DELETE/PATCH happy paths + all error codes from the 20 scenarios
- In-memory mutation visibility: assert `getRepositories()` returns N+1 after a successful POST without re-registering the route
- Filesystem assertion: legacy DOM cleanup scenario reads `src/dashboard/index.html` and `src/dashboard/styles.css` via `readFileSync` and asserts:
  - 0 matches for `project-select`, `project-path-input`, `addProjectToHistory`, etc.
  - `@media (prefers-reduced-motion: reduce)` block exists with at least one rule mentioning `.dashboard-tab` or `.manage-row`
  - `styles.css` contains rules for `#manage-panel`, `.manage-row`, `.dashboard-tab.is-entering`

Pure-JS dashboard module behavior (managePanel `validateLocalPathInput`, `buildOptimisticAddedRow`) is covered by its own unit tests — the acceptance does not duplicate it.

---

## REFERENCE_FILES

- `docs/specs/177-dashboard-add-project-ui.md` — source of truth (20 scenarios)
- `src/modules/cli-configuration/usecases/cli/addRepositoriesToConfig.usecase.ts` — reuse + pattern for new usecases
- `src/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.ts` — extends this file
- `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.test.ts` — extends with POST/DELETE/PATCH cases
- `src/frameworks/config/configLoader.ts` — `RepositoryConfig` type, `resolveConfigPath` (needs export), `validateAndEnrichConfig` for re-enrich
- `src/dashboard/modules/tabBar.js` — humble-object pattern reference + 1-line modification target
- `src/tests/units/dashboard/modules/tabBar.test.ts` — extend with `enabled` propagation tests
- `src/dashboard/index.html` lines 2288-2451 + 2955-2956 — dead helpers to delete
- `src/dashboard/styles.css` lines 4569 + 4892 — existing `prefers-reduced-motion` patterns
- `src/main/routes.ts` lines 359-361 — wiring delta location
- `project_agentic_os_design_dna.md` (memory) — visual DNA reference for animation colors / glow pulse

---

## Risks & Open Questions

1. **Git remote re-enrichment latency on POST**: `validateAndEnrichConfig` shells out to `git remote get-url origin` per repository. For N=10 repos this is 10 spawns (~500ms). Mitigation A: only re-enrich the newly added entry (write a small helper `enrichSingleRepository(input)` exported from `configLoader.ts`). Mitigation B: skip enrichment, push a partial `RepositoryConfig` with `remoteUrl = ''` and rely on the next daemon restart. **Recommendation: Mitigation A** — minimal new code, preserves pipeline correctness. Implementer to add a 5-line `enrichSingleRepository` export.

2. **Path without git remote on add**: per `enrichRepository` line 133, a path without `git remote origin` returns `null` and is dropped from the enriched list. The on-disk `config.json` will contain the entry but `deps.config.repositories` will not. Should this be a 422 ("Le projet n'a pas de remote git configuré") or accepted silently? Spec does not address this. **Recommendation: 422 + revert the config.json write** (re-call `removeRepositoryFromConfigUseCase` on the freshly added entry) to keep disk + memory consistent. Confirm with orchestrator before coding.

3. **`syncServerRepositories` / `getStoredProjects` legacy**: the cleanup list includes `syncServerRepositories` but `getStoredProjects` is used elsewhere (line 2280). Implementer must grep before deleting and may need to keep `getStoredProjects` alive even though it loses its only writer.

4. **`removeCurrentProject` button**: no longer rendered anywhere visible; safe to delete but requires a grep confirmation (`onclick="removeCurrentProject` should return 0 matches).

5. **i18n keys**: error messages in the spec are French (`"Chemin du projet requis"`, etc.) — consistent with project rule "French for end-user UI texts". The implementer must NOT introduce English error strings for these.

6. **Active-tab fallback on delete**: spec scenario "delete active tab" requires switching to Overview. This is dashboard inline-script logic only — not covered by unit tests (no DOM in tests). Acceptance covers the server-side correctness; the dashboard wiring is verified manually.

7. **CSS unit testing**: no automated visual contract beyond grep assertions. Accepted constraint of the project.
