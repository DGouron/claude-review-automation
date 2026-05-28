---
title: "SPEC-183: Setup Wizard CLI orchestrator — Jarvis end-to-end"
status: implemented
implemented_at: 2026-05-28
milestone: Setup Wizard Jarvis
supersedes:
  - "30-init-project-command"
  - "52-automated-webhook-secret-generation"
  - "55-configuration-validation-command"
  - "56-mcp-ready-skeleton-skill-templates"
  - "57-interactive-agent-configuration-wizard"
  - "58-multi-language-project-init"
related:
  - "184-setup-wizard-dashboard-jarvis"
  - "185-setup-wizard-mcp-agent-fallback"
---

# SPEC-183: Setup Wizard CLI orchestrator — Jarvis end-to-end

## Status: implemented

- Plan: [183-setup-wizard-cli-orchestrator.plan.md](../plans/183-setup-wizard-cli-orchestrator.plan.md)
- Report: [183-setup-wizard-cli-orchestrator.report.md](../reports/183-setup-wizard-cli-orchestrator.report.md)
- Branch: `worktree-spec-183-setup-wizard-cli`
- Date: 2026-05-28

## Implementation

### Module

- New bounded context `src/modules/setup-wizard/` (orchestration + state + event emitter + 12 wizard-specific gateways).

### Entry point

- CLI command: `reviewflow setup [path] [--json] [--force] [--ai] [--yes|-y] [--show-secrets]`
- Controller: `src/main/commands/setup.command.ts` (matches `init.command.ts` / `validate.command.ts` pattern).
- Wiring: `src/cli/parseCliArgs.ts` (added `setup` discriminant + 6 flags), `src/main/cli.ts` (added `case 'setup':` branch).

### Use cases

- Orchestrator: `orchestrateSetup.usecase.ts` (load state, iterate steps, detect → maybe execute, emit events, atomic save).
- 10 steps, each a separate file under `src/modules/setup-wizard/usecases/steps/`: `checkDependencies`, `claudeLogin`, `daemonInstall`, `generateSecrets`, `addProject`, `configurePipeline`, `generateFiles`, `registerProject`, `validateSetup`, `displayNextActions`. All implement a shared `SetupStep` contract `{ id, title, detect, execute }`.

### Gateways (12 net-new)

`ClaudeAuthGateway`, `DaemonServiceGateway`, `DaemonHealthProbeGateway`, `DependencyProbeGateway`, `EnvFileGateway`, `GitRemoteGateway`, `ProjectConfigGateway`, `PromptGateway`, `ServerConfigGateway`, `SkillTemplateGateway`, `ValidationGateway`, `AiFallbackGateway`, `SetupStateGateway`. Contracts in `entities/<gw>/<gw>.gateway.ts`, implementations in `interface-adapters/gateways/`. Validation gateway delegates in-process to existing `ValidateConfigUseCase`. AI fallback is a no-op until SPEC-185.

### State & resumability

- State persisted at `~/.config/reviewflow/setup-state.json` via `setupState.fileSystem.gateway.ts` (atomic tmp + rename).
- Per-step `detect()` interrogates live system; state file is a UX optimization, detection is the correctness mechanism.
- Corrupted state → orchestrator warns, runs fresh, rewrites valid JSON.

### JSON event stream

- `WizardEventEmitter` interface with `HumanWizardEventEmitter` (colored text) + `JsonWizardEventEmitter` (newline-delimited JSON). Selected once at composition root via `--json` flag.

### Reuse (no duplication)

- `generateWebhookSecret` / `isValidSecret` from `src/shared/services/secretGenerator.ts`.
- `ValidateConfigUseCase` from `src/modules/cli-configuration/` (called in-process).
- `getConfigDir` from `src/shared/services/configDir.ts`.
- `@inquirer/prompts` (already used by `init.command.ts`).

### Architectural decisions

- **D1**: Dedicated bounded context (`src/modules/setup-wizard/`), not spread across existing modules.
- **D3**: Shared `SetupStep` contract (interface, not base class) → orchestrator iterates typed array, no switch over `StepId`.
- **D5**: CLI flags parsed once via `setupCliArgs` discriminant, then carried by `WizardContext.flags`.
- **D8**: `--ai` parseable today, inert via `aiFallback.noop.gateway.ts`; SPEC-185 will swap binding with zero step code changes.

### Product decision

`reviewflow init` is left intact as legacy. `reviewflow setup` is the recommended path. Specs 30, 52, 55, 56, 57, 58 marked `superseded by SPEC-183` in `docs/feature-tracker.md`.

### Tests

- 1 acceptance test (10 scenarios) at `src/tests/acceptance/183-setup-wizard.acceptance.test.ts`.
- 35 unit tests across entities, steps, gateways, services, presenter, CLI.
- 12 stub gateways at `src/tests/stubs/setup-wizard/`.
- 4 factories at `src/tests/factories/`.
- Full suite: 337 test files / 2603 tests, all GREEN.

## Context

Today a new ReviewFlow user faces 6 disjointed steps to reach their first review: install dependencies, login to Claude, generate webhook secrets, register the project, configure agents, validate everything. Each step is documented in a different place, error-prone, and silently fails late. The 6 draft specs that tried to address this (30, 52, 55, 56, 57, 58) remained drafted for 2+ months because they were each too narrow to deliver value alone.

A single `reviewflow setup` command must replace this fragmented experience with a **stateful, resumable, idempotent** end-to-end wizard that brings any user from "fresh clone" to "first review running" in under 5 minutes, without ever requiring manual edits to config files.

## Rules

- setup wizard is idempotent: running it twice on the same machine is safe and never destructive
- setup wizard detects current state automatically and resumes from the first incomplete step
- setup never asks an API key: Claude authentication uses `claude /login` OAuth only
- setup never prompts when a sensible default exists and the value is fully derivable from context
- every step has 3 outcomes only: skipped (already done), succeeded, blocked (clear remediation message)
- every blocking outcome includes a single remediation command the user can copy-paste
- the wizard exposes a JSON event stream on stdout when `--json` is passed, for dashboard consumption
- no step writes files outside the user's home directory or the target project's `.claude/` folder
- webhook secrets are cryptographically generated, never templated as placeholders
- the `.env` file is added to `.gitignore` of the target project before secrets are written
- per-project review pipeline (skills + agents) is generated with English defaults, project language selectable
- in non-interactive mode (`-y`), every blocking step that requires user input fails with exit code 2 and a remediation hint
- the wizard never deletes or overwrites existing files without explicit confirmation
- the agent fallback (SPEC-185) is opt-in via `--ai` flag; default mode is fully scripted
- total walltime budget: scripted mode completes in under 30 seconds excluding user typing time

## Scenarios

### Detection & state

- fresh machine: {state: none} → start with step "install dependencies" + next 6 steps queued
- partial setup: {state: daemon-installed, no claude login} → resume from "claude login" + skip "install daemon"
- complete setup, new project: {state: all done, no project at ./} → start with step "add project"
- already configured project: {state: project has .claude/reviews/config.json} → reject "Projet déjà configuré, utilisez --force pour réinitialiser"

### Step 1 — Dependencies check

- all deps present: {node>=20, yarn, claude, git} → step "dependencies" skipped
- node too old: {node: "18.0.0"} → reject "Node.js 20 minimum requis, version détectée 18.0.0"
- claude missing: {claude: not installed} → blocked + remediation "Installez Claude CLI: https://docs.anthropic.com/en/docs/claude-code/overview"
- gh & glab missing: {gh: no, glab: no} → warn "Aucun CLI plateforme installé, vous devrez en installer au moins un selon votre repo"

### Step 2 — Claude authentication

- already logged in: {claude /login: ok, oauth token valid} → step "claude login" skipped
- not logged in: {claude /login: no token} → prompt "Lancement de claude /login dans 3s..." + spawn `claude /login` interactively
- login failed: {claude /login: exit 1} → reject "L'authentification Claude a échoué, relancez le wizard une fois connecté"
- non-interactive mode without login: {-y flag, not logged in} → reject "Mode non-interactif: connectez-vous d'abord avec 'claude /login'"

### Step 3 — Daemon installation

- daemon running: {systemctl status reviewflow-app: active} → step "daemon install" skipped
- daemon not installed, linux+systemd: {os: linux, systemd: yes} → prompt "Installer le daemon systemd reviewflow-app ?" + offer install
- daemon not installed, no systemd: {os: linux, systemd: no} → warn "Pas de systemd détecté, le daemon devra être lancé manuellement avec 'yarn start'"
- daemon not installed, non-linux: {os: darwin} → suggest "Lancez 'yarn start' dans un terminal séparé, le wizard continuera dès qu'il détecte le port ouvert"
- daemon install confirmed: {confirm: yes} → run install script + wait until port responds (timeout 30s)

### Step 4 — Webhook secrets

- secrets present and valid: {.env: GITLAB_WEBHOOK_TOKEN=64hex + GITHUB_WEBHOOK_SECRET=64hex} → step "secrets" skipped
- secrets missing: {.env: empty or absent} → generate both, write to .env, ensure .gitignore protects it
- secrets are placeholders: {.env: GITLAB_WEBHOOK_TOKEN="your_token_here"} → warn + offer regeneration
- regeneration confirmed: {confirm: yes} → rotate secrets + display warning "N'oubliez pas de mettre à jour les webhooks GitLab/GitHub avec les nouveaux secrets"

### Step 5 — Add project

- path provided, valid git repo with remote: {path: "/home/u/api", git: ok, remote: ok} → continue
- path not provided: {} → prompt "Chemin du projet à ajouter (cwd par défaut) ?"
- path not a git repo: {path: "/tmp/dir"} → reject "Le dossier n'est pas un dépôt git"
- path has no remote: {path: "/home/u/local-only"} → reject "Aucun remote git configuré, ajoutez 'origin' avant de continuer"
- platform auto-detected github: {remote: "git@github.com:org/repo.git"} → suggest platform=github + confirm
- platform auto-detected gitlab: {remote: "git@gitlab.com:org/repo.git"} → suggest platform=gitlab + confirm
- platform ambiguous: {remote: "git@custom.com:repo.git"} → prompt "Plateforme inconnue, choisissez github ou gitlab"

### Step 6 — Configure review pipeline

- preset chosen: {preset: "backend"} → select agents: architecture, solid, testing, code-quality, security, ddd, clean-architecture
- preset frontend: {preset: "frontend"} → select agents: architecture, testing, code-quality, react-best-practices
- preset fullstack: {preset: "fullstack"} → select agents: architecture, solid, testing, code-quality, security, react-best-practices
- preset basic: {preset: "basic"} → no agents, single-pass review only
- preset custom: {preset: "custom"} → multi-select prompt with all catalog agents
- zero agents in custom: {selected: []} → reject "Sélectionnez au moins un agent ou choisissez le preset 'basic'"
- language choice: {lang: "fr"} → generate SKILL.md with French section headers
- language default: {} → use English

### Step 7 — Generate files

- generation nominal: {project: ok, preset: backend, lang: en} → write 4 files: .claude/reviews/config.json + .claude/skills/review-code/SKILL.md + .claude/skills/review-followup/SKILL.md + .mcp.json
- existing files without --force: {project has .claude/reviews/config.json} → reject "Configuration projet existante, utilisez --force pour écraser"
- existing files with --force: {flag: --force} → backup existing to .claude/reviews/config.json.bak + write fresh files
- generation failed (permission denied): {fs: EACCES} → reject "Impossible d'écrire dans le dossier projet, vérifiez les permissions"

### Step 8 — Register project on daemon

- project registered: {server config: has matching localPath} → step "register" skipped + info "Déjà enregistré côté serveur"
- project added: {server config: no match} → append to ~/.claude-review/config.json repositories array
- daemon unreachable: {http://localhost:port: timeout} → warn "Daemon injoignable, le projet sera enregistré au prochain lancement"

### Step 9 — Validate everything

- all green: {schema: ok, env: ok, paths: ok, remotes: ok, project config: ok, deps: ok} → "Setup terminé. Première review prête."
- minor warnings: {warnings: ["glab not installed"], errors: []} → "Setup terminé avec 1 warning, voir 'reviewflow validate' pour le détail"
- errors remain: {errors: [...]} → reject "Le setup a des erreurs bloquantes" + run `reviewflow validate` automatically to detail

### Step 10 — Display next actions

- nominal end: {all steps: ok} → output "Configurez le webhook sur `<platform>`: URL=http://YOUR_HOST:PORT/webhooks/`<platform>`, Secret=`<masked>`, Events=`<event-type>`"
- with --show-secrets: {flag: --show-secrets} → show full secret value in output

### JSON event stream mode

- json mode active: {flag: --json} → emit one JSON line per state transition: {step: "claude-login", status: "in_progress", message: "..."}
- json line on user prompt: {step needs input} → {step: "add-project", status: "awaiting_input", prompt: "Chemin du projet ?"}
- json line on completion: {final} → {step: "done", status: "completed", summary: {...}}

### AI fallback mode (--ai flag)

- ai flag set, ambiguous user input: {flag: --ai, input: "j'ai un monorepo turborepo avec 3 apps"} → invoke agent (SPEC-185) to interpret and guide
- ai flag not set, ambiguous input: {flag: none, input: "j'ai un monorepo"} → reject "Le mode scripté ne gère pas les monorepos, relancez avec --ai ou ajoutez chaque app séparément"

### Resumability

- wizard interrupted mid-flow: {state: 5 steps done, user CTRL+C} → next launch resumes from step 6 with banner "Reprise du setup à l'étape 6/10"
- state file corrupted: {state file: invalid json} → warn + offer to reset state

## Out of Scope

- creating webhook automatically on GitLab/GitHub via API (requires OAuth flow per platform)
- managing multiple Claude accounts on the same machine (one login per user assumed)
- migrating existing manual setups (users with hand-crafted SKILL.md keep them; the wizard only generates fresh ones)
- updating existing projects (this is `reviewflow setup` for first-time setup; updates handled by `reviewflow update-project` in a future spec)
- network reachability tests (ping GitLab API, etc) — too slow for a local wizard, covered by `reviewflow validate` separately if needed
- Windows support in v1 (linux + darwin only; Windows tracked separately)
- generating custom agent SKILL.md sections (custom agent names are added to config.json, user fills SKILL.md sections manually)
- the actual dashboard visual layer (see SPEC-184)
- the actual agent Claude implementation (see SPEC-185)

## Glossary

| Term | Definition |
|------|------------|
| Setup state | Persisted JSON tracking which of the 10 steps have completed, stored at `~/.claude-review/setup-state.json` |
| Step | One of 10 atomic stages of the wizard, each with a unique id and clear success/skip/block outcome |
| Agent preset | A named bundle of review agents (backend, frontend, fullstack, basic, custom) pre-configured for a tech stack |
| Daemon | The local long-running ReviewFlow server process (typically systemd unit `reviewflow-app` on linux) |
| Project | A git repository registered with ReviewFlow, identified by its `localPath` |
| Per-project config | The `.claude/reviews/config.json` file inside a project, defining its review pipeline |
| Server config | The global `~/.claude-review/config.json` file listing all registered projects |
| Webhook secret | A 64-character hex string used to authenticate incoming webhook events from GitLab/GitHub |
| JSON event stream | Newline-delimited JSON lines on stdout, one per state transition, consumed by the dashboard wizard view |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Depends on existing CLI patterns and known infra (systemd, claude CLI, gh/glab). No upstream spec blocked. |
| Negotiable | OK | Step order, preset definitions, JSON event shape, prompt wording — all negotiable without changing the value. |
| Valuable | OK | Time-to-first-review < 5 min, zero manual file editing, onboarding without doc — all 3 metrics measurable. |
| Estimable | WARN | Wide surface (10 steps × 3 outcomes = ~30 paths). Estimable at ~5-7 AI-days. Consider iterating: ship steps 1-5 first, then 6-10. |
| Small | WARN | At ~15-20 files (use cases per step + state manager + JSON emitter + CLI command). Borderline. Split if needed during planning. |
| Testable | OK | All scenarios in DSL format are concrete test cases. State manager is pure. Each step has injectable I/O dependencies. |

## Definition of Done

Standard checklist from `.claude/skills/product-manager/rules/dod.md` applies. Specific to this spec:

- [ ] State manager persists at `~/.claude-review/setup-state.json` with schema validation
- [ ] All 10 steps are individual use cases, composable, injectable I/O
- [ ] Idempotence verified by acceptance test: full run + second full run = no errors, no duplicates
- [ ] JSON event stream emits one line per transition, schema documented and stable
- [ ] `--force` flag works on every destructive step
- [ ] `--ai` flag is parsed but its activation can no-op if SPEC-185 not yet implemented (graceful)
- [ ] `--json` flag emits machine-readable output, no human-only colors
- [ ] `--show-secrets` flag controls secret masking in output only
- [ ] Acceptance test: fresh VM → `reviewflow setup /path/to/repo --json` → all 10 steps succeed in < 30s wall time excluding user input
- [ ] Acceptance test: interrupted setup resumes at correct step on second run
- [ ] No `as Type` assertions, no `any`, no relative imports
