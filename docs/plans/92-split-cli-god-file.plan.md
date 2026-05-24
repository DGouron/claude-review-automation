# Plan — Spec #92 Split cli.ts God File into Per-Command Modules

**Spec**: `docs/specs/92-split-cli-god-file.md`
**Type**: Refactoring (Strangler Fig). No behavioral change. No new tests.
**Tracker**: `docs/feature-tracker.md` (status to flip `drafted` → `planned`)

---

## Current State Verification (2026-05-24)

`src/main/cli.ts` is **794 lines** — matches spec.

### Verified line ranges (cli.ts)

| Symbol | Spec range | Actual range | Status |
|--------|-----------|--------------|--------|
| `readVersion` | L38-42 | L38-42 | OK |
| `printHelp` | L44-97 | L44-97 | OK |
| `StartDependencies` | L99-108 (implied) | L99-108 | OK |
| `showBanner` | L110-124 | L110-124 | OK |
| `executeStart` | L99-174 (block) | L126-174 (function body), interface L99-108, helper L110-124 | OK |
| `StopDeps` | L176-181 | L176-181 | OK |
| `executeStop` | L176-199 (block) | L183-199 | OK |
| `StatusDeps` | L201-205 | L201-205 | OK |
| `executeStatus` | L201-226 (block) | L207-226 | OK |
| `LogsDeps` | L228-233 | L228-233 | OK |
| `executeLogs` | L228-260 (block) | L235-260 | OK |
| `executeFollowupImportants` | L262-277 | L262-277 | OK |
| `DEFAULT_SCAN_PATHS` | L279-285 | L279-285 | OK |
| `getGitRemoteUrl` | L287-298 | L287-298 | OK |
| `PlatformChoice` | L300 | L300 | OK |
| `InitDependencies` | L302-321 | L302-321 | OK |
| `WELCOME_BANNER` | L323-326 | L323-326 | OK |
| `executeInit` | L300-451 (block) | L328-451 | OK |
| `DiscoverDependencies` | L453-462 | L453-462 | OK |
| `executeDiscover` | L453-519 (block) | L464-519 | OK |
| `executeValidate` | L521-563 | L521-563 | OK |
| `createPidFileDeps` | L565-572 | L565-572 | OK |
| dispatch switch | L574-794 | L574-794 (ends L793, brace L794) | OK |

**All line ranges from the spec are accurate.**

### Test files verification

All 6 test files exist under `src/tests/units/main/`. The spec's claim "all import from `@/main/cli.js`" is partially wrong:

| Test file | Current import path |
|-----------|--------------------|
| `executeStart.test.ts` | `../../../main/cli.js` (relative) |
| `executeStop.test.ts` | `../../../main/cli.js` (relative) |
| `executeStatus.test.ts` | `../../../main/cli.js` (relative) |
| `executeLogs.test.ts` | `../../../main/cli.js` (relative) |
| `executeDiscover.test.ts` | `@/main/cli.js` (alias) |
| `executeInit.test.ts` | `@/main/cli.js` (alias) |

**Deviation flag**: 4 of 6 test files use relative imports — a violation of project rule (`@/` + `.js` mandatory). Updating their imports is in-scope (Scenario 4 covers test import updates). Move them to `@/main/commands/<name>.command.js`.

No `executeFollowupImportants.test.ts` or `executeValidate.test.ts` exists today. Per spec ("no new tests, only import path updates"), none will be created.

---

## Reference pattern — `executeDiscover` / `DiscoverDependencies`

```typescript
export interface DiscoverDependencies {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, content: string) => void;
  readdirSync: (path: string) => Array<{ name: string; isDirectory: () => boolean }>;
  getGitRemoteUrl: (localPath: string) => string | null;
  getConfigPath: () => string;
  log: (...args: unknown[]) => void;
  selectRepositories: (repositories: DiscoveredRepository[]) => Promise<DiscoveredRepository[]>;
}

export async function executeDiscover(
  scanPaths: string[],
  maxDepth: number,
  deps: DiscoverDependencies,
): Promise<void> { /* ... */ }
```

**Pattern characteristics**:
- All I/O (`existsSync`, `readFileSync`, `writeFileSync`, `readdirSync`) injected as deps
- All side effects (`log`, `selectRepositories`, `getGitRemoteUrl`) injected
- `getConfigPath` is a factory function (not a path string) so deps stay pure
- No `process.exit` — function returns void via early returns
- Use cases are instantiated inside `execute*` (not injected), wired with deps fields

The 8 commands target this shape.

---

## Proposed new Dependencies interfaces

### `FollowupImportantsDependencies` (new — for `executeFollowupImportants`)

Current external calls in `executeFollowupImportants` (cli.ts L262-277):
- `readPidFile(PID_FILE_PATH)` → file I/O
- `isProcessRunning(pidData.pid)` → process check
- `console.error(...)` → stderr
- `process.exit(1)` → exit
- `new FollowupImportantsUseCase({ serverPort, log, error, fetch })` → factory dep
- `console.log`, `console.error`, `globalThis.fetch` → passed into use case

Proposed shape:

```typescript
export interface FollowupImportantsDependencies {
  readPidFile: () => { pid: number; port: number } | null;
  isProcessRunning: (pid: number) => boolean;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => void;
  fetch: typeof globalThis.fetch;
}

export async function executeFollowupImportants(
  project: string | undefined,
  deps: FollowupImportantsDependencies,
): Promise<void>;
```

Wiring (in `cli.ts` dispatch) supplies `readPidFile: () => readPidFile(PID_FILE_PATH)`, `isProcessRunning`, `console.log`, `console.error`, `process.exit`, `globalThis.fetch`.

### `ValidateDependencies` (new — for `executeValidate`)

Current external calls in `executeValidate` (cli.ts L521-563):
- `getConfigDir()` → returns directory string
- `process.cwd()` → cwd string
- `existsSync(path)` (3 calls)
- `readFileSync` (passed into `ValidateConfigUseCase` constructor)
- `console.log` (5 calls)
- `process.exit(1)` (2 calls)
- `new ValidateConfigUseCase({ existsSync, readFileSync })` → instantiated inside

Proposed shape:

```typescript
export interface ValidateDependencies {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  getConfigDir: () => string;
  getCwd: () => string;
  log: (...args: unknown[]) => void;
  exit: (code: number) => void;
}

export function executeValidate(fix: boolean, deps: ValidateDependencies): void;
```

Wiring (in `cli.ts` dispatch) supplies `existsSync`, `readFileSync` from `node:fs`, `getConfigDir`, `process.cwd`, `console.log`, `process.exit`.

---

## Per-Step Extraction Order (Strangler Fig)

Each step is one commit. `yarn verify` between every step.

### Step 1 — Create shared/cliConstants.ts (foundation first)

| Field | Value |
|-------|-------|
| **Source** | cli.ts L38-42 (`readVersion`), L44-97 (`printHelp`), L279-285 (`DEFAULT_SCAN_PATHS`) |
| **Target** | `src/main/shared/cliConstants.ts` |
| **Exports** | `readVersion`, `printHelp`, `DEFAULT_SCAN_PATHS` |
| **cli.ts diff** | Remove L38-97 and L279-285; add `import { readVersion, printHelp, DEFAULT_SCAN_PATHS } from '@/main/shared/cliConstants.js'` |
| **Tests to update** | none (these helpers aren't unit-tested today) |
| **Validation** | `yarn verify` |

**Rationale for going first**: `DEFAULT_SCAN_PATHS` is consumed by both `discover` and `init`. Extracting it first means later steps just `import` it without back-and-forth.

### Step 2 — commands/stop.command.ts (smallest, safest, validates the pattern)

| Field | Value |
|-------|-------|
| **Source** | cli.ts L176-199 |
| **Target** | `src/main/commands/stop.command.ts` |
| **Exports** | `executeStop`, `StopDeps` (name preserved per spec out-of-scope rule) |
| **Imports needed in target** | `StopDaemonUseCase`, `StopDaemonDependencies`, `green`, `red`, `yellow` |
| **cli.ts diff** | Remove L176-199; add `import { executeStop, type StopDeps } from '@/main/commands/stop.command.js'` |
| **Test update** | `executeStop.test.ts`: change `../../../main/cli.js` → `@/main/commands/stop.command.js` |
| **Validation** | `yarn verify` |

### Step 3 — commands/status.command.ts

| Field | Value |
|-------|-------|
| **Source** | cli.ts L201-226 |
| **Target** | `src/main/commands/status.command.ts` |
| **Exports** | `executeStatus`, `StatusDeps` |
| **Imports needed in target** | `QueryStatusUseCase`, `QueryStatusDependencies`, `green`, `red`, `dim`, `bold` |
| **cli.ts diff** | Remove L201-226; add import |
| **Test update** | `executeStatus.test.ts` → `@/main/commands/status.command.js` |
| **Validation** | `yarn verify` |

### Step 4 — commands/logs.command.ts

| Field | Value |
|-------|-------|
| **Source** | cli.ts L228-260 |
| **Target** | `src/main/commands/logs.command.ts` |
| **Exports** | `executeLogs`, `LogsDeps` |
| **Imports needed in target** | `ReadLogsUseCase`, `ReadLogsDependencies`, `yellow` |
| **Note** | Function references `process.on('SIGINT', ...)` and `process.exit(0)` inside the `following` branch — keep these as direct calls (lifecycle signal handling is wiring, not business logic). Spec does not require extracting them. |
| **cli.ts diff** | Remove L228-260; add import |
| **Test update** | `executeLogs.test.ts` → `@/main/commands/logs.command.js` |
| **Validation** | `yarn verify` |

### Step 5 — commands/start.command.ts (includes private `showBanner`)

| Field | Value |
|-------|-------|
| **Source** | cli.ts L99-174 (interface + helper + function) |
| **Target** | `src/main/commands/start.command.ts` |
| **Exports** | `executeStart`, `StartDependencies` |
| **Private** | `showBanner` stays module-private (not exported) |
| **Imports needed in target** | `StartDaemonUseCase`, `StartDaemonDependencies`, `formatStartupBanner`, `yellow` |
| **cli.ts diff** | Remove L99-174; add import |
| **Test update** | `executeStart.test.ts` → `@/main/commands/start.command.js` |
| **Validation** | `yarn verify` |

### Step 6 — commands/validate.command.ts (NEW ValidateDependencies interface)

| Field | Value |
|-------|-------|
| **Source** | cli.ts L521-563 |
| **Target** | `src/main/commands/validate.command.ts` |
| **Exports** | `executeValidate`, `ValidateDependencies` (new) |
| **Interface** | See "Proposed new Dependencies interfaces" above |
| **Imports needed in target** | `ValidateConfigUseCase`, `green`, `red`, `yellow`, `dim`, `bold` (NO direct `existsSync`/`readFileSync`/`getConfigDir`/`process.*`/`console.*` imports — all via deps) |
| **cli.ts diff** | Remove L521-563; add import + wire deps in dispatch (`existsSync`, `readFileSync`, `getConfigDir`, `process.cwd`, `console.log`, `process.exit`) |
| **Test update** | none (no existing test file) |
| **Validation** | `yarn verify` |

### Step 7 — commands/followupImportants.command.ts (NEW FollowupImportantsDependencies)

| Field | Value |
|-------|-------|
| **Source** | cli.ts L262-277 |
| **Target** | `src/main/commands/followupImportants.command.ts` |
| **Exports** | `executeFollowupImportants`, `FollowupImportantsDependencies` (new) |
| **Interface** | See "Proposed new Dependencies interfaces" above |
| **Imports needed in target** | `FollowupImportantsUseCase`, `red` |
| **cli.ts diff** | Remove L262-277; add import + wire deps in dispatch (`readPidFile`, `isProcessRunning`, `console.*`, `process.exit`, `globalThis.fetch`) |
| **Test update** | none (no existing test file) |
| **Validation** | `yarn verify` |

### Step 8 — commands/discover.command.ts

| Field | Value |
|-------|-------|
| **Source** | cli.ts L453-519 |
| **Target** | `src/main/commands/discover.command.ts` |
| **Exports** | `executeDiscover`, `DiscoverDependencies` |
| **Imports needed in target** | `DiscoverRepositoriesUseCase`, `DiscoveredRepository`, `AddRepositoriesToConfigUseCase`, `green`, `yellow`, `dim`, `DEFAULT_SCAN_PATHS` from `@/main/shared/cliConstants.js` |
| **cli.ts diff** | Remove L453-519; add import |
| **Test update** | `executeDiscover.test.ts` → `@/main/commands/discover.command.js` |
| **Validation** | `yarn verify` |

### Step 9 — commands/init.command.ts (largest, last)

| Field | Value |
|-------|-------|
| **Source** | cli.ts L300-451 (`PlatformChoice`, `InitDependencies`, `WELCOME_BANNER`, `executeInit`) |
| **Target** | `src/main/commands/init.command.ts` |
| **Exports** | `executeInit`, `InitDependencies`, `PlatformChoice` |
| **Module-private** | `WELCOME_BANNER` |
| **Imports needed in target** | `DiscoverRepositoriesUseCase`, `DiscoveredRepository`, `DiscoverRepositoriesResult`, `ConfigureMcpResult`, `WriteInitConfigUseCase`, `WriteInitConfigInput`, `WriteInitConfigResult`, `InitSummaryInput`, `PrerequisitesResult`, `green`, `red`, `yellow`, `dim`, `bold`, `DEFAULT_SCAN_PATHS` |
| **cli.ts diff** | Remove L300-326 and L328-451; add import |
| **Test update** | `executeInit.test.ts` → `@/main/commands/init.command.js` |
| **Validation** | `yarn verify` |

### Step 10 — Final cli.ts cleanup verification

After step 9, `cli.ts` should contain only:
- Shebang + imports (command modules, `parseCliArgs`, dispatch wiring helpers, `createPidFileDeps`, `getGitRemoteUrl`)
- `getGitRemoteUrl` (per spec out-of-scope: stays in cli.ts)
- `createPidFileDeps` (per spec out-of-scope: stays in cli.ts)
- `isDirectlyExecuted` guard + `parseCliArgs` call
- `switch (args.command)` dispatch block

Expected final line count: ~110-120 (Scenario 2 requires **< 120 lines**).

**Validation gate**: `yarn verify` + manual smoke (`reviewflow --help`, `reviewflow --version`).

---

## Final structure

```
src/main/
├── cli.ts                              # < 120 lines: parse + dispatch only
├── shared/
│   └── cliConstants.ts                 # readVersion, printHelp, DEFAULT_SCAN_PATHS
└── commands/
    ├── start.command.ts                # executeStart + StartDependencies (+ private showBanner)
    ├── stop.command.ts                 # executeStop + StopDeps
    ├── status.command.ts               # executeStatus + StatusDeps
    ├── logs.command.ts                 # executeLogs + LogsDeps
    ├── init.command.ts                 # executeInit + InitDependencies + PlatformChoice
    ├── discover.command.ts             # executeDiscover + DiscoverDependencies
    ├── validate.command.ts             # executeValidate + ValidateDependencies (NEW)
    └── followupImportants.command.ts   # executeFollowupImportants + FollowupImportantsDependencies (NEW)
```

---

## Risks & Deviations

| Risk | Mitigation |
|------|-----------|
| Test files use relative imports today (4 of 6) | Update them to `@/main/commands/<name>.command.js` during the per-step migration (in-scope per Scenario 4) |
| `executeLogs` uses `process.on('SIGINT')` + `process.exit(0)` directly | Out-of-scope to inject — keep as is. Spec only requires NEW Dependencies for `followupImportants` and `validate` |
| `executeFollowupImportants` and `executeValidate` have no existing tests | Per spec "No new tests, only import path updates" — do not add tests, even though new Dependencies interfaces would make them trivially testable |
| `StopDeps`/`StatusDeps`/`LogsDeps` naming inconsistent with `StartDependencies`/`InitDependencies`/`DiscoverDependencies` | Out-of-scope per spec ("Renaming `StopDeps` to `StopDependencies` … separate ticket if desired") |
| `getGitRemoteUrl` and `createPidFileDeps` stay in `cli.ts` | Per spec out-of-scope ("dispatch wiring concerns") — do NOT move them |
| Order: `discover` (step 8) depends on `DEFAULT_SCAN_PATHS` from step 1 | Step 1 extracts `cliConstants.ts` first; init (step 9) also depends on it. Order respected. |
| Spec's suggested step order differed (puts `start` before `validate`/`followup`) | Plan keeps spec's overall philosophy (smallest first) but swaps to ensure constants extraction first since it's a prerequisite for `discover`/`init` |

---

## Acceptance Validation

After step 10, verify against spec Scenarios:

| Scenario | Validation method |
|----------|------------------|
| #1 — 8 files in `commands/` | `ls src/main/commands/` |
| #2 — cli.ts < 120 lines, no business logic | `wc -l src/main/cli.ts`, grep for `new .*UseCase\(` (should be zero) |
| #3 — all tests pass | `yarn test:ci` |
| #4 — test imports updated | grep `from '@/main/cli` and `from '../../../main/cli` in `src/tests/units/main/` (should be zero) |
| #5 — `yarn verify` | green |
| #6 — no behavioral change | smoke test each command — `reviewflow --help`, `--version`, `status` |
| #7 — `DEFAULT_SCAN_PATHS` centralized | grep `DEFAULT_SCAN_PATHS = [` (should appear exactly once, in `cliConstants.ts`) |
| #8 — new Dependencies interfaces | grep `FollowupImportantsDependencies` and `ValidateDependencies` exports |

---

## Out of Scope (per spec — DO NOT do)

- Rename `StopDeps` → `StopDependencies`
- Move `createPidFileDeps` or `getGitRemoteUrl` out of `cli.ts`
- Modify use case layer (`src/modules/cli-configuration/usecases/cli/`)
- Add new test files
- Change command behavior or exit codes
- Refactor `parseCliArgs`
