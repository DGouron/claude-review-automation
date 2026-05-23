# Report — SPEC-170 Pre-built Worktree Lifecycle

**Date**: 2026-05-23
**Spec**: `docs/specs/170-prebuilt-worktree-lifecycle.md`
**Plan**: `docs/plans/170-prebuilt-worktree-lifecycle.plan.md`
**Branch**: `worktree-spec-170-prebuilt-worktree-lifecycle`
**Status**: partial — FRs 1, 2, 3, 4, 5, 7, 9 shipped. FR-6 (daily sweep scheduler wiring) and FR-8 (GitHub cross-fork PR) deferred to follow-up PRs.

## Files Created

### New bounded context `src/modules/worktree-management/`

- `entities/worktree/worktree.schema.ts` — `WorktreeIdentity`, branded `WorktreePath`, `MrSource`, `EnsureResult`, `RemoveResult`, `WorktreeEntry`
- `entities/worktree/worktree.ts` — pure helpers: `deriveWorktreePath`, `deriveWorktreeDirectoryName`, `parseWorktreeDirectoryName`, `deriveFetchRef`
- `entities/worktree/worktree.guard.ts` — Zod-backed identity guard
- `entities/worktree/worktree.gateway.ts` — `WorktreeGateway` contract
- `entities/gitCommand/gitCommand.schema.ts` — discriminated `GitCommand` union (fetch / worktree-add / worktree-prune / worktree-remove / reset-hard)
- `entities/gitCommand/gitCommand.gateway.ts` — `GitCommandExecutor` contract
- `interface-adapters/gateways/gitCommand.cli.gateway.ts` — `GitCommandCliGateway` (spawn-based)
- `interface-adapters/gateways/worktree.fileSystem.gateway.ts` — facade combining git CLI + `fs.stat` + settings writer
- `services/worktreeSettingsWriter.ts` — writes `<path>/.claude/settings.json` with `bgIsolation: "none"`
- `usecases/ensureWorktree.usecase.ts` — create-or-fast-forward (FR-2)
- `usecases/removeWorktree.usecase.ts` — idempotent remove (FR-5)
- `usecases/sweepStaleWorktrees.usecase.ts` — daily sweep predicate (FR-6 logic; scheduler not yet wired)

### Acceptance scaffold + new tests

- `src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts` — 11 scenarios, 5 active (3, 4, 5, 10, 11), 6 `it.todo` deferred
- `src/tests/stubs/gitCommandExecutor.stub.ts`
- 6 unit-test files under `src/tests/units/modules/worktree-management/`

## Files Modified

- `src/shared/services/daemonPaths.ts` — exports `WORKTREE_BASE_DIR`
- `src/frameworks/claude/claudeInvoker.ts` — calls `ensureWorktree` and dispatches with the worktree path as cwd (FR-3); deletes the "⛔ CRITICAL: Data Source Rules" disclaimer and the `glab/gh` interpolation (FR-7)
- `src/frameworks/queue/pQueueAdapter.ts` — MR-scoped concurrency chain (FR-9); fresh review and followup on the same MR are serialized
- `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` — close + merge branches call `removeWorktree` (FR-5)
- `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` — close branch calls `removeWorktree` (FR-5)
- `src/main/routes.ts` — composition root wires `removeWorktree` action backed by `GitCommandCliGateway`
- `src/tests/units/frameworks/claude/mcpContext.test.ts` — factory mock of `node:os` so the new transitive import to `daemonPaths` does not crash module load
- `src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts` — drops the obsolete "Platform-aware MCP system prompt" suite (now owned by SPEC-170 scenario 11)
- `docs/feature-tracker.md` — SPEC-170 status `implementing`

## Acceptance Scenarios GREEN (5 / 11)

| # | Scenario | Status |
|---|----------|--------|
| 3 | merge cleanup → remove worktree | ✓ |
| 4 | close cleanup → remove worktree | ✓ |
| 5 | merge with worktree absent → log warning, no failure | ✓ |
| 10 | concurrent followups on same MR serialize via MR-key chain | ✓ |
| 11 | system prompt no longer contains UNRELIABLE / FORBIDDEN / glab mr diff / gh pr diff | ✓ |

## Acceptance Scenarios Deferred (6 / 11, `it.todo`)

| # | Scenario | Deferred reason |
|---|----------|-----------------|
| 1 | first review creates worktree on source branch + dispatches from worktree | FR-3 wiring covered by `claudeInvoker.test.ts` unit tests; end-to-end acceptance requires harness work — follow-up |
| 2 | followup reuses worktree with fetch + reset --hard | Idempotency covered by `ensureWorktree.usecase.test.ts`; acceptance harness same as scenario 1 |
| 6 | daily sweep removes worktrees of MRs closed >24h ago | FR-6: use case exists; scheduler + `server.ts` wiring is the follow-up PR |
| 7 | daily sweep removes orphan worktrees | Same as scenario 6 |
| 8 | daily sweep removes worktrees with mtime >7 days | Same as scenario 6 |
| 9 | GitHub cross-fork PR fetches from fork URL | FR-8 fork detection in `github.controller` is the follow-up PR |

## Decisions on Planner-flagged Risks

| Risk | Decision |
|------|----------|
| **R2** branch deleted upstream | `ensureWorktree` returns `EnsureResult { status: 'failed', reason: 'branch-not-found' }`; `claudeInvoker` propagates the failure rather than silently falling back to plain `localPath` cwd |
| **R3** settings write failure | No rollback. Logged as warning, dispatch continues. Worst case: Claude creates a nested sub-worktree (pre-SPEC-170 behaviour) |
| **R5** fresh + followup serialization on same MR | Confirmed desired. The MR-key chain in `pQueueAdapter` keys by `<platform>:<projectPath>:<mrNumber>` and ignores the `gitlab-followup` prefix; the second operation waits for the first |
| **R6** GitHub close vs merged | `closed` + `closed+merged` are funneled through the same `closeResult` branch in `github.controller`. Single insertion point sufficient |
| **R10** sweep cross-project | `sweepStaleWorktrees` use case takes a `getRepositories()` callback and iterates each repo's `getActiveMrs` / `getById` for tracker cross-reference. Scheduler not yet wired (deferred) |

## Verification

```
yarn verify
✓ typecheck OK
✓ lint  OK (Biome — 579 files)
✓ tests OK — 234 files / 1653 passing / 6 todos
```

## Follow-ups (next PRs)

1. **FR-6 scheduler wiring** — create `src/frameworks/scheduler/worktreeSweepScheduler.ts` mirroring `cleanupScheduler.ts`; wire `startWorktreeSweepScheduler` in `src/main/server.ts`; convert scenarios 6, 7, 8 to active tests
2. **FR-8 fork handling** — add `sourceForkCloneUrl?: string` to `ReviewJob`; populate from `github.controller` on cross-fork events; thread through `claudeInvoker` → `MrSource`; convert scenario 9
3. **Scenarios 1 + 2 acceptance harness** — currently asserted via unit tests on `claudeInvoker` + `ensureWorktree.usecase`; building the end-to-end acceptance harness around `enqueueReview → claudeInvoker → ensureWorktree → dispatch` deserves its own ticket
4. **Pre-SPEC-170 worktree sweep on prod** — one-time manual cleanup of `.claude/worktrees/` under the operator's home; documented in deploy runbook (`docs/HARNESS-ONBOARDING.md` companion entry to add)
