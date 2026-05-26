---
title: Worktree Lifecycle
---

# Worktree Lifecycle

Reviewflow runs each Claude review in a **pre-built git worktree** dedicated to the merge request. This page explains why, where worktrees live on disk, and how they are created, reused, and reclaimed.

## Why worktrees

Earlier versions of Reviewflow invoked `claude -p` in the user's main checkout. That coupled review state to the developer's working copy and caused three classes of bugs:

- Concurrent reviews stepped on each other's index
- `git checkout` inside Claude polluted the parent branch
- Followup reviews could not reproduce the exact state of the MR head

Switching to one worktree per MR isolates each review in its own checkout, lets concurrent reviews on different MRs run truly in parallel, and gives followup reviews a stable cwd that always reflects the latest push.

## On-disk layout

```
~/.reviewflow/worktrees/
├── gitlab-myorg-myrepo-142/        # platform-slug-mrNumber
│   ├── .claude/
│   │   └── settings.json           # { "worktree": { "bgIsolation": "none" } }
│   ├── .git                        # git worktree pointer
│   └── ...                         # full project checkout at the MR head
├── github-myorg-otherrepo-87/
└── gitlab-myorg-myrepo-156/
```

| Element | Source |
|---|---|
| Base dir | `~/.reviewflow/worktrees/` — see `WORKTREE_BASE_DIR` in `src/shared/services/daemonPaths.ts` |
| Directory name | `<platform>-<slug>-<mrNumber>` — `deriveWorktreeDirectoryName` in `src/modules/worktree-management/entities/worktree/worktree.ts` |
| Slug | `projectPath` with `/` replaced by `-` |
| `.claude/settings.json` | `{ worktree: { bgIsolation: 'none' } }` — tells the Claude CLI not to create a nested worktree inside the review worktree |

The parse function `parseWorktreeDirectoryName` accepts directories matching `^(gitlab|github)-(.+)-(\d+)$`. Anything else is ignored by the sweep.

## End-to-end flow

```
Webhook ──► Queue ──► ensureWorktree ──► dispatchClaudeSession (--bg)
                              │                       │
                              │                       ▼
                              │             awaitSessionCompletion
                              │                       │
                              │         ┌─────────────┼─────────────┐
                              │         ▼             ▼             ▼
                              │   MCP set_phase   agents --json  timeout 15min
                              │         │             │             │
                              │         └─────────────┼─────────────┘
                              │                       ▼
                              │              retrieveReviewReport
                              │                       │
                              ▼                       ▼
                       (worktree reused                Post to MR/PR
                        on followup)                   cleanupClaudeSession

On merge / close ──► removeWorktree
Daily 02:00     ──► sweepStaleWorktrees
```

## `ensureWorktree` — create or fast-forward

Source: `src/modules/worktree-management/usecases/ensureWorktree.usecase.ts`

The use case is **idempotent**. First call creates the worktree; subsequent calls (followup reviews) fetch and reset to the MR head.

| Branch | Sequence |
|---|---|
| Fresh review (path does not exist) | `git worktree prune` → `git fetch <remote> <refspec>` from source checkout → `git worktree add <path> <ref>` → write `.claude/settings.json` → return `{ status: 'created' }` |
| Followup (path exists) | `git worktree prune` → `git fetch <remote> <refspec>` inside the worktree → `git reset --hard <ref>` → return `{ status: 'reused' }` |
| Source branch deleted upstream | Fetch fails → return `{ status: 'failed', reason: 'branch-not-found' }`. `claudeInvoker` propagates the failure rather than running the review against the wrong tree. |
| `.claude/settings.json` write failure | Logged as `settingsWarning`. Dispatch continues. Worst case: Claude opens a nested sub-worktree (pre-SPEC-170 behaviour). |

### Fetch refspec — origin vs fork

Source: `deriveFetchRef` in `worktree.ts`.

| MR source | Refspec | Worktree ref |
|---|---|---|
| `origin` (same repo) | `<sourceBranch>` | `origin/<sourceBranch>` |
| `fork` (cross-repo PR) | `<sourceBranch>:refs/remotes/pr-<mrNumber>/head` | `refs/remotes/pr-<mrNumber>/head` |

Cross-fork support exists in the use case; GitHub controller wiring is tracked under FR-8 of SPEC-170.

## `removeWorktree` — on merge / close

Source: `src/modules/worktree-management/usecases/removeWorktree.usecase.ts`

Triggered by the webhook controllers when a merge request transitions to `merged` or `closed`:

- `gitlab.controller.ts` — close + merge
- `github.controller.ts` — close (merged PRs are funneled through the same `closeResult` branch)

The operation is **idempotent**. A missing worktree returns `{ status: 'not-found' }` and logs a warning — never an error.

## `sweepStaleWorktrees` — daily safety net

Source: `src/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.ts`

A worktree is reclaimed when **any** of these is true:

| Predicate | Threshold |
|---|---|
| Tracked MR not found in any enabled repository | immediate |
| Tracked MR is `merged` or `closed` for more than 24h | `ONE_DAY_MS` |
| Worktree directory `mtime` older than 7 days | `STALE_THRESHOLD_MS = 7 * ONE_DAY_MS` |

The sweep walks every directory under `~/.reviewflow/worktrees/` that matches the naming pattern, cross-references the tracking gateway across all enabled repositories, and removes the matches. Failures are counted but do not abort the sweep.

## Concurrency

The queue (`pQueueAdapter`) serializes operations sharing the same MR key `<platform>:<projectPath>:<mrNumber>`. Fresh review and followup on the same MR run sequentially against the same worktree. Reviews on different MRs run in parallel up to `queue.maxConcurrent` (default 2).

## Operator commands

```bash
# Inspect worktrees on disk
ls -la ~/.reviewflow/worktrees/

# Disk usage per worktree
du -sh ~/.reviewflow/worktrees/*

# Manual cleanup (rare — sweep handles this)
git worktree prune
rm -rf ~/.reviewflow/worktrees/<platform>-<slug>-<mrNumber>
```

The dashboard "Worktree" panel surfaces the same information plus per-worktree size probe — see SPEC-173.

## Related specs and reports

| Concern | Spec | Report |
|---|---|---|
| `claude -p` → `claude --bg` migration | [SPEC-169](../specs/169-migrate-claude-invocation-to-bg-mode.md) | [Report](../reports/169-migrate-claude-invocation-to-bg-mode.report.md) |
| Pre-built worktree lifecycle | [SPEC-170](../specs/170-prebuilt-worktree-lifecycle.md) | [Report](../reports/170-prebuilt-worktree-lifecycle.report.md) |
| Daily sweep scheduler + GitHub fork | [SPEC-170 FR6/FR8](../specs/170-prebuilt-worktree-lifecycle.md) | [Report](../reports/170-prebuilt-worktree-lifecycle-fr6-fr8.report.md) |
| Dashboard worktree panel | [SPEC-173](../specs/173-dashboard-worktree-panel.md) | [Report](../reports/173-dashboard-worktree-panel.report.md) |
| Worktree failure visibility | [SPEC-175](../specs/175-worktree-failure-visibility.md) | — |
