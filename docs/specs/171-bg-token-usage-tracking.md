---
title: "SPEC-171: Re-enable Token Usage Tracking in --bg Mode"
labels: enhancement, P2-important, observability, claude-invocation
milestone: June 15 Migration
status: DRAFT
blocked-by: SPEC-169
---

# SPEC-171: Re-enable Token Usage Tracking in --bg Mode

## Problem Statement

SPEC-169 migrated `claudeInvoker.ts` from `claude -p` (which emits `stream-json` to stdout including `{ input_tokens, output_tokens, ... }` per response) to `claude --bg` (which detaches the session into a supervised daemon and does not stream usage data back to the spawning process). As a side-effect, `deps.trackTokenUsage` is no longer called and `broadcastBudgetAfterUsage` is no longer fired.

Operationally this means:
- `BudgetStatusPresenter` reports zero post-deploy — the dashboard budget widget goes blind.
- The pre-existing `auditBilling` safety net (FR-7 of SPEC-169) is the **only** remaining cost-visibility signal, and that signal is binary (regression yes/no), not granular.
- Combined with the `/usage` CLI surface uncertainty (also a SPEC-169 follow-up), the operator loses both cost tracking AND granular regression alerting at the same time.

This is a load-bearing operational tool, not a "nice to have". The budget cap (SPEC-163) cannot enforce a cap it cannot see.

## User Story

**As** the operator of ReviewFlow,
**I want** post-completion token usage extracted from each `claude --bg` session and forwarded to `TrackTokenUsageUseCase` + budget broadcast,
**So that** the dashboard budget widget keeps working and SPEC-163 budget caps remain enforceable.

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | Capture session token usage post-completion | After `awaitSessionCompletion` settles with `outcome: 'completed'`, parse usage from `claude logs <sessionId>` (or an equivalent CLI subcommand) before `cleanupClaudeSession` removes the session |
| 2 | Map raw usage to `TokenUsage` schema | Reuse the existing Zod schema in `src/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.ts` so downstream code is unchanged |
| 3 | Call `deps.trackTokenUsage` from `invokeViaBackgroundSession` | Replace the current `// NOTE: token tracking is intentionally disabled` block with an actual usage extraction step |
| 4 | Broadcast budget after each successful review | Re-fire `broadcastBudgetAfterUsage` after a usage record is written, identical to the pre-SPEC-169 behaviour |
| 5 | Graceful degradation when extraction fails | If `claude logs` is unavailable or returns unparseable output, log a warning with the raw output and skip tracking for this session — do NOT crash the review |

### Out of Scope

| Item | Why / Where |
|------|------------|
| Real-time mid-session token broadcasting | `--bg` decouples session from caller; mid-session usage requires WebSocket from Claude daemon, not in current CLI surface |
| Replacement of `/usage` audit | Distinct concern — `auditBilling` checks the *pool* (API vs subscription), this spec tracks *consumption* |
| Migration of historical pre-SPEC-169 records | Records emitted by the previous code path are already on disk and remain consumable by `BudgetStatusPresenter` |

## Acceptance Criteria

- [ ] AC-1: After a successful `--bg` review, the `tokenUsage.filesystem.gateway` has at least one new record for that `jobId`
- [ ] AC-2: `BudgetStatusPresenter` returns a `currentSpendingUsd > 0` after at least one review since SPEC-171 ships
- [ ] AC-3: A `--bg` session that completes without parseable usage logs a single warning and does NOT block the review pipeline
- [ ] AC-4: Unit test asserts that `deps.trackTokenUsage` is called exactly once per successful review and zero times per failed/timeout review

## Risks & Mitigations

| # | Risk | Mitigation |
|---|------|------------|
| 1 | `claude logs <sessionId>` does not exist or output is unparseable | First investigation step is a CLI surface probe; if no surface exists, this spec blocks until Anthropic exposes one (escalate via `claude doctor` / support) |
| 2 | Parsing a real CLI output is fragile (regex against unstable format) | Pin a real-output fixture in `src/tests/fixtures/claudeCli/`; refresh fixture on Claude version bumps |
| 3 | Concurrent reviews race to write to the same usage file | Existing `FilesystemTokenUsageGateway` already handles append-only semantics — verify under contention before merging |

## Glossary

| Term | Definition |
|------|------------|
| Session usage | The total `{ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }` consumed by a single `claude --bg` session, summed across all assistant turns |
| `claude logs <sessionId>` | Anthropic CLI command (assumed) that prints the session's log file content to stdout — to be verified against the deployed CLI version before implementation |
| Budget broadcast | WebSocket event emitted by `broadcastBudgetAfterUsage` to refresh the dashboard's budget widget in real time |
