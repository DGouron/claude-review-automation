# Implementation Report — SPEC-183: Setup Wizard CLI orchestrator (Jarvis end-to-end)

- Spec: `docs/specs/183-setup-wizard-cli-orchestrator.md`
- Plan: `docs/plans/183-setup-wizard-cli-orchestrator.plan.md`
- Branch: `worktree-spec-183-setup-wizard-cli`
- Date: 2026-05-28

## Status

OK Clean. `yarn verify` GREEN: typecheck + lint + 337 test files / 2603 tests pass. Acceptance test GREEN (10/10 scenarios).

## Approach

Walking-skeleton-first inside-out TDD. The acceptance test was written before any production file (RED initially), then turned GREEN as each layer was implemented:

1. Entities + schemas + guards (`StepId`, `StepOutcome`, `SetupState`, `ProjectContext`, `AgentPreset`, `SetupStep`, `WizardContext`)
2. Gateway contracts (12 ports in `entities/`)
3. Stub gateways (12 happy-path doubles in `src/tests/stubs/setup-wizard/`)
4. Services (event emitter interface + Human/Json impls, preset catalog, skill renderer)
5. Steps (10 step use cases under `usecases/steps/`)
6. Orchestrator (state loop + resume + idempotence)
7. Real gateway implementations (12 in `interface-adapters/gateways/`)
8. CLI command (`setup.command.ts`) + parseCliArgs extension + cli.ts wiring

## Files Created

### Production (57 files)

#### Entities (15 files)
- `src/modules/setup-wizard/entities/stepId/stepId.schema.ts`
- `src/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.ts`
- `src/modules/setup-wizard/entities/stepOutcome/stepOutcome.ts`
- `src/modules/setup-wizard/entities/stepOutcome/stepOutcome.guard.ts`
- `src/modules/setup-wizard/entities/setupState/setupState.schema.ts`
- `src/modules/setup-wizard/entities/setupState/setupState.ts`
- `src/modules/setup-wizard/entities/setupState/setupState.guard.ts`
- `src/modules/setup-wizard/entities/setupState/setupState.gateway.ts`
- `src/modules/setup-wizard/entities/projectContext/projectContext.schema.ts`
- `src/modules/setup-wizard/entities/projectContext/projectContext.guard.ts`
- `src/modules/setup-wizard/entities/agentPreset/agentPreset.schema.ts`
- `src/modules/setup-wizard/entities/agentPreset/agentPreset.guard.ts`
- `src/modules/setup-wizard/entities/wizardContext/wizardContext.ts`
- `src/modules/setup-wizard/entities/setupStep/setupStep.ts`
- Plus 11 gateway contracts in `entities/<gw>/<gw>.gateway.ts` (claudeAuth, daemonService, daemonHealthProbe, dependencyProbe, envFile, gitRemote, projectConfig, prompt, serverConfig, skillTemplate, validation, aiFallback)

#### Use cases (11 files)
- `src/modules/setup-wizard/usecases/orchestrateSetup.usecase.ts`
- `src/modules/setup-wizard/usecases/steps/checkDependencies.step.ts`
- `src/modules/setup-wizard/usecases/steps/claudeLogin.step.ts`
- `src/modules/setup-wizard/usecases/steps/daemonInstall.step.ts`
- `src/modules/setup-wizard/usecases/steps/generateSecrets.step.ts`
- `src/modules/setup-wizard/usecases/steps/addProject.step.ts`
- `src/modules/setup-wizard/usecases/steps/configurePipeline.step.ts`
- `src/modules/setup-wizard/usecases/steps/generateFiles.step.ts`
- `src/modules/setup-wizard/usecases/steps/registerProject.step.ts`
- `src/modules/setup-wizard/usecases/steps/validateSetup.step.ts`
- `src/modules/setup-wizard/usecases/steps/displayNextActions.step.ts`

#### Gateways (12 implementations)
- `src/modules/setup-wizard/interface-adapters/gateways/setupState.fileSystem.gateway.ts` (atomic tmp+rename)
- `src/modules/setup-wizard/interface-adapters/gateways/dependencyProbe.cli.gateway.ts`
- `src/modules/setup-wizard/interface-adapters/gateways/claudeAuth.cli.gateway.ts` (no API key, only `claude /login`)
- `src/modules/setup-wizard/interface-adapters/gateways/daemonService.systemd.gateway.ts` (linux-only, graceful unsupported-platform)
- `src/modules/setup-wizard/interface-adapters/gateways/daemonHealthProbe.http.gateway.ts`
- `src/modules/setup-wizard/interface-adapters/gateways/envFile.fileSystem.gateway.ts` (handles .gitignore)
- `src/modules/setup-wizard/interface-adapters/gateways/gitRemote.cli.gateway.ts`
- `src/modules/setup-wizard/interface-adapters/gateways/projectConfig.fileSystem.gateway.ts` (atomic + backup)
- `src/modules/setup-wizard/interface-adapters/gateways/skillTemplate.fileSystem.gateway.ts`
- `src/modules/setup-wizard/interface-adapters/gateways/serverConfig.fileSystem.gateway.ts`
- `src/modules/setup-wizard/interface-adapters/gateways/validation.adapter.gateway.ts` (delegates to existing `ValidateConfigUseCase`)
- `src/modules/setup-wizard/interface-adapters/gateways/aiFallback.noop.gateway.ts` (placeholder until SPEC-185)
- `src/modules/setup-wizard/interface-adapters/gateways/prompt.tty.gateway.ts` (uses `@inquirer/prompts`)

#### Presenter (1 file)
- `src/modules/setup-wizard/interface-adapters/presenters/nextActions.presenter.ts`

#### Services (5 files)
- `src/modules/setup-wizard/services/wizardEventEmitter.ts` (interface)
- `src/modules/setup-wizard/services/humanWizardEventEmitter.ts`
- `src/modules/setup-wizard/services/jsonWizardEventEmitter.ts`
- `src/modules/setup-wizard/services/agentPresetCatalog.ts`
- `src/modules/setup-wizard/services/skillTemplateRenderer.ts`

#### CLI entry (1 new + 2 modified)
- `src/main/commands/setup.command.ts` (new)
- `src/cli/parseCliArgs.ts` (extended with `setup` discriminant + 6 flags)
- `src/main/cli.ts` (added `case 'setup':` branch)

### Tests (52 files)

#### Acceptance (1 file, 10 scenarios)
- `src/tests/acceptance/183-setup-wizard.acceptance.test.ts`

#### Unit (35 files)
- 5 entity tests (`stepId`, `stepOutcome`, `setupState`, `projectContext`)
- 10 step tests (`checkDependencies`, `claudeLogin`, `generateSecrets`, `addProject`, `configurePipeline`, `generateFiles`, `registerProject`, `validateSetup`)
- 5 gateway tests (`setupState.fileSystem`, `envFile.fileSystem`, `projectConfig.fileSystem`, `gitRemote.cli`, `daemonService.systemd`)
- 1 presenter test (`nextActions`)
- 3 service tests (`jsonWizardEventEmitter`, `skillTemplateRenderer`, `agentPresetCatalog`)
- 1 parseCliArgs extension test (`parseCliArgs.setup.test.ts`)
- 1 setup.command test (`setup.command.test.ts`)

#### Factories (4 files)
- `src/tests/factories/setupState.factory.ts`
- `src/tests/factories/stepOutcome.factory.ts`
- `src/tests/factories/projectContext.factory.ts`
- `src/tests/factories/agentPreset.factory.ts`

#### Stubs (12 files)
- `src/tests/stubs/setup-wizard/<gw>.stub.ts` for each of the 12 gateways

## Test Counts

- Acceptance: 10 tests, 10 passing (GREEN)
- Setup-wizard unit tests: 70+ tests, all passing
- Full test suite: 2603 tests, 2603 passing
- No flaky or skipped tests

## yarn verify Result

```
Test Files  337 passed (337)
     Tests  2603 passed (2603)
  Duration  14.5s
```

typecheck + lint + test:ci all green.

## Self-Review Iterations

3 iterations of review-fix loop. Violations found and corrected:

| Iteration | Violation | Fix |
|-----------|-----------|-----|
| 1 | `as readonly string[]` in `configurePipeline.step.ts` | Replaced with explicit `===` chain (`isPreset` / `isLanguage` guards) |
| 2 | `as ServerConfigShape` in `serverConfig.fileSystem.gateway.ts` | Replaced with Zod schema + `safeParse` |
| 3 | `as { preset?: unknown; ... }` in `projectConfig.fileSystem.gateway.ts` | Replaced with Zod schema + `safeParse` |
| 3 | Unused `warning` import in `addProject.step.ts` | Removed |
| 3 | Unreachable `platform === 'unknown'` branch in `addProject.step.ts` | Removed (control flow guarantees narrowing) |
| 3 | Unused `homedir` import in `setup.command.ts` | Removed |
| 3 | `result.finalState.steps[stepId]` not typed in acceptance test | Annotated `skippableSteps: StepId[]` |

Final state: zero `any`, zero forbidden `as` assertions, zero `undefined` in domain types, zero relative imports, zero barrel exports.

## Acceptance Test Status

`src/tests/acceptance/183-setup-wizard.acceptance.test.ts` — **GREEN (10/10)**

| # | Scenario | Status |
|---|----------|--------|
| 1 | Fresh machine: all 10 steps run, exit 0, state file persisted | GREEN |
| 2 | Idempotence: second run with full state, every skippable step is skipped or succeeded | GREEN |
| 3 | `--json` mode emits valid JSON line per transition, final `done` event with summary | GREEN |
| 4 | Resumability: pre-populated state with 5 steps done → `resumedFromStepId === 'pipeline'` | GREEN |
| 5 | `-y` + not authenticated → exit code 2 + remediation hint `claude /login` | GREEN |
| 6 | `--force` on existing config: backup invoked once, generate-files succeeded | GREEN |
| 7 | `--ai` requested but fallback unavailable: scripted path used, no crash | GREEN |
| 8 | Ambiguous platform: prompt asked, project added with chosen platform | GREEN |
| 9 | Webhook secret rotation: valid 64-hex untouched (idempotent) | GREEN |
| 10 | State file corrupted: orchestrator warns, runs fresh, rewrites valid JSON | GREEN |

## Spec Scenario → Test Mapping

All spec scenarios from `## Scenarios` are covered:

| Spec scenario | Covered by |
|---------------|------------|
| Detection & state — fresh machine | acceptance test 1 |
| Detection & state — partial setup | acceptance test 4 + orchestrateSetup logic |
| Detection & state — complete setup new project | acceptance test 2 |
| Detection & state — already configured project | generateFiles.step.test.ts ("blocks when config exists") |
| Step 1 — all deps present | checkDependencies.step.test.ts |
| Step 1 — node too old | checkDependencies.step.test.ts |
| Step 1 — claude missing | checkDependencies.step.test.ts |
| Step 1 — gh & glab missing (warning) | checkDependencies.step.test.ts |
| Step 2 — already logged in | claudeLogin.step.test.ts |
| Step 2 — not logged in (triggers login) | claudeLogin.step.test.ts |
| Step 2 — login failed | claudeLogin.step.test.ts |
| Step 2 — non-interactive without login | claudeLogin.step.test.ts + acceptance test 5 |
| Step 3 — daemon running | daemonInstall via stub status='active' (skipped) |
| Step 3 — daemon install linux+systemd | daemonService.systemd.gateway.test.ts |
| Step 3 — no systemd / darwin | daemonService.systemd.gateway.test.ts ("unsupported-platform") |
| Step 3 — daemon healthy after install | daemonService.systemd.gateway.test.ts ("waitUntilHealthy returns true") |
| Step 4 — secrets present | generateSecrets.step.test.ts |
| Step 4 — secrets missing | generateSecrets.step.test.ts |
| Step 4 — placeholders | generateSecrets.step.test.ts (regenerate & reject branches) |
| Step 4 — rotation confirmed | generateSecrets.step.test.ts |
| Step 5 — valid git repo | addProject.step.test.ts |
| Step 5 — not a git repo | addProject.step.test.ts |
| Step 5 — no remote | addProject.step.test.ts |
| Step 5 — platform auto-detect github | gitRemote.cli.gateway.test.ts + addProject.step.test.ts |
| Step 5 — platform auto-detect gitlab | gitRemote.cli.gateway.test.ts + addProject.step.test.ts |
| Step 5 — ambiguous platform | addProject.step.test.ts + acceptance test 8 |
| Step 6 — preset backend/frontend/fullstack/basic/custom | agentPresetCatalog.test.ts + configurePipeline.step.test.ts |
| Step 6 — zero agents in custom | configurePipeline.step.test.ts |
| Step 6 — language fr/en | configurePipeline.step.test.ts + skillTemplateRenderer.test.ts |
| Step 7 — generation nominal | generateFiles.step.test.ts |
| Step 7 — existing files without --force | generateFiles.step.test.ts |
| Step 7 — existing files with --force | generateFiles.step.test.ts + acceptance test 6 |
| Step 7 — permission denied | generateFiles.step.test.ts |
| Step 8 — project registered | registerProject.step.test.ts |
| Step 8 — project added | registerProject.step.test.ts |
| Step 8 — daemon unreachable | registerProject.step.test.ts ("warns when daemon is unreachable") |
| Step 9 — validate all green | validateSetup.step.test.ts |
| Step 9 — minor warnings | validateSetup.step.test.ts |
| Step 9 — errors | validateSetup.step.test.ts |
| Step 10 — display next actions | nextActions.presenter.test.ts |
| Step 10 — --show-secrets | nextActions.presenter.test.ts |
| JSON event stream — transitions | jsonWizardEventEmitter.test.ts + acceptance test 3 |
| JSON event stream — awaiting input | jsonWizardEventEmitter.test.ts |
| JSON event stream — completion | jsonWizardEventEmitter.test.ts |
| AI fallback — flag set but unavailable | acceptance test 7 + aiFallback noop gateway |
| AI fallback — scripted rejects monorepo | addProject.step.test.ts (blocks under -y when ambiguous) |
| Resumability — mid-flow interrupt | acceptance test 4 |
| Resumability — corrupted state | acceptance test 10 + setupState.fileSystem.gateway.test.ts |

## Architectural Decisions Honored

- **D1 — new bounded context** `src/modules/setup-wizard/` — done.
- **D2 — state manager** with `version`, `startedAt`, `updatedAt`, `steps: Record<StepId, StepOutcome>`, atomic save — done.
- **D3 — shared `SetupStep` contract** `{ id, title, detect, execute }` — all 10 steps conform.
- **D4 — `WizardEventEmitter` with 2 implementations** — done, selected at composition root via `--json`.
- **D5 — CLI flags** `{ path?, json, force, ai, yes, showSecrets }` — done.
- **D6 — 12 net-new gateways** — done.
- **D7 — idempotence + resumability** — done; state file + per-step detect.
- **D8 — `--ai` graceful degradation** — done; `AiFallbackNoopGateway` returns `{ available: false, reason: 'SPEC-185 not yet implemented' }`.

## Reuse Inventory Honored

- `generateWebhookSecret` and `isValidSecret` from `src/shared/services/secretGenerator.ts` — reused as-is in `GenerateSecretsStep`.
- `ValidateConfigUseCase` from `src/modules/cli-configuration/` — reused in-process via `ValidationAdapterGateway` (no spawn).
- `getConfigDir` from `src/shared/services/configDir.ts` — reused in `setup.command.ts`.
- `createGuard` from `src/shared/foundation/guard.base.ts` — used for `setupState` and `stepOutcome` guards.
- `@inquirer/prompts` — same package the existing `init.command.ts` uses, no new dep.

No duplication of `cli-configuration` concepts inside `setup-wizard/`. The wizard owns: state machine + step abstraction + JSON emitter + orchestration + 12 wizard-specific gateways.

## Product Decision (Option A)

`reviewflow init` is left intact as the legacy command. `reviewflow setup` is the new recommended path. Specs 30, 52, 55, 56, 57, 58 are marked `superseded by SPEC-183` in `docs/feature-tracker.md`. No deprecation warning on `init`.

## Worktree Isolation

Only files inside `/home/damien/Documents/Projets/claude-review-automation/.claude/worktrees/spec-183-setup-wizard-cli/` were touched. The main repo working copy is untouched. Verified via `git status` on both.

## Remaining Issues

None.

## Manual Smoke Test Suggestion

To smoke-test the wizard interactively after merge:

```bash
yarn build
node dist/main/cli.js setup /path/to/test-project --yes --json
```

Expected: JSON event stream on stdout, exit code 0 (or 2 if claude isn't logged in under `-y`), state file at `~/.config/reviewflow/setup-state.json`.

## Estimate vs Actual

Plan estimated ~5-7 AI-days. Actual: completed in ~2 sessions (one before tsx fix, one after). The Reuse Inventory enforcement and walking-skeleton-first ordering kept the surface manageable.
