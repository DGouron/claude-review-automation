# Implementation Plan — SPEC-184: Setup Wizard Dashboard (Jarvis HUD)

> Status: PLANNED
> Spec: `docs/specs/184-setup-wizard-dashboard-jarvis.md`
> Depends on: SPEC-183 (merged — `src/modules/setup-wizard/`)
> Module home: `src/modules/setup-wizard/` (backend) + `src/dashboard/` (frontend, browser JS)

PLAN:
  scope: Setup Wizard Dashboard (Jarvis HUD)
  is_new_module: false (extends the existing `setup-wizard` module with an HTTP/SSE surface + adds a `/setup` static page to the dashboard)

---

## 0. Spec reconciliations (stale prose → real SPEC-183 / codebase contract)

Each correction below is authoritative; the implementer must follow the RIGHT column, not the spec prose.

| # | Spec prose (WRONG) | Reality (USE THIS) | Source |
|---|--------------------|--------------------|--------|
| R1 | step ids `secrets-rotation`, `configure-pipeline`; steps referenced by number `{step: 6}` | The 10 real ids are string-only: `dependencies, claude-login, daemon, secrets, add-project, pipeline, generate-files, register-project, validate, next-actions` | `entities/stepId/stepId.schema.ts` |
| R2 | 4-state model `pending / in_progress / completed / blocked` | Stream carries **9** statuses a consumer sees: `in_progress, skipped, succeeded, blocked, warning, awaiting_input, info, resumed, completed`. `pending` is a UI-only initial state (never emitted). Map all 9. | `services/jsonWizardEventEmitter.ts`, `entities/stepOutcome/stepOutcome.schema.ts` |
| R3 | spawn `reviewflow setup --json --pipe` | No `--pipe` flag exists. Use `reviewflow setup --json` only. Real flags: `path, --json, --force, --ai, --yes/-y, --show-secrets`. | `src/cli/parseCliArgs.ts`, `src/main/commands/setup.command.ts` (`SetupCliArgs`) |
| R4 | "exactly 10 steps, no more, no less" applied to all events | `instructions / warning / resume / done` are NOT among the 10 step rows. They are **banners/summary** events (`step: "instructions" | "warning" | "resume" | "done"`). Render them as banners, never as an 11th row. The "exactly 10" rule applies only to the 10 `StepId` rows. | `services/jsonWizardEventEmitter.ts` |
| R5 | SSE is the project's streaming mechanism ("SSE wiring already exists") | **No SSE anywhere** in the project (no `text/event-stream`, no `EventSource`). The project streams live dashboard updates over **WebSocket** (`/ws`, `src/main/websocket.ts`). DECISION below: we still implement SSE for `/setup` because the subprocess lifecycle is per-request (a fresh spawn per wizard run), which maps cleanly to one SSE response stream and avoids polluting the global `/ws` broadcast bus. This is a deliberate, isolated new pattern — flagged. | `src/main/websocket.ts`, grep of repo |
| R6 | CSS tokens `--bg-near-black`, `--amber-500`, `--green-400`, `--red-400` | Real tokens: `--bg-0..--bg-4` (warm near-black), `--accent` (amber `#F4A93D`), `--success` (`#7BC47F`), `--warning` (`#E0B341`), `--danger` (`#D9656A`), `--info`, `--font-mono`. Reuse these; do NOT invent new token names. | `src/dashboard/styles.css` `:root` |
| R7 | "filesystem picker via electron-style API"; forms POST to `/api/setup/input` → stdin → next event | The duplex input half DOES NOT EXIST on the CLI side. In `--json` mode the orchestrator still builds `PromptTtyGateway` (inquirer/TTY) and never reads a JSON answer from stdin. A piped subprocess has no TTY, so `awaiting_input` cannot be answered by the dashboard. → **forms + `/api/setup/input` deferred to Iteration B**, gated on a new SPEC-183 `PromptStdinJsonGateway`. | `createSetupDependencies()` line ~132, `interface-adapters/gateways/prompt.tty.gateway.ts`, `usecases/orchestrateSetup.usecase.ts` |
| R8 | polling fallback `/api/setup/state` reflects "current state" | `setup-state.json` (`setupState.schema.ts`) only persists **terminal** step outcomes (`Partial<Record<StepId, StepOutcome>>`), no `in_progress`. So polling can show completed/blocked steps but cannot show which step is *currently* running. The frontend must treat polling as a degraded snapshot (completed-set + last-known), not a live cursor. | `entities/setupState/setupState.schema.ts` |
| R9 | Lottie via `lottie-web` | **No lottie dependency installed.** `lottie-web` would be a NEW runtime dependency (flagged §"NEW DEPENDENCY"). The project already ships `animejs` (vendored `anime.esm.min.js`). Iteration A uses CSS + existing anime.js for the status choreography and a lightweight inline-SVG/CSS "boot sequence" — NO new dependency. Lottie deferred unless explicitly approved. | `package.json`, `src/dashboard/vendor/anime.esm.min.js` |

---

## 1. Iteration split (anti-overengineering / scope discipline)

The full DoD (~12 components, 4 endpoints, 4 Lottie, a11y, multi-tab, visual regression, duplex stdin) exceeds one pipeline run AND the input half is blocked on a SPEC-183 change (R7). Split:

### Iteration A — read-only live view (THIS pipeline run)

Backend:
- `POST /api/setup/start` — spawn `reviewflow setup --json` as a subprocess, register it as the single active wizard run, return `{ runId }`.
- `GET /api/setup/events` — SSE stream of the subprocess stdout, one JSON event per `data:` frame (newline-delimited stdout → SSE frames), plus a synthetic `connection-lost` / `process-exit` frame.
- `GET /api/setup/state` — read `~/.claude-review/setup-state.json` (via existing `SetupStateFileSystemGateway`) for the degraded polling fallback.

Frontend (`/setup` static page):
- 10 step rows keyed by the real `StepId`s (R1), full 9-status→visual mapping (R2), `pending` as initial UI state.
- Banners for `instructions / warning / resume / done` (R4); `resume` drives the "// REPRISE — Étape N/10" header.
- Boot animation via CSS/anime.js (no Lottie, R9).
- Design DNA via existing tokens (R6): corner brackets, `// LABEL` prefixes, glow-pulse status dots.
- `prefers-reduced-motion`: instant transitions, static SVG checkmarks.
- Screen-reader live region announcing each status change.
- Disconnect banner ("// CONNEXION PERDUE") + polling fallback to `/api/setup/state` (R8 degraded).
- Multi-tab READ-ONLY awareness: a second `/setup` tab sees the active run as read-only ("// SETUP DÉJÀ EN COURS"); completion broadcast via `storage` event.
- `awaiting_input` rendered **read-only / informational** in A (shows the prompt label, no form, with a note that input must be provided in the terminal). NO `/api/setup/input`, NO interactive forms.

### Iteration B — forms + stdin duplex (DEFERRED — documented only, not planned in detail)

See §"DEFERRED TO ITERATION B".

### Judgment on the split

The proposed A/B split is the right cut: it ships a fully usable, beautiful, faithful read-only HUD now, and isolates the one genuinely-blocked capability (interactive input) behind a clearly-scoped SPEC-183 prerequisite. Iteration A is self-contained and demonstrable end-to-end (the DoD acceptance test "spawn mock CLI emitting all 10 step events → all rows update in order" is satisfiable in A). No A1/A2 sub-split is needed — see file count §"FILE LIST" (≈18 files, within the ≤20 target).

---

## ENTITIES

No NEW domain entity is required. The wizard event shapes are already implicitly defined by `jsonWizardEventEmitter.ts`. To consume them safely at the SSE boundary WITHOUT `as`/`any`, add ONE boundary guard that validates a parsed stdout line into a discriminated union:

  - name: WizardStreamEvent
    file: src/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.schema.ts
    guard: src/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.guard.ts
    test: src/tests/units/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.guard.test.ts
    factory: src/tests/factories/wizardStreamEvent.factory.ts
    note: >
      Zod discriminated union over the 7 emitter shapes (step-started, step-completed,
      awaiting-input, instructions, warning, resume, done). Reuses `stepIdSchema` and
      `stepOutcomeStatusSchema` from SPEC-183. This is the ONLY new domain artifact;
      it earns its place because the SSE server must validate untrusted subprocess
      stdout before forwarding (anti-`as`/`any`). Keep it a schema+guard, no class.

> Anti-overengineering note: no Value Object, no Entity-with-identity, no presenter ViewModel
> on the backend. The 9-status→visual mapping is a presentation concern that lives in the
> frontend humble object (browser JS), consistent with how every other dashboard panel is built.

---

## USECASES

  - name: streamSetupRun (thin orchestration, may be a plain function, not a class)
    file: src/modules/setup-wizard/usecases/streamSetupRun.usecase.ts
    test: src/tests/units/modules/setup-wizard/usecases/streamSetupRun.usecase.test.ts
    type: command
    input: { spawn: SetupProcessGateway, onEvent: (line: string) => void, onClose: (code: number | null) => void }
    output: { runId: string; cancel: () => void }
    note: >
      Owns the "single active run" invariant (reject a second start while one is live),
      wires the subprocess gateway's stdout-line callback to the SSE writer, and the
      exit callback to the terminal frame. No business logic beyond lifecycle — kept
      minimal per anti-overengineering. If it collapses to <15 lines during TDD, inline
      it into the controller and drop this file (note that in the report).

> No use case for `/api/setup/state`: it is a straight read through the existing
> `SetupStateFileSystemGateway` — the controller calls the gateway directly (same pattern
> as `/api/worktrees` reading through `worktreeGateway`).

---

## GATEWAYS

  - name: SetupProcessGateway
    contract: src/modules/setup-wizard/entities/setupProcess/setupProcess.gateway.ts
    implementation: src/modules/setup-wizard/interface-adapters/gateways/setupProcess.childProcess.gateway.ts
    stub: src/tests/stubs/setupProcess.stub.ts
    methods:
      - spawn(): { onLine(cb), onExit(cb), kill(), pid }   # spawns `reviewflow setup --json`
    note: >
      Implementation uses `node:child_process.spawn(process.execPath, [process.argv[1],
      'setup', '--json', ...], { stdio: ['ignore','pipe','pipe'] })`, mirroring the
      existing `src/shared/services/daemonSpawner.ts` pattern (same project, no execa).
      Splits stdout on newlines into JSON lines. The STUB emits a scripted sequence of
      lines — this is what the acceptance test drives ("mock CLI emitting all 10 step events").

  - reuse (no new file): SetupStateGateway
    contract: src/modules/setup-wizard/entities/setupState/setupState.gateway.ts (EXISTS)
    implementation: src/modules/setup-wizard/interface-adapters/gateways/setupState.fileSystem.gateway.js (EXISTS)
    note: instantiate in routes.ts with `join(getConfigDir(), 'setup-state.json')` (same as setup.command.ts).

---

## CONTROLLERS

  - name: setupWizardRoutes (Fastify plugin, http)
    file: src/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.ts
    test: src/tests/units/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.test.ts
    dependencies:
      - setupProcessGateway: SetupProcessGateway
      - setupStateGateway: SetupStateGateway   # for GET /api/setup/state
      - wizardStreamEventGuard                  # validate each stdout line before forwarding
      - logger: Logger
    endpoints:
      - POST /api/setup/start   → start run (409 if one already active), returns { runId }
      - GET  /api/setup/events  → SSE: sets headers (Content-Type: text/event-stream,
                                   Cache-Control: no-cache, Connection: keep-alive),
                                   writes to `reply.raw`, forwards each validated event as
                                   `data: <json>\n\n`, sends terminal `event: end` on exit,
                                   cleans up on `request.raw.on('close')`.
      - GET  /api/setup/state   → reads setup-state.json, returns SetupState | { state: null }
    note: >
      SSE is implemented via Fastify `reply.raw` (Node http.ServerResponse) since the
      project has no SSE helper. Controller contains ZERO presentation logic: it forwards
      validated raw events; the browser humble object maps status→visuals. Follows the
      typed-options DI pattern of every existing *.routes.ts (`FastifyPluginAsync<Options>`).

---

## PRESENTERS

  None on the backend (deliberate). The status→visual mapping (dot color, glow-pulse,
  label, banner kind, a11y announcement string) is presentation logic and lives in the
  frontend humble object, consistent with every existing dashboard panel (worktreePanel.js,
  tabBar.js, etc. are humble objects fed by browser-side view models). Adding a TS presenter
  here would duplicate logic the browser must own anyway → rejected per anti-overengineering.

---

## VIEWS (browser humble objects — `src/dashboard/`, NOT `src/interface-adapters/views/`)

> Convention confirmed: dashboard frontend lives in `src/dashboard/` served by
> `@fastify/static` (prefix `/dashboard/`). Views are JSDoc-typed browser JS modules in
> `src/dashboard/modules/`, each with a unit test in `src/tests/units/dashboard/modules/`.
> `/setup` ships as a new static HTML page + dedicated JS modules.

  - name: setup.html (page)
    file: src/dashboard/setup.html
    served_at: /dashboard/setup.html  (and a `/setup` redirect alias in routes.ts → /dashboard/setup.html)
    note: standalone page reusing styles.css tokens, Geist/JetBrains fonts, lucide; no Lottie.

  - name: setupWizardView (humble object — pure render of step rows + banners)
    file: src/dashboard/modules/setupWizard.js
    test: src/tests/units/dashboard/modules/setupWizard.test.ts
    responsibility: >
      buildStepRowsModel(events) → 10 rows with {id, label, status, message, remediation,
      dotClass, ariaAnnouncement}; full 9-status→visual mapping (R2); banner model for
      instructions/warning/resume/done (R4); corner-bracket markup + `// LABEL` prefixes.
      Pure functions, no DOM, no globals (mirror worktreePanel.js style).

  - name: setupWizardController (browser glue — SSE/EventSource client + DOM wiring + a11y live region + multi-tab)
    file: src/dashboard/modules/setupWizardStream.js
    test: src/tests/units/dashboard/modules/setupWizardStream.test.ts
    responsibility: >
      Opens `new EventSource('/api/setup/events')`, dispatches events into the view model,
      handles disconnect → polling `/api/setup/state` every 2s (R8 degraded), updates the
      SR live region, broadcasts completion via `storage` event for multi-tab redirect,
      respects `prefers-reduced-motion`. Kept thin; the pure mapping stays in setupWizard.js.
    note: >
      `EventSource` is the standard browser SSE client (no dependency). This is the first
      EventSource usage in the project — flagged in R5 as a deliberate isolated pattern.

  - modify: src/dashboard/index.html + a small entry module
    file (modify): src/dashboard/index.html
    note: >
      Empty-state CTA "// SETUP REQUIRED" → "Lancer le wizard" linking to /dashboard/setup.html
      (Scenario "fresh dashboard visit, no project"). Minimal addition; if it grows beyond a
      few lines, extract to src/dashboard/modules/setupEntry.js (decide during TDD).

  - modify: src/dashboard/styles.css
    note: append `/setup`-scoped styles (step rows, status dots, glow-pulse keyframes if not
      already present, corner brackets, banners) reusing existing tokens. No new tokens.

---

## WIRING

  routes (src/main/routes.ts):
    - import + register `setupWizardRoutes` with:
        setupProcessGateway: new SetupProcessChildProcessGateway()
        setupStateGateway: new SetupStateFileSystemGateway({ filePath: join(getConfigDir(), 'setup-state.json') })
        logger: deps.logger
    - add `app.get('/setup', (_req, reply) => reply.redirect('/dashboard/setup.html'))`
      (alias, consistent with existing `app.get('/', → /dashboard/)`)
    - (static serving of setup.html is already covered by the existing `@fastify/static`
      registration rooted at `src/dashboard`)
  dependencies:
    - SetupProcessChildProcessGateway (new) — instantiated in routes.ts composition root only
    - SetupStateFileSystemGateway (existing) — reused

---

## IMPLEMENTATION_ORDER (inside-out, TDD per file, acceptance RED first)

1. `src/tests/acceptance/184-setup-wizard-dashboard-jarvis.acceptance.test.ts` — write FIRST, stays RED (outer SDD loop). Drives the stub process gateway emitting all 10 step events → asserts ordered row updates + banners.
2. `entities/wizardStreamEvent/wizardStreamEvent.schema.ts` (+ guard, + factory, + guard test) — boundary contract, innermost layer. Reuses SPEC-183 `stepIdSchema` / `stepOutcomeStatusSchema`.
3. `entities/setupProcess/setupProcess.gateway.ts` (contract) + `tests/stubs/setupProcess.stub.ts` — port the acceptance test needs.
4. `usecases/streamSetupRun.usecase.ts` (+ test) — single-active-run lifecycle (may be inlined if trivial).
5. `interface-adapters/gateways/setupProcess.childProcess.gateway.ts` — real spawn impl (mirrors daemonSpawner.ts).
6. `interface-adapters/controllers/http/setupWizard.routes.ts` (+ test) — 3 endpoints, SSE via reply.raw, guard at boundary.
7. `src/dashboard/modules/setupWizard.js` (+ test) — pure view model: 9-status mapping, rows, banners, a11y strings.
8. `src/dashboard/modules/setupWizardStream.js` (+ test) — EventSource client, polling fallback, multi-tab, reduced-motion.
9. `src/dashboard/setup.html` + `src/dashboard/styles.css` additions — markup + DNA styles (no test; covered by view-model tests + acceptance).
10. `src/dashboard/index.html` (+ entry) — empty-state CTA to /setup.
11. `src/main/routes.ts` — WIRING (composition root) — ALWAYS LAST. Make the acceptance test GREEN.

---

## FILE LIST (create vs modify, with counts)

### CREATE — production (9)
1. src/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.schema.ts
2. src/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.guard.ts
3. src/modules/setup-wizard/entities/setupProcess/setupProcess.gateway.ts
4. src/modules/setup-wizard/usecases/streamSetupRun.usecase.ts  (may be inlined → −1)
5. src/modules/setup-wizard/interface-adapters/gateways/setupProcess.childProcess.gateway.ts
6. src/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.ts
7. src/dashboard/modules/setupWizard.js
8. src/dashboard/modules/setupWizardStream.js
9. src/dashboard/setup.html

### CREATE — tests / doubles (6)
10. src/tests/acceptance/184-setup-wizard-dashboard-jarvis.acceptance.test.ts
11. src/tests/units/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.guard.test.ts
12. src/tests/units/modules/setup-wizard/usecases/streamSetupRun.usecase.test.ts  (drops if §4 inlined)
13. src/tests/units/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.test.ts
14. src/tests/units/dashboard/modules/setupWizard.test.ts
15. src/tests/units/dashboard/modules/setupWizardStream.test.ts
16. src/tests/factories/wizardStreamEvent.factory.ts
17. src/tests/stubs/setupProcess.stub.ts

### MODIFY (3)
18. src/main/routes.ts                 (register routes + /setup alias)
19. src/dashboard/index.html           (empty-state CTA)
20. src/dashboard/styles.css           (/setup styles, reuse tokens)

**Total: 17 create + 3 modify = 20 files** (17 if the trivial use case + its test are inlined).
Within the ≤20 target → **fits ONE pipeline run; no A1/A2 sub-split required.**

---

## DEFERRED TO ITERATION B (document only — do NOT implement now)

Reason: the duplex stdin input channel does not exist on the CLI side (R7). Implementing
faithfully requires a SPEC-183 change first.

- SPEC-183 prerequisite: add a `PromptStdinJsonGateway` selected when `--json`, so the
  orchestrator reads a JSON answer line from stdin on `awaiting_input` instead of using
  `PromptTtyGateway` (inquirer/TTY). Without it, no piped subprocess can collect input.
- `POST /api/setup/input` — write the JSON answer body to the subprocess stdin.
- The 4 interactive forms (project-path, preset-choice 5-card grid, custom-agent multi-select,
  confirmation overlay) — Scenarios under "Forms inside the wizard".
- Lottie animations (boot/pulse/check/celebration) IF the team wants true Lottie — requires
  the `lottie-web` dependency (see below). Iteration A delivers the choreography with CSS +
  anime.js, satisfying the design DNA without it.
- Visual-regression snapshot tooling for the 4 Lottie/animation states (separate concern).

---

## NEW DEPENDENCY FLAG

- `lottie-web` — **NOT installed**, would be a NEW runtime dependency (~no current lottie in
  package.json; `animejs` is the only animation lib, already vendored). **Iteration A does NOT
  add it** — boot/status choreography uses CSS + existing anime.js. Adding `lottie-web` is
  deferred to Iteration B and must be explicitly approved (project rule: flag new deps).
- `EventSource` (browser SSE client) and `reply.raw` SSE writing — NOT new dependencies
  (native browser API / native Fastify), but they ARE a new *pattern* in this codebase
  (the project otherwise uses WebSocket `/ws`). Flagged in R5 as a deliberate, isolated choice
  scoped to `/setup` (per-request subprocess lifecycle maps to one SSE response).

---

## ACCEPTANCE_TEST

  file: src/tests/acceptance/184-setup-wizard-dashboard-jarvis.acceptance.test.ts
  note: >
    SDD outer loop — written FIRST (step 1), RED during impl, GREEN at the end. Drives the
    StubSetupProcessGateway to emit the full ordered sequence: step-started + step-completed
    for all 10 real StepIds (R1), plus a `resume` banner and a final `done`. Asserts the
    setupWizard.js view model produces 10 rows updating in order with correct statuses (R2)
    and that banner events are NOT rendered as rows (R4). Exercises the SSE controller via
    Fastify inject where feasible, otherwise the use-case + view-model seam.

---

## REFERENCE_FILES

  - src/modules/setup-wizard/services/jsonWizardEventEmitter.ts — exact event shapes (R2,R4) [VERIFIED]
  - src/modules/setup-wizard/entities/stepId/stepId.schema.ts — the 10 real step ids (R1) [VERIFIED]
  - src/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.ts — outcome statuses [VERIFIED]
  - src/main/commands/setup.command.ts — real flags + PromptTtyGateway in --json mode (R3,R7) [VERIFIED]
  - src/modules/setup-wizard/entities/setupState/setupState.schema.ts — polling state shape (R8) [VERIFIED]
  - src/modules/setup-wizard/interface-adapters/gateways/setupState.fileSystem.gateway.js — reuse for /api/setup/state
  - src/main/websocket.ts — confirms project uses WS not SSE (R5) [VERIFIED]
  - src/shared/services/daemonSpawner.ts — node:child_process.spawn pattern to mirror [VERIFIED]
  - src/main/routes.ts — composition root + @fastify/static + redirect pattern [VERIFIED]
  - src/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.ts — `FastifyPluginAsync<Options>` route + zod boundary pattern [VERIFIED]
  - src/modules/worktree-management/interface-adapters/controllers/http/...routes.test.ts — route test via Fastify pattern [VERIFIED]
  - src/dashboard/styles.css :root — real design tokens (R6) [VERIFIED]
  - src/dashboard/modules/worktreePanel.js + tabBar.js — humble-object JSDoc/style for browser views [VERIFIED]
  - src/dashboard/index.html — single-page dashboard; /setup is a new static page [VERIFIED]
  - package.json — confirms no lottie-web; animejs present (R9) [VERIFIED]
