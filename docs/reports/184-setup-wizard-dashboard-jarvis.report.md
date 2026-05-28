# Implementation Report — SPEC-184 Setup Wizard Dashboard (Jarvis HUD)

- **Spec**: [184-setup-wizard-dashboard-jarvis](../specs/184-setup-wizard-dashboard-jarvis.md)
- **Plan**: [184-setup-wizard-dashboard-jarvis.plan](../plans/184-setup-wizard-dashboard-jarvis.plan.md)
- **Date**: 2026-05-28
- **Status**: Iteration A complete — Iteration B deferred

## Scope delivered (Iteration A — read-only live view)

The dashboard `/setup` route consumes the SPEC-183 JSON event stream (`reviewflow setup --json`)
through a per-run SSE channel and renders the 10-step boot sequence with the existing design DNA.
The interactive forms / stdin duplex (Iteration B) are intentionally out of scope (see Deferred).

## Files created (production)

| File | Layer | Responsibility |
|------|-------|----------------|
| `src/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.schema.ts` | Entity | Zod schemas for the 7 observable event shapes (boundary contract) |
| `src/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.guard.ts` | Entity | Guard validating each stdout line at the boundary |
| `src/modules/setup-wizard/entities/setupProcess/setupProcess.gateway.ts` | Entity | Gateway contract for spawning the setup subprocess |
| `src/modules/setup-wizard/usecases/streamSetupRun.usecase.ts` | Use case | `SetupRunRegistry`: single-active-run lifecycle, line buffering, late-subscriber replay |
| `src/modules/setup-wizard/interface-adapters/gateways/setupProcess.childProcess.gateway.ts` | Gateway impl | Spawns `reviewflow setup --json`, splits stdout into lines, surfaces exit code |
| `src/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.ts` | Controller (HTTP+SSE) | `POST /api/setup/start`, `GET /api/setup/events` (SSE), `GET /api/setup/state` |
| `src/dashboard/modules/setupWizard.js` | View (humble object) | Folds events into 10 rows + banner model, 9-status→visual mapping, ARIA announcements |
| `src/dashboard/modules/setupWizardStream.js` | View (humble object) | EventSource subscription, polling fallback, multi-tab read-only awareness, reduced-motion |
| `src/dashboard/setup.html` | View | `/setup` page shell with design DNA (corner brackets, `// LABEL`, no emoji) |

## Files created (tests & doubles)

| File | Tests |
|------|-------|
| `src/tests/acceptance/184-setup-wizard-dashboard-jarvis.acceptance.test.ts` | 5 — mock CLI emits all 10 step events → rows update in order |
| `src/tests/units/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.guard.test.ts` | 10 |
| `src/tests/units/modules/setup-wizard/usecases/streamSetupRun.usecase.test.ts` | 7 |
| `src/tests/units/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.test.ts` | 5 |
| `src/tests/units/dashboard/modules/setupWizard.test.ts` | 14 |
| `src/tests/units/dashboard/modules/setupWizardStream.test.ts` | 14 |
| `src/tests/factories/wizardStreamEvent.factory.ts` | factory |
| `src/tests/stubs/setupProcess.stub.ts` | stub gateway |

## Files modified

| File | Change |
|------|--------|
| `src/main/routes.ts` | Composition root: wire `setupWizardRoutes` (registry + state gateway), `/setup` redirect |
| `src/dashboard/index.html` | Empty-state `// SETUP REQUIRED` CTA → `/setup` |
| `src/dashboard/styles.css` | Wizard DNA styles, reusing existing tokens (`--bg-0..4`, `--accent`, `--success`, `--warning`, `--danger`, `--font-mono`) |

## Tests

- New SPEC-184 tests: **55 passed** (5 acceptance + 50 unit).
- Full suite (`yarn verify` = typecheck + lint + test:ci): **356 files / 2789 tests passed**, lint clean, typecheck clean.
- Acceptance test: **GREEN**.

## Spec → reality reconciliations (spec prose was partially stale vs merged SPEC-183)

| # | Spec prose | Reality (implemented against) |
|---|-----------|-------------------------------|
| R1 | step ids `secrets-rotation`, `configure-pipeline`, numeric `{step:6}` | string ids `dependencies, claude-login, daemon, secrets, add-project, pipeline, generate-files, register-project, validate, next-actions` |
| R2 | 4-state model (pending/in_progress/completed/blocked) | 9 observable statuses; `pending` is UI-only |
| R3 | spawn `setup --json --pipe` | no `--pipe` flag; spawn `--json` only |
| R4 | "exactly 10 steps" | `instructions/warning/resume/done` are banner/summary events, not rows |
| R5 | (assumed SSE) | project standardizes on WebSocket; SSE kept per spec, isolated per run (user-approved) |
| R6 | tokens `--bg-near-black`, `--amber-500`… | real tokens `--bg-0..4`, `--accent`, `--success`, `--warning`, `--danger`, `--font-mono` |
| R8 | polling fallback = full state | `setup-state.json` persists only terminal outcomes → fallback is a degraded snapshot |

## Architectural decisions

- **SSE per run** via `reply.hijack()` + `reply.raw` (text/event-stream) + browser `EventSource`. Each wizard run is a per-request subprocess with an isolated stream that ends on client disconnect (`request.raw.on('close')`). Deliberately not multiplexed over the existing WebSocket bus (user-approved trade-off).
- **Boundary validation**: every subprocess stdout line is parsed through `wizardStreamEventGuard`; malformed lines are skipped, never forwarded.
- **Late-subscriber replay**: `POST /start` and `GET /events` are two requests; the registry buffers emitted lines and replays them on subscribe so no early event is lost in the race.
- **Status→visual mapping lives in the browser humble object**, matching every existing dashboard panel — no backend presenter introduced.
- **No new dependency**: animations use CSS + the already-vendored `animejs`; `lottie-web` was NOT added (deferred to Iteration B).

## Deferred to Iteration B (documented, not implemented)

- `POST /api/setup/input` and the interactive forms (project path, preset choice, custom preset, confirmation).
- **Blocking prerequisite in SPEC-183**: in `--json` mode the CLI still builds `PromptTtyGateway` (inquirer/TTY) and the orchestrator never reads a JSON answer from stdin. A piped subprocess therefore cannot collect input the way SPEC-184 assumes. Iteration B requires a new `PromptStdinJsonGateway` selected when `--json` — a SPEC-183 change, out of scope for SPEC-184.
- Real Lottie animations (`lottie-web`) and visual-regression tooling.

## Process note

The implementer agent's worktree initially had no installed dependencies, so its in-loop test runs never executed (paper TDD). Dependencies were linked to the repo root `node_modules` and the full suite was run for real, confirming green, before this report.
