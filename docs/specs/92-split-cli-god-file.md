# Spec #92 — Split cli.ts God File into Per-Command Modules

**Issue**: [#92](https://github.com/DGouron/review-flow/issues/92)
**Labels**: cli, refactor, P2-important, architecture
**Milestone**: Architecture Cleanup
**Date**: 2026-03-14

---

## Problem Statement

`src/main/cli.ts` is a 794-line God File with 29 imports and 8 command handlers. Every new CLI command adds another reason to change this file, violating the Single Responsibility Principle. The file mixes argument dispatch, command execution logic, dependency interfaces, shared utilities, and infrastructure wiring — all in one place.

**Developer impact**: adding or modifying any command requires understanding the entire file. The blast radius of any change is the whole CLI surface. Test files import execute functions and dependency interfaces from a single monolithic source, making it unclear which pieces belong to which command.

---

## User Story

**As** a developer working on ReviewFlow CLI commands,
**I want** each command to live in its own module under `src/main/commands/`,
**So that** I can modify, test, and review individual commands without touching the rest of the CLI surface.

---

## Current State Analysis

### File: `src/main/cli.ts` (794 lines, 29 imports)

| Command | Execute Function | Dependencies Interface | Lines (approx) |
|---------|-----------------|----------------------|-----------------|
| `start` | `executeStart` | `StartDependencies` | L99-174 (~76) |
| `stop` | `executeStop` | `StopDeps` | L176-199 (~24) |
| `status` | `executeStatus` | `StatusDeps` | L201-226 (~26) |
| `logs` | `executeLogs` | `LogsDeps` | L228-260 (~33) |
| `followup-importants` | `executeFollowupImportants` | none (inline) | L262-277 (~16) |
| `init` | `executeInit` | `InitDependencies` | L300-451 (~152) |
| `discover` | `executeDiscover` | `DiscoverDependencies` | L453-519 (~67) |
| `validate` | `executeValidate` | none (inline) | L521-563 (~43) |

### Shared code in cli.ts

| Symbol | Lines | Used By |
|--------|-------|---------|
| `readVersion()` | L38-42 | dispatch (version command) |
| `printHelp()` | L44-97 | dispatch (help command) |
| `showBanner()` | L110-124 | `executeStart` |
| `DEFAULT_SCAN_PATHS` | L279-285 | `executeInit`, `executeDiscover` |
| `getGitRemoteUrl()` | L287-298 | dispatch wiring for init/discover |
| `PlatformChoice` type | L300 | `executeInit` |
| `WELCOME_BANNER` | L323-326 | `executeInit` |
| `createPidFileDeps()` | L565-572 | dispatch wiring for start/stop/status |
| dispatch switch | L574-794 | entry point |

### Existing tests (all import from `@/main/cli.js`)

| Test File | Imports |
|-----------|---------|
| `executeStart.test.ts` | `executeStart`, `StartDependencies` |
| `executeStop.test.ts` | `executeStop`, `StopDeps` |
| `executeStatus.test.ts` | `executeStatus`, `StatusDeps` |
| `executeLogs.test.ts` | `executeLogs`, `LogsDeps` |
| `executeDiscover.test.ts` | `executeDiscover`, `DiscoverDependencies` |
| `executeInit.test.ts` | `executeInit`, `InitDependencies`, `PlatformChoice` |

### Reference pattern: `executeDiscover` + `DiscoverDependencies`

This command already follows the target pattern: a typed `Dependencies` interface, a single exported `execute*` function, all infrastructure injected. The other commands should be extracted to match this structure.

---

## Decomposition Table

### Target structure

```
src/main/
├── cli.ts                              # Entry point only: parse args + dispatch
├── commands/
│   ├── start.command.ts                # executeStart + StartDependencies + showBanner
│   ├── stop.command.ts                 # executeStop + StopDeps
│   ├── status.command.ts               # executeStatus + StatusDeps
│   ├── logs.command.ts                 # executeLogs + LogsDeps
│   ├── init.command.ts                 # executeInit + InitDependencies + PlatformChoice + WELCOME_BANNER
│   ├── discover.command.ts             # executeDiscover + DiscoverDependencies
│   ├── validate.command.ts             # executeValidate (+ extract Dependencies interface)
│   └── followupImportants.command.ts   # executeFollowupImportants (+ extract Dependencies interface)
├── shared/
│   └── cliConstants.ts                 # DEFAULT_SCAN_PATHS, readVersion, printHelp
```

### Per-command extraction plan

| # | Source | Target File | Exports to Move | New Exports |
|---|--------|-------------|-----------------|-------------|
| 1 | `cli.ts` L126-174, L99-108, L110-124 | `commands/start.command.ts` | `executeStart`, `StartDependencies`, `showBanner` | — |
| 2 | `cli.ts` L183-199, L176-181 | `commands/stop.command.ts` | `executeStop`, `StopDeps` | — |
| 3 | `cli.ts` L207-226, L201-205 | `commands/status.command.ts` | `executeStatus`, `StatusDeps` | — |
| 4 | `cli.ts` L235-260, L228-233 | `commands/logs.command.ts` | `executeLogs`, `LogsDeps` | — |
| 5 | `cli.ts` L262-277 | `commands/followupImportants.command.ts` | `executeFollowupImportants` | `FollowupImportantsDependencies` (new) |
| 6 | `cli.ts` L328-451, L302-321, L300, L323-326 | `commands/init.command.ts` | `executeInit`, `InitDependencies`, `PlatformChoice`, `WELCOME_BANNER` | — |
| 7 | `cli.ts` L464-519, L453-462 | `commands/discover.command.ts` | `executeDiscover`, `DiscoverDependencies` | — |
| 8 | `cli.ts` L521-563 | `commands/validate.command.ts` | `executeValidate` | `ValidateDependencies` (new) |
| 9 | `cli.ts` L279-285, L38-42, L44-97 | `shared/cliConstants.ts` | `DEFAULT_SCAN_PATHS`, `readVersion`, `printHelp` | — |

### Commands needing a new Dependencies interface

Two commands currently use inline dependencies (`process.exit`, direct `console.log`, direct `existsSync` imports). The refactoring should introduce proper `Dependencies` interfaces for them:

- **`followupImportants`**: extract `readPidFile`, `isProcessRunning`, `FollowupImportantsUseCase` instantiation, `console.error`, `process.exit` into a `FollowupImportantsDependencies` interface.
- **`validate`**: extract `existsSync`, `readFileSync`, `getConfigDir`, `console.log`, `process.exit` into a `ValidateDependencies` interface.

---

## Acceptance Criteria (Gherkin)

### Scenario 1: Each command lives in its own module (nominal)

```gherkin
Given the refactoring is complete
When I list files in src/main/commands/
Then I find exactly 8 files: start.command.ts, stop.command.ts, status.command.ts, logs.command.ts, init.command.ts, discover.command.ts, validate.command.ts, followupImportants.command.ts
And each file exports one execute function and one Dependencies interface
```

### Scenario 2: cli.ts is reduced to entry point only

```gherkin
Given the refactoring is complete
When I read src/main/cli.ts
Then it contains only: import statements for command modules, parseCliArgs call, version/help handling, and a dispatch switch
And its line count is under 120 lines
And it contains zero business logic (no use case instantiation, no direct I/O)
```

### Scenario 3: All existing tests pass without modification

```gherkin
Given the refactoring is complete
When I run yarn test:ci
Then all existing tests pass
And the only test changes are updated import paths (from @/main/cli.js to @/main/commands/<command>.command.js)
```

### Scenario 4: Import paths updated in test files

```gherkin
Given executeStart.test.ts imports executeStart and StartDependencies
When the refactoring moves executeStart to commands/start.command.ts
Then executeStart.test.ts imports from @/main/commands/start.command.js
And no other test changes are needed (same function signatures, same interface shapes)
```

### Scenario 5: yarn verify passes (full quality gate)

```gherkin
Given all command modules are extracted
When I run yarn verify
Then TypeScript type-checking passes
And Biome linting passes
And all tests pass
```

### Scenario 6: No behavioral change (pure structural refactoring)

```gherkin
Given the refactoring is complete
When I run reviewflow start, reviewflow stop, reviewflow status, reviewflow logs, reviewflow init, reviewflow discover, reviewflow validate, reviewflow followup-importants
Then each command behaves identically to before the refactoring
And the same exit codes are produced for the same inputs
```

### Scenario 7: Shared constants are centralized (edge case)

```gherkin
Given DEFAULT_SCAN_PATHS is used by both init and discover commands
When both commands are extracted to separate modules
Then both import DEFAULT_SCAN_PATHS from @/main/shared/cliConstants.js
And the constant is defined in exactly one place
```

### Scenario 8: followupImportants and validate get proper Dependencies interfaces (improvement)

```gherkin
Given executeFollowupImportants currently uses process.exit and console.error directly
When it is extracted to commands/followupImportants.command.ts
Then it receives a FollowupImportantsDependencies parameter with log, error, exit, and gateway functions
And executeValidate similarly receives a ValidateDependencies parameter
```

---

## Out of Scope

| Item | Reason |
|------|--------|
| Adding new CLI commands | This is a structural refactoring, not a feature addition |
| Changing command behavior | Pure extraction — same inputs, same outputs, same exit codes |
| Refactoring `parseCliArgs` | Separate file, separate concern, separate scope |
| Changing the use case layer (`src/usecases/cli/`) | Already properly structured, not part of this refactoring |
| Adding new tests for existing behavior | Tests already exist; only import paths change |
| Moving the dispatch wiring helpers (`createPidFileDeps`, `getGitRemoteUrl`) to a separate file | Keep in `cli.ts` — they are dispatch wiring concerns |
| Renaming `StopDeps` to `StopDependencies` | Naming consistency improvement, but out of scope — separate ticket if desired |

---

## Technical Notes

### Strangler Fig approach

Extract one command at a time, keeping `cli.ts` working throughout. Each extraction is a standalone commit:

1. Create `commands/` directory
2. Extract command N: move function + interface + private helpers to `commands/<name>.command.ts`
3. Update `cli.ts`: replace inline code with import from new module
4. Update test file: change import path
5. Run `yarn verify`
6. Repeat for next command

This means every intermediate state is green. If a command extraction breaks something, the blast radius is one command.

### Import rule compliance

All new modules use `@/` alias + `.js` extension. Example:

```typescript
// In commands/start.command.ts
import { StartDaemonUseCase, type StartDaemonDependencies } from '@/usecases/cli/startDaemon.usecase.js';
import { formatStartupBanner } from '@/cli/startupBanner.js';

// In cli.ts (after extraction)
import { executeStart, type StartDependencies } from '@/main/commands/start.command.js';
```

### Test migration

Tests change only their import source. Function signatures and interface shapes remain identical:

```typescript
// Before
import { executeStart, type StartDependencies } from '@/main/cli.js';

// After
import { executeStart, type StartDependencies } from '@/main/commands/start.command.js';
```

---

## Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| None | — | This refactoring has zero external dependencies |

---

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | No dependencies on other issues; self-contained structural change | PASS |
| **Negotiable** | Shared constants location negotiable (inline vs separate file); `Dependencies` interface for `followupImportants`/`validate` optional but recommended | PASS |
| **Valuable** | Reduces cognitive load for CLI development; each command independently modifiable and reviewable; eliminates God File smell | PASS |
| **Estimable** | 8 commands to extract, each is mechanical move + import update; ~1-2 hours per command; total 1-2 days | PASS |
| **Small** | Pure structural refactoring with no behavioral change; decomposable into 8 independent extractions (one per command) | PASS |
| **Testable** | 8 Gherkin scenarios; `yarn verify` as gate; existing tests validate no behavioral regression | PASS |

---

## Suggested Implementation Order

The Strangler Fig approach means each step is independently committable:

| Step | Command | Complexity | Rationale |
|------|---------|------------|-----------|
| 1 | `stop` | Low (24 lines) | Smallest, simplest — validates the extraction pattern |
| 2 | `status` | Low (26 lines) | Same shape as stop |
| 3 | `logs` | Low (33 lines) | Same shape |
| 4 | `start` | Medium (76 lines) | Includes private `showBanner` helper |
| 5 | `validate` | Medium (43 lines) | Needs new `ValidateDependencies` interface |
| 6 | `followupImportants` | Medium (16 lines) | Needs new `FollowupImportantsDependencies` interface |
| 7 | `discover` | Medium (67 lines) | Depends on `DEFAULT_SCAN_PATHS` — extract shared constants first |
| 8 | `init` | High (152 lines) | Largest command, most dependencies, depends on `DEFAULT_SCAN_PATHS` |

Step 7 should create `shared/cliConstants.ts` with `DEFAULT_SCAN_PATHS` before extracting `discover`, so that step 8 (`init`) can import from the same location.

---

## Definition of Done

- [ ] 8 command files exist under `src/main/commands/` following naming convention `<name>.command.ts`
- [ ] `cli.ts` is reduced to entry point: parse args, dispatch to command modules (under 120 lines)
- [ ] Each command module exports one `execute*` function and one `*Dependencies` interface
- [ ] `followupImportants` and `validate` have proper `Dependencies` interfaces (no direct `process.exit`/`console.log`)
- [ ] Shared constants (`DEFAULT_SCAN_PATHS`) are in `src/main/shared/cliConstants.ts`
- [ ] All test files updated to import from `@/main/commands/<name>.command.js`
- [ ] All existing tests pass without behavioral changes
- [ ] No new test files needed (only import path updates in existing tests)
- [ ] `yarn verify` passes (typecheck + lint + test:ci)
- [ ] Zero behavioral change — all commands produce identical output for identical input
