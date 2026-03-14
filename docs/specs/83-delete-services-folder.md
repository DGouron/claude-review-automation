# Spec #83 — Delete `/services/` folder (final cleanup)

**Issue**: [#83](https://github.com/DGouron/review-flow/issues/83)
**Absorbs**: [#78](https://github.com/DGouron/review-flow/issues/78) (ThreadActionsExecutor → gateway), [#81](https://github.com/DGouron/review-flow/issues/81) (reviewContextWatcher migration)
**Labels**: refactor, P3-nice-to-have, architecture
**Milestone**: Architecture Cleanup
**Blocked by**: #80 (split statsService), #82 (EventBus)

---

## Problem Statement

The project follows Clean Architecture with layers `entities/`, `usecases/`, `interface-adapters/`, `frameworks/`, and `shared/foundation/`. Two legacy directories — `src/services/` (7 files) and `src/shared/services/` (12 files) — violate this layering by acting as a dumping ground where domain logic, infrastructure concerns, and cross-cutting utilities coexist without clear architectural classification.

This prevents developers from knowing whether a "service" is a domain function, an adapter, or pure infrastructure. It also creates import cycles where interface-adapters import from `services/` (a peer-level non-layer directory) and entities re-export types through services.

## User Story

**As a** ReviewFlow contributor,
**I want** every module to live in its proper Clean Architecture layer,
**So that** the dependency rule is self-documenting and I can locate code by its architectural role without guessing.

---

## Migration Table

### `src/services/` (7 files)

| # | Current File | Responsibility | Target Location | Rationale | Notes |
|---|---|---|---|---|---|
| 1 | `statsService.ts` | Types (`ReviewStats`, `ProjectStats`), parsing (`parseReviewOutput`), persistence (`loadProjectStats`, `saveProjectStats`), presentation (`getStatsSummary`), aggregation (`addReviewStats`) | **Split across layers** (see below) | God Object mixing 4 concerns. Depends on #80 completing first. | **Blocked by #80** |
| 2 | `threadActionsParser.ts` | Parses CLI stdout markers into `ThreadAction[]`. Pure transformation, no I/O. Re-exports types from `entities/reviewAction`. | `src/interface-adapters/adapters/reviewAction.parser.ts` | Adapter: transforms external format (CLI stdout) into domain types. No domain logic — pure parsing/mapping. |  |
| 3 | `threadActionsExecutor.ts` | Deprecated facade that delegates to `GitLabReviewActionCliGateway` / `GitHubReviewActionCliGateway`. Also exports `defaultCommandExecutor`. | **Delete entirely** — inline `defaultCommandExecutor` into composition root or a framework utility. | Already marked `@deprecated`. Both gateways exist in `interface-adapters/gateways/cli/`. Callers should import gateways directly. |  |
| 4 | `contextActionsExecutor.ts` | Deprecated facade identical in purpose to `threadActionsExecutor` but takes a `ReviewContext` instead of raw actions. | **Delete entirely** — callers use gateways directly. | Already marked `@deprecated`. Same delegation pattern. |  |
| 5 | `commentLinkEnricher.ts` | Transforms `file:line` references into clickable GitLab/GitHub blob links. Pure string transformation, no I/O. | `src/interface-adapters/adapters/commentLink.enricher.ts` | Adapter: enriches domain data (comment body) with platform-specific URLs before external delivery. Already used only by `reviewAction.gitlab.cli.gateway.ts`. |  |
| 6 | `agentInstructionsBuilder.ts` | Builds `AgentInstructions` object and formats it for prompt injection. Pure data construction, no I/O. | `src/interface-adapters/adapters/agentInstructions.builder.ts` | Adapter: transforms domain concepts into an external prompt format. Used only by `reviewContext.fileSystem.gateway.ts`. |  |
| 7 | `reviewContextWatcher.service.ts` | Polls `ReviewContextGateway` for progress changes, fires callbacks. Stateful (holds timers, watchers map). | `src/interface-adapters/gateways/reviewContextWatcher.gateway.ts` | Interface adapter: orchestrates I/O (polling gateway) and transforms events outward. Not a use case (no business decision). Not a framework (no library). |  |

### `src/shared/services/` (12 files)

| # | Current File | Responsibility | Target Location | Rationale |
|---|---|---|---|---|
| 8 | `claudePathResolver.ts` | Resolves the `claude` CLI binary path. Executes shell commands, reads filesystem. | `src/frameworks/claude/claudePathResolver.ts` | Framework concern: locating an external tool binary. Already used by `frameworks/claude/claudeInvoker.ts`. |
| 9 | `mcpJobContext.ts` | Builds filesystem paths for MCP job context files. Pure path computation. | `src/frameworks/claude/mcpJobContext.ts` | Framework concern: MCP infrastructure file paths. Used by MCP server and Claude invoker. |
| 10 | `dependencyChecker.ts` | Validates that external CLI tools (`claude`, `glab`, `gh`) are installed. Executes shell commands. | `src/frameworks/dependencyChecker.ts` | Framework concern: verifying external tool availability at startup. |
| 11 | `daemonPaths.ts` | Exports constants: `PID_FILE_PATH`, `LOG_FILE_PATH`, `LOG_DIR`. Pure path computation. | `src/frameworks/daemon/daemonPaths.ts` | Framework/infrastructure concern: daemon file layout. |
| 12 | `daemonSpawner.ts` | Spawns a detached child process for daemon mode. Uses `child_process.spawn`. | `src/frameworks/daemon/daemonSpawner.ts` | Framework concern: OS process management. |
| 13 | `pidFileManager.ts` | CRUD operations on PID file (read/write/remove/exists). Filesystem I/O. | `src/frameworks/daemon/pidFileManager.ts` | Framework concern: daemon lifecycle via PID files. |
| 14 | `processChecker.ts` | Checks if a PID is running via `process.kill(pid, 0)`. | `src/frameworks/daemon/processChecker.ts` | Framework concern: OS process introspection. |
| 15 | `logFileReader.ts` | Reads/watches log files from disk. Filesystem I/O with polling. | `src/frameworks/daemon/logFileReader.ts` | Framework concern: log file infrastructure. |
| 16 | `ansiColors.ts` | ANSI escape code wrappers (`red`, `green`, `bold`, etc.). Zero dependencies. | `src/shared/foundation/ansiColors.ts` | Foundation utility: cross-cutting, no domain logic, no I/O. |
| 17 | `browserOpener.ts` | Opens a URL in the system browser via `xdg-open`/`open`. Executes shell command. | `src/frameworks/browserOpener.ts` | Framework concern: OS-level browser launch. |
| 18 | `configDir.ts` | Computes the XDG-compliant config directory path. Pure path computation. | `src/frameworks/config/configDir.ts` | Framework/config concern. Already used by `frameworks/config/configLoader.ts`. |
| 19 | `secretGenerator.ts` | Generates and validates webhook secrets using `crypto.randomBytes`. | `src/shared/foundation/secretGenerator.ts` | Foundation utility: cryptographic helper with no domain semantics. |

---

## Detailed `statsService.ts` Split (blocked by #80)

`statsService.ts` is a God Object. Issue #80 covers its decomposition:

| Concern | Current Functions | Target |
|---|---|---|
| **Types** | `ReviewStats`, `ProjectStats` | `src/entities/stats/stats.ts` |
| **Parsing** | `parseReviewOutput()` | `src/interface-adapters/adapters/reviewOutput.parser.ts` |
| **Persistence** | `loadProjectStats()`, `saveProjectStats()`, `createEmptyStats()` | Already partially exists: `StatsGateway` + `FileSystemStatsGateway` |
| **Aggregation** | `addReviewStats()` | `src/usecases/addReviewStats.usecase.ts` |
| **Presentation** | `getStatsSummary()` | `src/interface-adapters/presenters/stats.presenter.ts` |

This spec does NOT implement #80's split. It only moves what remains after #80 is done, or moves the file as-is if #80 is deferred.

---

## Scope

### In Scope

- Move all 19 source files to their target locations
- Move all corresponding test files (in `src/tests/units/services/` and `src/tests/units/shared/services/`) to mirror the new source structure
- Update ALL imports across the codebase (both `@/` alias and relative paths)
- Remove backward-compatibility re-exports from `threadActionsParser.ts` (types already live in `entities/reviewAction/`)
- Delete the two deprecated facades (`threadActionsExecutor.ts`, `contextActionsExecutor.ts`) and update all callers to use gateways directly
- Delete `src/services/` and `src/shared/services/` directories
- Ensure `yarn verify` passes (typecheck + lint + tests)

### Out of Scope

- **#80**: Splitting `statsService.ts` into proper layers (separate ticket)
- **#82**: Replacing global queue state with EventBus (separate ticket)
- Refactoring the internal logic of any migrated file
- Adding new tests for existing functionality
- Changing any public API behavior
- Renaming functions or types beyond what is needed for file moves

---

## Acceptance Criteria (Gherkin)

### Scenario 1: Services directories no longer exist

```gherkin
Given the migration is complete
When I list directories under src/
Then neither "services" nor "shared/services" exists
And no file in the codebase imports from "@/services/" or "@/shared/services/"
```

### Scenario 2: Deprecated facades are removed

```gherkin
Given threadActionsExecutor.ts and contextActionsExecutor.ts are deleted
When I search for "executeThreadActions" or "executeActionsFromContext" in source code
Then zero results are found (excluding git history)
And all callers use GitLabReviewActionCliGateway or GitHubReviewActionCliGateway directly
```

### Scenario 3: threadActionsParser moves to interface-adapters

```gherkin
Given threadActionsParser.ts has moved to src/interface-adapters/adapters/reviewAction.parser.ts
When I run yarn verify
Then TypeScript compilation passes
And all tests that exercise parseThreadActions still pass
And the type re-exports from threadActionsParser are removed (types already in entities/reviewAction/)
```

### Scenario 4: commentLinkEnricher moves to interface-adapters

```gherkin
Given commentLinkEnricher.ts has moved to src/interface-adapters/adapters/commentLink.enricher.ts
When I run yarn verify
Then TypeScript compilation passes
And the enrichCommentWithLinks tests still pass
```

### Scenario 5: agentInstructionsBuilder moves to interface-adapters

```gherkin
Given agentInstructionsBuilder.ts has moved to src/interface-adapters/adapters/agentInstructions.builder.ts
When reviewContext.fileSystem.gateway.ts imports buildAgentInstructions
Then the import path uses "@/interface-adapters/adapters/agentInstructions.builder.js"
And yarn verify passes
```

### Scenario 6: reviewContextWatcher moves to interface-adapters

```gherkin
Given reviewContextWatcher.service.ts has moved to src/interface-adapters/gateways/reviewContextWatcher.gateway.ts
When I check src/main/dependencies.ts
Then it imports ReviewContextWatcherService from the new location
And all existing watcher tests pass without modification (beyond import paths)
```

### Scenario 7: shared/services utilities move to frameworks or foundation

```gherkin
Given all 12 files from src/shared/services/ are migrated
When I run yarn verify
Then TypeScript compilation passes
And all unit tests pass
And imports in src/main/cli.ts, src/frameworks/claude/claudeInvoker.ts, and other consumers use the new paths
```

### Scenario 8: Daemon-related files grouped together

```gherkin
Given daemonPaths.ts, daemonSpawner.ts, pidFileManager.ts, processChecker.ts, and logFileReader.ts
When they move to src/frameworks/daemon/
Then they form a cohesive module for daemon lifecycle management
And internal imports between them (e.g., daemonSpawner importing daemonPaths) use the new paths
```

### Scenario 9: No behavior changes

```gherkin
Given the full migration is complete
When I run the entire test suite with yarn test:ci
Then all existing tests pass
And no test has been modified beyond import path updates
And the application behavior is identical
```

### Scenario 10: defaultCommandExecutor survives facade deletion

```gherkin
Given threadActionsExecutor.ts is deleted
When callers need defaultCommandExecutor
Then it is available from a new location (e.g., src/frameworks/claude/commandExecutor.ts or inlined at call sites)
And yarn verify passes
```

---

## Implementation Plan (suggested staging)

The migration should be done in **5 sequential commits** to keep diffs reviewable:

| Stage | Scope | Files | Risk |
|---|---|---|---|
| **1** | Delete deprecated facades | `threadActionsExecutor.ts`, `contextActionsExecutor.ts` + update 5 callers to use gateways directly. Relocate `defaultCommandExecutor`. | Medium — callers change significantly |
| **2** | Move pure adapters | `threadActionsParser.ts`, `commentLinkEnricher.ts`, `agentInstructionsBuilder.ts` → `interface-adapters/adapters/` | Low — file moves + import updates |
| **3** | Move `reviewContextWatcher` | `reviewContextWatcher.service.ts` → `interface-adapters/gateways/` | Low — single file + 3 import sites |
| **4** | Move `shared/services/` to `frameworks/` and `foundation/` | All 12 files | Low — file moves + import updates, but high file count |
| **5** | Delete empty directories + final verification | Remove `src/services/`, `src/shared/services/`, `src/tests/units/services/`, `src/tests/units/shared/services/` | Low — cleanup |

**Note**: Stage 1 is the only stage with non-trivial code changes (replacing facade calls with direct gateway usage). Stages 2-5 are mechanical file moves and import rewrites.

---

## INVEST Validation

| Criterion | Assessment | Pass? |
|---|---|---|
| **Independent** | Can be implemented without other in-progress work. Blocked by #80 only for the `statsService.ts` split — the file can be moved as-is and split later. #82 (EventBus) is unrelated to file moves. | Yes |
| **Negotiable** | Target paths are a recommendation, not a contract. The team can adjust naming conventions. The staging plan is a suggestion. | Yes |
| **Valuable** | Eliminates architectural ambiguity. After this, every file lives in a layer that communicates its role. Removes 2 deprecated facades and their dead-code maintenance burden. | Yes |
| **Estimable** | 19 source files + 14 test files to move. ~15 import sites to update per file on average. Facade deletion requires updating 5 callers. Total: 3-5 days. | Yes |
| **Small** | 19 files is large but the work is mechanical (move + update imports). The staging plan breaks it into 5 commits of ~4 files each. Each stage is independently verifiable. | Yes (with staging) |
| **Testable** | `yarn verify` is the acceptance gate. Zero test logic changes — only import paths. Any test failure means a broken migration. | Yes |

---

## Definition of Done

- [ ] `src/services/` directory deleted
- [ ] `src/shared/services/` directory deleted
- [ ] `src/tests/units/services/` directory deleted
- [ ] `src/tests/units/shared/services/` directory deleted
- [ ] No import in the codebase references `@/services/` or `@/shared/services/`
- [ ] No import uses relative paths to old `services/` locations
- [ ] `threadActionsExecutor.ts` and `contextActionsExecutor.ts` are deleted (not moved)
- [ ] `defaultCommandExecutor` is preserved in a new location
- [ ] All files use `@/` alias imports with `.js` extension (no relative paths introduced)
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] No behavior changes — all existing tests pass with only import path modifications
- [ ] PR references issues #83, #78, #81

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| #80 not done yet → `statsService.ts` cannot be properly split | Medium | Move `statsService.ts` as-is to a temporary `src/interface-adapters/adapters/statsService.ts` and let #80 split it later. Or defer its move to #80. |
| Facade deletion breaks callers at runtime (not caught by types) | High | The 5 callers in controllers are well-tested. Run full test suite after stage 1. |
| Missed import references | Low | Use `grep -r "services/"` across the entire `src/` tree after migration. CI will catch any broken imports via typecheck. |
| Merge conflicts with parallel work | Medium | Coordinate with active PRs. The staging plan allows partial merge. |
