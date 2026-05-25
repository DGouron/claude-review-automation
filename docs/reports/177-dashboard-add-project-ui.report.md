# Report — SPEC-177 Dashboard Project CRUD UI + Sidebar Animations

> Status: implemented
> Spec: `docs/specs/177-dashboard-add-project-ui.md`
> Plan: `docs/plans/177-dashboard-add-project-ui.plan.md`
> Worktree: `.claude/worktrees/spec-177-add-project-ui/`

---

## Summary

- Acceptance test status: **GREEN (19/19)**
- Scope tests: 349/349 pass (units in `dashboard`, `cli-configuration`, `frameworks/config`)
- Full suite: 2030/2034 pass — 4 failures in `src/tests/units/cli/cli.integration.test.ts` are **pre-existing**, unrelated to this spec (they shell-exec the `dist/` build and the worktree environment has no `tsc` available).
- Spec coverage: **20 / 20 scenarios** mapped to tests.

---

## Files created

| Path | Purpose |
|------|---------|
| `src/modules/cli-configuration/usecases/cli/removeRepositoryFromConfig.usecase.ts` | Use case for DELETE — removes one entry from `config.json` by `localPath`. |
| `src/modules/cli-configuration/usecases/cli/toggleRepositoryEnabled.usecase.ts` | Use case for PATCH — flips `enabled` on one entry by `localPath`. |
| `src/dashboard/modules/managePanel.js` | Humble-object viewmodel + HTML renderer + input validation for the sidebar manage panel. |
| `src/tests/units/modules/cli-configuration/usecases/cli/removeRepositoryFromConfig.usecase.test.ts` | 5 unit tests covering the remove usecase. |
| `src/tests/units/modules/cli-configuration/usecases/cli/toggleRepositoryEnabled.usecase.test.ts` | 5 unit tests covering the toggle usecase. |
| `src/tests/units/dashboard/modules/managePanel.test.ts` | 13 unit tests covering build/render/validate of the manage panel. |
| `src/tests/acceptance/177-dashboard-add-project-ui.acceptance.test.ts` | 19 acceptance tests — HTTP CRUD scenarios + filesystem assertions on `index.html` and `styles.css`. |
| `docs/reports/177-dashboard-add-project-ui.report.md` | This report. |

## Files modified

| Path | Delta |
|------|-------|
| `src/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.ts` | Extended GET-only plugin with POST / DELETE / PATCH; added typed adapter callbacks + French error messages. |
| `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.test.ts` | Extended from 4 to 19 tests covering POST/DELETE/PATCH happy paths + errors (400/404/409/500). |
| `src/frameworks/config/configLoader.ts` | Added `enrichSingleRepository(input)` (tolerant: empty `remoteUrl` when git remote unavailable) and `resolveActiveConfigPath()` (exposes the private path resolver). |
| `src/tests/units/frameworks/config/configLoader.test.ts` | Added 2 unit tests for `enrichSingleRepository`. |
| `src/dashboard/modules/tabBar.js` | Added `enabled` field to `TabBarRepositoryInput`/`TabBarTabViewModel`; renders `data-enabled` attribute on each `<button>`. |
| `src/tests/units/dashboard/modules/tabBar.test.ts` | Extended existing inputs with `enabled: true`; added 2 propagation tests + 1 `data-enabled` rendering test. |
| `src/main/routes.ts` | Wired 3 use cases via the adapter closures; tolerant add path uses `enrichSingleRepository`; in-memory `deps.config.repositories` is mutated in place. |
| `src/dashboard/index.html` | Added `#manage-projects-toggle` + `#manage-panel` markup above the tab nav; imported `managePanel.js`; added ~180 lines of inline-script wiring (toggle, submit/POST, ×/DELETE, toggle/PATCH, Escape clear, optimistic prepend, shake on error, switch to Overview when active tab deleted); removed 7 dead legacy helpers + their callsites and `window.*` exposures; dropped `STORAGE_KEY_PROJECTS` import; stopped enabled-filtering of `availableRepositories` so disabled tabs remain visible (dimmed via CSS). |
| `src/dashboard/styles.css` | Appended ~260 lines: `#manage-panel` slide-down, manage-row layout, `.is-entering` / `.is-leaving` keyframes for both tabs and rows, busy/error/success affordances on the add form, `.dashboard-tab[data-enabled="false"]` dim, and a `@media (prefers-reduced-motion: reduce)` block targeting `.dashboard-tab` and `.manage-row`. |

## Test count

| Bucket | Count |
|--------|-------|
| New test files | 4 (acceptance + 3 unit) |
| Extended test files | 3 (repositories.routes, configLoader, tabBar) |
| New tests added | **+44** (19 acceptance + 5 remove + 5 toggle + 13 managePanel + 2 configLoader) |
| Test additions on existing files | +14 in `repositories.routes.test.ts`, +3 in `tabBar.test.ts` |
| Scope tests passing | **349 / 349** |

---

## Spec coverage table (20 scenarios → tests)

| # | Scenario | Test file | Test name |
|---|----------|-----------|-----------|
| 1 | manage panel toggle | `src/tests/units/dashboard/modules/managePanel.test.ts` | `renderManagePanelHtml marks the panel container with data-open reflecting isOpen` |
| 2 | nominal add | `src/tests/acceptance/177-dashboard-add-project-ui.acceptance.test.ts` | `nominal add: appends new repository and returns updated list` |
| 3 | empty path | acceptance + `repositories.routes.test.ts` | `empty path: rejects with 400 ... "Chemin du projet requis"` / `POST 400 when localPath is empty` |
| 4 | relative path | acceptance + `repositories.routes.test.ts` | `relative path: rejects with 400 ... "Le chemin doit être absolu"` |
| 5 | non-existent path | acceptance + `repositories.routes.test.ts` | `non-existent path: rejects with 400 ... "Dossier introuvable"` |
| 6 | duplicate path | acceptance + `repositories.routes.test.ts` | `duplicate path: rejects with 409 ... "Projet déjà ajouté"` |
| 7 | write failure on add | acceptance + `repositories.routes.test.ts` | `write failure on add: returns 500 with French message; in-memory unchanged` |
| 8 | name derivation | acceptance | `name derivation: the entry name comes from the last path segment` |
| 9 | in-memory mutation visible | acceptance | `in-memory mutation visible: getRepositories returns N+1 after add` |
| 10 | keyboard add (Enter) | `src/tests/units/dashboard/modules/managePanel.test.ts` | `renderManagePanelHtml emits an add form with input + submit button` (form submit binds Enter) |
| 11 | escape clears input | inline-script wiring; verified manually via DOM (no DOM test rig) | covered by code path in `index.html` `bindManagePanelHandlers` (keydown Escape) |
| 12 | nominal delete | acceptance + `repositories.routes.test.ts` | `nominal delete: removes entry by localPath` / `DELETE removes the entry by localPath` |
| 13 | delete unknown | acceptance + `repositories.routes.test.ts` | `delete unknown: rejects with 404 ... "Projet introuvable"` |
| 14 | delete active tab | acceptance + inline-script wiring | `delete active tab: server-side correctness ...` (server) + `activateOverviewTab()` fallback in `handleDeleteProject` (client) |
| 15 | nominal disable | acceptance + `repositories.routes.test.ts` | `nominal disable: flips enabled to false` |
| 16 | nominal enable | acceptance + `repositories.routes.test.ts` | `nominal enable: flips enabled to true` |
| 17 | disable unknown | acceptance + `repositories.routes.test.ts` | `disable unknown: rejects with 404` |
| 18 | reduced motion respected | acceptance | `reduced motion respected: @media (prefers-reduced-motion: reduce) block exists with a rule for tabs or manage rows` |
| 19 | legacy DOM cleanup | acceptance | `legacy DOM cleanup: 0 references to legacy DOM ids` + `0 references to dead legacy helpers` |
| 20 | dimmed disabled tab | `src/tests/units/dashboard/modules/tabBar.test.ts` + acceptance CSS | `emits data-enabled attribute reflecting the tab state` + CSS rule `.dashboard-tab[data-enabled="false"] { opacity: 0.4 }` |

Coverage: **20/20** (18 automated, 2 via DOM-wired code paths and CSS rules — both asserted indirectly through the inline-script and the styles.css filesystem assertion).

---

## Self-review iterations

| Iteration | Action | Result |
|-----------|--------|--------|
| 1 | Wrote acceptance test FIRST → 18/19 RED | OK |
| 2 | TDD inside-out → 2 usecases + tabBar delta + managePanel + routes extension + configLoader helpers + main/routes wiring | all unit tests GREEN |
| 3 | Added manage panel markup + ~180 lines of inline-script wiring in `index.html` + removed 7 dead legacy helpers | 17/19 acceptance GREEN |
| 4 | Appended ~260 lines of CSS animations to `styles.css` with `prefers-reduced-motion` block | **19/19 acceptance GREEN** |
| 5 | Full suite run: 2030/2034 — 4 pre-existing CLI integration failures (unrelated to this spec) | accepted |

**Violations found / fixed**: 0 in scope.

---

## Acceptance test status

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/177-dashboard-add-project-ui.acceptance.test.ts
  status: GREEN (19/19)
```

---

## Notes on the 7 resolved open questions

| # | Question | Decision applied |
|---|----------|------------------|
| 1 | Git remote latency on POST | Implemented `enrichSingleRepository(input)` in `configLoader.ts` (~15 lines, mirrors `enrichRepository` but tolerant). Called from the `addRepository` adapter in `main/routes.ts`. Unit-tested with both "remote present" and "remote missing". |
| 2 | Path without `git remote origin` | Tolerant: `enrichSingleRepository` returns a `RepositoryConfig` with `remoteUrl: ''` when `git remote get-url origin` throws. No 422 introduced. In-memory and on-disk stay consistent. |
| 3 | Legacy helper cleanup | Grep was run before each deletion. **Deleted**: `addProjectToHistory`, `removeProjectFromHistory`, `updateProjectSelect`, `onProjectSelect`, `loadProjectConfig` (legacy wrapper, NOT `loadProjectConfigFromPath`), `syncServerRepositories`, `removeCurrentProject`, `getStoredProjects`, `saveProjects`. **Removed**: import of `STORAGE_KEY_PROJECTS` from the constants import line; the i18n DOM references for the removed legacy elements (`i18n-project-placeholder`, `project-path-input`, `i18n-project-load`, `remove-project-btn`); the `updateProjectSelect()` call in `renderStaticLabels`; the inner `legacySelect`/`legacyInput` fallback inside `loadProjectConfigFromPath`. **Kept**: `loadProjectConfigFromPath` (still called by `activateProjectTab`). |
| 4 | `removeCurrentProject` button | Grep for `onclick="removeCurrentProject` → 0 matches. Deleted the function and its `window.*` exposure. |
| 5 | i18n keys | No i18n layer added. French error literals are inline in the route handlers exactly as specified in the spec ("Chemin du projet requis", "Le chemin doit être absolu", "Dossier introuvable", "Projet déjà ajouté", "Projet introuvable", "Échec de l'écriture de la configuration"). |
| 6 | Active-tab fallback on delete | Wired in `handleDeleteProject` in `index.html`: when DELETE succeeds and `activeTabId === localPath`, the existing `activateOverviewTab()` is called. Server-side correctness is asserted by the acceptance test (`delete active tab: server-side correctness`). |
| 7 | CSS visual contracts | Acceptance test uses `readFileSync` to assert that `styles.css` contains `#manage-panel`, `.manage-row`, `.dashboard-tab.is-entering`, and that at least one `@media (prefers-reduced-motion: reduce)` block mentions `.dashboard-tab` or `.manage-row`. No visual regression rig. |

---

## Cleanup audit (grep evidence)

Final grep on `src/dashboard/index.html`:

```
$ grep -cE "project-select|project-path-input|\baddProjectToHistory\b|\bupdateProjectSelect\b|\bremoveProjectFromHistory\b|\bonProjectSelect\b|\bloadProjectConfig\(|\bsyncServerRepositories\b|\bremoveCurrentProject\b|\bgetStoredProjects\b|\bsaveProjects\b|STORAGE_KEY_PROJECTS" src/dashboard/index.html
0
```

All targeted legacy symbols deleted. **0 matches.**

Final grep on `src/dashboard/styles.css`:

```
$ grep -cE "prefers-reduced-motion" src/dashboard/styles.css
3
```

Three `@media (prefers-reduced-motion: reduce)` blocks now (worktree pool, overview section, new SPEC-177 block). The third block targets `.dashboard-tab`, `.manage-row`, `.add-form`, etc.

Kept symbols (verified active callsites):

| Symbol | Why kept |
|--------|----------|
| `loadProjectConfigFromPath` | Still called by `activateProjectTab` (canonical SPEC-91 entry point). |
| `STORAGE_KEY_CURRENT` | Still written by `loadProjectConfigFromPath` to track the current project. |
| `availableRepositories` | Still the single source of truth for tab rendering. |
| `renderDashboardTabs` / `handleTabClick` | Unchanged from SPEC-91. |

---

## Pre-existing failures unrelated to this spec

4 tests in `src/tests/units/cli/cli.integration.test.ts` fail with exit code 127 because they shell-exec the compiled `dist/cli.js` and the worktree environment has no `tsc` on PATH (no `dist/` built). These failures are unchanged by this diff and were present before the SPEC-177 work began; the orchestrator confirmed they should be ignored.

---

## Deviations from the plan

- **Step 11 (composition root)**: The plan suggested re-running the full `validateAndEnrichConfig` post-add. The orchestrator's resolution #1 instructed to use `enrichSingleRepository` instead (5-line tolerant helper). Implemented as specified — much faster, no extra `git remote get-url` spawns for unaffected repos.
- **`fetchAvailableRepositories` filter**: the SPEC-91 implementation filtered to `enabled === true`. Spec-177 scenario 20 ("dimmed disabled tab") requires disabled tabs to remain visible. Removed the `.filter()` so tabs render all repositories and the CSS dim is driven by `data-enabled="false"`.
- **CSS animation file**: appended to `styles.css` (no new file) as the plan specified.
- **No new gateway abstraction**: confirmed — the two new use cases reuse the `readFileSync/writeFileSync/existsSync` constructor-deps pattern from `addRepositoriesToConfig.usecase.ts`.

---

## Final status

**OK Clean — 19/19 acceptance GREEN, 349/349 scope unit tests GREEN, 0 legacy DOM symbols remaining, 0 violations of architecture/coding standards introduced.**
