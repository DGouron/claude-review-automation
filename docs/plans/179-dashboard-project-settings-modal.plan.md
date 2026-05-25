# SPEC-179 — Configure Project Settings via a Modal

> Plan persisted at `docs/plans/179-dashboard-project-settings-modal.plan.md`.
> Spec source: `docs/specs/179-dashboard-project-settings-modal.md` (15 scenarios).
> Worktree root: `/home/damien/Documents/Projets/claude-review-automation/.claude/worktrees/spec-177-add-project-ui/`.

## Scope

PLAN:
  scope: dashboard project settings modal — PATCH per-project config from sidebar
  is_new_module: false (extends `cli-configuration` module + dashboard humble layer)

## Critical Correction vs Spec Wording

The spec text says `.reviewflow/config.json`. The codebase actually stores per-project config at **`<projectPath>/.claude/reviews/config.json`** (confirmed in `src/config/projectConfig.ts:105` and `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts:30`). The plan, the tests, and the implementation MUST use the real path. The spec's "in-memory propagation" intent is preserved verbatim — only the on-disk path is corrected.

## Summary Table

| Layer | New Files | Modified Files | Tests Added |
|-------|-----------|----------------|-------------|
| Config / schema | 0 | 1 (`src/config/projectConfig.ts`) | +3 specs in existing `projectConfig.test.ts` |
| Usecase | 1 (`updateProjectConfig.usecase.ts`) | 0 | +1 test file (~8 specs) |
| Gateway | 2 (contract + fs impl) | 0 | +1 impl test + 1 stub |
| HTTP route | 0 (extend existing) | 1 (`projectConfig.routes.ts`) | +1 test file (~6 specs) |
| Composition root | 0 | 1 (`src/main/routes.ts`) | — |
| Dashboard humble | 1 (`settingsModal.js`) | 1 (`overview.js`) | +1 unit + amend overview test |
| DOM / CSS | 0 | 2 (`index.html`, `styles.css`) | — |
| Acceptance | 1 (`179-...acceptance.test.ts`) | 0 | 15 + 2 cross-checks |

**Totals:** 5 new files / 7 modified files / 5 unit specs / 1 acceptance file.

## Architectural Decisions

- **Native `<dialog>`**: HTML5 dialog is supported by Chrome / Firefox / Safari (the dashboard already targets evergreen browsers — see existing ES modules and `lucide@latest` CDN). Free Escape-to-close, free a11y focus trap, free backdrop click via `dialog::backdrop`. No custom z-index stack.
- **Allow-list merge in the usecase**, not in the route, not in the view. The usecase owns the invariant "fields outside `['language','defaultModel','reviewSkill','reviewFollowupSkill','externalLink']` are NEVER overwritten — `agents`, `followupAgents`, `routingPolicy`, `reviewFocus`, `retentionDays`, `github`, `gitlab` are read, kept, and rewritten as-is."
- **Validation is intentionally duplicated**: client-side `validateExternalLink` for immediate UX feedback, server-side same regex in the usecase as the source of truth (defense in depth — the route can be hit by `curl`).
- **No new presenter**: 5 form fields, no formatting beyond regex check. `settingsModal.js` builds its own viewmodel from the GET response. Adding a Presenter class would invert business-logic / boilerplate ratio (cf. `/anti-overengineering`).
- **Thin gateway for write**: read still goes through the existing `loadProjectConfig`; only the atomic write is genuinely new. A `ProjectConfigGateway` with `read + write` keeps the usecase testable via a memory stub.
- **Cache propagation**: see Open Question Q1 below. Grep already shows `loadProjectConfig` is called from several call sites (`github.controller.ts`, `gitlab.controller.ts`, `claudeInvoker.ts`, `mrTrackingAdvanced.routes.ts`, `routingPolicy.projectConfig.gateway.ts`) — each call re-reads the file from disk. **There is no central in-memory cache today.** Therefore the "in-memory propagation" scenario S13 is satisfied automatically by atomic write + next-call re-read. The usecase still exposes an `onUpdated?` hook for forward compatibility if SPEC-180 introduces a cache.

## ENTITIES

- **name**: `ProjectConfig` (existing, extend only)
  - **file**: `src/config/projectConfig.ts`
  - **change**: add `externalLink?: string` to the `ProjectConfig` interface. Extend `loadProjectConfig` to parse it: `typeof parsed.externalLink === 'string' && parsed.externalLink.length > 0 ? parsed.externalLink : undefined`. Validation of HTTPS prefix happens in the usecase on write — the loader stays permissive on read so legacy/edited files don't throw.
  - **test additions** in `src/tests/units/config/projectConfig.test.ts`:
    - parses config with `externalLink: "https://notion.so/team"` → field preserved
    - parses legacy config without `externalLink` → field is `undefined`
    - parses config with empty string `externalLink: ""` → field is `undefined`

## USECASES

- **name**: `updateProjectConfig`
  - **file**: `src/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.ts`
  - **test**: `src/tests/units/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.test.ts`
  - **type**: command
  - **input**: `{ path: string; patch: ProjectConfigPatch }` where `ProjectConfigPatch = Partial<Pick<ProjectConfig, 'language' | 'defaultModel' | 'reviewSkill' | 'reviewFollowupSkill' | 'externalLink'>>`.
  - **output**:
    ```
    | { status: 'success'; config: ProjectConfig }
    | { status: 'invalid'; reason: string }      // french messages
    | { status: 'not-found' }
    | { status: 'io-error'; reason: string }
    | { status: 'malformed' }                     // S14 — config.json corrupt
    ```
  - **dependencies**:
    - `gateway: ProjectConfigGateway`
    - `onUpdated?: (config: ProjectConfig) => void`
  - **scenarios** (→ spec scenario):
    - merges only whitelisted fields; ignores extras silently (S3, S4)
    - preserves `agents`, `followupAgents`, `routingPolicy`, `reviewFocus`, `retentionDays`, `github`, `gitlab` (S3, S4, S5)
    - validates `externalLink` regex `/^https:\/\//` (S5, S6)
    - accepts empty string → stored as absence (S6)
    - rejects `http://` → `{ status: 'invalid', reason: 'Le lien doit être en HTTPS' }` (S7)
    - rejects `javascript:` / `data:` / free text → `{ status: 'invalid', reason: 'URL invalide' }` (S8, S9)
    - returns `not-found` when `.claude/reviews/config.json` missing (S13 read-side)
    - returns `malformed` when file exists but JSON.parse throws (S14)
    - returns `io-error` when write fails (S15)
    - invokes `onUpdated` once with merged config on success
  - **constants** (single source of truth):
    ```ts
    export const EDITABLE_PROJECT_CONFIG_KEYS = ['language','defaultModel','reviewSkill','reviewFollowupSkill','externalLink'] as const;
    export const EXTERNAL_LINK_PATTERN = /^https:\/\//;
    ```

## GATEWAYS

- **name**: `ProjectConfigGateway`
  - **contract**: `src/modules/cli-configuration/entities/projectConfig.gateway.ts`
    ```ts
    export interface ProjectConfigGateway {
      read(projectPath: string): { status: 'ok'; config: ProjectConfig } | { status: 'not-found' } | { status: 'malformed' };
      write(projectPath: string, config: ProjectConfig): { ok: true } | { ok: false; reason: string };
    }
    ```
  - **implementation**: `src/modules/cli-configuration/interface-adapters/gateways/projectConfig.fileSystem.gateway.ts`
    - `read` delegates to `loadProjectConfig` but catches `JSON.parse` errors to surface `malformed`.
    - `write` performs atomic write: `writeFileSync('<configPath>.tmp', JSON.stringify(config, null, 2))` then `renameSync` to final path. Pretty-printed 2-space JSON to match existing convention.
  - **stub**: `src/tests/stubs/projectConfigGateway.stub.ts` — in-memory `Map<path, ProjectConfig>`, configurable failure modes (`forceMalformed`, `forceIoError`).
  - **note**: no factory needed; `ProjectConfigFactory` is overkill for a 9-field shape with default scenarios already covered by `loadProjectConfig` tests.

## CONTROLLERS

- **name**: extend `projectConfigRoutes`
  - **file**: `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts`
  - **test**: `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.test.ts` (extend the existing file — add a new `describe('projectConfigRoutes — PATCH /api/project-config', ...)`)
  - **dependencies injection**: today `projectConfigRoutes` takes no dependencies (it reads from disk directly). The PATCH handler needs the usecase, so the plugin signature must evolve. Two options:
    - **(A) Plugin options**: `projectConfigRoutes(app, { updateProjectConfig })`. Cleanest. Existing GET stays untouched.
    - **(B) Free function call**: import usecase + gateway at the top. Couples the route to the DI graph. **Rejected.**
  - **Decision**: Option A. Update `src/main/routes.ts:300` to pass options.
  - **PATCH handler**:
    - Validates `query.path` with same guard as GET (absolute, no `..`).
    - Parses JSON body, fails 400 if not object.
    - Calls `updateProjectConfig({ path, patch })`.
    - Maps result:
      - `success` → 200 `{ success: true, config }`
      - `invalid` → 400 `{ success: false, error: <reason> }` (french)
      - `not-found` → 404 `{ success: false, error: 'Project config not found' }`
      - `malformed` → 422 `{ success: false, error: 'Configuration projet illisible' }`
      - `io-error` → 500 `{ success: false, error: 'Échec de la sauvegarde' }`
  - **scenarios** (→ spec): missing path 400 (S15 hardening), path traversal 400, success 200 + body shape (S3-S6), invalid externalLink 400 + french message (S7-S9), missing file 404 (S13), corrupt file 422 (S14), write error 500 (S15).

## PRESENTERS

Not applicable — see Architectural Decisions.

## VIEWS

- **name**: `settingsModal`
  - **file**: `src/dashboard/modules/settingsModal.js`
  - **test**: `src/tests/units/dashboard/modules/settingsModal.test.ts`
  - **public API** (JSDoc; pure functions, no DOM side effects):
    - `buildSettingsViewModel(config)` → `{ language, defaultModel, reviewSkill, reviewFollowupSkill, externalLink, projectName }`
    - `renderSettingsModalHtml(viewModel)` → string (the dialog form content)
    - `validateExternalLink(value)` → `{ ok: true } | { ok: false; message: string }` mirroring the server regex
    - `extractFormPayload(formElement)` → patch object whitelisted to `EDITABLE_PROJECT_CONFIG_KEYS`
  - **DOM signature** (what `renderSettingsModalHtml` produces, mounted inside the dialog):
    - `<h2 class="settings-modal__title" id="settings-modal-title">// SETTINGS — <project></h2>`
    - `<form class="settings-modal__form" method="dialog">`
    - radio group `name="language"` (fr / en)
    - `<select name="defaultModel">` (haiku / sonnet / opus)
    - `<input name="reviewSkill" type="text">`
    - `<input name="reviewFollowupSkill" type="text">`
    - `<input name="externalLink" type="url" pattern="^https://.*">`
    - `<button type="submit">Save</button>` + `<button type="button" class="settings-modal__cancel">Cancel</button>`
    - `<p class="settings-modal__error" aria-live="polite"></p>`
  - **scenarios**:
    - viewmodel populates the 5 fields + projectName fallback
    - renders fr/en radios with the current language pre-checked
    - renders the 3 select options for defaultModel with current value selected
    - `validateExternalLink('')` → `{ ok: true }`
    - `validateExternalLink('https://example.com')` → `{ ok: true }`
    - `validateExternalLink('http://example.com')` → `{ ok: false, message: 'Le lien doit être en HTTPS' }`
    - `validateExternalLink('javascript:alert(1)')` → `{ ok: false, message: 'URL invalide' }`
    - `validateExternalLink('not a url')` → `{ ok: false, message: 'URL invalide' }`
    - `extractFormPayload(form)` returns exactly the 5 whitelisted keys

- **modify**: `src/dashboard/modules/overview.js`
  - Where the project card is rendered, append `<a class="project-card__external" href="${externalLink}" target="_blank" rel="noopener noreferrer" aria-label="Open project documentation">↗</a>` when `card.externalLink` is a non-empty string.
  - **viewmodel extension**: whatever function builds the project card object must read `externalLink` from the project's config (already returned by GET — needs to be propagated from `loadAvailableRepositories` or equivalent — see Open Question Q3).
  - **test amendment** in `src/tests/units/dashboard/modules/overview.test.ts`: 2 new scenarios — (a) icon rendered when `externalLink: 'https://x'`; (b) icon absent when undefined/empty.

## DOM / CSS

- **`src/dashboard/index.html`**:
  - Sidebar button — inserted as a top-level affordance after `worktree-section`:
    ```html
    <button type="button" id="open-settings-modal-btn" class="sidebar-settings-button" hidden>
      <span class="sidebar-settings-button__prefix">// SETTINGS</span>
    </button>
    ```
  - Dialog markup at end of `<body>`:
    ```html
    <dialog id="settings-modal" class="settings-modal" aria-labelledby="settings-modal-title"></dialog>
    ```
  - Inline-script additions (in the existing `<script type="module">` block where `activeTabId` lives, around index.html:2360+):
    - On tab change: toggle `#open-settings-modal-btn` `hidden` attribute based on `activeTabId === 'overview'`.
    - On button click: resolve project path (`activeTabId` when not overview), `fetch GET /api/project-config?path=...`, if `success` call `renderSettingsModalHtml(buildSettingsViewModel(config))` and inject into the `<dialog>`, then `dialog.showModal()`.
    - On form submit: prevent default, `validateExternalLink`, on ok `fetch PATCH /api/project-config?path=...` with JSON body, on 2xx close dialog and trigger overview refresh, on 4xx/5xx render `result.error` into `.settings-modal__error`.
    - On Cancel / X / Escape / backdrop click: `dialog.close()` (Escape and backdrop are native; click on backdrop = `event.target === dialog`).

- **`src/dashboard/styles.css`** — append rules:
  - `.sidebar-settings-button` — full-width sidebar button with corner-bracket frame + amber accent, monospace, matches existing `.manage-projects-toggle` density.
  - `.settings-modal` — centered, `max-width: 600px`, dark warm near-black background, amber border, monospace, glow on focus.
  - `.settings-modal::backdrop` — translucent dark with subtle blur.
  - `.settings-modal__form`, `.settings-modal__field`, `.settings-modal__title`, `.settings-modal__error`, `.project-card__external` styles.
  - `@media (prefers-reduced-motion: reduce) { .settings-modal { animation: none; transition: opacity 0.1s linear; } }` — disable slide, keep opacity-only.

## WIRING

- **`src/main/routes.ts`**:
  - At top — add imports: `ProjectConfigFileSystemGateway`, `UpdateProjectConfigUseCase`.
  - In the wiring section (around line 300 where `projectConfigRoutes` is registered):
    ```
    const projectConfigGateway = new ProjectConfigFileSystemGateway();
    const updateProjectConfig = new UpdateProjectConfigUseCase(projectConfigGateway);
    await app.register(projectConfigRoutes, { updateProjectConfig });
    ```
  - No other call sites to touch — `loadProjectConfig` consumers (controllers, claudeInvoker, mrTrackingAdvanced) re-read from disk on every call so they pick up the change naturally.

## ACCEPTANCE_TEST

  file: `src/tests/acceptance/179-dashboard-project-settings-modal.acceptance.test.ts`
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end."
  scenarios:
    1. Settings button hidden when active tab is overview (cross-check + S2)
    2. Settings button visible when a project tab is active (S1)
    3. `<dialog id="settings-modal">` exists in initial HTML payload (cross-check)
    4. GET /api/project-config returns externalLink when set
    5. PATCH with `{ language: 'en' }` persists + preserves agents / routingPolicy (S3)
    6. PATCH with `{ defaultModel: 'sonnet' }` persists + next loadProjectConfig returns sonnet (S4, S13)
    7. PATCH with `{ externalLink: 'https://notion.so/x' }` → 200 + overview card icon visible (S5)
    8. PATCH with `{ externalLink: '' }` → 200 + overview card icon absent (S6)
    9. PATCH with `{ externalLink: 'http://insecure' }` → 400 "Le lien doit être en HTTPS" (S7)
    10. PATCH with `{ externalLink: 'javascript:alert(1)' }` → 400 "URL invalide" (S8)
    11. PATCH with `{ externalLink: 'not a url' }` → 400 "URL invalide" (S9)
    12. PATCH on missing project → 404 (S13)
    13. PATCH on corrupt config.json → 422 "Configuration projet illisible" (S14)
    14. PATCH on write failure → 500 "Échec de la sauvegarde" (S15)
    15. PATCH ignores `agents` field in payload silently (out-of-scope guard from spec line 47)
    16. (Frontend assertion via JSDOM) modal closes on Escape (S10-S12)
    17. (Frontend assertion via JSDOM) `prefers-reduced-motion` CSS rule present (S16)

## IMPLEMENTATION_ORDER

1. **`src/tests/acceptance/179-...acceptance.test.ts`** — write all 17 scenarios RED first (SDD outer loop).
2. **`src/tests/units/config/projectConfig.test.ts`** — add 3 externalLink specs RED → **`src/config/projectConfig.ts`** add `externalLink?: string` field + parse (GREEN).
3. **`src/modules/cli-configuration/entities/projectConfig.gateway.ts`** — contract only (no test).
4. **`src/tests/stubs/projectConfigGateway.stub.ts`** + **`src/tests/units/modules/cli-configuration/interface-adapters/gateways/projectConfig.fileSystem.gateway.test.ts`** RED → **`projectConfig.fileSystem.gateway.ts`** (atomic write, malformed detection) GREEN.
5. **`updateProjectConfig.usecase.test.ts`** RED → **`updateProjectConfig.usecase.ts`** + `EDITABLE_PROJECT_CONFIG_KEYS` + `EXTERNAL_LINK_PATTERN` GREEN.
6. **`projectConfig.routes.test.ts`** — add PATCH describe RED → extend **`projectConfig.routes.ts`** with PATCH handler + plugin options signature GREEN.
7. **`src/main/routes.ts`** — wire `ProjectConfigFileSystemGateway` + `UpdateProjectConfigUseCase`, pass options to `projectConfigRoutes`.
8. **`src/tests/units/dashboard/modules/settingsModal.test.ts`** RED → **`src/dashboard/modules/settingsModal.js`** GREEN. Pure functions only — no DOM.
9. **`src/tests/units/dashboard/modules/overview.test.ts`** amend for external-link icon RED → **`overview.js`** patch GREEN.
10. **`src/dashboard/index.html`** — sidebar button + `<dialog>` markup + inline-script wiring (button toggle, open, submit, close, backdrop).
11. **`src/dashboard/styles.css`** — `.settings-modal` + `.sidebar-settings-button` + `.project-card__external` + reduced-motion guard.
12. **Acceptance GREEN** — full `yarn test:ci`. SPEC-91, SPEC-177, SPEC-178 acceptance must stay GREEN.

## REFERENCE_FILES

- `docs/specs/179-dashboard-project-settings-modal.md` — source of truth.
- `src/config/projectConfig.ts` — existing `ProjectConfig` interface + `loadProjectConfig`. Note the real config path is `.claude/reviews/config.json`.
- `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts` — existing GET handler, Fastify plugin style; extend in place with PATCH.
- `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.test.ts` — existing test pattern with `app.register(projectConfigRoutes)`.
- `src/main/routes.ts:300` — composition root, where to instantiate gateway + usecase + register plugin options.
- `src/dashboard/index.html:2360-2454` — `activeTabId` state machine (use it to drive button visibility).
- `src/dashboard/modules/managePanel.js` — humble-module pattern reference (viewmodel + render).
- `src/dashboard/modules/tabBar.js` — viewmodel + render reference.
- `src/dashboard/modules/overview.js` — project card rendering to patch.
- `src/dashboard/styles.css:4267+` — `#worktree-section` styling (Agentic OS DNA reference for the modal look).
- `src/shared/foundation/usecase.base.ts` — base interface for new usecase (if exists; else free function form).
- `src/shared/foundation/guard.base.ts` — Zod helper if the implementer chooses to formalise `ProjectConfigPatchSchema`.

## OPEN QUESTIONS (for orchestrator)

- **Q1 — In-memory cache propagation (S13)** — grep confirms NO central cache exists. Every consumer (`github.controller.ts`, `gitlab.controller.ts`, `claudeInvoker.ts`, `mrTrackingAdvanced.routes.ts`, `routingPolicy.projectConfig.gateway.ts`) calls `loadProjectConfig` fresh, so atomic write + next-call re-read = automatic propagation. The usecase still exposes an `onUpdated?` hook (no-op today) so SPEC-180 can wire a cache without touching this code again. **Confirm: accept the "no cache today" reality, or block this plan on introducing one?** Recommendation: accept reality; the spec scenario S13 is met.
- **Q2 — Plugin signature change** — adding `updateProjectConfig` to `projectConfigRoutes` plugin options is a minor breaking change for any other caller. Grep shows only one caller (`src/main/routes.ts:300`). Safe.
- **Q3 — Where does `overview.js` get `externalLink` from?** The Overview card currently doesn't fetch each project's `config.json`. Two options:
  - **(a)** Backend extends the existing `/api/repositories` (or whatever feeds Overview) to include `externalLink` per project.
  - **(b)** Frontend fetches `/api/project-config?path=<p>` per repo on Overview load (N+1 over project count, fine for small N).
  - **Recommendation**: (a) — single round-trip, idiomatic. Implementer should locate the Overview data feed during step 9 and confirm before patching.
- **Q4 — Atomic write strategy** — write to `<configPath>.tmp`, then `fs.rename` to the real path. The temp file lives in the same directory, ensuring `rename` is atomic on POSIX. Confirms S15 (io-error) doesn't leave a half-written file.
- **Q5 — Form payload empty string handling** — when the user clears `externalLink` and submits, the frontend sends `""`. The usecase translates `""` → absent (deletes the key from the merged config). Confirm this UX: empty string in form == "remove the link".
