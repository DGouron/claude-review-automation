# Plan — SPEC-170 Pre-built Worktree Lifecycle

**Spec**: `docs/specs/170-prebuilt-worktree-lifecycle.md`
**Status**: planned
**New bounded context**: `src/modules/worktree-management/`
**Depends on**: SPEC-169 (deployed)

---

## 1. Architectural Decisions (recap — non-negotiable)

These three decisions were validated with the user and are baked into the plan. They short-circuit ~60% of the original spec's complexity.

1. **No mapping store.** The worktree path `~/.reviewflow/worktrees/<platform>-<projectSlug>-<mrNumber>` deterministically encodes MR identity. Whether a worktree is "still needed" is answered by `getActiveMrs(projectPath)` on `ReviewRequestTrackingGateway` (already file-backed, already the source of truth elsewhere). No additional persistence is introduced. This invalidates spec FR-5 ("clear mapping"), FR-2 step 4 ("orphan mapping"), and parts of FR-6 — they collapse to filesystem ops + tracking lookups.
2. **Worktrees live outside the source checkout** at `~/.reviewflow/worktrees/<platform>-<project-slug>-<mrNumber>/`. The spec's `<localPath>/.reviewflow-worktrees/...` is **overridden**. Rationale: keeps the source checkout pristine (no nested `.reviewflow-worktrees/` polluting the repo), centralises sweep target, and decouples disk planning from the operator's project layout. A `WORKTREE_BASE_DIR` constant lives next to `daemonPaths.ts`.
3. **Per-MR serialization** = extend the existing `p-queue` in `src/frameworks/queue/pQueueAdapter.ts` with an MR-scoped concurrency key. The current `activeJobs` Map already enforces "no concurrent same-MR job" by `job.id`. We extend that to cover the followup job id which uses a different prefix (`gitlab-followup:...`). **No new dep, no mutex, no file-lock, no `p-limit`.**

---

## 2. Bounded Context Layout (`src/modules/worktree-management/`)

Mirroring `src/modules/claude-invocation/` shape.

```
src/modules/worktree-management/
├── entities/
│   └── worktree/
│       ├── worktree.schema.ts            # WorktreeIdentity (platform/project/mrNumber), WorktreePath (branded), MrSource (origin|fork)
│       ├── worktree.ts                   # pure helpers: deriveWorktreePath, deriveWorktreeSlug, deriveFetchRef
│       ├── worktree.guard.ts             # parseWorktreeIdentity, isValidWorktreeIdentity
│       └── worktree.gateway.ts           # WorktreeGateway contract (create/update/remove/exists/list)
│   └── gitCommand/
│       ├── gitCommand.schema.ts          # GitFetchCommand, GitWorktreeAddCommand, GitWorktreeRemoveCommand, GitResetHardCommand
│       └── gitCommand.gateway.ts         # GitCommandExecutor contract (single method: execute(command) → Result)
├── usecases/
│   ├── ensureWorktree.usecase.ts         # FR-2 create-or-reuse, idempotent
│   ├── removeWorktree.usecase.ts         # FR-5 cleanup on merge/close
│   └── sweepStaleWorktrees.usecase.ts    # FR-6 daily safety net
├── interface-adapters/
│   └── gateways/
│       ├── worktree.fileSystem.gateway.ts   # WorktreeGateway impl: knows WORKTREE_BASE_DIR, mkdir, fs.stat for mtime, listdir
│       └── gitCommand.cli.gateway.ts        # GitCommandExecutor impl: spawn `git ...` via shared/foundation/commandExecutor.ts
└── services/
    └── worktreeSettingsWriter.ts            # FR-4: writes `.claude/settings.json` with bgIsolation:"none" into the worktree
```

**No `index.ts`**. All cross-module imports use `@/` + `.js`.

### Key types (interfaces, not code)

- `WorktreeIdentity = { platform: 'gitlab' | 'github'; projectPath: string; mrNumber: number }`
- `WorktreePath = string & { readonly __brand: 'WorktreePath' }`
- `MrSource = { kind: 'origin' } | { kind: 'fork'; cloneUrl: string }` (fork detected upstream in webhook controller from `event.pull_request.head.repo.full_name !== base.repo.full_name`)
- `WorktreeGateway.ensure(identity, sourceBranch, mrSource): Promise<EnsureResult>` where `EnsureResult = { status: 'created' | 'reused'; path: WorktreePath } | { status: 'failed'; reason: string }`
- `WorktreeGateway.remove(identity): Promise<RemoveResult>` where `RemoveResult = { status: 'removed' | 'absent' | 'failed'; warning: string | null }`
- `WorktreeGateway.list(): Promise<WorktreeEntry[]>` where `WorktreeEntry = { identity: WorktreeIdentity; path: WorktreePath; mtime: Date }`

---

## 3. Per-FR Implementation Mapping

| FR | Capability | Delivered by |
|----|-----------|--------------|
| FR-1 | Path convention `~/.reviewflow/worktrees/<platform>-<projectSlug>-<mrNumber>/` | `deriveWorktreePath()` in `entities/worktree/worktree.ts` + `WORKTREE_BASE_DIR` constant in `shared/services/daemonPaths.ts` (touched file) |
| FR-2 | Create-or-reuse logic | `ensureWorktree.usecase.ts` orchestrates: `WorktreeGateway.exists()` → either `GitCommandExecutor.execute(fetch + worktree add)` or `GitCommandExecutor.execute(fetch + reset --hard)`. The "orphan mapping" branch from spec FR-2.4 disappears — we only check filesystem |
| FR-3 | Dispatch from worktree cwd | **Modified file**: `src/frameworks/claude/claudeInvoker.ts` — `invokeViaBackgroundSession` calls `ensureWorktree` use case before `runClaudeReviewJob`, then passes the resulting `WorktreePath` as `localPath` into `DispatchInput`. Original `job.localPath` is preserved for tracking/stats — only the dispatch cwd changes |
| FR-4 | `bgIsolation: "none"` | `worktreeSettingsWriter.ts` writes `<worktreePath>/.claude/settings.json` on creation. Called by `ensureWorktree` use case after `git worktree add` succeeds |
| FR-5 | Cleanup on merge/close | **Modified files**: `gitlab.controller.ts` (in `closeResult` branch around line 113, and `mergeResult` branch around line 159) and `github.controller.ts` (in `closeResult` branch around line 93). Each branch calls `removeWorktree.execute({ identity })` after the existing `archive()` + context delete |
| FR-6 | Daily sweep | `sweepStaleWorktrees.usecase.ts` — iterates `WorktreeGateway.list()`, cross-references each entry with `trackingGateway.getById()` and `getByState('merged'|'closed')`. Removes if (closed >24h ago) OR (no tracked MR exists) OR (mtime >7 days). Wired into a **new file** `src/frameworks/scheduler/worktreeSweepScheduler.ts` mirroring `cleanupScheduler.ts` |
| FR-7 | System prompt slimming | **Modified file**: `src/frameworks/claude/claudeInvoker.ts` — `buildMcpSystemPrompt()` drops the entire "⛔ CRITICAL: Data Source Rules" section (lines ~345-360 today). Also drops the `diffSourceCommand` / `metadataSourceCommand` interpolation, since `glab mr diff` is no longer prescribed. The MCP `get_threads` rule stays |
| FR-8 | GitHub cross-fork PR | `deriveFetchRef()` in `entities/worktree/worktree.ts` returns either `{ remote: 'origin', refspec: '<branch>' }` for same-repo PRs or `{ remote: '<cloneUrl>', refspec: '<branch>:refs/remotes/pr-<n>/head' }` for forks. `MrSource` is propagated from webhook controller → `ensureWorktree` input |
| FR-9 | Per-MR serialization | **Modified file**: `src/frameworks/queue/pQueueAdapter.ts` — `createJobId` already returns `platform:project:mrNumber`. The `activeJobs.has(job.id)` guard at line 161 currently *rejects* the second job (returns false). For followups arriving within the deduplication window we need to **queue** the second instead of dropping it. New helper `createMrConcurrencyKey(platform, projectPath, mrNumber)` plus a per-key `Promise` chain held in a `Map<string, Promise<void>>`. Each enqueue awaits the previous chain entry for its MR key before starting. Other MRs unaffected. (Detail in section 5.) |

---

## 4. Test-First Sequence (TDD inside-out + Acceptance outer loop)

### 4.1 Outer loop — Acceptance test (RED first, GREEN last)

`src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts`

Scenarios (mapped 1:1 to Gherkin in spec §Gherkin Scenarios):
1. First review creates worktree on source branch + dispatches with worktree cwd
2. Followup reuses worktree with fetch + reset --hard
3. `merged` webhook removes worktree
4. `closed` webhook removes worktree
5. Cleanup error logged but does not block webhook response
6. Daily sweep removes worktrees of MRs closed >24h ago
7. Daily sweep removes orphan worktrees (no tracked MR)
8. Daily sweep removes worktrees with mtime >7 days
9. GitHub fork PR fetches from fork URL
10. Two followups <5s apart serialized via MR-key chain
11. `buildMcpSystemPrompt` no longer contains "UNRELIABLE" / "FORBIDDEN" / `glab mr diff` strings

Test scaffolding:
- Stub gateways (see 4.4) so no real git invocation
- Helper `createWebhookHarness()` already exists from SPEC-46 acceptance test — reuse
- For sweep: inject fake clock via `now: () => new Date(...)` and fake mtime via `WorktreeFakeGateway`

### 4.2 Inner loop — Unit tests (order, RED → GREEN → REFACTOR per file)

```
Step 1  src/tests/units/modules/worktree-management/entities/worktree/worktree.test.ts
        - deriveWorktreePath('gitlab', 'group/proj', 4242) → '<HOME>/.reviewflow/worktrees/gitlab-group-proj-4242'
        - deriveWorktreeSlug normalizes '/' → '-'
        - deriveFetchRef returns origin refspec for same-repo MR
        - deriveFetchRef returns fork URL refspec for cross-fork PR
        - parseWorktreeIdentity round-trip via guard

Step 2  src/tests/units/modules/worktree-management/usecases/ensureWorktree.usecase.test.ts
        - First call → status:'created', executes fetch + worktree add + writeSettings
        - Second call same identity → status:'reused', executes fetch + reset --hard, no second worktree add
        - Fork MrSource → fetches from fork URL, worktree add on refs/remotes/pr-<n>/head
        - Git command failure → status:'failed', reason surfaced, no settings written
        - Settings write failure → status:'failed' (worktree rolled back? — see Risks §6)

Step 3  src/tests/units/modules/worktree-management/usecases/removeWorktree.usecase.test.ts
        - Existing worktree → 'removed'
        - Absent worktree → 'absent', no error
        - git worktree remove fails → 'failed' with warning, idempotent

Step 4  src/tests/units/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.test.ts
        - MR closed 25h ago → removed
        - MR closed 20h ago → kept
        - Worktree without matching tracked MR → removed (orphan)
        - Worktree mtime 8 days → removed regardless of state
        - Worktree mtime 6 days, MR open → kept
        - Removal error logged but loop continues for other entries

Step 5  src/tests/units/modules/worktree-management/interface-adapters/gateways/worktree.fileSystem.gateway.test.ts
        - ensure() creates directory if missing
        - list() reads WORKTREE_BASE_DIR, returns entries with mtime from fs.stat
        - remove() invokes GitCommandExecutor with 'git worktree remove --force <path>'

Step 6  src/tests/units/modules/worktree-management/interface-adapters/gateways/gitCommand.cli.gateway.test.ts
        - Builds correct argv per GitFetchCommand/GitWorktreeAddCommand/GitWorktreeRemoveCommand/GitResetHardCommand
        - Surfaces exitCode + stderr in Result
        - Uses provided cwd (from worktree path for fetch-in-worktree case)

Step 7  src/tests/units/modules/worktree-management/services/worktreeSettingsWriter.test.ts
        - Writes JSON with bgIsolation:"none" at <path>/.claude/settings.json
        - Creates intermediate .claude/ directory
        - Idempotent (overwrites existing file)

Step 8  src/tests/units/frameworks/claude/claudeInvoker.test.ts (MODIFIED, not new)
        - invokeClaudeReview calls ensureWorktree before dispatching
        - DispatchInput.localPath = worktreePath (not job.localPath)
        - buildMcpSystemPrompt: assert "UNRELIABLE" is NOT in output
        - buildMcpSystemPrompt: assert "FORBIDDEN" is NOT in output
        - buildMcpSystemPrompt: assert "glab mr diff" is NOT in output
        - Existing dispatch tests still pass

Step 9  src/tests/units/modules/platform-integration/.../gitlab.controller.test.ts (MODIFIED)
        - merged branch calls removeWorktree
        - closed branch calls removeWorktree
        - cleanup error logged, response still 200

Step 10 src/tests/units/modules/platform-integration/.../github.controller.test.ts (MODIFIED)
        - same as gitlab + cross-fork PR carries MrSource through

Step 11 src/tests/units/frameworks/queue/pQueueAdapter.test.ts (MODIFIED) — see §5
        - Two enqueues with same MR key serialize: second processor starts only after first completes
        - Two enqueues with different MR keys run in parallel (within p-queue concurrency)
        - Existing dedup + abort behaviour untouched

Step 12 src/tests/units/frameworks/scheduler/worktreeSweepScheduler.test.ts (NEW)
        - Runs sweep immediately at boot
        - setInterval 24h
        - stop() clears interval
```

### 4.3 Factories (`src/tests/factories/`)

- `worktreeIdentity.factory.ts` — `createWorktreeIdentity({ platform?, projectPath?, mrNumber? })`
- `worktreeEntry.factory.ts` — `createWorktreeEntry({ identity?, path?, mtime? })`
- `gitCommandResult.factory.ts` — quick `{ exitCode, stdout, stderr }`

### 4.4 Stubs (`src/tests/stubs/`)

- `worktree.stub.ts` — `StubWorktreeGateway` with controllable behaviour (in-memory map, fake mtime per entry)
- `gitCommandExecutor.stub.ts` — `StubGitCommandExecutor` records calls (assertable: "was fetch called with these args?"); programmable exit codes per command kind

---

## 5. Touched Existing Files (outside the new module)

| File | Surgical change |
|------|----------------|
| `src/frameworks/claude/claudeInvoker.ts` | (a) Add `WorktreeGateway` + `EnsureWorktreeUseCase` to `ClaudeInvokerDependencies`. (b) In `invokeViaBackgroundSession`, call `ensureWorktree.execute({ identity, sourceBranch: job.sourceBranch, mrSource })` *before* `runClaudeReviewJob`. (c) Pass `worktreePath` as `localPath` in the `RunClaudeReviewJobInput`. (d) Compute `mrSource` from job: today `job` only has `sourceBranch`/`targetBranch` — for fork detection we need new fields `sourceForkCloneUrl?` on `ReviewJob`. (e) In `buildMcpSystemPrompt`, delete the "⛔ CRITICAL: Data Source Rules" block AND drop the `diffSourceCommand`/`metadataSourceCommand` interpolation (FR-7) |
| `src/frameworks/queue/pQueueAdapter.ts` | Add `ReviewJob.mrConcurrencyKey?: string` (optional, derived `platform:projectPath:mrNumber` ignoring jobType prefix). Inside `enqueueReview`, before `q.add`, look up `mrChains.get(key)`; chain `q.add` behind that promise; store the new tail. On completion/finally, if the tail is still ours, delete the map entry. Keep `activeJobs` semantics for cancellation/dedup as-is. |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` | (a) In `closeResult` branch (~line 126, after `archive`): call `removeWorktree.execute({ identity: { platform:'gitlab', projectPath, mrNumber } })`. (b) Same in `mergeResult` branch (~line 164, after `transitionState`). (c) Errors logged as warning, do not change HTTP response |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | (a) In `closeResult` branch (~line 108, after `archive`): call `removeWorktree.execute({ identity: { platform:'github', ... } })`. (b) Also need a `merged` branch — current code only handles `closed` (closed=true && merged=true means merged on GitHub). Verify: `filterGitHubPrClose` already conflates closed+merged. Confirm by reading `eventFilter.ts`. If so, single branch covers both. (c) When event is `opened`/`synchronize` with cross-fork detection (`head.repo.full_name !== base.repo.full_name`), populate `ReviewJob.sourceForkCloneUrl` from `event.pull_request.head.repo.clone_url` |
| `src/main/dependencies.ts` | Add to `Dependencies`: `worktreeGateway: WorktreeGateway`, `gitCommandExecutor: GitCommandExecutor`, `ensureWorktree: EnsureWorktreeUseCase`, `removeWorktree: RemoveWorktreeUseCase`, `sweepStaleWorktrees: SweepStaleWorktreesUseCase`. Construct in `createDependencies` |
| `src/main/routes.ts` | Pass `ensureWorktree` + `removeWorktree` into webhook handler dependency objects. Currently both `handleGitLabWebhook`/`handleGitHubWebhook` receive a `deps` parameter — extend their `WebhookDependencies` interfaces in their respective controller files |
| `src/main/server.ts` | After `startCleanupScheduler` (~line 65), add `startWorktreeSweepScheduler({ sweepStaleWorktrees: deps.sweepStaleWorktrees, getRepositories: () => deps.config.repositories, logger: deps.logger })`. Capture stop handle for graceful shutdown |
| `src/shared/services/daemonPaths.ts` | Export new constant `WORKTREE_BASE_DIR = path.join(os.homedir(), '.reviewflow', 'worktrees')` |
| `src/frameworks/scheduler/worktreeSweepScheduler.ts` | **NEW**, lives outside the bounded context because the scheduler is framework code (mirrors `cleanupScheduler.ts`). Exports `startWorktreeSweepScheduler(deps): { stop }` — runs immediately + every 24h |

### Strategy for cross-fork detection

The webhook controller is the only place that sees the raw `event.pull_request.head.repo` + `base.repo`. We **must not** leak that shape into `ReviewJob`. The clean line is:
- Controller computes `sourceForkCloneUrl?: string` (null when `head.repo.full_name === base.repo.full_name`) and stuffs it onto `ReviewJob`.
- `claudeInvoker.ts` reads `job.sourceForkCloneUrl` and builds `MrSource` (`kind:'fork'` when present, else `kind:'origin'`).
- `ensureWorktree` consumes `MrSource`, never sees the raw event.

---

## 6. Risks & Unknowns (planner-spotted)

| # | Risk | Mitigation / Decision needed |
|---|------|------------------------------|
| R1 | **Git operations are async and slow (5-15s on large monorepo).** `runClaudeReviewJob` is already async; adding ensureWorktree adds another 5-15s to first-review latency before the Claude session even starts. Acceptable per spec (one-time per MR) but operator should know — log `ensureWorktree` duration |
| R2 | **`git worktree add` failure modes.** Branch may have been deleted upstream between webhook arrival and our fetch. `git fetch origin <branch>` will fail. Need a clean `EnsureResult` for this: `status:'failed', reason:'branch-not-found'`. Upstream (claudeInvoker) should bail with a `failed` job status, not silently fall back to plain localPath cwd (would re-introduce the "wrong code" problem). |
| R3 | **Settings write rollback?** If `worktreeSettingsWriter` fails after `git worktree add` succeeded, do we `git worktree remove` to rollback? Decision: **no rollback**. Log warning, proceed with dispatch. Worst case: Claude creates a nested sub-worktree (the old behaviour). Tests assert this fallback is non-fatal. |
| R4 | **p-queue chain map memory leak.** If a job throws and our `finally` cleanup is buggy, `mrChains` Map keeps growing. Mitigation: chain promise must use `.finally(() => mrChains.delete(key) if last)`. Unit-tested explicitly. |
| R5 | **`createJobId` prefix collision.** Today: `gitlab:project:42` vs `gitlab-followup:project:42` — these have different `job.id` (so `activeJobs.has` doesn't catch them), but they target the **same MR**. The MR concurrency key strips the prefix: `gitlab:project:42` for both. This means a followup queued while a fresh review is running will *wait* (today it would be dropped by `activeJobs.has` since job.id differs… actually no, today they are dropped only if same job.id — different prefixes do run in parallel). **This is a behaviour change.** Confirm with user during implementation review whether the new behaviour (serialize fresh+followup on same MR) is desired. Spec FR-9 implies yes. |
| R6 | **GitHub `closed` event semantics.** `filterGitHubPrClose` must be verified to fire for both `closed` and `closed+merged`. Skim showed only one branch. If it covers both, FR-5 has a single insertion point. If not, add a `mergeResult` branch like GitLab. **Action**: implementer reads `eventFilter.ts` in step 9. |
| R7 | **Disk usage of `~/.reviewflow/worktrees/` on dev machines.** Acceptable per spec, but `WORKTREE_BASE_DIR` location is debatable — operator may prefer `$XDG_CACHE_HOME/reviewflow/worktrees`. **Decision**: hard-code `~/.reviewflow/worktrees` per validated architectural decision #2. Revisit if user objects. |
| R8 | **The source checkout might already be on the wrong branch.** `git fetch origin <branch>` from the source checkout works regardless of current HEAD. `git worktree add` does not check out anything in the source. Confirmed by git docs — no risk. |
| R9 | **Cleanup of pre-SPEC-170 worktrees inside `.claude/worktrees/`.** Spec DoD calls for a one-time manual sweep. Plan: implementer adds a documented runbook entry in `docs/reports/170-...report.md` after implementation. Not in scope of automated code. |
| R10 | **`getActiveMrs` is per-project; sweep is global.** `WorktreeGateway.list()` returns entries across all projects (one base dir). To check tracking we'd need to iterate `getRepositories()` and call `getById(repo.localPath, mrId)`. Tractable but means sweep depends on `getRepositories` config callback. Plan: `sweepStaleWorktrees.usecase` receives `getRepositories` in deps. |

---

## 7. Order of Implementation

Walking skeleton first (vertical slice through all layers), then breadth.

1. **Acceptance test scaffold** (`src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts`) — RED. Skeleton for all 11 scenarios, only scenario 1 wired (others `it.todo`).
2. **Entity layer**: `worktree.schema.ts` + `worktree.ts` (`deriveWorktreePath`, `deriveFetchRef`) + `worktree.guard.ts`. Unit tests first (RED → GREEN).
3. **Gateway contract**: `worktree.gateway.ts` + `gitCommand.gateway.ts` (interfaces only).
4. **Use case (walking skeleton)**: `ensureWorktree.usecase.ts` with `StubWorktreeGateway` + `StubGitCommandExecutor`. Tests for create + reuse paths. RED → GREEN.
5. **Gateway implementations**:
   - `gitCommand.cli.gateway.ts` (wraps `shared/foundation/commandExecutor.ts` if compatible, else direct `child_process.spawn`).
   - `worktree.fileSystem.gateway.ts` (uses the cli executor under the hood + fs.stat).
6. **Settings writer service**: `worktreeSettingsWriter.ts`.
7. **Wire ensureWorktree into `claudeInvoker.ts`** + delete the "UNRELIABLE" / "FORBIDDEN" prompt block (FR-3 + FR-7). Acceptance scenarios 1 + 11 should now go GREEN.
8. **Use case**: `removeWorktree.usecase.ts` (RED → GREEN with stubs).
9. **Wire into controllers**: `gitlab.controller.ts` close+merge branches, `github.controller.ts` close branch. Acceptance scenarios 3 + 4 + 5 should now go GREEN.
10. **Fork handling**: `deriveFetchRef` fork branch + `ReviewJob.sourceForkCloneUrl` field + github.controller computes it. Scenario 9 GREEN.
11. **p-queue MR-key chain**: extend `pQueueAdapter.ts` + tests. Scenario 10 GREEN.
12. **Use case**: `sweepStaleWorktrees.usecase.ts`. Tests for the four sweep predicates.
13. **Scheduler**: `worktreeSweepScheduler.ts` + wire in `server.ts`. Scenarios 6 + 7 + 8 GREEN.
14. **Composition root**: `dependencies.ts` + `routes.ts` final wiring.
15. **Followup reuse scenario 2** — should already pass after step 7 (ensureWorktree is idempotent). Verify GREEN; if RED, debug reset-hard branch.
16. **Run full `yarn verify`**. All acceptance scenarios GREEN.
17. **Update tracker**: `docs/feature-tracker.md` → SPEC-170 status `implemented`.
18. **Report**: `docs/reports/170-prebuilt-worktree-lifecycle.report.md`.

---

## 8. Reference Files (read before/during implementation)

| Path | Why |
|------|-----|
| `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts` | Reference shape for gateway contract — `DispatchInput`, `Result` discriminated unions |
| `src/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.ts` | Reference for a CLI-backed gateway — process runner injection, exit-code handling |
| `src/modules/claude-invocation/usecases/dispatchClaudeSession.usecase.ts` | Reference for a use case orchestrating gateway calls with input/dep/result types |
| `src/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.ts` | Reference for a multi-step orchestrator use case |
| `src/modules/tracking/entities/tracking/reviewRequestTracking.gateway.ts` | Source of `getActiveMrs`, `getByState`, `getById` used by sweep |
| `src/frameworks/scheduler/cleanupScheduler.ts` | Template for `worktreeSweepScheduler.ts` (24h interval + immediate run + stop handle) |
| `src/frameworks/queue/pQueueAdapter.ts` | Surgery target for MR-scoped serialization (R5) |
| `src/frameworks/claude/claudeInvoker.ts` | Two surgical zones: dispatch cwd (FR-3) + system prompt block deletion (FR-7) |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` | Insertion points for `removeWorktree` calls (close + merge branches) |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | Insertion point for `removeWorktree` + cross-fork detection |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts` | Verify GitHub close-vs-merged semantics (R6) |
| `src/shared/foundation/commandExecutor.ts` | Decide if reusable for `git` invocation |
| `src/shared/services/daemonPaths.ts` | New `WORKTREE_BASE_DIR` constant location |
| `src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts` | Template for the SPEC-170 acceptance test harness |
| `src/tests/units/frameworks/scheduler/cleanupScheduler.test.ts` | Template for scheduler tests |

---

## ACCEPTANCE_TEST

- **file**: `src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts`
- **note**: SDD outer loop — created first (RED) at step 1 of §7, stays RED during steps 2–11, turns GREEN incrementally as scenarios are wired, fully GREEN at step 16.
