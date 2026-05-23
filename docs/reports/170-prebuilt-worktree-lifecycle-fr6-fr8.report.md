# Report — SPEC-170 Follow-up: FR-6 (Daily Sweep Scheduler) + FR-8 (GitHub Cross-Fork PR)

**Date**: 2026-05-23
**Spec**: `docs/specs/170-prebuilt-worktree-lifecycle.md`
**Plan**: `docs/plans/170-prebuilt-worktree-lifecycle-fr6-fr8.plan.md`
**Predecessor PR**: #175 (FRs 1, 2, 3, 4, 5, 7, 9)
**Predecessor report**: `docs/reports/170-prebuilt-worktree-lifecycle.report.md`
**Branch**: `worktree-spec-170-fr6-fr8-followup`
**Status**: complete — FR-6 + FR-8 shipped; acceptance scenarios 6, 7, 8, 9 GREEN; scenarios 1 + 2 also converted to active GREEN tests at the `ensureWorktree` boundary (acceptance file now 11/11 GREEN).

## Files Created (2)

- `src/frameworks/scheduler/worktreeSweepScheduler.ts` — `startWorktreeSweepScheduler(deps): { stop }`. Mirrors `cleanupScheduler.ts`: runs the existing `sweepStaleWorktrees` use case once at boot, then every 24h. Owns the `setInterval`; surfaces a `stop()` for graceful shutdown. Catches per-iteration errors so the interval stays alive.
- `src/tests/units/frameworks/scheduler/worktreeSweepScheduler.test.ts` — fake-timer unit tests covering (a) immediate boot run + orphan removal, (b) 24h tick re-runs the sweep, (c) `stop()` cancels the interval, (d) gateway exceptions are swallowed and do not crash the scheduler.

## Files Modified (8)

| Path | What changed |
|------|--------------|
| `src/main/dependencies.ts` | Promoted `worktreeGateway: WorktreeGateway` + `gitCommandExecutor: GitCommandExecutor` to `Dependencies`. Single `GitCommandCliGateway` instance shared between the `WorktreeFileSystemGateway`, the routes `removeWorktreeAction`, and the daily sweep scheduler (R7). |
| `src/main/routes.ts` | Removed the local `new GitCommandCliGateway()` + `existsSync` closure; `removeWorktreeAction` now delegates to `deps.worktreeGateway.remove()`. Same observable behaviour, single executor instance. |
| `src/main/server.ts` | After `startCleanupScheduler` boots, `startWorktreeSweepScheduler` is started with `deps.worktreeGateway`, `deps.reviewRequestTrackingGateway`, `config.repositories`, `deps.logger`, `now: () => new Date()`. Handle captured and `stop()`-ed inside `shutdown()` alongside the cleanup scheduler. |
| `src/modules/platform-integration/entities/github/githubPullRequestEvent.guard.ts` | Schema extended: `pull_request.head.repo` and `pull_request.base.repo` are now optional Zod objects (`full_name` + `clone_url` for head, `full_name` for base). Backwards compatible — pre-existing test payloads without `repo` still parse. |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | Added `computeSourceForkCloneUrl(pullRequest)` helper returning `head.repo.clone_url` when `head.repo.full_name !== base.repo.full_name`, else `undefined`. Field populated on BOTH `ReviewJob` literals — fresh review (~line 480) and followup (~line 239). |
| `src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts` | Scenarios 6, 7, 8 (`it.todo` → `it`): drive `startWorktreeSweepScheduler` directly with a stub `WorktreeGateway`, fake timers, fake `now`. Scenario 9 (`it.todo` → `it`): drive `ensureWorktree` with a fork-flavoured `MrSource`, assert `executor.callsOfKind('fetch')` targets the fork URL with refspec `patch-1:refs/remotes/pr-77/head` and `worktree-add` checks out `refs/remotes/pr-77/head`. |
| `src/tests/units/entities/github/githubPullRequestEvent.guard.test.ts` | Added (a) parses payload with `head.repo` + `base.repo`, (b) parses payload without them. |
| `src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts` | Three new tests: fresh-review cross-fork populates `sourceForkCloneUrl`, same-repo leaves it undefined, followup-on-synchronize cross-fork propagates the field. |
| `docs/feature-tracker.md` | New row for the FR-6/FR-8 follow-up pointing at this report. SPEC-170 base row stays `implementing` (scenarios 1+2 acceptance still deferred per plan). |

## Acceptance Scenario Status (11 / 11 GREEN)

| # | Scenario | Status | Source PR |
|---|----------|--------|-----------|
| 1 | first review creates worktree on source branch + dispatches from worktree | **GREEN — this PR** | this |
| 2 | followup reuses worktree with fetch + reset --hard | **GREEN — this PR** | this |
| 3 | merge cleanup → remove worktree | GREEN | #175 |
| 4 | close cleanup → remove worktree | GREEN | #175 |
| 5 | merge with worktree absent → log warning, no failure | GREEN | #175 |
| 6 | daily sweep — closed MR over 24h → remove worktree | **GREEN — this PR** | this |
| 7 | daily sweep — orphan → remove worktree + warning | **GREEN — this PR** | this |
| 8 | daily sweep — stale active MR (mtime >7d) → remove worktree | **GREEN — this PR** | this |
| 9 | GitHub cross-fork PR fetches from fork URL + worktree from `refs/remotes/pr-N/head` | **GREEN — this PR** | this |
| 10 | concurrent followups on same MR serialize via MR-key chain | GREEN | #175 |
| 11 | system prompt no longer contains UNRELIABLE / FORBIDDEN / glab mr diff / gh pr diff | GREEN | #175 |

Final acceptance file state: **11 active GREEN tests** = 11 spec scenarios accounted for. Scenarios 1 + 2 were initially deferred pending a full webhook E2E harness; the close-out converted them to active tests at the `ensureWorktree` boundary, matching scenario 9's shape (`StubGitCommandExecutor` + assertion on `callsOfKind`). The webhook E2E harness is a separate concern — these acceptance tests assert the use-case contract directly.

## Self-Review Iterations

| Iteration | Result | Action |
|-----------|--------|--------|
| 1 | `yarn typecheck` clean. `yarn lint` clean. `yarn test:ci` 1730 passing / 2 todo (after fixing worktree-vs-parent `node_modules` symlink — see below). | None — zero violations. |

**Violations found**: 0
**Violations fixed**: 0
**Remaining issues**: None.

**Environment note (not a code issue)**: This branch lives in a git worktree without local `node_modules`. The `cli.integration.test.ts` suite resolves `tsx` via `join(repoRoot, 'node_modules/.bin/tsx')` relative to the worktree root, which initially gave exit 127. Resolved by symlinking `./node_modules → ../../../node_modules` for the duration of the verify run. Same suite passes natively in the main checkout. No production-code change required.

## Decisions on Plan §5 Risks

| # | Risk | Decision taken |
|---|------|----------------|
| R1 | `dependencies.ts` promotion ripples typings (e.g. `dependencies.test.ts`). | `Dependencies` interface grew by two fields. `yarn typecheck` was clean after the change — `src/tests/units/main/dependencies.test.ts` only checks a subset of fields with `toBeDefined()`, no fixture rewrite needed. |
| R2 | GitHub fork URL authentication. | Documented as out-of-scope. `ensureWorktree` propagates fork-fetch failure as `{ status: 'failed', reason: 'branch-not-found' }` exactly like a deleted branch — same downstream behaviour. Operator must have cached HTTPS creds or SSH key for the fork remote. |
| R3 | Scheduler idempotency on app restart. | Accepted per spec — predicate is idempotent (re-running early is safe). No persisted last-sweep timestamp (YAGNI). Daemon restarts hourly under systemd will sweep hourly; spec only requires *at least* daily. |
| R4 | `sourceForkCloneUrl` migration of in-flight jobs. | None needed. Jobs are in-memory only; pre-change jobs behave as same-repo (matches current production behaviour). |
| R5 | `event.repository.clone_url` vs `head.repo.clone_url`. | Verified: base repo URL still drives `findRepositoryByRemoteUrl` (controller line 437), fork URL only fills `ReviewJob.sourceForkCloneUrl`. No conflict. |
| R6 | Test mock payloads without `head.repo`/`base.repo`. | Both fields marked `.optional()`. Existing fixtures unchanged. Controller treats missing as same-repo (helper returns `undefined`). |
| R7 | `WorktreeFileSystemGateway` + `removeWorktreeAction` must share a single `GitCommandExecutor`. | Done. One `GitCommandCliGateway` instance constructed in `createDependencies`, passed into `WorktreeFileSystemGateway`, and re-used by both `removeWorktreeAction` (via `deps.worktreeGateway.remove`) in `routes.ts` and the scheduler (via `deps.worktreeGateway.remove`) in `server.ts`. |
| R8 | Scenario 9 vs end-to-end webhook harness. | Scenario 9 asserts the contract at the `ensureWorktree` boundary (controller-level field population covered by unit tests; ref derivation covered by `worktree.ts` unit tests). Matches the shape of scenarios 3/4/5 already shipped. End-to-end webhook harness deferred per scope. |

## `yarn verify` Summary

```
$ yarn verify
✓ typecheck OK (tsc --noEmit clean)
✓ lint OK (Biome, all files)
✓ tests OK — 244 test files / 1732 passing / 0 todo
  - Acceptance: 11 active GREEN, 0 it.todo
  - Unit + integration: 1721 passing, no regressions
```

Total acceptance file: `src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts`
Total scheduler unit tests: 4 (boot run, 24h tick, stop, error swallowed)
Total guard tests added: 2 (with-repo, without-repo)
Total controller tests added: 3 (fresh cross-fork, fresh same-repo, followup cross-fork)

## Follow-ups

1. **Pre-SPEC-170 worktree sweep on prod** — one-time manual cleanup of `.claude/worktrees/` under the operator's home; documented in deploy runbook (predecessor report §Follow-ups #4).
2. **Operator documentation for GitHub fork authentication** — short HARNESS-ONBOARDING entry confirming that cross-fork PRs require git credentials cached on the operator's machine (HTTPS creds or SSH key). No code change.
