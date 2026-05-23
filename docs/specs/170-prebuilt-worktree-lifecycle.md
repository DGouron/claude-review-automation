---
title: "SPEC-170: Pre-built Worktree Lifecycle Managed by ReviewFlow"
labels: enhancement, P2-important, worktree, webhook
milestone: June 15 Migration
status: implemented
blocked-by: SPEC-169
---

# SPEC-170: Pre-built Worktree Lifecycle Managed by ReviewFlow

## Status: implemented

All 9 functional requirements shipped across 2 PRs. Acceptance file **11/11 GREEN**. AC-11 (manual one-time sweep of pre-SPEC-170 worktrees on prod) remains a deploy-runbook task, not a code item.

## Implementation

Shipped across two PRs.

**PR #175 — FRs 1, 2, 3, 4, 5, 7, 9** (report: `docs/reports/170-prebuilt-worktree-lifecycle.report.md`)

- New bounded context `src/modules/worktree-management/` (entities, gateways, use cases)
- Path convention + ensure-or-reuse + dispatch-from-worktree + bgIsolation settings + close/merge cleanup + system prompt slimming + MR-scoped p-queue serialization
- 5 acceptance scenarios GREEN (3, 4, 5, 10, 11)

**FR-6 + FR-8 follow-up** (plan: `docs/plans/170-prebuilt-worktree-lifecycle-fr6-fr8.plan.md` · report: `docs/reports/170-prebuilt-worktree-lifecycle-fr6-fr8.report.md`)

- `src/frameworks/scheduler/worktreeSweepScheduler.ts` — daily 24h sweep wrapping the existing `sweepStaleWorktrees` use case; booted in `src/main/server.ts` alongside `cleanupScheduler`
- `src/modules/platform-integration/entities/github/githubPullRequestEvent.guard.ts` — optional `head.repo` + `base.repo`
- `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` — `computeSourceForkCloneUrl` helper populates `ReviewJob.sourceForkCloneUrl` on both fresh and followup paths; existing `deriveMrSourceFromJob → ensureWorktree → deriveFetchRef` chain does the rest
- `src/main/dependencies.ts` + `src/main/routes.ts` — `worktreeGateway` + `gitCommandExecutor` promoted to `Dependencies` (single executor instance shared by routes, scheduler, gateway)
- 4 acceptance scenarios GREEN (6, 7, 8, 9)

**Acceptance close-out — same PR**

- `src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts` — scenarios 1 + 2 converted from `it.todo` to active tests at the `ensureWorktree` boundary (same assertion shape as scenario 9). Acceptance file now **11/11 GREEN**.

**Architectural decisions taken**

| Decision | Choice |
|----------|--------|
| Mapping storage | None — path encodes identity, active MR list from existing tracker |
| Worktree location | `~/.reviewflow/worktrees/<platform>-<projectSlug>-<mrNumber>/` |
| Per-MR serialization | MR-scoped p-queue concurrency key (extends existing `pQueueAdapter`) |
| Single `GitCommandExecutor` instance | Avoids `.git/worktree.lock` contention between sweep + close-branch action |
| Fork auth | Operator-managed (cached HTTPS creds or SSH key); failure surfaces as `branch-not-found` |

**Deferred (deploy-runbook task, not code)**

- AC-11 — manual one-time sweep of pre-SPEC-170 worktrees on the operator's prod server

## Context

After SPEC-169, every review runs through `claude --bg`. By default Claude creates a worktree on-demand from the launch directory's HEAD — which is **not** the MR's source branch. Two consequences: reviews end up reading the wrong code (mitigated today by a 500-token "local state UNRELIABLE" disclaimer in the system prompt), and worktrees accumulate without cleanup. By pre-creating the worktree on the actual source branch and managing its lifecycle through webhook events, three benefits unlock: reviews see the real code, the disclaimer disappears (~500 tokens/review saved), and disk usage stays bounded.

## User Story

**As** the operator of ReviewFlow,
**I want** every review to run inside a pre-built git worktree checked out on the MR's source branch, with lifecycle tied to webhook events (open → create, push → fast-forward, merge/close → remove) plus a daily sweep for orphans,
**So that** reviews see the actual code under review, the system prompt is leaner, and disk usage stays bounded over time.

## Scope

### In Scope

| # | Capability |
|---|------------|
| 1 | Worktree created on first review at a deterministic path derived from MR identity |
| 2 | Worktree reused and fast-forwarded on subsequent reviews/followups |
| 3 | `claude --bg` invoked with the worktree as `cwd` instead of the original local checkout |
| 4 | Claude's native sub-worktree creation disabled inside the pre-built worktree |
| 5 | Worktree removed on `merged` / `closed` webhook actions |
| 6 | Daily sweep removes worktrees of inactive MRs and stale orphans |
| 7 | MCP system prompt no longer disclaims local state as unreliable |
| 8 | GitHub cross-fork PRs fetch from the fork URL before worktree creation |
| 9 | Concurrent followups on the same MR are serialized |

### Out of Scope

| Item | Reason |
|------|--------|
| Persistent MR ↔ worktree mapping store | Path convention encodes identity — no separate store needed |
| Worktree-per-followup-event | Disk explosion risk. Per-MR reuse with serialization is the right granularity |
| Cross-repo worktree sharing | One repo, one worktree base — no fancy sharing |
| Sandbox / permission isolation per worktree | Standard git worktree isolation is enough |
| Branch protection check before creation | If `git fetch` succeeds, the branch is reachable |
| Migration of pre-SPEC-170 worktrees | Manual one-time sweep documented in deploy runbook |

## Architectural Decisions (validated)

| Decision | Choice |
|----------|--------|
| **Mapping storage** | None — the worktree path encodes MR identity (`<platform>-<project>-<mrNumber>`); active MR list comes from existing tracker (`getActiveMrs`) |
| **Worktree location** | Outside the source checkout: `~/.reviewflow/worktrees/<platform>-<project-slug>-<mrNumber>/` |
| **Per-MR serialization** | Extend the existing p-queue with a concurrency key derived from MR identity; cross-MR work remains parallel |

## Functional Requirements

### FR-1: Worktree Path Convention

For an MR identified by `(platform, project, mrNumber)`, the canonical worktree path is:

```
~/.reviewflow/worktrees/<platform>-<project-slug>-<mrNumber>/
```

`<project-slug>` is the project identifier sanitized for filesystem safety (slashes replaced by dashes). The base directory `~/.reviewflow/worktrees/` is created on first use. The path **is** the identity — no store of "(MR, path)" pairs exists.

### FR-2: Ensure-or-Reuse Logic

Before dispatching Claude for any review or followup:

1. Compute the canonical worktree path from the MR identity.
2. If the path does not exist on disk: `git fetch origin <source-branch>` from the source checkout, then `git worktree add <path> origin/<source-branch>`.
3. If the path exists: from inside the worktree, `git fetch origin <source-branch>` then `git reset --hard origin/<source-branch>`.
4. Run `git worktree prune` defensively before any operation to keep git's internal worktree list in sync with the filesystem.

### FR-3: Dispatch from Worktree

`claudeInvoker` invokes `claude --bg` with `cwd: <worktree-path>`. All other flags unchanged. The MCP system prompt is updated per FR-7.

### FR-4: Claude Sub-worktree Disabled

A `.claude/settings.json` is written inside each created worktree with `{"worktree": {"bgIsolation": "none"}}` so Claude never creates a nested sub-worktree.

### FR-5: Cleanup on Merge/Close

`gitlab.controller` and `github.controller` invoke `git worktree remove <path>` on `merged` / `closed` actions. Errors (worktree already gone, path not found) are logged as warnings and do not fail the webhook response.

### FR-6: Daily Sweep Job

A scheduled task runs every 24h. For each directory in `~/.reviewflow/worktrees/`:

- Parse the MR identity from the directory name.
- Cross-reference with the tracker (`getActiveMrs` from each tracked project): if the MR is no longer active (merged/closed) and the directory mtime is >24h old → remove.
- If no matching tracked MR exists (orphan) → remove with a warning log.
- If mtime >7 days regardless of tracker state → remove with a warning log.

### FR-7: System Prompt Slimming

`buildMcpSystemPrompt` removes the "CRITICAL: Data Source Rules" section (the "local state is UNRELIABLE / FORBIDDEN: git diff, git log" block). Skill prompts that referenced `glab mr diff` / `gh pr diff` as a substitute switch to plain `git diff target..HEAD` and `git log`.

### FR-8: GitHub Fork Handling

When `event.pull_request.head.repo.full_name !== event.pull_request.base.repo.full_name`:

```
git fetch <fork-clone-url> <source-branch>:refs/remotes/pr-<number>/head
git worktree add <path> refs/remotes/pr-<number>/head
```

### FR-9: Concurrent Followup Serialization

The existing p-queue is extended with a concurrency key derived from MR identity (`<platform>-<project>-<mrNumber>`). Two followups arriving in <30s on the same MR are serialized; cross-MR work stays parallel.

## Rules

- a worktree's identity is its path; the path is fully determined by the MR identity (platform, project, mrNumber)
- before any worktree operation, git's worktree list is pruned to reflect filesystem reality
- a worktree's lifecycle spans MR open → MR merged/closed; a stale worktree (mtime >7 days) is removed regardless of MR state
- cleanup failures are warnings, not errors — the webhook response never depends on cleanup success
- two operations targeting the same MR worktree never run concurrently; operations on distinct MRs run in parallel
- the system prompt does not warn agents about local state when reviews run inside a worktree on the source branch

## Scenarios

- first review on new MR: {webhook: "open", branch: "feat/X", worktree on disk: "absent"} → create worktree + dispatch from worktree
- followup on existing MR: {webhook: "push", branch: "feat/X", worktree on disk: "present"} → fast-forward worktree + dispatch from worktree
- merge cleanup: {webhook: "merged"} → remove worktree + clear nothing else
- close cleanup: {webhook: "closed", merged: false} → remove worktree + clear nothing else
- merge with worktree already gone: {webhook: "merged", worktree on disk: "absent"} → log warning + webhook returns success
- daily sweep — closed MR over 24h: {worktree: "present", tracker state: "merged 48h ago"} → remove worktree
- daily sweep — orphan: {worktree: "present", tracker MR: "absent"} → remove worktree + warning log
- daily sweep — stale active MR: {worktree mtime: "8 days", tracker state: "pending-review"} → remove worktree + warning log + next review recreates fresh
- cross-fork PR: {platform: "github", head.repo: "contributor/fork", source: "patch-1"} → fetch from fork URL + worktree add from `refs/remotes/pr-N/head`
- concurrent followups: {two push webhooks within 5s on same MR} → second waits for first; both complete in order
- system prompt without disclaimer: {review dispatched via claudeInvoker} → prompt contains no "UNRELIABLE" / "FORBIDDEN" block; agents may use plain git commands

## Acceptance Criteria

- [ ] AC-1: First review on a new MR creates a worktree at `~/.reviewflow/worktrees/<platform>-<project-slug>-<mrNumber>/` checked out on the source branch
- [ ] AC-2: A followup webhook reuses the worktree path and fast-forwards it (`git fetch` + `git reset --hard origin/<source-branch>`)
- [ ] AC-3: `merged` or `closed` webhook removes the worktree; missing-worktree errors are warnings, not failures
- [ ] AC-4: Daily sweep removes worktrees whose MR is merged/closed >24h ago, orphan worktrees, and stale worktrees (mtime >7 days)
- [ ] AC-5: `claude --bg` is invoked with `cwd = <worktree-path>` for all MR-bound reviews
- [ ] AC-6: Each created worktree contains `.claude/settings.json` with `{"worktree": {"bgIsolation": "none"}}`
- [ ] AC-7: `buildMcpSystemPrompt` output contains no "UNRELIABLE" / "FORBIDDEN" / `glab mr diff` / `gh pr diff` substrings
- [ ] AC-8: GitHub cross-fork PRs fetch from the fork URL and create the worktree from `refs/remotes/pr-<number>/head`
- [ ] AC-9: Two followups on the same MR within 5s execute serially; two reviews on distinct MRs execute in parallel
- [ ] AC-10: Acceptance test green at `src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts`
- [ ] AC-11: Manual one-time sweep done on the operator's prod server (documented in deploy runbook)
- [ ] AC-12: Tracker updated — SPEC-170 → status `implemented`

## Operational Notes

**Manual pre-deploy sweep** (executed once during deployment):

```bash
# Inspect what exists today
ls -la ~/.reviewflow/worktrees/ 2>/dev/null
find <repo>/.claude/worktrees/ -maxdepth 1 -type d 2>/dev/null

# Remove pre-SPEC-170 Claude-managed worktrees that are no longer mapped to an open MR
git -C <repo> worktree list --porcelain
# For each unmapped worktree path: git -C <repo> worktree remove <path>
```

**Disk monitoring** (post-deploy):

```bash
du -sh ~/.reviewflow/worktrees/
ls ~/.reviewflow/worktrees/ | wc -l   # rough count of active MRs
```

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 7 | Cross-module: webhook controllers (gitlab + github), new worktree module, scheduled job, claudeInvoker, MCP prompt builder |
| Impact | 1.5 | Medium — improves review quality and unbounds disk usage, but doesn't block operation |
| Confidence | 80% | Standard git worktree usage; lifecycle hooks already exist in webhook controllers; fork case adds minor uncertainty |
| Effort | 5 pts | Multiple files, new module, cron job, fork branching logic, system prompt update |
| **Score** | **1.68** | |

Priority: **Important**

## INVEST Validation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | WARN | Depends on SPEC-169 being live; otherwise independent |
| Negotiable | OK | Path convention, sweep frequency, fork handling all open |
| Valuable | OK | Disk bounded + review quality up + system prompt leaner |
| Estimable | OK | ~1 jour IA; clear file list, standard git operations |
| Small | WARN | Borderline at 5 pts; user chose monolithic PR over split |
| Testable | OK | Worktree commands mockable; webhook paths already tested; sweep is a pure scheduled task |

## Glossary

| Term | Definition |
|------|------------|
| Worktree | Independent working directory tied to a single branch, managed by `git worktree` |
| Source branch | The branch the MR/PR proposes to merge from (e.g., a feature branch) |
| Target branch | The branch the MR/PR targets (typically master/main) — not checked out by ReviewFlow |
| Cross-fork PR | A GitHub PR whose source branch lives on a fork repository, not the main repository |
| Daily sweep | Scheduled cleanup job removing inactive, orphan, or stale worktrees |
| `bgIsolation` | Claude Code setting controlling whether `--bg` creates a nested worktree inside the cwd |
| Orphan worktree | A directory under `~/.reviewflow/worktrees/` that does not correspond to any tracked MR |
| Stale worktree | A worktree whose mtime is older than 7 days regardless of MR state |

## Risks

| Risk | Mitigation |
|------|------------|
| `git worktree add` on a large monorepo is slow (5-15s) | Acceptable: one-time per MR, reused for followups. Measure on first deploy |
| Disk fills despite sweep (operator forgets to monitor) | Add a daily metric in the dashboard showing total `~/.reviewflow/worktrees/` size |
| `git reset --hard` discards local changes if anything ever writes to the worktree | Worktrees are read-only for the review skill; documented in worktree README |
| Fork URL not resolvable (network, auth, fork deleted) | FR-8 wraps fork fetch in try/catch; fallback to error logged + job marked failed |
| Webhook for `closed` arrives twice (idempotency) | `git worktree remove` is naturally idempotent; warnings logged, no failure |
| Worktrees created before SPEC-170 still consume disk | Manual one-time sweep in DoD, documented in deploy runbook |
| Filesystem and git worktree list diverge (manual `rm -rf`) | `git worktree prune` runs defensively at the start of every operation |
