---
title: "SPEC-170: Pre-built Worktree Lifecycle Managed by ReviewFlow"
labels: enhancement, P2-important, worktree, webhook
milestone: June 15 Migration
status: DRAFT
blocked-by: SPEC-169
---

# SPEC-170: Pre-built Worktree Lifecycle Managed by ReviewFlow

## Problem Statement

After SPEC-169 migrates the project to `claude --bg`, Claude creates its own worktree on-demand from HEAD of the launch directory, under `.claude/worktrees/`. This default behavior has two limitations for ReviewFlow's review workflow:

1. **Wrong branch**: Claude's worktree starts from the local repo's HEAD, not the MR's source branch. Reviews end up reading "the wrong code" — the system prompt has historically contained a 500-token disclaimer (`buildMcpSystemPrompt`) telling Claude that local state is UNRELIABLE and to fetch the diff via `glab mr diff` / `gh pr diff`. This works but wastes tokens on every review and limits Claude's ability to navigate the actual code.
2. **No lifecycle management**: Worktrees accumulate without explicit cleanup. Claude's supervisor reclaims idle sessions after ~1 hour, but the worktrees themselves can persist indefinitely. With 100+ concurrent open MRs on a large monorepo, disk usage grows uncontrolled.

By having ReviewFlow pre-create the worktree on the MR's actual source branch and explicitly manage its lifecycle (create on open/push, remove on merge/close, sweep stale after 7 days), three benefits unlock:
- Claude reads the real branch state — agents like `clean-architecture`, `react-best-practices` become substantially more accurate.
- The "local state UNRELIABLE" disclaimer disappears from the system prompt (~500 tokens saved per review).
- Disk usage stays bounded: roughly one worktree per open MR.

## User Story

**As** the operator of ReviewFlow,
**I want** every review to run inside a pre-built git worktree checked out on the MR's source branch, with lifecycle tied to webhook events (open → create, merge/close → remove) plus a daily sweep for orphans,
**So that** reviews see the actual code being reviewed, the system prompt is leaner, and disk usage stays bounded over time.

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | Worktree creation on first review | When a webhook arrives for an MR with no existing worktree, ReviewFlow runs `git fetch origin <source-branch>` then `git worktree add <path> <source-branch>` before dispatching Claude |
| 2 | Worktree reuse for followups | Subsequent reviews/followups on the same MR reuse the existing worktree. `git fetch` + `git reset --hard origin/<source-branch>` updates it to the latest commit |
| 3 | `claude --bg` invoked with worktree as cwd | `claudeInvoker.ts` runs `claude --bg` with the worktree path as the working directory, not the original `localPath` |
| 4 | Disable Claude auto-worktree | `.claude/settings.json` in the worktree (or in the launched session config) sets `worktree.bgIsolation: "none"` so Claude doesn't create a nested sub-worktree |
| 5 | MR ↔ worktree path mapping | A persisted mapping (in tracked MR record or a dedicated store) records the worktree path for each open MR |
| 6 | Cleanup on MR merged/closed | Webhooks for `merged`/`closed` actions trigger `git worktree remove <path>` and clear the mapping |
| 7 | Daily safety-net sweep | A scheduled job runs daily and removes worktrees whose mapped MR has been closed >24h or whose mtime is >7 days old |
| 8 | System prompt cleanup | The "local state UNRELIABLE / use glab mr diff / NEVER git diff" section of `buildMcpSystemPrompt` is removed. Claude now sees the right code |
| 9 | GitHub fork support | When the MR source branch is on a fork (GitHub), `git fetch <fork-remote-url> <branch>` adds the fork as a remote (or uses one-shot fetch) before worktree creation |
| 10 | Concurrent-followup serialization per MR | Two followups arriving in <30s on the same MR are serialized: the second waits for the first to complete before reusing/updating the worktree |

### Out of Scope

| Item | Reason |
|------|--------|
| Migrating MR ↔ worktree mapping to a SQL database | Filesystem-based or in-existing-store mapping is sufficient at current scale |
| Worktree-per-followup-event (instead of per-MR) | Disk explosion risk. Per-MR reuse with serialization is the right granularity |
| Disabling worktree isolation for non-MR jobs (e.g., dashboard manual run) | Dashboard manual run still uses worktree if the MR is tracked. Untracked invocations remain on plain `localPath` |
| Cross-repo worktree sharing | One repo, one worktree base. No fancy sharing |
| Cleanup of `.claude/worktrees/` created by Claude itself (pre-SPEC-170) | Manual one-time sweep is acceptable. Future cleanups handled by FR-7 |
| Sandbox / permission isolation per worktree | Standard git worktree isolation is enough. Sandboxing is a separate concern |
| Branch protection check before worktree creation | If `git fetch` succeeds, the branch is reachable. No extra check |

## Functional Requirements

### FR-1: Worktree Path Convention

For an MR identified by `(platform, project, mrNumber)`, the worktree path is:
`<localPath>/.reviewflow-worktrees/<platform>-<project-slug>-mr-<mrNumber>`

The directory `.reviewflow-worktrees/` is distinct from Claude's default `.claude/worktrees/` to make ownership unambiguous.

### FR-2: Create-or-Reuse Logic

Before dispatching Claude for any review or followup:

1. Look up the mapping for `(platform, project, mrNumber)`.
2. If absent: `git fetch origin <source-branch>`, then `git worktree add <path> <source-branch>`, persist the mapping.
3. If present and path exists: `git fetch origin <source-branch>` (from the worktree), then `git reset --hard origin/<source-branch>`.
4. If present but path missing (orphan mapping): clear mapping, fall back to creation.

### FR-3: Dispatch from Worktree

`claudeInvoker.ts` invokes `claude --bg` with `cwd: <worktree-path>` instead of `cwd: <localPath>`. All other flags (`--mcp-config`, `--model`, etc.) unchanged. The MCP system prompt is updated per FR-8 (no more disclaimer).

### FR-4: Claude Sub-worktree Disabled

Either:
- A `.claude/settings.json` in `<worktree-path>` with `{"worktree": {"bgIsolation": "none"}}`, OR
- The `--bg` invocation passes settings explicitly (`--settings '{"worktree": {"bgIsolation": "none"}}'`).

The first option is preferred (persists across invocations).

### FR-5: Cleanup on Merge/Close

In `gitlab.controller.ts` and `github.controller.ts`, the existing `merged` and `closed` action branches trigger `git worktree remove <path>` then clear the mapping. Errors (e.g., worktree already removed) are logged as warnings, not failures.

### FR-6: Daily Sweep Job

A scheduled task (cron-style, every 24h) iterates all entries in `.reviewflow-worktrees/`. For each:
- If a mapping exists and the MR is closed/merged >24h ago: remove.
- If no mapping exists (orphan): remove.
- If mtime is >7 days old regardless of mapping: remove with a warning log.

### FR-7: System Prompt Slimming

`buildMcpSystemPrompt` removes the section "CRITICAL: Data Source Rules" (the disclaimer about local state being UNRELIABLE and the FORBIDDEN list including `git diff`, `git log`, etc.). The skill prompts can now legitimately use `git diff target..HEAD` and `git log` because the working tree is on the MR branch.

### FR-8: GitHub Fork Handling

When `event.pull_request.head.repo.full_name !== event.pull_request.base.repo.full_name` (cross-fork PR), the source branch lives on a fork. The fetch command becomes:
`git fetch <fork-clone-url> <source-branch>:refs/remotes/pr-<number>/head`
followed by `git worktree add <path> refs/remotes/pr-<number>/head`.

### FR-9: Concurrent Followup Serialization

The existing `p-queue` already serializes per-job execution. The MR-level serialization is enforced by keying the queue concurrency on `(platform, project, mrNumber)` for worktree operations specifically, so two followups on the same MR never `git reset --hard` concurrently. Other MRs can still run in parallel.

## Gherkin Scenarios

```gherkin
Feature: ReviewFlow manages git worktrees over MR lifecycle

  Background:
    Given SPEC-169 is deployed and reviews run via `claude --bg`
    And the operator user can run `git worktree` commands in the project directory

  Scenario: First review on a new MR creates a worktree on the source branch
    Given GitLab MR #4242 opens with source branch "feat/new-feature"
    And no worktree exists for this MR
    When the review webhook arrives
    Then `git fetch origin feat/new-feature` is invoked from the project directory
    And `git worktree add <localPath>/.reviewflow-worktrees/gitlab-project-mr-4242 feat/new-feature` is invoked
    And the mapping (gitlab, project, 4242) → <path> is persisted
    And `claude --bg` runs with cwd = <worktree-path>

  Scenario: Followup on the same MR reuses and updates the worktree
    Given GitLab MR #4242 has a worktree at <localPath>/.reviewflow-worktrees/gitlab-project-mr-4242
    And a new push arrives on "feat/new-feature"
    When the followup webhook fires
    Then `git fetch origin feat/new-feature` runs from the worktree
    And `git reset --hard origin/feat/new-feature` runs from the worktree
    And the worktree is reused (no new worktree created)
    And `claude --bg` runs with the same cwd

  Scenario: MR is merged and worktree is removed
    Given GitLab MR #4242 has a worktree
    When a `merged` webhook is received for MR #4242
    Then `git worktree remove <path>` is invoked
    And the mapping is cleared
    And subsequent webhooks for MR #4242 (if any) would recreate from scratch

  Scenario: MR is closed without merge and worktree is removed
    Given GitLab MR #4242 has a worktree
    When a `closed` webhook is received
    Then the same cleanup as the merge case occurs

  Scenario: Cleanup error is logged but does not block webhook response
    Given GitLab MR #4242 has a worktree
    But the worktree directory has been manually deleted
    When a `merged` webhook is received
    Then `git worktree remove` fails with "not a working tree"
    And a warning is logged
    And the mapping is still cleared
    And the webhook returns success

  Scenario: Daily sweep removes worktrees whose MR closed >24h ago
    Given the daily sweep job runs
    And a worktree exists for MR #4100 whose mapping shows status closed 48h ago
    Then `git worktree remove` is invoked for that worktree
    And the mapping is cleared

  Scenario: Daily sweep removes orphan worktrees (no mapping)
    Given the daily sweep job runs
    And a worktree exists at `.reviewflow-worktrees/...` with no corresponding mapping
    Then it is removed with a warning log

  Scenario: Daily sweep removes worktrees idle >7 days regardless of mapping
    Given a worktree's mtime is 8 days old
    And the mapped MR is still open
    Then the worktree is removed with a warning log
    And the mapping is cleared
    And the next review on that MR recreates the worktree fresh

  Scenario: GitHub cross-fork PR fetches from fork URL
    Given GitHub PR #99 is opened from a fork at `https://github.com/contributor/main-app-v3.git`
    And the source branch is "patch-1"
    When the review webhook arrives
    Then `git fetch https://github.com/contributor/main-app-v3.git patch-1:refs/remotes/pr-99/head` is invoked
    And `git worktree add <path> refs/remotes/pr-99/head` is invoked
    And the review proceeds normally

  Scenario: Two followups within 5 seconds on same MR are serialized
    Given two push webhooks arrive 5 seconds apart on MR #4242
    When the followup jobs are queued
    Then the second job waits for the first to release the worktree
    And the worktree is not `git reset --hard` concurrently
    And both followups complete in order

  Scenario: System prompt no longer warns about local state
    Given a review is dispatched via claudeInvoker
    When buildMcpSystemPrompt produces the system prompt
    Then the prompt contains no "UNRELIABLE" or "FORBIDDEN" disclaimer
    And the prompt no longer references `glab mr diff` or `gh pr diff` as a substitute for git diff
    And Claude can use `git diff target..HEAD` and `git log` legitimately
```

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 7 | Cross-module: webhook controllers (gitlab + github), new worktree usecase, scheduled job, claudeInvoker, MCP prompt builder |
| Impact | 1.5 | Medium — improves review quality and unbounds disk usage, but doesn't block operation. Quality gains material but not critical |
| Confidence | 80% | Standard git worktree usage. Lifecycle hooks already exist in webhook controllers. Fork case adds minor uncertainty |
| Effort | 5 pts | Multiple files, new usecase, cron job, fork branching logic, system prompt update, mapping persistence |
| **Score** | **1.68** | |

Priority: **Important**

## INVEST Validation

| Criterion | Pass | Rationale |
|-----------|------|-----------|
| Independent | WARN | Depends on SPEC-169 being live. Otherwise independent of other in-flight work |
| Negotiable | Yes | Path convention, sweep frequency, mapping storage, fork-handling strategy all open |
| Valuable | Yes | Disk bounded + review quality up + system prompt leaner = real operator and review-quality wins |
| Estimable | Yes | ~1 jour IA. Clear file list, standard git operations, lifecycle wiring on existing webhook paths |
| Small | WARN | Borderline at 5 pts. Could split into "worktree creation" + "lifecycle cleanup" + "sweep" but coordination overhead exceeds savings |
| Testable | Yes | Worktree commands mockable; webhook paths already tested; sweep is a pure scheduled task with deterministic input |

## Definition of Done

- [ ] FR-1: Worktree path convention implemented and used consistently
- [ ] FR-2: Create-or-reuse logic in a new usecase (e.g., `ensureWorktree.usecase.ts`)
- [ ] FR-3: `claudeInvoker.ts` dispatches with worktree as cwd
- [ ] FR-4: `worktree.bgIsolation: "none"` set in each created worktree's `.claude/settings.json`
- [ ] FR-5: Cleanup on merge/close branches in both gitlab/github controllers
- [ ] FR-6: Daily sweep job implemented and registered in the scheduler
- [ ] FR-7: `buildMcpSystemPrompt` UNRELIABLE/FORBIDDEN section removed; tests adjusted
- [ ] FR-8: GitHub fork branching handled (cross-fork PR fetch from fork URL)
- [ ] FR-9: Per-MR serialization for worktree operations (extend existing queue keying)
- [ ] All scenarios covered by passing tests (unit + integration on webhook controllers + sweep)
- [ ] `yarn verify` passes
- [ ] Acceptance test GREEN at `src/tests/acceptance/170-prebuilt-worktree-lifecycle.acceptance.test.ts`
- [ ] Imports use `@/` alias + `.js` extension
- [ ] No `any`, no `as Type`, full words in naming
- [ ] Manual one-time sweep done on operator's prod server to remove pre-SPEC-170 worktrees
- [ ] Tracker updated: SPEC-170 → status `implemented`

## Glossary

| Term | Definition |
|------|------------|
| Worktree | Independent working directory tied to a single branch, managed by `git worktree` |
| Source branch | The branch the MR/PR proposes to merge from (e.g., feature branch) |
| Target branch | The branch the MR/PR targets (e.g., master/main). Not checked out — the worktree is on source |
| MR ↔ worktree mapping | Persisted association between a tracked MR/PR and its worktree path on disk |
| Cross-fork PR | A GitHub PR whose source branch lives on a fork repository, not the main repository |
| Daily sweep | Scheduled cleanup job removing stale or orphaned worktrees |
| `bgIsolation` | Claude Code setting controlling whether `--bg` creates a nested worktree inside the cwd |

## Risks

| Risk | Mitigation |
|------|------------|
| `git worktree add` on a large monorepo is slow (5-15s) | Acceptable: one-time per MR, reused for followups. Measure on first deploy |
| Disk fills despite sweep (operator forgets to monitor) | Add a daily metric in the dashboard showing total `.reviewflow-worktrees/` size |
| `git reset --hard` discards local changes if anything ever writes to the worktree | Worktrees are read-only for the review skill. Add documentation in worktree README |
| Fork URL not resolvable (network, auth, fork deleted) | FR-8 wraps fork fetch in try/catch; fallback to error logged + job marked failed |
| Webhook for `closed` arrives twice (idempotency) | `git worktree remove` is naturally idempotent (errors logged as warnings, mapping clear is safe to repeat) |
| Worktrees created before SPEC-170 still consume disk | Manual one-time sweep in DoD; documented in deploy runbook |
