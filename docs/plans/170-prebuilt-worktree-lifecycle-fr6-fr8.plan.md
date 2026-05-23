# Plan — SPEC-170 Follow-up: FR-6 (Daily Sweep Scheduler) + FR-8 (GitHub Cross-Fork PR)

**Spec**: `docs/specs/170-prebuilt-worktree-lifecycle.md`
**Original plan**: `docs/plans/170-prebuilt-worktree-lifecycle.plan.md`
**Predecessor PR**: #175 — covered FRs 1, 2, 3, 4, 5, 7, 9
**Predecessor report**: `docs/reports/170-prebuilt-worktree-lifecycle.report.md`
**Status**: planned

This follow-up covers the work explicitly deferred from PR #175:

- **FR-6** — wire the already-implemented `sweepStaleWorktrees` use case to a daily scheduler so it actually runs.
- **FR-8** — detect GitHub cross-fork PRs in the webhook controller, plumb the fork clone URL through `ReviewJob.sourceForkCloneUrl` (field already exists) so `claudeInvoker → ensureWorktree → deriveFetchRef` takes the fork branch in `worktree.ts` (the fork branch already exists).
- Convert acceptance scenarios 6, 7, 8, 9 from `it.todo` to active tests.

**Out of scope — DO NOT TOUCH**:
- Anything PR #175 shipped (worktree entity, ensure/remove use cases, sweep predicate logic, gateways, claudeInvoker dispatch wiring, pQueueAdapter MR-key chain, MCP prompt slimming, controllers' close/merge `removeWorktree` insertions).
- Acceptance scenarios 1 + 2 (separate follow-up per report §Follow-ups #3).
- The manual pre-deploy sweep runbook (separate follow-up per report §Follow-ups #4).

---

## 1. Files to CREATE

| Path | Purpose |
|------|---------|
| `src/frameworks/scheduler/worktreeSweepScheduler.ts` | NEW — exports `startWorktreeSweepScheduler(deps): { stop }`. Mirrors `cleanupScheduler.ts`: runs the sweep immediately at boot, then every 24h. Owns the `setInterval` handle and surfaces a `stop()` for graceful shutdown. Composes the `WorktreeFileSystemGateway.list` + `removeWorktree.execute` + tracking `getById` + `now: () => new Date()` into the `SweepStaleWorktreesDependencies` already accepted by `sweepStaleWorktrees.usecase.ts`. |
| `src/tests/units/frameworks/scheduler/worktreeSweepScheduler.test.ts` | NEW — fake timers, asserts (a) sweep runs immediately, (b) re-runs after 24h, (c) `stop()` clears interval, (d) per-iteration errors are caught and don't crash the scheduler. Mirrors `cleanupScheduler.test.ts`. |

That's it. Everything else is a surgical modification.

---

## 2. Files to MODIFY

| Path | Surgical change | FR |
|------|-----------------|----|
| `src/modules/platform-integration/entities/github/githubPullRequestEvent.guard.ts` | Extend the Zod schema: add `pull_request.head.repo: z.object({ full_name: z.string(), clone_url: z.string() })` and `pull_request.base.repo: z.object({ full_name: z.string() })`. Both `.optional()` for backwards compat with existing mock payloads in tests; the controller treats missing as "same-repo". | FR-8 |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | (a) In the fresh-review enqueue path (around line 480, building `job: ReviewJob`), compute `sourceForkCloneUrl` via a small helper `computeSourceForkCloneUrl(event.pull_request)` that returns `event.pull_request.head.repo.clone_url` when `head.repo.full_name !== base.repo.full_name`, else `undefined`. Add the field to the `job` literal. (b) Same in the followup enqueue path (around line 239, `followupJob: ReviewJob`). (c) No other behavioural change — `claudeInvoker.deriveMrSourceFromJob` already converts the field to `MrSource`. | FR-8 |
| `src/main/dependencies.ts` | Add `sweepStaleWorktreesDeps` (or a single ready-to-call `runSweep` callback) so `server.ts` can wire the scheduler without re-importing every gateway. Specifically: instantiate one `GitCommandCliGateway` + one `WorktreeFileSystemGateway` (or just reuse the list/remove primitives), expose them on the `Dependencies` interface as `worktreeGateway: WorktreeGateway` and `gitCommandExecutor: GitCommandExecutor`. **Rationale**: today `routes.ts` constructs its own `GitCommandCliGateway` for the close-branch `removeWorktree` action — that instance is hidden behind the `removeWorktreeAction` closure and not reachable from `server.ts`. Promoting the executor + gateway to `Dependencies` removes the duplication. Refactor of `routes.ts` covered below. | FR-6 |
| `src/main/routes.ts` | Replace the local `new GitCommandCliGateway()` (line 223) and `existsSync(path)` closure with `deps.gitCommandExecutor` and `deps.worktreeGateway.remove()` — same behaviour, different source. Keep the `removeWorktreeAction` shape exactly as today so the controller deps are untouched. | FR-6 (preparatory) |
| `src/main/server.ts` | After `startCleanupScheduler` (around line 68–73), add `startWorktreeSweepScheduler({ worktreeGateway: deps.worktreeGateway, removeWorktree, trackingGateway: deps.reviewRequestTrackingGateway, getRepositories: () => config.repositories, logger: deps.logger, now: () => new Date() })`. Capture the handle and `stop()` it in `shutdown()` alongside `cleanupScheduler.stop()`. | FR-6 |
| `src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts` | Convert scenarios 6, 7, 8, 9 from `it.todo` to active `it`. (a) Scenarios 6, 7, 8 drive `startWorktreeSweepScheduler` with a stub `WorktreeGateway` returning fixed `WorktreeEntry`s, a stub tracking gateway, a fake `now`, fake timers; assert `removeWorktree` was invoked for the expected identities. (b) Scenario 9 drives the github controller (or directly `enqueueReview` with a fork-flavoured `ReviewJob`) and asserts the resulting fetch command targets `<fork-clone-url>` with refspec `<branch>:refs/remotes/pr-<n>/head`. Scenario 9's preferred assertion shape: build a `ReviewJob` with `sourceForkCloneUrl` set, run it through `ensureWorktree` with a `StubGitCommandExecutor`, and inspect `executor.callsOfKind('fetch')[0].args` + `callsOfKind('worktree-add')[0].args`. | FR-6, FR-8 |
| `src/tests/units/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.test.ts` (if present; otherwise add the assertion to the existing controller acceptance harness) | Verify `ReviewJob.sourceForkCloneUrl` is `undefined` for same-repo events and matches `head.repo.clone_url` for cross-fork events. Also verify followup path propagates the field. (Read the file first to confirm location/shape — `Grep` for `handleGitHubWebhook` test.) | FR-8 |

**Note on `dependencies.ts` promotion**: This is the only structural change. It is technically larger than a pure follow-up, but keeping the gateway construction in `routes.ts` while the scheduler lives in `server.ts` would force `server.ts` to re-instantiate the gateway, breaking the "one gateway instance per process" implicit invariant. Promoting to `Dependencies` follows the composition-root convention used for every other gateway (`reviewFileGateway`, `trackingGateway`, etc.).

---

## 3. Per-FR Mapping (what delivers what)

| FR | Capability | File / Function delivering it |
|----|-----------|-------------------------------|
| FR-6 | Daily 24h sweep of `~/.reviewflow/worktrees/` removing closed-MR / orphan / stale entries | NEW `worktreeSweepScheduler.ts` wraps existing `sweepStaleWorktrees` use case (no logic change to the use case). Wiring in `server.ts` boots it. |
| FR-8 | GitHub cross-fork PR fetches from fork URL + worktree from `refs/remotes/pr-<n>/head` | `githubPullRequestEvent.guard.ts` exposes `head.repo` + `base.repo`. `github.controller.ts` computes `sourceForkCloneUrl` and stuffs it on `ReviewJob`. **Already-shipped chain** (`claudeInvoker.deriveMrSourceFromJob → ensureWorktree → deriveFetchRef`) converts it to a fork-flavoured `MrSource` and the fetch ref naturally lands on `refs/remotes/pr-<n>/head` because `deriveFetchRef` already handles the `{ kind: 'fork', cloneUrl }` branch. |

**No business logic added** — both FRs are wiring. FR-6 wires the scheduler around an existing use case; FR-8 wires controller-side detection around an existing job field and an existing fetch-ref helper.

---

## 4. TDD Inside-Out Order

### 4.1 Outer loop (SDD acceptance — RED → GREEN)

Single file: `src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts`. Convert four `it.todo` into active tests at the end of each FR's inner loop.

### 4.2 Inner loop — unit tests, file by file (RED → GREEN → REFACTOR)

```
Step 1  (FR-6) src/tests/units/frameworks/scheduler/worktreeSweepScheduler.test.ts (NEW)
        - boots: sweep invoked synchronously on start
        - 24h interval: vi.advanceTimersByTime(24h) triggers a second sweep
        - stop() clears interval
        - exception inside sweep is caught + logged, does not crash interval
        Use stubs: StubWorktreeGateway (or in-test minimal object exposing list+remove),
                   in-memory tracking gateway, vi.useFakeTimers().

Step 2  (FR-6) src/frameworks/scheduler/worktreeSweepScheduler.ts (NEW)
        Minimal implementation to pass Step 1.

Step 3  (FR-6 wiring) src/main/dependencies.ts MODIFY
        - Add worktreeGateway + gitCommandExecutor to Dependencies type
        - Construct in createDependencies
        - No new test (composition root); existing dependencies tests (if any) should still pass.
        - Run `yarn typecheck` to catch ripple effects.

Step 4  (FR-6 wiring) src/main/routes.ts MODIFY
        - Replace local GitCommandCliGateway with deps.gitCommandExecutor
        - Verify webhook controllers still receive the same removeWorktreeAction shape
        - No new test; existing webhook tests must remain GREEN.

Step 5  (FR-6 wiring) src/main/server.ts MODIFY
        - Wire startWorktreeSweepScheduler; capture handle; stop on shutdown
        - No direct unit test for server.ts (it has none today). Verified by acceptance.

Step 6  (FR-6 acceptance) Activate scenarios 6, 7, 8 in the acceptance file
        - Scenario 6: closed-MR-over-24h → removeWorktree called once
        - Scenario 7: orphan (no tracked MR) → removeWorktree called once
        - Scenario 8: stale (mtime 8 days) → removeWorktree called once
        All three drive startWorktreeSweepScheduler directly (not via boot), keeping
        the assertion focused on the scheduler+sweep collaboration.

Step 7  (FR-8) src/tests/units/modules/platform-integration/entities/github/githubPullRequestEvent.guard.test.ts MODIFY
        - Add: parses payload with head.repo + base.repo present
        - Add: parses payload without head.repo (backwards compat)
        (Verify the test file exists; if not, create it.)

Step 8  (FR-8) src/modules/platform-integration/entities/github/githubPullRequestEvent.guard.ts MODIFY
        Add the two optional `repo` shapes.

Step 9  (FR-8) src/tests/units/.../github.controller.test.ts MODIFY
        - Cross-fork PR payload (head.repo.full_name !== base.repo.full_name)
          → ReviewJob.sourceForkCloneUrl === head.repo.clone_url
        - Same-repo PR payload → ReviewJob.sourceForkCloneUrl === undefined
        - Same assertions for the followup enqueue path.

Step 10 (FR-8) src/modules/.../github.controller.ts MODIFY
        Implement `computeSourceForkCloneUrl` helper + add field to both job literals.

Step 11 (FR-8 acceptance) Activate scenario 9
        Build a fork-flavoured ReviewJob, run ensureWorktree with StubGitCommandExecutor,
        assert: executor.callsOfKind('fetch')[0].args === ['fetch', '<fork-clone-url>', 'patch-1:refs/remotes/pr-N/head']
        and    executor.callsOfKind('worktree-add')[0].args === ['worktree', 'add', <path>, 'refs/remotes/pr-N/head']

Step 12 yarn verify — all green
```

### 4.3 Factories / stubs

- Reuse existing `StubGitCommandExecutor` (`src/tests/stubs/gitCommandExecutor.stub.ts`) — already supports `programResponse` and `callsOfKind`.
- For the scheduler test, build a minimal inline `StubWorktreeGateway` (the sweep only calls `list` + the `removeWorktree` callback) — no need to spawn a new stub file.
- For scenario 9, build a minimal `WorktreeGateway` stub that asserts `worktreeExists` returns false (forces the create-then-add branch in `ensureWorktree`).

---

## 5. Risk Callouts (specific to this follow-up)

| # | Risk | Mitigation / Decision |
|---|------|-----------------------|
| R1 | **`dependencies.ts` promotion ripples typings.** Promoting `worktreeGateway` + `gitCommandExecutor` to `Dependencies` changes the `Dependencies` shape — any test or call site that constructs a synthetic `Dependencies` (e.g. in `routes.ts` tests) will break typecheck. | Run `yarn typecheck` after Step 3. Likely affected: `src/tests/units/main/dependencies.test.ts` if it exists. Update those tests to include the new fields (use a `createTestDependencies()` factory if present; otherwise inline). |
| R2 | **GitHub fork URL authentication.** `git fetch <https-clone-url>` against a public fork works unauthenticated; against a private fork it requires the operator's GitHub credentials in their git config (`https://<token>@github.com/...` or SSH agent). ReviewFlow does NOT manage these credentials. | Document in the report: "FR-8 requires the operator to have valid git credentials for the fork remote (cached HTTPS creds or SSH key). Authentication failures surface as `ensureWorktree` `branch-not-found` and the job fails cleanly — same path as a deleted branch." No code change needed; explicit in the risk register. |
| R3 | **Scheduler idempotency on app restart.** `setInterval` does not survive restarts; the sweep runs on every boot (first call inside `startWorktreeSweepScheduler`). For a process restarted hourly under systemd, the sweep would run hourly instead of daily. | Acceptable per spec ("removes inactive worktrees" — re-running early is safe, the predicate is idempotent). Document. Alternative (persist last-sweep timestamp) is YAGNI; do not implement. |
| R4 | **`sourceForkCloneUrl` migration of in-flight jobs.** `ReviewJob` is a runtime object held in PQueue's in-memory queue. No persistence, no migration. Jobs queued before the controller change won't have the field — they'll behave as same-repo (current behaviour). Zero migration risk. | None needed. |
| R5 | **`event.repository.clone_url` (used by `findRepositoryByRemoteUrl`) is the BASE repo URL.** For cross-fork PRs we must keep using BASE for repo config lookup (the operator configures the upstream, not the fork), and use HEAD.repo.clone_url only for the git fetch. | Verified: github controller already uses `event.repository.clone_url` for `findRepositoryByRemoteUrl`. Our addition only reads `event.pull_request.head.repo.clone_url` for the new field. No conflict. |
| R6 | **Test mock payloads may now fail validation.** Several existing GitHub webhook tests use mock payloads without `head.repo` / `base.repo`. Making these required would break dozens of fixtures. | Make both `.optional()` — controllers treat missing as "same-repo" via `?? undefined`. No fixture rewrite needed. |
| R7 | **`WorktreeFileSystemGateway` already takes an `executor` in its constructor** (`gitCommand.cli.gateway.ts`). The promoted `Dependencies` must share the same executor instance — accidentally creating two would mean two `.git/worktree.lock` contenders on the source checkout, with FR-6 sweep + FR-5 webhook close racing on the same prune. | Single `gitCommandExecutor` instance instantiated in `createDependencies`, passed to both the `WorktreeFileSystemGateway` and the `removeWorktreeAction` factory in routes. |
| R8 | **Scenario 9 vs end-to-end webhook harness.** A "true" acceptance for FR-8 would post a full GitHub webhook payload and assert the resulting `git fetch` args. That requires a webhook harness similar to the one cited in report §Follow-up #3 for scenarios 1/2 — which is itself deferred. | Scenario 9 asserts the contract at the `ensureWorktree` boundary (build the `ReviewJob`, invoke `ensureWorktree` with the stub executor, inspect calls). This is one layer above the unit and one below the webhook E2E, and matches how scenarios 3/4/5 are written today (which the previous PR shipped as acceptance). Consistent with existing acceptance shape; revisit when the E2E harness lands. |

---

## 6. Implementation Order (walking skeleton)

1. **`worktreeSweepScheduler.test.ts`** (RED) — write the scheduler test first, copying `cleanupScheduler.test.ts` structure, with `vi.useFakeTimers`. Assert immediate-run, 24h-tick, stop, error-swallow.
2. **`worktreeSweepScheduler.ts`** (GREEN) — minimal `setInterval` wrapper invoking `sweepStaleWorktrees` once at boot + every 24h. Errors caught.
3. **`dependencies.ts`** — promote `worktreeGateway` + `gitCommandExecutor`. `yarn typecheck` until green.
4. **`routes.ts`** — swap local instance for `deps.gitCommandExecutor` / `deps.worktreeGateway`. `yarn test:ci` must still be green.
5. **`server.ts`** — boot the scheduler, capture handle, `stop()` on shutdown.
6. **Acceptance scenarios 6, 7, 8** — convert `it.todo` → `it`, drive `startWorktreeSweepScheduler` directly (no full server boot needed). GREEN.
7. **`githubPullRequestEvent.guard.test.ts`** — add fork-detection parsing tests (RED).
8. **`githubPullRequestEvent.guard.ts`** — add optional `head.repo` + `base.repo` (GREEN).
9. **`github.controller.test.ts`** — assert `sourceForkCloneUrl` on both fresh and followup `ReviewJob` (RED).
10. **`github.controller.ts`** — `computeSourceForkCloneUrl` helper + field on both job literals (GREEN).
11. **Acceptance scenario 9** — convert `it.todo` → `it`, drive `ensureWorktree` with fork-flavoured input via `StubGitCommandExecutor`, assert fetch + worktree-add args. GREEN.
12. **`yarn verify`** — all green. Acceptance is 9/11 (scenarios 1, 2 still `it.todo`, per scope).
13. **Update `docs/feature-tracker.md`** — leave SPEC-170 at `implementing` (still 2 deferred scenarios); add a one-line note pointing at this follow-up.
14. **Report**: `docs/reports/170-prebuilt-worktree-lifecycle-fr6-fr8.report.md` — files touched, FR coverage, decisions taken on the 8 risks above, `yarn verify` output.

Walking-skeleton vertical: steps 1 → 2 → 5 → 6 gives a scheduler running end-to-end on a stub gateway. Steps 7 → 10 → 11 give a fork-aware controller dispatching through the existing chain.

---

## 7. Acceptance Test Reference

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts
  note: SDD outer loop — scenarios 3/4/5/10/11 already GREEN from PR #175.
        This follow-up converts scenarios 6, 7, 8 (FR-6) and 9 (FR-8) from
        `it.todo` to active tests. Scenarios 1, 2 remain `it.todo` (separate
        follow-up — needs full webhook E2E harness).
```

Final acceptance count after this PR: **9 of 11 scenarios active and GREEN** (3, 4, 5, 6, 7, 8, 9, 10, 11). Scenarios 1 + 2 remain deferred.

---

## 8. Reference Files Read

| Path | Why |
|------|-----|
| `docs/specs/170-prebuilt-worktree-lifecycle.md` | FR-6 §line 89-96, FR-8 §line 103-109, AC-4 and AC-8 |
| `docs/plans/170-prebuilt-worktree-lifecycle.plan.md` | Cross-reference with the original plan's §3 FR-6/FR-8 rows and §7 steps 10 + 13 |
| `docs/reports/170-prebuilt-worktree-lifecycle.report.md` | Confirms what shipped vs deferred; risk decisions to honour |
| `src/frameworks/scheduler/cleanupScheduler.ts` | Direct template for `worktreeSweepScheduler.ts` |
| `src/tests/units/frameworks/scheduler/cleanupScheduler.test.ts` | Direct template for the scheduler test |
| `src/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.ts` | Already-implemented sweep predicate — confirms input shape (`SweepStaleWorktreesDependencies`) the scheduler must satisfy |
| `src/tests/units/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.test.ts` | Demonstrates the contract the scheduler test will mock |
| `src/modules/worktree-management/entities/worktree/worktree.ts` | Confirms `deriveFetchRef` already handles the fork branch — FR-8 needs no entity change |
| `src/modules/worktree-management/entities/worktree/worktree.schema.ts` | Confirms `MrSource = { kind: 'fork'; cloneUrl }` already exists |
| `src/modules/worktree-management/interface-adapters/gateways/worktree.fileSystem.gateway.ts` | Confirms `list()` returns `WorktreeEntry[]` consumable by the sweep |
| `src/modules/worktree-management/usecases/ensureWorktree.usecase.ts` | Confirms create path → executor receives the fork refspec on cross-fork — FR-8 truly is wiring |
| `src/frameworks/claude/claudeInvoker.ts` (line 525-530) | Confirms `deriveMrSourceFromJob` already reads `job.sourceForkCloneUrl` — controller only needs to populate it |
| `src/frameworks/queue/pQueueAdapter.ts` (lines 8-34) | Confirms `ReviewJob.sourceForkCloneUrl?` already exists |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | Insertion points: line ~239 (followup `ReviewJob`), line ~480 (fresh `ReviewJob`) |
| `src/modules/platform-integration/entities/github/githubPullRequestEvent.guard.ts` | Current schema lacks `head.repo` + `base.repo` — must extend |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts` | Confirms FilterResult does NOT carry repo info — controller reads directly from `event.pull_request.head.repo` |
| `src/main/server.ts` | Boot insertion point (after `startCleanupScheduler`) + shutdown teardown |
| `src/main/dependencies.ts` | Where to promote `worktreeGateway` + `gitCommandExecutor` |
| `src/main/routes.ts` (lines 220-272) | Where to swap local instances for `deps.*` |
| `src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts` | The four `it.todo` to convert |
| `src/tests/stubs/gitCommandExecutor.stub.ts` | Reusable for scenario 9 — supports `callsOfKind('fetch')` etc. |
