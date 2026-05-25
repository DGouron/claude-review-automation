# Spec #177 — Dashboard Project CRUD UI + Sidebar Animations

**Labels**: bug, P1-critical, dashboard, cli-configuration, ux
**Date**: 2026-05-25
**Status**: implemented

---

## Status: implemented

Shipped 2026-05-25. See `docs/reports/177-dashboard-add-project-ui.report.md` for the implementation report (20/20 scenarios covered, +44 tests, 349/349 scope tests GREEN).

## Implementation

### Artefacts

- **Use case (new)**: `src/modules/cli-configuration/usecases/cli/removeRepositoryFromConfig.usecase.ts` — removes one entry from `config.json` by `localPath`. Mirrors the pattern of the existing `AddRepositoriesToConfigUseCase` (constructor deps: `readFileSync`/`writeFileSync`/`existsSync`).
- **Use case (new)**: `src/modules/cli-configuration/usecases/cli/toggleRepositoryEnabled.usecase.ts` — flips `enabled` on one entry by `localPath`.
- **Use case (reused)**: `AddRepositoriesToConfigUseCase` — called with a single-element `newRepositories` array; `skipped` non-empty → HTTP 409.
- **Routes (extended)**: `src/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.ts` — GET stays unchanged; added POST/DELETE/PATCH with French error messages and validation in the route handler. Adapter closures (`addRepository`/`removeRepository`/`patchRepository`/`mutateRepositories`) injected from the composition root.
- **Config helpers (new)**: `enrichSingleRepository(input)` and `resolveActiveConfigPath()` exported from `src/frameworks/config/configLoader.ts`. `enrichSingleRepository` is tolerant — returns `{ remoteUrl: '' }` when `git remote get-url origin` fails (no `null` drop, no 422).
- **Dashboard humble module (new)**: `src/dashboard/modules/managePanel.js` — pure-function viewmodel builder + HTML renderer + client-side validation (`validateLocalPathInput`).
- **Dashboard humble module (extended)**: `src/dashboard/modules/tabBar.js` — propagates `enabled: boolean` from the input to a `data-enabled` attribute on each `<button>` for CSS dimming.
- **Dashboard inline-script wiring**: `src/dashboard/index.html` — manage panel markup + ~180 LOC of event wiring (toggle open/close, form submit POST, × DELETE, toggle PATCH, Escape clear, optimistic prepend, shake on error, fall back to Overview when the active tab is deleted). 7 dead legacy helpers + their `window.*` exposures removed.
- **CSS animations**: `src/dashboard/styles.css` — ~260 LOC appended. `#manage-panel` slide-down, `.dashboard-tab.is-entering/.is-leaving`, `.manage-row.is-entering/.is-leaving`, `.dashboard-tab[data-enabled="false"]` dim, busy/error/success affordances on the add form, `@media (prefers-reduced-motion: reduce)` block reducing transform/box-shadow to opacity only.

### Endpoints

| Method | Path | Body / Query | Status mapping |
|--------|------|--------------|----------------|
| GET | `/api/repositories` | — | 200 (unchanged) |
| POST | `/api/repositories` | `{ localPath: string }` | 200 / 400 invalid / 400 not-a-directory / 409 duplicate / 500 write |
| DELETE | `/api/repositories` | query `localPath` | 200 / 400 missing query / 404 unknown / 500 write |
| PATCH | `/api/repositories` | `{ localPath, enabled: boolean }` | 200 / 400 invalid body / 404 unknown / 500 write |

All error messages are inline French literals (no i18n layer introduced).

### Architectural decisions taken

- **No new gateway abstraction.** The two new usecases reuse the exact constructor-deps pattern (`readFileSync`/`writeFileSync`/`existsSync`) of the existing `AddRepositoriesToConfigUseCase`. Extracting a `RepositoryConfigStore` gateway was premature given the spec is pure CRUD on one JSON file.
- **Adapter closures over direct usecase wiring.** Routes receive `addRepository`/`removeRepository`/`patchRepository` as injected functions. This keeps the route file framework-agnostic, lets us mock at the route boundary, and contains all `validateAndEnrichConfig` plumbing in the composition root where the dotenv state already lives.
- **In-place mutation of `deps.config.repositories`.** After each successful write, the wiring mutates the in-memory array (`push`/`splice`/property update) so the lambdas `() => deps.config.repositories` consumed by ~10 other modules see the new state without a daemon restart.
- **Tolerant git remote on add.** `enrichSingleRepository` never returns `null` — when `git remote get-url origin` fails, it returns the entry with `remoteUrl: ''`. This keeps disk and in-memory consistent and matches the spec's OUT OF SCOPE "Git repository validation on add" (symmetric with the existing CLI `add-repository`).
- **Filter on `availableRepositories` removed in `fetchAvailableRepositories`.** Before SPEC-177 the dashboard client filtered out `enabled: false` repos client-side. Removed so disabled tabs remain visible and get dimmed via `[data-enabled="false"]` CSS — this is the visual contract scenario 15-17 require.
- **Manage panel as a discrete humble object** (`managePanel.js`), mirroring the established pattern in `tabBar.js`/`overview.js`. Heavy DOM wiring (event handlers, fetch calls) stays inline in `index.html`.
- **No new CSS framework.** Pure CSS keyframes + transitions, monospace + amber/green from the existing Agentic OS DNA. `prefers-reduced-motion` reduces every transform/box-shadow animation to opacity-only.

### Cleanup audit

`grep -c` for the 11 legacy symbols in `src/dashboard/index.html`: **0 matches**.
Deleted: `addProjectToHistory`, `updateProjectSelect`, `removeProjectFromHistory`, `onProjectSelect`, the legacy `loadProjectConfig` wrapper, `syncServerRepositories`, `removeCurrentProject`, `getStoredProjects`, `saveProjects`, the `legacySelect`/`legacyInput` fallback block, the `STORAGE_KEY_PROJECTS` import + `window.onProjectSelect`/`window.loadProjectConfig` exposures.
Kept: `loadProjectConfigFromPath` (active callsite from `activateProjectTab`).

---

## Context

SPEC-91 (PR #200) shipped the multi-project overview by replacing the legacy `<select id="project-select">` + `<input id="project-path-input">` controls with a tab bar driven by `GET /api/repositories`. The read path was delivered but no write path was specified — there is no UI to add, remove, or toggle a project from the dashboard, and `config.json` can only be edited manually on the server. The legacy `addProjectToHistory()` / `updateProjectSelect()` JavaScript still references DOM elements that no longer exist (dead code).

This spec restores full CRUD on `config.repositories` from the dashboard sidebar and adds purposeful motion to the project tabs (slide-in on add, slide-out on remove, dim on disable, pulse on async work, shake on error). The animation layer follows the existing "Agentic OS" visual DNA (`project_agentic_os_design_dna.md`) — no new library, CSS-only transitions, prefers-reduced-motion respected.

---

## Rules

### Add (POST /api/repositories)

- The sidebar exposes a path input + "Add" button above the project tabs
- Submitting calls `POST /api/repositories` with `{ localPath }`
- The server rejects an empty or non-absolute path (`400` + "Chemin du projet requis" / "Le chemin doit être absolu")
- The server rejects a path that does not exist on disk (`400` + "Dossier introuvable")
- The server rejects a path already present in `config.repositories.localPath` (`409` + "Projet déjà ajouté")
- On success the new repository is appended to `config.json` with `name` derived from the last path segment and `enabled: true`
- On success the in-memory `deps.config.repositories` array is mutated in place
- On success the response returns the updated full repository list
- Write failures return `500` + "Échec de l'écriture de la configuration"; in-memory unchanged

### Manage panel (delete + toggle enabled)

- A "Manage projects" button sits above the tab bar in the sidebar
- Clicking the button toggles an inline panel listing each repository as a row (`name` — short path — × button — enable/disable toggle)
- The panel opens with a slide-down animation, closes with slide-up
- The "Add" form lives at the bottom of the same panel (input + Add button), so all CRUD actions are co-located
- The tab bar above is purely navigational once the panel is collapsed — no inline affordances, no hover reveals

### Remove (DELETE /api/repositories)

- The × button on a manage-panel row calls `DELETE /api/repositories?localPath=<path>`
- The server rejects an unknown `localPath` (`404` + "Projet introuvable")
- On success the entry is removed from `config.json` and from `deps.config.repositories` (in-place splice)
- If the removed project was the active tab, the dashboard switches to the Overview tab
- The active in-flight reviews of that project are NOT cancelled (out of scope)

### Toggle enabled (PATCH /api/repositories)

- The enable/disable toggle on a manage-panel row calls `PATCH /api/repositories?localPath=<path>` body `{ enabled: boolean }`
- The server rejects an unknown `localPath` (`404`)
- On success `enabled` is updated in `config.json` and in `deps.config.repositories`
- A disabled project still appears in the tab bar but visually dimmed (opacity 0.4); the Overview filters out disabled projects (already implemented client-side)

### Animations

- The "Manage projects" panel slides down (max-height 0 → auto) over 250ms on open, slides up over 200ms on close
- A newly added tab slides in from the right + glow-pulse green for 1500ms in the tab bar
- A newly added row in the manage panel slides in from the top with a 1500ms green glow
- A removed manage-panel row collapses (height → 0) + fades out over 250ms; in parallel the matching tab in the tab bar fades + collapses
- A toggled-disabled tab fades to 0.4 opacity over 200ms; toggled-enabled fades back to 1.0; the matching toggle icon in the manage panel rotates 180° as visual confirmation
- The "Add" submit button enters a pulse-busy state during the POST (border breathes) and a shake (3 × 4px) on validation error
- The form input flashes a 1500ms green check overlay on success
- All animations honor `@media (prefers-reduced-motion: reduce)` — transitions reduced to opacity-only, no movement
- All durations sit between 150ms (toggle) and 1500ms (success confirm); never block UI interaction

### Code hygiene

- Dead legacy DOM helpers (`addProjectToHistory`, `updateProjectSelect`, `removeProjectFromHistory`, `onProjectSelect`, `loadProjectConfig` legacy wrapper) are removed in the same change

---

## Scenarios

- manage panel toggle: {click: "Manage projects" button} → panel slides down 250ms with input + repo rows
- nominal add: {localPath: "/home/dev/projects/new-app", exists: true, notInConfig: true} → 200 + config.json appended + new tab slides in + green pulse 1500ms + new row appears in manage panel
- empty path: {localPath: ""} → 400 + "Chemin du projet requis" + form shakes
- relative path: {localPath: "projects/app"} → 400 + "Le chemin doit être absolu"
- non-existent path: {localPath: "/tmp/does-not-exist", exists: false} → 400 + "Dossier introuvable"
- duplicate path: {localPath: "/home/dev/main-app-v3", alreadyInConfig: true} → 409 + "Projet déjà ajouté"
- write failure on add: {fileSystem: "EACCES on config.json"} → 500 + in-memory unchanged + form shakes
- name derivation: {localPath: "/home/dev/projects/my-frontend"} → entry name="my-frontend"
- in-memory mutation visible: {pipelineConsumer: "getRepositories()", afterAdd: true} → returns N+1 repos without restart
- keyboard add: {key: "Enter" on input} → POST fires
- escape clears input: {key: "Escape" on input} → input cleared

- nominal delete: {click: "×" on manage row, localPath: "/home/dev/old-project"} → 200 + manage row collapses + matching tab fades + DOM removed
- delete unknown: {localPath: "/nope"} → 404 + "Projet introuvable" + no DOM change
- delete active tab: {activeTabId: "/home/dev/x", deleteX: true} → switch to Overview tab after removal

- nominal disable: {click: "toggle" on manage row, localPath: "/home/dev/x"} → 200 + tab dims to 0.4 over 200ms + toggle icon rotates 180°
- nominal enable: {click: "toggle" on manage row, localPath: "/home/dev/x", currentlyDisabled: true} → 200 + tab fades back to 1.0 + toggle icon rotates back
- disable unknown: {localPath: "/nope"} → 404

- reduced motion respected: {prefers-reduced-motion: reduce} → opacity-only transitions, no slide/shake/pulse
- legacy DOM cleanup: {grep: "project-select|project-path-input"} → 0 matches in index.html

---

## Out of Scope

- Editing the `name` field of an existing project (deferred to SPEC-179 Settings modal)
- Editing per-project settings (language, skills, quality threshold) — SPEC-179
- Cancelling in-flight reviews of a removed project — SPEC-179 may address it
- Path autocomplete or filesystem browser
- Per-repo CLI bootstrap (`.reviewflow/`, `.mcp.json`) — `reviewflow init` handles it
- Git repository validation on add — symmetric with the existing CLI `add-repository`
- Settings modal UI shell (chantier #3) — SPEC-179
- Tab repositioning above the cards (chantier #2) — SPEC-178
- Reordering tabs by drag-and-drop

---

## Glossary

| Term | Definition |
|------|------------|
| `localPath` | Absolute filesystem path to a project directory |
| Project tab | Button rendered by `tabBar.js` for one entry of `config.repositories` |
| Manage panel | Collapsible section above the tab bar containing the Add form + per-repo rows (delete + toggle) |
| Manage row | One row in the manage panel for one repository — shows name, short path, × button, enable/disable toggle |
| In-memory mutation | Direct push/splice on `deps.config.repositories` so subsequent lambdas see the new state |
| Agentic OS DNA | The visual identity in `styles.css` — dark warm near-black + amber + green, monospace, corner-brackets, `// LABEL` prefix, glow-pulse |
| Reduced motion | Honors `prefers-reduced-motion: reduce` CSS media query |

---

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | No prerequisite spec; tab bar route already shipped |
| Negotiable | OK | Affordance placement and animation timing open |
| Valuable | OK | Restores a flow broken by SPEC-91 + adds polish that elevates perception |
| Estimable | OK | 3 endpoints (1 reusing existing usecase), 1 sidebar form, animation CSS pass |
| Small | OK | ~7 production files + 4 test files, ~0.6j IA |
| Testable | OK | 20 scenarios cover CRUD nominal + errors + animation contracts |

**Verdict**: READY

---

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 3 | Every dashboard user |
| Impact | 2 | Restores critical flow + meaningful UX uplift |
| Confidence | 90% | Add reuses existing usecase; delete/patch new but trivial; animation CSS-only |
| Effort | 2 pts | ~0.6j IA |
| **Score** | **2.7** | |

**Priority**: P1-critical
