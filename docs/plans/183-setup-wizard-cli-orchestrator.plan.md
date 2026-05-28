# PLAN: SPEC-183 — Setup Wizard CLI orchestrator (Jarvis end-to-end)

> Status: draft — produced by feature-planner
> Spec: `docs/specs/183-setup-wizard-cli-orchestrator.md`
> Acceptance test: `src/tests/acceptance/183-setup-wizard.acceptance.test.ts`

## Scope

- feature: `reviewflow setup` CLI command — stateful, resumable, idempotent walkthrough of 10 steps from fresh machine to first review running
- is_new_module: true (new bounded context `src/modules/setup-wizard/`)
- size: ~30-35 production files + tests (revised down from initial 45 thanks to **massive reuse from existing `src/modules/cli-configuration/`** — see Reuse Inventory below)

## Reuse Inventory (CRITICAL — do not duplicate)

Before any code is written, the implementer MUST reuse the following existing assets. Failure to reuse is overengineering by duplication.

| Existing asset | Path | Used by which step |
|---------------|------|--------------------|
| `checkInitPrerequisites` use case | `src/modules/cli-configuration/usecases/cli/checkInitPrerequisites.ts` | Step 1 (dependencies). Already does node-version + claude. **Extend** to also probe yarn/git/gh/glab (add to its result variants). |
| `checkDependency` service | `src/shared/services/dependencyChecker.ts` | Step 1 — reused as-is |
| `generateWebhookSecret`, `isValidSecret`, `truncateSecret` | `src/shared/services/secretGenerator.ts` | Step 4 — reused as-is (already does 64-hex crypto random + validation) |
| `writeInitConfig` use case | `src/modules/cli-configuration/usecases/cli/writeInitConfig.usecase.ts` | Step 4 + Step 8 — writes `~/.claude-review/config.json` and `.env`. Reused; extend with project-level write if not present. |
| `configureMcp` use case | `src/modules/cli-configuration/usecases/cli/configureMcp.usecase.ts` | Step 7 — `.mcp.json` generation. Reused. |
| `discoverRepositories` use case | `src/modules/cli-configuration/usecases/cli/discoverRepositories.usecase.ts` | Step 5 — finding/validating git repos. Reused for path detection. |
| `addRepositoriesToConfig` use case | `src/modules/cli-configuration/usecases/cli/addRepositoriesToConfig.usecase.ts` | Step 8 — appending to server config. Reused. |
| `validateConfig` use case | `src/modules/cli-configuration/usecases/cli/validateConfig.usecase.ts` | Step 9 — full validation. **This is the answer to Risk 6: validate IS already a use case**, callable in-process. No spawn needed. |
| `projectConfig.fileSystem.gateway.ts` | `src/modules/cli-configuration/interface-adapters/gateways/projectConfig.fileSystem.gateway.ts` | Step 7 — already writes `.claude/reviews/config.json` |
| `mcpSettings` entity (schema + guard) | `src/modules/cli-configuration/entities/mcpSettings/` | Step 7 — reused for `.mcp.json` |
| `repositoryEntry` entity | `src/modules/cli-configuration/entities/repositoryEntry/repositoryEntry.ts` | Step 8 — reused for repo entries |
| `configDir`, `daemonPaths`, `ansiColors`, `processChecker`, `pidFileManager` | `src/shared/services/` | All steps — config paths, colored output, process detection |
| `daemonSpawner` | `src/shared/services/daemonSpawner.ts` | Step 3 — daemon process spawn (verify if used by `start.command.ts`) |
| Existing CLI command structure | `src/main/commands/<name>.command.ts` + `src/cli/parseCliArgs.ts` | New `setup.command.ts` added here. **Not** under `interface-adapters/controllers/cli/` (project convention is `src/main/commands/`). |
| `presenter.base.ts`, `guard.base.ts`, `usecase.base.ts`, `executionGateway.base.ts` | `src/shared/foundation/` | Foundation — all new components |

**Consequence**: the new module focuses on **orchestration + state + JSON emitter + 3 net-new gateways** (claude auth, daemon service, skill template). Steps become thin orchestrators around existing use cases.

## Decision Log (architectural stances)

### D1. Module boundary — new bounded context `src/modules/setup-wizard/`

A dedicated module under `src/modules/setup-wizard/` is justified because:

- The wizard has its own ubiquitous language (Step, SetupState, StepOutcome, Preset, RemediationHint) that does not belong in any existing module.
- It orchestrates I/O from many subsystems (systemd, claude CLI, filesystem, http probe, git remote, queue daemon) but never owns them — it only consumes their gateways. Gateways are co-located with the wizard because all of them are wizard-specific (e.g. `daemonHealthProbe`, `claudeAuthProbe`).
- Existing modules (`worktree-management`, `queue`) prove the pattern: a self-contained module that exposes a few use cases and wires its own gateways.
- 10 steps + state + JSON emitter + CLI controller = a cohesive feature with one entrypoint. Spreading across multiple existing modules would dilute responsibility.

Out of the new module:
- Reused `src/shared/foundation/usecase/`, `src/shared/foundation/guard/`, `src/shared/foundation/executionGateway.base.ts` (no copy).
- Reused git remote inspection if available in `src/modules/worktree-management/` (TBD: verify, otherwise add a thin gateway here).
- CLI binary entry in `src/interface-adapters/controllers/cli/` (project convention) but delegates immediately to `src/modules/setup-wizard/interface-adapters/controllers/cli/setupWizard.cli.ts`.

### D2. State manager — entity + schema + gateway

- Entity: `SetupState` — pure data + small helpers (`nextStep()`, `markStep(stepId, outcome)`, `isComplete()`).
- Schema: Zod schema enforcing the shape `{ version, startedAt, updatedAt, steps: Record<StepId, StepOutcomeRecord>, project?: ProjectContext }`.
- Guard: `setupState.guard.ts` via `createGuard(setupStateSchema, 'SetupState')` — used at load (file → memory) and save (memory → file).
- Gateway contract: `setupStateGateway.ts` — `load(): SetupState | null`, `save(state): void`, `reset(): void`, `corrupt(): boolean` for state-corruption detection.
- Implementation: `setupState.fileSystem.gateway.ts` writes to `~/.claude-review/setup-state.json` atomically (tmp + rename).
- Each step has one of 3 outcomes: `{ status: 'skipped' | 'succeeded' | 'blocked', message?: string, remediation?: string, evidence?: Record<string, unknown> }`.
- Resumability: `findFirstIncomplete(state, steps)` returns the first step whose recorded outcome is not `skipped` or `succeeded`. This is a pure function in the entity.

### D3. Step abstraction — common `SetupStep` contract (use case interface)

All 10 steps implement the same contract:

```
interface SetupStep {
  readonly id: StepId;
  readonly title: string;
  detect(context: WizardContext): Promise<StepOutcome | null>; // null = needs execution
  execute(context: WizardContext): Promise<StepOutcome>;
}
```

Justification:
- All steps share the outcome shape (`skipped | succeeded | blocked`) and the resumability invariant (detect-then-execute).
- The orchestrator iterates a typed array of steps, no `switch` over StepId.
- Each step is still its own use case file — the interface is just a typed contract, not a base class.
- I/O differs per step but is injected via the `WizardContext` (gateways + flags + logger + emitter). No god-object: context is built once by the orchestrator from the composition root.

Anti-overengineering check: a shared interface is justified because the orchestrator needs polymorphism over `detect/execute`. Without it, we would write a 10-arm `switch` in the orchestrator.

### D4. JSON event stream — `WizardEventEmitter` service (not a presenter)

- Lives at `src/modules/setup-wizard/services/wizardEventEmitter.ts`.
- Two implementations behind one interface: `HumanWizardEventEmitter` (colored text via Pino/console) and `JsonWizardEventEmitter` (newline-delimited JSON on stdout).
- Selected once at composition root based on `--json` flag.
- Steps receive `emitter: WizardEventEmitter` via `WizardContext`. They call `emitter.emitStepStarted(stepId)`, `emitter.emitStepCompleted(stepId, outcome)`, `emitter.emitAwaitingInput(stepId, prompt)`.
- Not a presenter because: no domain-to-viewmodel transformation. It's a side-effect sink with two implementations. Presenters are pure functions returning ViewModels; an emitter is a write port to stdout. Closer to a `Logger`.

### D5. CLI flags parsing

- A single guard `setupCliArgs.guard.ts` parses `argv` into `SetupCliArgs { path?, json, force, ai, yes, showSecrets }` via Zod.
- Flag definitions:
  - `--json` — switches emitter implementation
  - `--force` — passed to `WizardContext.flags.force`, only "Generate files" step honors it
  - `--ai` — passed to `WizardContext.flags.ai`; until SPEC-185, the `AiFallback` gateway returns `{ available: false }` and the wizard falls back to scripted-mode rejection (graceful degradation, see D8)
  - `-y` / `--yes` — passed to `WizardContext.flags.yes`; prompts auto-fail with exit 2 and remediation hint
  - `--show-secrets` — passed to the final step presenter to control masking
- Parsing happens in the CLI controller, before any use case is instantiated.

### D6. External I/O gateways needed

All gateway contracts under `src/modules/setup-wizard/entities/*.gateway.ts`; implementations under `src/modules/setup-wizard/interface-adapters/gateways/`. Stubs under `src/tests/stubs/setup-wizard/`.

| Gateway | Methods | Implementation | Why |
|---------|---------|---------------|-----|
| `DependencyProbeGateway` | `probeNode()`, `probeYarn()`, `probeClaude()`, `probeGit()`, `probeGh()`, `probeGlab()` | `dependencyProbe.cli.gateway.ts` (via `executionGateway.base.ts`) | Step 1 — check binaries + versions |
| `ClaudeAuthGateway` | `isLoggedIn()`, `triggerLogin()` | `claudeAuth.cli.gateway.ts` | Step 2 — `claude /login` spawn + token detection |
| `DaemonServiceGateway` | `status()`, `install()`, `waitUntilHealthy(timeoutMs)` | `daemonService.systemd.gateway.ts` (linux/systemd) + `daemonService.process.gateway.ts` (darwin/manual) | Step 3 — systemctl + http probe combined |
| `DaemonHealthProbeGateway` | `ping(port, timeoutMs)` | `daemonHealthProbe.http.gateway.ts` | Step 3 + Step 8 — HTTP probe for port readiness |
| `SecretGeneratorGateway` | `generate(byteLength)` | `secretGenerator.crypto.gateway.ts` (`crypto.randomBytes`) | Step 4 — 64-hex tokens |
| `EnvFileGateway` | `read(path)`, `write(path, kv)`, `ensureGitignored(repoPath, '.env')` | `envFile.fileSystem.gateway.ts` | Step 4 — `.env` IO + `.gitignore` update |
| `GitRemoteGateway` | `isRepo(path)`, `getOriginRemote(path)`, `detectPlatform(remoteUrl)` | `gitRemote.cli.gateway.ts` | Step 5 — git inspection (reuse from worktree-management if shape matches; otherwise add here) |
| `ProjectConfigGateway` | `exists(projectPath)`, `read(projectPath)`, `write(projectPath, config)`, `backup(projectPath)` | `projectConfig.fileSystem.gateway.ts` | Step 7 — `.claude/reviews/config.json` |
| `SkillTemplateGateway` | `writeSkill(projectPath, skillName, language)`, `writeMcpJson(projectPath)` | `skillTemplate.fileSystem.gateway.ts` | Step 7 — SKILL.md files + .mcp.json |
| `ServerConfigGateway` | `read()`, `addProject(projectEntry)`, `hasProject(localPath)` | `serverConfig.fileSystem.gateway.ts` | Step 8 — `~/.claude-review/config.json` |
| `ValidationGateway` | `validate(projectPath)` | `validation.adapter.gateway.ts` (delegates to existing `reviewflow validate`) | Step 9 — reuse existing validate command |
| `AiFallbackGateway` | `isAvailable()`, `interpret(input, context)` | `aiFallback.noop.gateway.ts` (until SPEC-185) | Step 5/6 — graceful degradation |
| `PromptGateway` | `askText(prompt, default?)`, `askConfirm(prompt)`, `askChoice(prompt, choices)`, `askMultiSelect(prompt, choices)` | `prompt.tty.gateway.ts` (via `prompts` or `inquirer`-like wrapper) | Used by any step that prompts — abstracts TTY |

### D7. Idempotence + resumability design

Two-layer defence:

1. **State file**: on launch, load `~/.claude-review/setup-state.json`. If present and valid, the orchestrator iterates steps but skips those marked `succeeded` (still re-runs `detect()` for safety: detection is cheap and confirms environment hasn't changed). If a previously-`succeeded` step now detects regression, the orchestrator surfaces a warning event and re-executes.
2. **Per-step `detect()`**: every step's `detect()` interrogates the live system (not the state file). If the desired postcondition already holds, returns `{ status: 'skipped', evidence }`. This is the actual idempotence guarantee. The state file is a performance + UX optimization, not a correctness mechanism.

A second `reviewflow setup` run on a fully-done machine results in all 10 `detect()` calls returning `skipped` and emits one summary line.

Corrupt state file: `setupStateGateway.load()` returns `null` (and logs warning). The orchestrator then proceeds fresh, scenario "state file corrupted" is handled in the controller (prompt to reset or auto-reset under `-y`).

### D8. `--ai` graceful degradation (SPEC-185 deferred)

- `AiFallbackGateway` contract defined in this module.
- Default implementation `aiFallback.noop.gateway.ts` always returns `{ available: false, reason: 'SPEC-185 not implemented' }`.
- Steps that have an "ambiguous input" branch (Step 5 `add project`, Step 6 `configure pipeline`) inspect `flags.ai`. If true, they call `aiFallback.isAvailable()`. If false (noop case), they emit a warning event "`--ai` requested but agent fallback not yet available" and fall through to the scripted-rejection path.
- This keeps `--ai` parseable and inert today; tomorrow SPEC-185 swaps `aiFallback.noop.gateway.ts` for `aiFallback.claude.gateway.ts` in the composition root. Zero step code changes.

---

## ENTITIES

- name: SetupState
  file: src/modules/setup-wizard/entities/setupState/setupState.ts
  schema: src/modules/setup-wizard/entities/setupState/setupState.schema.ts
  guard: src/modules/setup-wizard/entities/setupState/setupState.guard.ts
  gateway_contract: src/modules/setup-wizard/entities/setupState/setupState.gateway.ts
  test: src/tests/units/modules/setup-wizard/entities/setupState/setupState.test.ts
  factory: src/tests/factories/setupState.factory.ts
  purpose: Persisted record of which steps have completed + project context. Pure helpers (nextStep, markStep, findFirstIncomplete, isComplete).

- name: StepOutcome
  file: src/modules/setup-wizard/entities/stepOutcome/stepOutcome.ts
  schema: src/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.ts
  guard: src/modules/setup-wizard/entities/stepOutcome/stepOutcome.guard.ts
  test: src/tests/units/modules/setup-wizard/entities/stepOutcome/stepOutcome.test.ts
  factory: src/tests/factories/stepOutcome.factory.ts
  purpose: Discriminated union `{ status: 'skipped' | 'succeeded' | 'blocked', message?, remediation?, evidence? }`. Constructors: `skipped()`, `succeeded()`, `blocked(message, remediation)`.

- name: StepId (value object, branded string)
  file: src/modules/setup-wizard/entities/stepId/stepId.ts
  schema: src/modules/setup-wizard/entities/stepId/stepId.schema.ts
  test: src/tests/units/modules/setup-wizard/entities/stepId/stepId.test.ts
  purpose: Branded literal union `'dependencies' | 'claude-login' | 'daemon' | 'secrets' | 'add-project' | 'pipeline' | 'generate-files' | 'register-project' | 'validate' | 'next-actions'`. Used as state keys.

- name: AgentPreset
  file: src/modules/setup-wizard/entities/agentPreset/agentPreset.ts
  schema: src/modules/setup-wizard/entities/agentPreset/agentPreset.schema.ts
  guard: src/modules/setup-wizard/entities/agentPreset/agentPreset.guard.ts
  test: src/tests/units/modules/setup-wizard/entities/agentPreset/agentPreset.test.ts
  factory: src/tests/factories/agentPreset.factory.ts
  purpose: Named preset (backend/frontend/fullstack/basic/custom) → agent list. Maps preset id to agents catalog.

- name: ProjectContext
  file: src/modules/setup-wizard/entities/projectContext/projectContext.ts
  schema: src/modules/setup-wizard/entities/projectContext/projectContext.schema.ts
  guard: src/modules/setup-wizard/entities/projectContext/projectContext.guard.ts
  test: src/tests/units/modules/setup-wizard/entities/projectContext/projectContext.test.ts
  factory: src/tests/factories/projectContext.factory.ts
  purpose: Carries cross-step project info: `localPath`, `platform`, `preset`, `language`, `remoteUrl`. Built progressively across steps.

- name: WizardContext (type, not entity — composition object)
  file: src/modules/setup-wizard/entities/wizardContext/wizardContext.ts
  test: covered via step tests
  purpose: Bundles `{ state, project, flags, gateways, emitter, prompt, logger }`. Built once by the orchestrator. Steps receive it readonly.

- name: SetupStep (interface)
  file: src/modules/setup-wizard/entities/setupStep/setupStep.ts
  test: type-checked by step implementations
  purpose: `{ id, title, detect(ctx), execute(ctx) }` contract for all 10 steps.

## USECASES (one per step + orchestrator)

- name: orchestrateSetup
  file: src/modules/setup-wizard/usecases/orchestrateSetup.usecase.ts
  test: src/tests/units/modules/setup-wizard/usecases/orchestrateSetup.usecase.test.ts
  type: command
  input: WizardContext + ordered SetupStep[]
  output: `{ finalState: SetupState, exitCode: 0 | 1 | 2 }`
  notes: Loads state, iterates steps, runs detect → maybe execute, records outcomes, emits events, handles ctrl+c via state save on each transition. Honors `-y` and `--json`.

- name: checkDependenciesStep (Step 1)
  file: src/modules/setup-wizard/usecases/steps/checkDependencies.step.ts
  test: src/tests/units/modules/setup-wizard/usecases/steps/checkDependencies.step.test.ts
  type: SetupStep
  deps: DependencyProbeGateway
  outcomes: skipped (all present + versions OK), blocked (node too old / claude missing), warning emitted for gh+glab missing.

- name: claudeLoginStep (Step 2)
  file: src/modules/setup-wizard/usecases/steps/claudeLogin.step.ts
  test: src/tests/units/modules/setup-wizard/usecases/steps/claudeLogin.step.test.ts
  type: SetupStep
  deps: ClaudeAuthGateway, PromptGateway, flags.yes
  outcomes: skipped (already authed), succeeded (login triggered & ok), blocked (login failed, or `-y` + not authed).

- name: daemonInstallStep (Step 3)
  file: src/modules/setup-wizard/usecases/steps/daemonInstall.step.ts
  test: src/tests/units/modules/setup-wizard/usecases/steps/daemonInstall.step.test.ts
  type: SetupStep
  deps: DaemonServiceGateway, DaemonHealthProbeGateway, PromptGateway, platform detection
  outcomes: skipped (active), succeeded (installed + healthy), blocked (install failed / timeout), warning (no systemd / darwin → manual).

- name: generateSecretsStep (Step 4)
  file: src/modules/setup-wizard/usecases/steps/generateSecrets.step.ts
  test: src/tests/units/modules/setup-wizard/usecases/steps/generateSecrets.step.test.ts
  type: SetupStep
  deps: EnvFileGateway, SecretGeneratorGateway, PromptGateway
  outcomes: skipped (both valid 64-hex), succeeded (generated + .gitignore updated), warning (placeholders → offer rotation).

- name: addProjectStep (Step 5)
  file: src/modules/setup-wizard/usecases/steps/addProject.step.ts
  test: src/tests/units/modules/setup-wizard/usecases/steps/addProject.step.test.ts
  type: SetupStep
  deps: GitRemoteGateway, PromptGateway, AiFallbackGateway, flags
  outcomes: succeeded (git repo + remote + platform determined), blocked (no repo / no remote), prompts (path / platform when ambiguous).

- name: configurePipelineStep (Step 6)
  file: src/modules/setup-wizard/usecases/steps/configurePipeline.step.ts
  test: src/tests/units/modules/setup-wizard/usecases/steps/configurePipeline.step.test.ts
  type: SetupStep
  deps: PromptGateway, AgentPreset catalog
  outcomes: succeeded (preset + language chosen, agents resolved), blocked (custom preset with empty selection).

- name: generateFilesStep (Step 7)
  file: src/modules/setup-wizard/usecases/steps/generateFiles.step.ts
  test: src/tests/units/modules/setup-wizard/usecases/steps/generateFiles.step.test.ts
  type: SetupStep
  deps: ProjectConfigGateway, SkillTemplateGateway, flags.force
  outcomes: succeeded (4 files written), blocked (existing files w/o --force, permission denied), warning (overwrote with backup under --force).

- name: registerProjectStep (Step 8)
  file: src/modules/setup-wizard/usecases/steps/registerProject.step.ts
  test: src/tests/units/modules/setup-wizard/usecases/steps/registerProject.step.test.ts
  type: SetupStep
  deps: ServerConfigGateway, DaemonHealthProbeGateway
  outcomes: skipped (already registered), succeeded (added), warning (daemon unreachable but config updated).

- name: validateSetupStep (Step 9)
  file: src/modules/setup-wizard/usecases/steps/validateSetup.step.ts
  test: src/tests/units/modules/setup-wizard/usecases/steps/validateSetup.step.test.ts
  type: SetupStep
  deps: ValidationGateway
  outcomes: succeeded (all green), warning (minor warnings), blocked (errors).

- name: displayNextActionsStep (Step 10)
  file: src/modules/setup-wizard/usecases/steps/displayNextActions.step.ts
  test: src/tests/units/modules/setup-wizard/usecases/steps/displayNextActions.step.test.ts
  type: SetupStep
  deps: NextActionsPresenter, flags.showSecrets
  outcomes: always succeeded.

## GATEWAYS

After applying the Reuse Inventory, only the gateways listed below are **net-new**. Existing gateways/services are wrapped, not duplicated.

Net-new gateway contracts live in `src/modules/setup-wizard/entities/<gw>/<gw>.gateway.ts`. Implementations and stubs:

- DependencyProbeGateway — **WRAPS EXISTING** `checkDependency` + `checkInitPrerequisites`. New gateway contract present only to give Step 1 a uniform multi-binary probe surface; impl delegates.
  contract: src/modules/setup-wizard/entities/dependencyProbe/dependencyProbe.gateway.ts
  implementation: src/modules/setup-wizard/interface-adapters/gateways/dependencyProbe.cli.gateway.ts
  stub: src/tests/stubs/setup-wizard/dependencyProbe.stub.ts
  methods: `probeAll()` → `{ node, yarn, claude, git, gh, glab }` each `{ present, version? }`
  reuse: delegates to `checkInitPrerequisites` for node+claude, `checkDependency` for the rest

- ClaudeAuthGateway
  contract: src/modules/setup-wizard/entities/claudeAuth/claudeAuth.gateway.ts
  implementation: src/modules/setup-wizard/interface-adapters/gateways/claudeAuth.cli.gateway.ts
  stub: src/tests/stubs/setup-wizard/claudeAuth.stub.ts
  methods: `isLoggedIn()`, `triggerLogin()` → `{ success, error? }`

- DaemonServiceGateway
  contract: src/modules/setup-wizard/entities/daemonService/daemonService.gateway.ts
  implementation: src/modules/setup-wizard/interface-adapters/gateways/daemonService.systemd.gateway.ts
  stub: src/tests/stubs/setup-wizard/daemonService.stub.ts
  methods: `status()`, `install()`, `waitUntilHealthy(timeoutMs)`

- DaemonHealthProbeGateway
  contract: src/modules/setup-wizard/entities/daemonHealthProbe/daemonHealthProbe.gateway.ts
  implementation: src/modules/setup-wizard/interface-adapters/gateways/daemonHealthProbe.http.gateway.ts
  stub: src/tests/stubs/setup-wizard/daemonHealthProbe.stub.ts
  methods: `ping(port, timeoutMs)` → `{ healthy, latencyMs? }`

- ~~SecretGeneratorGateway~~ — **DELETED**. Reuse `src/shared/services/secretGenerator.ts` directly. The `generateWebhookSecret()` function already injects the random source for testability; that's enough.

- EnvFileGateway
  contract: src/modules/setup-wizard/entities/envFile/envFile.gateway.ts
  implementation: src/modules/setup-wizard/interface-adapters/gateways/envFile.fileSystem.gateway.ts
  stub: src/tests/stubs/setup-wizard/envFile.stub.ts
  methods: `read(path)`, `write(path, kv)`, `ensureGitignored(repoPath, '.env')`

- GitRemoteGateway
  contract: src/modules/setup-wizard/entities/gitRemote/gitRemote.gateway.ts
  implementation: src/modules/setup-wizard/interface-adapters/gateways/gitRemote.cli.gateway.ts
  stub: src/tests/stubs/setup-wizard/gitRemote.stub.ts
  methods: `isRepo(path)`, `getOriginRemote(path)`, `detectPlatform(remoteUrl)` → `'github' | 'gitlab' | 'unknown'`

- ~~ProjectConfigGateway~~ — **REUSE** `src/modules/cli-configuration/interface-adapters/gateways/projectConfig.fileSystem.gateway.ts`. May need a small `backup()` method addition (separate scope; flag in plan).

- SkillTemplateGateway
  contract: src/modules/setup-wizard/entities/skillTemplate/skillTemplate.gateway.ts
  implementation: src/modules/setup-wizard/interface-adapters/gateways/skillTemplate.fileSystem.gateway.ts
  stub: src/tests/stubs/setup-wizard/skillTemplate.stub.ts
  methods: `writeSkill(projectPath, skillName, language)`, `writeMcpJson(projectPath)`

- ~~ServerConfigGateway~~ — **REUSE** `addRepositoriesToConfig.usecase.ts` + `writeInitConfig.usecase.ts`. They already manipulate `~/.claude-review/config.json`. Step 8 calls them directly. Add a `hasProject(localPath)` read if missing (separate scope, flag in plan).

- ~~ValidationGateway~~ — **REUSE** `validateConfig.usecase.ts` directly (already an in-process use case). Step 9 instantiates it with file-system probes. No new gateway needed.

- AiFallbackGateway
  contract: src/modules/setup-wizard/entities/aiFallback/aiFallback.gateway.ts
  implementation: src/modules/setup-wizard/interface-adapters/gateways/aiFallback.noop.gateway.ts (placeholder until SPEC-185)
  stub: src/tests/stubs/setup-wizard/aiFallback.stub.ts
  methods: `isAvailable()`, `interpret(input, context)` → `{ resolution? }`

- SetupStateGateway
  contract: src/modules/setup-wizard/entities/setupState/setupState.gateway.ts
  implementation: src/modules/setup-wizard/interface-adapters/gateways/setupState.fileSystem.gateway.ts
  stub: src/tests/stubs/setup-wizard/setupState.stub.ts
  methods: `load()`, `save(state)`, `reset()`

- PromptGateway
  contract: src/modules/setup-wizard/entities/prompt/prompt.gateway.ts
  implementation: src/modules/setup-wizard/interface-adapters/gateways/prompt.tty.gateway.ts
  stub: src/tests/stubs/setup-wizard/prompt.stub.ts
  methods: `askText`, `askConfirm`, `askChoice`, `askMultiSelect`

## CONTROLLERS (aligned with existing CLI convention)

The project convention is `src/main/commands/<name>.command.ts`, not `interface-adapters/controllers/cli/`. We follow it.

- name: setup.command (entry point matching existing CLI pattern)
  file: src/main/commands/setup.command.ts
  test: src/tests/units/main/commands/setup.command.test.ts
  responsibilities: build WizardContext from parsed args → call orchestrateSetup → translate result to exit code 0/1/2 → flush emitter
  dependencies: factory `createSetupDependencies()` injects all gateways + `orchestrateSetup` use case + emitter factory
  pattern: matches `init.command.ts`, `validate.command.ts` — exported `executeSetup(args, deps)` + `createSetupDependencies(): SetupDependencies`

- name: parseCliArgs extension
  file: src/cli/parseCliArgs.ts (modify, add `setup` command)
  test: src/tests/units/cli/parseCliArgs.test.ts (extend)
  responsibilities: add `setup` to the discriminated union of commands with flags `{ path?, json, force, ai, yes, showSecrets }`

- name: cli.ts wiring
  file: src/main/cli.ts (modify)
  test: covered by acceptance
  responsibilities: add `case 'setup':` branch calling `executeSetup(args, createSetupDependencies(...))`

## PRESENTERS

- name: NextActionsPresenter
  file: src/modules/setup-wizard/interface-adapters/presenters/nextActions.presenter.ts
  test: src/tests/units/modules/setup-wizard/interface-adapters/presenters/nextActions.presenter.test.ts
  input: `{ platform, host, port, webhookSecret, projectPath, showSecrets }`
  output: `NextActionsViewModel { lines: string[], maskedSecret: string, fullSecret?: string, webhookUrl: string, eventType: string }`
  purpose: builds the "Configurez le webhook sur `<platform>`..." instructions, masks secrets unless `--show-secrets` flag is on. Pure transformation.

- name: WizardSummaryPresenter
  file: src/modules/setup-wizard/interface-adapters/presenters/wizardSummary.presenter.ts
  test: src/tests/units/modules/setup-wizard/interface-adapters/presenters/wizardSummary.presenter.test.ts
  input: `SetupState`
  output: `WizardSummaryViewModel { totalSteps, succeeded, skipped, blocked, warnings, elapsedMs }`
  purpose: final summary line shown in human mode and the `summary` field of the final JSON event.

## SERVICES

- name: WizardEventEmitter (interface + 2 impl)
  files:
    - src/modules/setup-wizard/services/wizardEventEmitter.ts (interface)
    - src/modules/setup-wizard/services/humanWizardEventEmitter.ts
    - src/modules/setup-wizard/services/jsonWizardEventEmitter.ts
  test:
    - src/tests/units/modules/setup-wizard/services/humanWizardEventEmitter.test.ts
    - src/tests/units/modules/setup-wizard/services/jsonWizardEventEmitter.test.ts
  purpose: side-effect sink for step lifecycle events; selected at composition root via flag.

- name: AgentPresetCatalog
  file: src/modules/setup-wizard/services/agentPresetCatalog.ts
  test: src/tests/units/modules/setup-wizard/services/agentPresetCatalog.test.ts
  purpose: static map of preset → agent ids; backed by the existing skills/agents catalog.

- name: SkillTemplateRenderer
  file: src/modules/setup-wizard/services/skillTemplateRenderer.ts
  test: src/tests/units/modules/setup-wizard/services/skillTemplateRenderer.test.ts
  purpose: renders SKILL.md content from preset + language; used by `SkillTemplateGateway` implementation.

## GUARDS (boundary validation)

- src/modules/setup-wizard/entities/setupState/setupState.guard.ts — load/save state file
- src/modules/setup-wizard/entities/stepOutcome/stepOutcome.guard.ts — step boundary
- src/modules/setup-wizard/entities/projectContext/projectContext.guard.ts — composed context
- src/modules/setup-wizard/entities/agentPreset/agentPreset.guard.ts — preset selection
- src/modules/setup-wizard/interface-adapters/controllers/cli/setupCliArgs.guard.ts — argv parsing
- src/modules/setup-wizard/entities/serverConfig/serverConfigEntry.guard.ts — repository entry
- src/modules/setup-wizard/entities/envFile/envFileContents.guard.ts — `.env` key/value lines

## WIRING

- src/main/dependencies.ts: add factories for all 13 gateways listed above (only instantiated lazily under `dependencies.setupWizard.*` namespace to avoid bootstrapping cost when running the daemon).
- src/main/routes.ts: NO http routes added — the wizard is a CLI command, not a route. Just ensure the dashboard JSON consumer (SPEC-184) gets a stable stream contract.
- package.json bin: add `reviewflow` CLI shim if absent; wire `reviewflow setup ...` to `setupWizardEntry.cli.ts`.
- src/main/cli.ts (new or existing): register `setup` subcommand.

## ACCEPTANCE_TEST

  file: src/tests/acceptance/183-setup-wizard.acceptance.test.ts
  note: "SDD outer loop — written FIRST by implementer, RED during impl, GREEN at the end"
  outline:
    - test 1: fresh machine, all stubs return 'absent' → wizard runs all 10 steps, emits success, state file written with all 10 succeeded.
    - test 2: idempotence — second run on same state → all detect() return skipped → wizard emits single summary line, exit 0.
    - test 3: --json mode emits one JSON event per transition + final completion event; lines are valid JSON, conform to event schema.
    - test 4: interrupted run — state file shows steps 1-5 succeeded, step 6 not started → next launch resumes from step 6, emits "Reprise" banner.
    - test 5: -y + not authed → exit code 2, remediation hint emitted.
    - test 6: --force on existing project config → backup written, fresh files generated.
    - test 7: --ai requested but agent fallback unavailable → warning event, ambiguous input falls through to scripted rejection.
    - test 8: ambiguous platform (custom remote) → prompt asked via stubbed PromptGateway, project added correctly.
    - test 9: webhook secret rotation → existing 64-hex untouched (idempotent), placeholder triggers regeneration prompt.
    - test 10: state file corruption → orchestrator warns + offers reset; auto-reset under -y.

## SCENARIO → TEST MAPPING

| Spec scenario | Test file |
|--------------|-----------|
| fresh machine | acceptance test 1 |
| partial setup (resumability) | acceptance test 4 + orchestrateSetup.usecase.test.ts |
| complete setup, new project | acceptance test 2 + addProject.step.test.ts |
| already configured project (no --force) | acceptance test 6 + generateFiles.step.test.ts |
| all deps present | checkDependencies.step.test.ts |
| node too old | checkDependencies.step.test.ts |
| claude missing | checkDependencies.step.test.ts |
| gh & glab missing (warning) | checkDependencies.step.test.ts |
| claude already logged in | claudeLogin.step.test.ts |
| claude not logged in (interactive) | claudeLogin.step.test.ts |
| claude login failed | claudeLogin.step.test.ts |
| -y + not authed | claudeLogin.step.test.ts + acceptance test 5 |
| daemon running | daemonInstall.step.test.ts |
| daemon install (linux+systemd) | daemonInstall.step.test.ts |
| no systemd | daemonInstall.step.test.ts |
| darwin (manual) | daemonInstall.step.test.ts |
| daemon healthy after install | daemonInstall.step.test.ts |
| secrets present | generateSecrets.step.test.ts |
| secrets missing | generateSecrets.step.test.ts + acceptance test 9 |
| placeholder secrets | generateSecrets.step.test.ts |
| rotation confirmed | generateSecrets.step.test.ts |
| valid git repo | addProject.step.test.ts |
| path prompt | addProject.step.test.ts |
| not a git repo | addProject.step.test.ts |
| no remote | addProject.step.test.ts |
| platform auto-detect github | addProject.step.test.ts |
| platform auto-detect gitlab | addProject.step.test.ts |
| platform ambiguous | addProject.step.test.ts + acceptance test 8 |
| preset backend/frontend/fullstack/basic/custom | configurePipeline.step.test.ts |
| zero agents in custom | configurePipeline.step.test.ts |
| language fr/en | configurePipeline.step.test.ts + skillTemplateRenderer.test.ts |
| generation nominal | generateFiles.step.test.ts |
| existing files w/o --force | generateFiles.step.test.ts |
| existing files w/ --force | generateFiles.step.test.ts + acceptance test 6 |
| permission denied | generateFiles.step.test.ts |
| project registered | registerProject.step.test.ts |
| project added | registerProject.step.test.ts |
| daemon unreachable (register) | registerProject.step.test.ts |
| validate all green | validateSetup.step.test.ts |
| validate minor warnings | validateSetup.step.test.ts |
| validate errors | validateSetup.step.test.ts |
| display next actions nominal | displayNextActions.step.test.ts + nextActions.presenter.test.ts |
| --show-secrets | nextActions.presenter.test.ts |
| --json transitions | jsonWizardEventEmitter.test.ts + acceptance test 3 |
| --json awaiting input | jsonWizardEventEmitter.test.ts |
| --json completion | jsonWizardEventEmitter.test.ts + acceptance test 3 |
| --ai ambiguous input (no fallback yet) | addProject.step.test.ts + acceptance test 7 |
| scripted rejects monorepo | addProject.step.test.ts |
| interrupted mid-flow | orchestrateSetup.usecase.test.ts + acceptance test 4 |
| corrupted state | setupState.fileSystem.gateway.test.ts + orchestrateSetup.usecase.test.ts + acceptance test 10 |

## IMPLEMENTATION_ORDER

Walking skeleton first (1 vertical slice through all layers), then breadth.

1. `src/tests/acceptance/183-setup-wizard.acceptance.test.ts` — write outer loop RED first (test 1 only initially), other tests stubbed `test.skip` placeholders.
2. `src/modules/setup-wizard/entities/stepId/*` — branded literal union. Smallest entity.
3. `src/modules/setup-wizard/entities/stepOutcome/*` — discriminated union + constructors. Used by every step.
4. `src/modules/setup-wizard/entities/setupState/*` — entity + schema + guard + gateway contract. The state file format is the contract everything else hangs on.
5. `src/modules/setup-wizard/entities/projectContext/*` — composed context for cross-step data.
6. `src/modules/setup-wizard/entities/setupStep/setupStep.ts` — interface definition (no runtime code).
7. `src/modules/setup-wizard/entities/wizardContext/wizardContext.ts` — type definition.
8. `src/tests/factories/setupState.factory.ts`, `stepOutcome.factory.ts`, `projectContext.factory.ts`, `agentPreset.factory.ts` — needed by step tests.
9. Pick the simplest step end-to-end: `checkDependencies.step.ts` + `dependencyProbe.gateway.ts` contract + stub + test. This is the walking skeleton's vertical slice.
10. `src/modules/setup-wizard/services/wizardEventEmitter.ts` + `humanWizardEventEmitter.ts` + tests. Needed before orchestrator.
11. `src/modules/setup-wizard/usecases/orchestrateSetup.usecase.ts` + tests with only step 1 wired. Wire load/save state, iterate steps, resumability.
12. Extend `src/cli/parseCliArgs.ts` to recognize `setup` command + its flags. Add tests in `src/tests/units/cli/parseCliArgs.test.ts`.
13. Create `src/main/commands/setup.command.ts` (matching existing `init.command.ts` / `validate.command.ts` pattern) — stitches parsed args → context → orchestrator → exit code. Tests in `src/tests/units/main/commands/setup.command.test.ts`.
14. `src/modules/setup-wizard/interface-adapters/gateways/setupState.fileSystem.gateway.ts` — real persistence.
15. `src/modules/setup-wizard/interface-adapters/gateways/dependencyProbe.cli.gateway.ts` — real probe via executionGateway.base.
16. Composition root wiring in `src/main/dependencies.ts` + CLI entry point.
17. Acceptance test 1 GREEN: fresh machine runs only step 1 (others tdd: skipped temporarily). At this point walking skeleton is alive.
18. Add step 2 (claude-login) — contract + stub + test + impl + integration in orchestrator. Acceptance test 1 expands to "step 1 + 2".
19. Add step 3 (daemon) — same loop. Acceptance test 1 expands. Tests 4 (resumability) starts here once 3 steps exist.
20. Add `jsonWizardEventEmitter.ts` + tests. Acceptance test 3 unlocked.
21. Step 4 (secrets) — same loop. Acceptance test 9 unlocked.
22. Step 5 (add-project) — `PromptGateway` introduced here. Tests 5, 7, 8 unlocked.
23. Step 6 (pipeline) — `AgentPresetCatalog` + `SkillTemplateRenderer`.
24. Step 7 (generate-files) — backup + force handling. Acceptance test 6 unlocked.
25. Step 8 (register-project) — server config gateway.
26. Step 9 (validate) — adapter to existing `reviewflow validate`.
27. Step 10 (display next actions) + `NextActionsPresenter` + `WizardSummaryPresenter`.
28. State corruption handling + acceptance test 10 GREEN.
29. Final pass: idempotence acceptance test 2 GREEN (run wizard twice end-to-end in test).
30. Composition root final wiring + `package.json` bin entry. Manual smoke run.

## REFERENCE_FILES

- `src/shared/foundation/usecase/usecase.base.ts` — base `UseCase<I,O>` interface to align step contract style
- `src/shared/foundation/guard/guard.base.ts` — `createGuard(schema, 'context')` for all boundary validations
- `src/shared/foundation/executionGateway.base.ts` — base for CLI command gateways (claude /login, systemctl, gh, glab)
- `src/modules/worktree-management/` — reference module layout for `src/modules/<context>/entities|usecases|interface-adapters|services`
- `src/modules/worktree-management/entities/worktree/worktree.gateway.ts` — gateway-contract location convention
- `src/modules/worktree-management/interface-adapters/gateways/worktree.fileSystem.gateway.ts` — fileSystem gateway implementation pattern
- `src/modules/queue/` — second reference module
- `src/interface-adapters/controllers/cli/reviewCli.cli.ts` (if exists) — CLI controller pattern; if absent, this plan creates the convention
- `src/main/routes.ts` — composition root style (Dependencies object, lazy instantiation)
- `src/main/dependencies.ts` — central dependency factory
- `src/entities/reviewContext/reviewContext.schema.ts` + `.guard.ts` + `.gateway.ts` — canonical entity + schema + guard + gateway trio

## RISKS & DEFERRALS

### File count (after Reuse Inventory)

Honest revised count: **~30 production files + ~30 test files = ~60 files**.

Breakdown:
- 7 entities × ~3 files (entity, schema, guard — factory only for those needed in tests) = ~18
- 8 net-new gateways × 3 (contract, impl, stub) = 24 — but most "impl" delegate heavily to existing services so are 20-50 LOC each
- 11 use cases (orchestrator + 10 steps) × 2 (impl + test) = 22 — but 5+ steps are thin orchestrators around existing use cases (50-80 LOC each)
- 2 presenters × 2 = 4
- 4 services × 2 = 8
- 1 command entry (`setup.command.ts`) + parseCliArgs extension + cli.ts edit
- 1 acceptance test

This is above the INVEST `Small: WARN` threshold flagged in the spec (~15-20 files), but **the LOC density is low** because most steps are 30-80 LOC of orchestration over existing use cases. The user has explicitly chosen one PR; we honor that. The walking-skeleton ordering below remains critical for reviewer sanity.

### Risk 1 — review burden

A 90-file PR is hard to review. Mitigation:
- Each commit in the implementation order above corresponds to one logical slice (entity, gateway contract+stub, gateway impl, step, test).
- Encourage reviewer to read in implementation order, not file-tree order.
- Final commit is "wire it all" — must be small.

### Risk 2 — flaky shell-out tests

Steps 1, 2, 3 spawn external processes (`node --version`, `claude /login`, `systemctl`). Mitigation:
- Use stubs in unit tests (no real shell-out).
- Acceptance test uses stubs too — no real `claude` or `systemctl` invoked.
- Real CLI gateways are tested only via a minimal smoke test that runs in CI on linux only (skipped on darwin/windows).

### Risk 3 — `claude /login` interactivity

`claude /login` is interactive (browser OAuth). The wizard cannot capture its outcome reliably. Mitigation:
- `triggerLogin()` spawns it inherited-stdio (user sees output), waits for exit code, then polls `isLoggedIn()` until true or 60s timeout.
- Acceptance scenario "non-interactive without login" already covers the fail-fast path.

### Risk 4 — `--ai` activation coupled with SPEC-185

Deferred by design (D8). `AiFallbackGateway` is contractually present but its only impl is no-op. SPEC-185 swaps the binding. No code in steps changes.

### Risk 5 — preset definitions

Hard-coded for v1 (`backend`, `frontend`, `fullstack`, `basic`, `custom`). Custom-preset agent multi-select requires reading the agent catalog from disk. The catalog is assumed already discoverable via existing skill structure — verify before implementing Step 6. If not, add `AgentCatalogGateway` to enumerate `.claude/skills/`.

### Risk 6 — `reviewflow validate` reuse — RESOLVED

`validateConfig.usecase.ts` already exists and is callable in-process. Step 9 instantiates and calls it. No spawn needed. No risk.

### Risk 7 — Per-platform daemon install

Step 3 has 4 branches (linux+systemd, linux no-systemd, darwin, install-confirmed). The systemd install path requires sudo, which interacts with non-interactive `-y` mode. Mitigation:
- `DaemonServiceGateway.install()` returns `{ requiresSudo: true }` if it would need it; under `-y` without prior sudo cache, fail with remediation "Run `sudo -v` first or install manually with `<command>`".
- Document this in the step's blocked-outcome message.

### Risk 9 — duplication of existing cli-configuration logic

The `cli-configuration` module already implements most of what the wizard needs. The risk is that, during implementation, the implementer rebuilds parallel versions inside `setup-wizard/` (e.g. new project-config gateway, new secret generator, new validation logic).

Mitigation:
- **The Reuse Inventory at the top of this plan is normative.** Every step's tests must inject existing use cases as dependencies, not new ones.
- During code review, any new file under `setup-wizard/` that duplicates a concept from `cli-configuration/` is rejected.
- The wizard's contribution is: state machine + step abstraction + JSON emitter + orchestration. Nothing more.

### Risk 10 — `init` command vs `setup` command overlap

The existing `reviewflow init` command (`init.command.ts`) already does a subset of what `setup` does (prerequisites, MCP config, secret generation, repo discovery). The new `setup` command must NOT silently replace `init`. Either:
- Option A: keep both, document `setup` as the new recommended path and `init` as legacy/advanced.
- Option B: deprecate `init` with a wrapper that prints a deprecation notice and invokes `setup`.

Decision deferred to implementer + product (raise via PR comment). Plan assumes Option A.

### Risk 8 — atomic state writes

State file at `~/.claude-review/setup-state.json` must survive ctrl+c. Mitigation:
- `setupState.fileSystem.gateway.save()` writes to tmp file + rename (atomic POSIX rename).
- Save after every step outcome, not at the end.

### Deferrals (explicitly out of scope)

- Dashboard wizard view (SPEC-184) — consumes the JSON stream this spec produces, but lives elsewhere.
- Agent-driven fallback (SPEC-185) — `--ai` flag is parseable but inert.
- Windows support — gateways may throw "unsupported platform" early.
- Webhook auto-creation on GitLab/GitHub APIs — manual instructions only in Step 10.
- `reviewflow update-project` for already-configured projects — separate future spec.
