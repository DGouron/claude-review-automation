---
title: "SPEC-184: Setup Wizard Dashboard — Jarvis HUD"
status: partially-implemented
iterations:
  A: implemented
  B: deferred
milestone: Setup Wizard Jarvis
depends_on:
  - "183-setup-wizard-cli-orchestrator"
related:
  - "185-setup-wizard-mcp-agent-fallback"
---

# SPEC-184: Setup Wizard Dashboard — Jarvis HUD

## Status: implemented — Iteration A only (B deferred)

**Iteration A** (read-only live view) is implemented and on master (PR #235). **Iteration B**
(interactive forms + `POST /api/setup/input` + stdin duplex) is **deferred**: it is blocked by
[SPEC-187](187-setup-wizard-json-stdin-input.md) — the CLI must first read answers from stdin
in `--json` mode (today it still uses a TTY prompt). Items from the DoD not yet delivered:
`POST /api/setup/input` + forms (B), real Lottie animations (CSS used instead), visual-regression
tests, and full multi-tab completion broadcast. See
[implementation report](../reports/184-setup-wizard-dashboard-jarvis.report.md) and
[plan](../plans/184-setup-wizard-dashboard-jarvis.plan.md).

## Implementation

### Artefacts (Iteration A)

- **Entity (boundary contract)**: `wizardStreamEvent.schema.ts` / `.guard.ts` (7 event shapes, 9 statuses), `setupProcess.gateway.ts` (subprocess contract).
- **Use case**: `streamSetupRun.usecase.ts` — `SetupRunRegistry` (single-active-run, line buffering, late-subscriber replay).
- **Gateway impl**: `setupProcess.childProcess.gateway.ts` — spawns `reviewflow setup --json`, line-splits stdout, surfaces exit code.
- **Controller (HTTP + SSE)**: `setupWizard.routes.ts`.
- **Views (humble objects)**: `setupWizard.js` (rows + banners + status mapping + ARIA), `setupWizardStream.js` (EventSource + polling fallback + multi-tab + reduced-motion), `setup.html`.

### Endpoints

| Method | Route | Behaviour |
|--------|-------|-----------|
| POST | `/api/setup/start` | Spawns `reviewflow setup --json` (single active run); returns `runId`, `409` if already active |
| GET | `/api/setup/events?runId=` | SSE stream (text/event-stream) of validated stdout events; replays buffered lines; ends on subprocess exit or client disconnect |
| GET | `/api/setup/state` | Returns persisted `setup-state.json` for the polling fallback |
| GET | `/setup` | Redirects to the dashboard wizard page |

### Decisions

- Transport: **SSE isolated per run** (not the existing WebSocket bus) — each run is a per-request subprocess with a stream that dies on disconnect.
- Every subprocess stdout line is validated through `wizardStreamEventGuard` at the boundary; malformed lines are skipped.
- Status→visual mapping lives in the browser humble object (no backend presenter), matching existing dashboard panels.
- No new dependency: CSS + already-vendored `animejs` (no `lottie-web`).

### Reconciliations vs spec prose

Step ids are the real SPEC-183 string ids (not `secrets-rotation`/`configure-pipeline`/numbers); 9 observable statuses (not 4); `--json` only (no `--pipe`); `instructions/warning/resume/done` are banners, not rows; real CSS tokens (`--bg-0..4`, `--accent`, `--success`, `--warning`, `--danger`, `--font-mono`).

## Context

The CLI orchestrator from SPEC-183 brings users to first review in under 5 minutes, but the terminal experience is functional, not delightful. A new user who lands on the dashboard for the first time and clicks "Setup" should see a HUD-style boot sequence that makes the underlying CLI orchestration visible, traceable, and beautiful — without changing what the CLI does.

This spec defines the dashboard wizard view: a single page that consumes the JSON event stream from `reviewflow setup --json` and renders it as a 10-step Jarvis-style boot sequence with Lottie animations and the existing design DNA (dark warm + amber + corner brackets + glow pulse).

## Rules

- the dashboard wizard view is purely a presentation layer: it never executes setup logic itself
- the dashboard wizard spawns `reviewflow setup --json --pipe` as a subprocess and streams its stdout via SSE to the browser
- the dashboard never reads or writes config files directly: every action goes through the CLI subprocess
- the dashboard reflects exactly the 10 steps from SPEC-183, no more, no less
- user inputs collected in the dashboard (project path, preset choice, etc.) are sent back to the CLI subprocess via stdin
- the wizard view follows the existing design DNA: dark warm near-black background, amber accents, monospace primary font, corner-bracket frames, glow-pulse status dots, `// LABEL` comment prefixes
- Lottie animations are only used to enhance status transitions (loading, success, error), never to gate user interaction
- total Lottie payload across the wizard view stays under 200KB to preserve initial load time
- no Three.js, no WebGL, no 3D anywhere — 2D HUD aesthetic strictly
- the wizard view is keyboard-accessible: every action reachable via tab + enter, no mouse-only path
- the wizard view is server-rendered with progressive enhancement: an SSE-free fallback shows static state if the stream drops
- the wizard view auto-redirects to the main dashboard on successful completion (step 10) after a 3-second celebration animation
- on failure, the wizard view displays the exact CLI remediation message verbatim, never paraphrased

## Scenarios

### Entry & navigation

- fresh dashboard visit, no project: {state: dashboard has 0 projects} → empty state shows "// SETUP REQUIRED" panel with "Lancer le wizard" CTA
- click on CTA: {} → navigate to `/setup` route with boot animation
- mid-setup resume: {setup-state.json: 4 steps done} → page header reads "// REPRISE — Étape 5/10" + collapsed checklist of completed steps

### Boot sequence

- page mount: {} → play "boot-sequence.json" Lottie (1.2s) → reveal 10-step checklist with all steps in `pending` state
- subprocess spawn: {} → first SSE event "ready" → step 1 transitions to `in_progress` with glow-pulse on its status dot
- step completes: {sse: step-1-completed} → status dot transitions amber → green, step row collapses, next step expands

### Live event stream

- nominal flow: {sse stream active} → each event updates the matching step row in < 100ms
- subprocess emits awaiting_input: {sse: {step: "add-project", status: "awaiting_input", prompt: "Chemin du projet ?"}} → inline form appears under that step row with the prompt label
- user submits form: {form: path="/home/u/api"} → POST to backend → backend writes to subprocess stdin → next sse event arrives
- subprocess emits error: {sse: {step: 6, status: "blocked", message: "Aucun remote git"}} → step row turns red, expand panel shows full remediation
- subprocess crashes: {sse: stream closes unexpectedly} → banner "// CONNEXION PERDUE" + button "Relancer le wizard"

### Lottie animation choreography

- step in_progress: {} → small pulse Lottie loops next to step label (under 5KB)
- step completed: {} → checkmark-stamp Lottie plays once (under 15KB)
- step blocked: {} → error-sweep Lottie plays once (under 15KB)
- final completion: {step 10 done} → "celebration.json" Lottie (under 80KB) plays + countdown 3s → auto-redirect

### Forms inside the wizard

- project path form: {step: "add-project", awaiting_input} → input field with cwd as placeholder + browse button (filesystem picker via electron-style API if available, else manual paste)
- preset choice form: {step: "configure-pipeline", awaiting_input} → 5 card grid (basic, backend, frontend, fullstack, custom) with description tooltip + selection visual highlight
- custom preset: {preset: "custom"} → expand multi-select grid with all catalog agents (checkboxes, descriptions inline)
- confirmation prompt: {step: "secrets-rotation", awaiting_input} → modal-style overlay "// ROTATION REQUISE" + Confirm/Cancel buttons

### Design DNA compliance

- color palette: {} → backgrounds use existing `--bg-near-black` and `--bg-panel` tokens, accents use `--amber-500`, success uses `--green-400`, error uses `--red-400`
- typography: {} → all text uses `--font-mono` (JetBrains Mono or existing monospace stack); body 14px, labels 12px, hero 24px
- corner brackets: {} → every panel has 4 SVG corner brackets `[` `]` with subtle glow on focused panel
- comment prefix: {} → every section label starts with `// ` (e.g., `// DAEMON STATUS`, `// CLAUDE LOGIN`)
- status dots: {} → 8px circles with CSS animation `glow-pulse` on `in_progress`, solid color on terminal states
- no emoji: {} → status communicated via dots + colors + Lottie only

### Accessibility

- keyboard nav: {tab key} → focus moves through steps then form inputs in DOM order
- screen reader: {NVDA active} → live region announces each step status change ("step 3 of 10, completed: claude authentication")
- reduced motion: {prefers-reduced-motion: reduce} → Lottie animations replaced by instant state transitions + static checkmark SVG
- color contrast: {} → all text meets WCAG AA 4.5:1 minimum against background

### Fallback & error recovery

- SSE disconnected: {sse stream: closed} → polling fallback every 2s reads /api/setup/state JSON
- backend offline: {fetch: 500} → static error page "// BACKEND OFFLINE" + remediation "Relancez le daemon"
- subprocess hung over 60s on same step: {} → banner "// ÉTAPE EN COURS DEPUIS 60s" + button "Annuler et reprendre"

### Multi-tab / multi-user safety

- second tab opened during setup: {tab 1: in_progress, tab 2: navigate to /setup} → tab 2 shows "// SETUP DÉJÀ EN COURS dans un autre onglet" + read-only view
- setup completed in tab 1, tab 2 still open: {tab 1: completed} → tab 2 broadcasts via storage event → both redirect to dashboard

### Theming

- light mode opt-in: {user setting: theme=light} → reject for v1 "Le wizard n'est disponible qu'en mode dark, compatible avec l'identité ReviewFlow"

## Out of Scope

- the CLI execution itself (lives in SPEC-183)
- the agent fallback rendering (handled separately in SPEC-185)
- a light theme for the wizard view (v1 is dark-only; the rest of the dashboard can support both)
- 3D rendering, WebGL, Three.js
- voice interaction or audio feedback (potential future enhancement, not v1)
- localization beyond French/English (English copy default, French copy for prompts/errors)
- onboarding tutorial after setup completes (separate flow)
- the dashboard layout outside the wizard route (handled by existing dashboard specs)
- mobile responsive layout (the wizard is desktop-first; mobile triggers a "use desktop" message in v1)

## Glossary

| Term | Definition |
|------|------------|
| Wizard view | The `/setup` route in the dashboard, dedicated to displaying the boot sequence |
| Boot sequence | The visual choreography that plays as the 10 setup steps execute |
| SSE | Server-Sent Events, the one-way HTTP stream from backend to browser carrying JSON events from the CLI subprocess |
| Step row | A single panel in the wizard showing one of the 10 setup steps with its current status |
| Status dot | The 8px circle indicating step status (pending grey, in_progress amber pulse, completed green, blocked red) |
| Lottie | Vector animation format (JSON-based), rendered via the lottie-web library |
| Corner bracket | Decorative SVG frame element (4 per panel) part of the design DNA |
| Design DNA | The visual identity defined in memory `project_agentic_os_design_dna.md` |
| Awaiting input | A CLI step state where execution pauses until the user provides a value via stdin |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | WARN | Depends entirely on SPEC-183 (JSON event stream contract). Cannot be implemented before SPEC-183 ships. |
| Negotiable | OK | Lottie choice, exact step row layout, color shades, animation timings — all negotiable. |
| Valuable | OK | Turns a functional CLI into the showcase of the product. First impression matters for adoption. |
| Estimable | OK | Single dashboard route, ~10 components, SSE wiring already exists in project. ~3-4 AI-days. |
| Small | OK | 1 new route, ~12 components, 4 Lottie files. ~10-12 source files total. |
| Testable | OK | Each step row tested in isolation with mock SSE events. Snapshot tests for visual regression. |

## Definition of Done

Standard checklist from `.claude/skills/product-manager/rules/dod.md` applies. Specific to this spec:

- [ ] Route `/setup` added to dashboard router
- [ ] Backend endpoint `POST /api/setup/start` spawns `reviewflow setup --json --pipe` subprocess
- [ ] Backend endpoint `GET /api/setup/events` exposes SSE stream of subprocess stdout
- [ ] Backend endpoint `POST /api/setup/input` writes JSON body to subprocess stdin
- [ ] Backend endpoint `GET /api/setup/state` returns current state for polling fallback
- [ ] 10 step row components render correctly for all 4 states: pending / in_progress / completed / blocked
- [ ] All 4 Lottie animations (boot, pulse, check, celebration) load under 200KB total
- [ ] `prefers-reduced-motion` disables Lottie cleanly
- [ ] Screen reader live region announces every state change
- [ ] Visual regression tests for nominal flow + 3 error states
- [ ] Multi-tab safety: storage events broadcast completion
- [ ] No Three.js, no WebGL, no canvas-based rendering
- [ ] Acceptance test: spawn mock CLI emitting all 10 step events → all rows update in order
