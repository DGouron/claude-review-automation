# Spec #179 — Configure Project Settings via a Modal

## Status: implemented

Shipped 2026-05-25. See `docs/reports/179-dashboard-project-settings-modal.report.md` (22/22 acceptance GREEN, +70 tests, no regression on SPEC-177/178).

## Implementation

### Artefacts

- **Schema (new)**: `src/modules/cli-configuration/entities/projectConfig/projectConfig.schema.ts` — Zod schema with optional `externalLink: string`.
- **Gateway (new)**: `src/modules/cli-configuration/interface-adapters/gateways/projectConfig.fileSystem.gateway.ts` — atomic read + write of `<projectPath>/.claude/reviews/config.json` (write via `.tmp` then rename).
- **Use case (new)**: `src/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.ts` — allow-list merge of the 5 editable fields; validates HTTPS-only `externalLink`; empty string strips the key from the merged config; preserves all other fields (`agents`, `routingPolicy`, etc.).
- **Route (extended)**: `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts` — `PATCH /api/project-config?path=<localPath>` next to the existing GET. Accepts optional `onUpdated` hook (no-op today, SPEC-180 forward-compat).
- **Overview presenter (extended)**: `src/modules/statistics-insights/interface-adapters/presenters/overview.presenter.ts` — reads each project's `.claude/reviews/config.json` via the new gateway and exposes `externalLink` on the per-project view-model. Projects without the file get `undefined`.
- **Dashboard humble (new)**: `src/dashboard/modules/settingsModal.js` — `buildSettingsViewModel`, `renderSettingsModalHtml`, `validateExternalLink`, `extractFormPayload`. Pure functions, no DOM access in builders.
- **Dashboard view (extended)**: `src/dashboard/modules/overview.js` — renders the external-link icon (`target="_blank" rel="noopener noreferrer"`) on each project card when `externalLink` is set.
- **DOM + wiring**: `src/dashboard/index.html` — `<button id="open-settings-modal-btn">` in sidebar (hidden when `activeTabId === 'overview'`), native HTML5 `<dialog id="settings-modal">`, inline-script handlers (open/close on X/Escape/backdrop, submit calls `PATCH /api/project-config`, 4xx renders the server error in French inside the modal).
- **CSS**: `src/dashboard/styles.css` — `#settings-modal` centered overlay (Agentic OS DNA: monospace, amber accents, corner-brackets, glow), `@media (prefers-reduced-motion: reduce)` block reducing transitions to opacity-only.

### Endpoints

| Method | Path | Body / Query | Status mapping |
|---|---|---|---|
| GET | `/api/project-config?path=<localPath>` | — | 200 (unchanged) |
| PATCH | `/api/project-config?path=<localPath>` | `{ language?, defaultModel?, reviewSkill?, reviewFollowupSkill?, externalLink? }` | 200 / 400 invalid external link / 422 illisible / 500 write |

All error messages are inline French literals.

### Architectural decisions taken

- **No central in-memory cache**: confirmed via grep — 5 call sites of `loadProjectConfig` all re-read from disk. Spec scenario "in-memory propagation" is satisfied by the atomic write + next-job fresh read pattern. An optional `onUpdated` hook is exposed for SPEC-180 forward compatibility (today a no-op).
- **Native HTML5 `<dialog>`** instead of a custom overlay — built-in Escape and backdrop behaviors, less inline-script boilerplate.
- **Allow-list merge in the usecase** (not in the route) — keeps the route HTTP-shape-only and makes the merge invariant easy to test.
- **Atomic write via `.tmp` + rename** — preserves the previous config on failure (file system POSIX guarantee for rename within same FS).
- **Empty `externalLink` == remove the key** (not write empty string) — implemented via destructure-and-spread (`const { externalLink: _omitted, ...withoutLink } = merged`) to satisfy Biome's `noDelete` rule.
- **Overview presenter is the source of `externalLink`** (not `/api/repositories`) — the presenter already does the per-project aggregation; adding one disk read per project per refresh is cheap for typical N (< 10 repos). Avoids polluting the lighter `/api/repositories` endpoint.
- **`SettingsModalConfigInput` JSDoc accepts the full `ProjectConfig` shape** with optional extras — the humble builder ignores fields it does not consume; this keeps the test calling convention realistic.

## Context

After SPEC-177 (project CRUD) and SPEC-178 (tabs above + contextual counters), the project is selectable but its per-project configuration (`.claude/reviews/config.json`) is only editable by hand on disk. The operator wants to edit `language`, `defaultModel`, `reviewSkill`, `reviewFollowupSkill` and a new external link (Notion/Confluence/GitLab page) from the dashboard, immediately, without restarting the daemon. Auto-approve threshold and granular skills refactor are deferred to SPEC-180/SPEC-181 to keep this iteration small.

## Rules

- A "Settings" button appears in the sidebar; clicking it opens a modal targeting the project of the active tab (`activeTabId`)
- The Settings button is hidden when the active tab is `'overview'` (no project to configure)
- The modal loads the current `.claude/reviews/config.json` of the project and renders editable controls for: `language`, `defaultModel`, `reviewSkill`, `reviewFollowupSkill`, `externalLink`
- `language` is a radio choice between supported values (`fr` / `en`)
- `defaultModel` is a select between `haiku` / `sonnet` / `opus`
- `reviewSkill` and `reviewFollowupSkill` are free-text inputs (single line each)
- `externalLink` is an optional URL string; empty is allowed; non-empty must start with `https://`; anything else (including `http://`, `javascript:`, free text) is rejected
- Submitting the modal calls `PATCH /api/project-config?path=<projectLocalPath>` with the updated payload
- On 200, the server writes `.claude/reviews/config.json` atomically and mutates the in-memory project-config cache so the next review uses the new values without a daemon restart
- On 200, the modal closes; the dashboard refreshes the Overview cards (`externalLink` now visible on the project card) and the new values are reflected anywhere the dashboard reads them
- On 4xx, the modal stays open and shows the server error message in French
- The modal is dismissable via the close X, Escape key, and clicking the backdrop (outside the modal); dismissal without submit discards pending changes
- The Overview project card displays a small external-link icon when `externalLink` is set; the icon opens the URL in a new tab (`target="_blank" rel="noopener noreferrer"`)
- The modal honors `@media (prefers-reduced-motion: reduce)` — open/close transitions reduced to opacity only

## Scenarios

- open modal on project tab: {click: "Settings", activeTabId: "/repo/A"} → modal ouverte + champs pré-remplis depuis `.claude/reviews/config.json` de /repo/A
- settings button hidden on overview: {activeTabId: "overview"} → bouton "Settings" non rendu
- save language change: {language: "en"} → 200 + `.claude/reviews/config.json` mis à jour + modale fermée
- save default model: {defaultModel: "sonnet"} → 200 + persisté + next review utilise "sonnet"
- save external link valid: {externalLink: "https://notion.so/team/projet"} → 200 + persisté + carte overview du projet affiche l'icône de lien
- empty external link allowed: {externalLink: ""} → 200 + persisté + carte overview n'affiche pas d'icône
- reject http link: {externalLink: "http://insecure.example"} → reject "Le lien doit être en HTTPS"
- reject javascript scheme: {externalLink: "javascript:alert(1)"} → reject "URL invalide"
- reject free text: {externalLink: "not a url"} → reject "URL invalide"
- close via X: {click: "X"} → modale fermée + aucune écriture
- close via Escape: {key: "Escape"} → modale fermée + aucune écriture
- close via backdrop: {click: "backdrop"} → modale fermée + aucune écriture
- in-memory propagation: {save language "en", inflight review} → la review en cours conserve l'ancienne langue, la prochaine utilise "en"
- malformed config file: {`.claude/reviews/config.json` corrompu} → reject "Configuration projet illisible"
- network failure on save: {fetch error} → modale reste ouverte + message "Échec de la sauvegarde"
- reduced motion respected: {prefers-reduced-motion: reduce} → ouverture/fermeture opacity-only, pas de slide

## Out of Scope

- Seuil de qualité + auto-approve gate (SPEC-180 future)
- Refactor skills par audit individuel / review-back / custom (SPEC-181 future)
- Édition de champs avancés (`agents`, `followupAgents`, `routingPolicy`, `reviewFocus`, `retentionDays`) — la modale les ignore et les préserve à la sauvegarde
- Création d'une nouvelle config projet (le projet doit déjà avoir `.claude/reviews/config.json` créé par `reviewflow init`)
- Validation que `reviewSkill` / `reviewFollowupSkill` pointent vers une skill existante (texte libre, validation deferred à SPEC-181)
- Multi-projet (édition simultanée de plusieurs projets) — un projet à la fois
- Historique / undo des modifications

## Glossary

| Terme | Définition |
|---|---|
| `.claude/reviews/config.json` | Fichier de configuration per-projet dans le repo du projet — contient `language`, `defaultModel`, skills, agents, etc. |
| Settings modal | Modale HTML/CSS centrée ouverte depuis la sidebar, édite les fields ci-dessus pour le projet actif |
| `externalLink` | Nouveau champ — URL HTTPS optionnelle pointant vers la doc/page externe du projet |
| In-memory propagation | Le cache serveur des ProjectConfig est mis à jour en place après chaque PATCH, sans redémarrage |
| Project card | Le bloc visuel d'un projet dans l'Overview tab (déjà rendu par `overview.js` SPEC-91) |

## INVEST Evaluation

| Critère | Statut | Note |
|---|---|---|
| Independent | OK | Repose sur SPEC-91/177/178 livrés ; pas d'autre spec en vol bloquante |
| Negotiable | OK | UI exacte et position du bouton Settings ouvertes |
| Valuable | OK | Permet d'éditer 5 settings critiques sans toucher au disque |
| Estimable | OK | ~8 fichiers, scope serré, pas d'ambiguïté |
| Small | OK | 1 schema ext + 1 usecase + 1 route + 1 module dashboard + tests |
| Testable | OK | 15 scénarios couvrent nominal, validations, UX, fail modes |

**Verdict** : **READY**

## Definition of Done

- Acceptance test `src/tests/acceptance/179-*.test.ts` GREEN
- No regression on SPEC-91/177/178 acceptance tests
- Spec status flipped to `implemented` with `## Implementation` section
- Feature tracker updated
- Report persisted at `docs/reports/179-*.report.md`
- Committed via `/commit` with conventional message
