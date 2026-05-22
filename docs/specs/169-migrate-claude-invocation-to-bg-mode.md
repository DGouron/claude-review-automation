---
title: "SPEC-169: Migrate Claude Invocation from -p to --bg Mode"
labels: enhancement, P1-critical, claude-invocation
milestone: June 15 Migration
status: DRAFT
blocked-by: SPEC-168
---

# SPEC-169: Migrate Claude Invocation from `-p` to `--bg` Mode

## Problem Statement

After SPEC-168 validates the subscription-billing hypothesis, ReviewFlow must permanently replace all `claude -p` invocations with `claude --bg` before 2026-06-15. The current `claudeInvoker.ts` spawns Claude with `-p` and parses `stream-json` output for progress tracking. This entire invocation pattern must be replaced with a background-session model: dispatch via `claude --bg`, track completion through multiple complementary signals, retrieve the review report from a known file, and clean up the session afterwards.

The migration also introduces operational concerns absent in the `-p` model: rate-limit handling (Anthropic Pro/Max subscription quotas may cap concurrent sessions), supervisor process lifecycle (the per-user daemon hosting `--bg` sessions can crash or restart), and billing-regression detection (if Anthropic changes `--bg` behavior post-deployment, the system must alert rather than silently overcharge).

ReviewFlow will never request an Anthropic API key. Authentication is exclusively through `claude /login` OAuth on the operator's account.

## User Story

**As** the operator of ReviewFlow,
**I want** every review and followup to dispatch via `claude --bg` instead of `claude -p`, with robust completion detection, rate-limit handling, and billing-regression alerting,
**So that** the system continues operating under subscription billing after 2026-06-15 without per-token charges or silent failures.

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | Replace `-p` spawn with `--bg` dispatch | `claudeInvoker.ts` spawns `claude --bg "<prompt>"` for every review/followup, captures the returned session ID |
| 2 | Triple completion detection | Completion detected via (a) MCP `set_phase("completed")` primary, (b) `claude agents --json` polling fallback every 30s, (c) hard timeout at 15 minutes |
| 3 | Report retrieval from known file | After completion, the review markdown is read from `.claude/reviews/YYYY-MM-DD-MR-XXXX-review.md` (existing skill convention) |
| 4 | Session cleanup | After report extraction, the session is stopped (`claude stop <id>`) and removed (`claude rm <id>`) |
| 5 | Rate-limit handling | If `claude --bg` returns a rate-limit error, the job is re-enqueued with exponential backoff (no job loss) |
| 6 | Supervisor health monitoring | A supervisor crash (detected via `claude daemon status`) emits a critical log and dashboard alert |
| 7 | Billing-regression alert | If a session is observed to consume the API pool (detectable via env-var presence or `claude /usage` output), a critical alert is emitted and dispatching is paused |
| 8 | OAuth-only invocation | The spawned `claude --bg` process runs without `ANTHROPIC_API_KEY` in its environment, ever |
| 9 | ProgressParser simplification | The `--output-format stream-json` parser is removed or stubbed; progress signal flows exclusively through the existing MCP `review-progress` server |
| 10 | Zero remaining `-p` invocations | A grep on the codebase confirms `claude -p` and `claude --print` no longer appear in production paths |

### Out of Scope

| Item | Reason |
|------|--------|
| Worktree lifecycle pre-management | SPEC-170. This spec lets Claude create its own worktree via `--bg` default behavior |
| Automatic rollback to `-p` on failure | Operator explicitly declined a rollback flag. Monitoring + manual revert if needed |
| BYOK or any API-key code path | ReviewFlow never asks for API keys. Out of scope by product principle |
| Refactoring the MCP `review-progress` server | The MCP contract is unchanged. Only the consumer side of completion signals adapts |
| Migrating dashboard's manual followup trigger | The same `claudeInvoker.ts` change covers both webhook and manual paths automatically |
| Multi-tenant subscription pooling | One operator, one Pro/Max account. Multi-tenancy is a separate product question |
| `--output-format` JSON re-introduction in `--bg` mode | Not needed — MCP review-progress carries all required progress signals |

## Functional Requirements

### FR-1: Background Dispatch

In `claudeInvoker.ts`, the current `spawn('claude', ['-p', ...args])` is replaced by a shell invocation of `claude --bg "<prompt>"` with the same `--model`, `--mcp-config`, `--strict-mcp-config`, `--append-system-prompt`, `--allowedTools`, `--disallowedTools`, `--permission-mode bypassPermissions`, and `--dangerously-skip-permissions` flags. The output is parsed to extract the session short ID (e.g., `7c5dcf5d`).

### FR-2: Triple Completion Detection

Three independent completion signals are evaluated; the first that fires wins:

1. **MCP primary**: The MCP `review-progress` server (already in use) reports `set_phase("completed")` or `set_phase("failed")` for the job. ReviewFlow's MCP listener bridges this to the invocation flow.
2. **Polling fallback**: Every 30 seconds, `claude agents --json` is run; the entry matching the captured session ID is inspected. Status `completed`, `failed`, or `stopped` triggers completion.
3. **Hard timeout**: 15 minutes of wall-clock from dispatch without any completion signal triggers a forced stop (`claude stop <id>`), marks the job as failed with reason `timeout`, and emits an error log.

### FR-3: Report Retrieval

After completion (success path), ReviewFlow reads the markdown report from the path produced by the review skill (existing convention: `.claude/reviews/YYYY-MM-DD-MR-XXXX-review.md` for reviews, `.claude/reviews/YYYY-MM-DD-MR-XXXX-followup.md` for followups). If the file is absent after completion, the job is marked failed with reason `report-missing`.

### FR-4: Session Cleanup

After report extraction (or on timeout/failure paths), `claude stop <id>` followed by `claude rm <id>` is invoked. Failures of these cleanup commands are logged as warnings but do not fail the job.

### FR-5: Rate-Limit Handling

If `claude --bg` exits with a rate-limit error (detected via exit code or stderr pattern matching), the job is re-enqueued with an exponential backoff schedule (initial 60s, doubling, max 15min, max 5 retries). No job is silently dropped.

### FR-6: Supervisor Health Monitoring

A background check runs every 5 minutes via `claude daemon status`. If the supervisor is unreachable, a critical log entry is emitted and the dashboard surfaces a "Claude supervisor down" alert. While the supervisor is down, no new dispatches are attempted; in-flight jobs continue to be tracked.

### FR-7: Billing-Regression Detection

Two protective checks:

1. **Pre-dispatch**: Before each `claude --bg` invocation, the process environment is verified free of `ANTHROPIC_API_KEY`. Presence aborts the dispatch with a critical error.
2. **Periodic billing audit**: Every hour, `claude /usage` (or equivalent diagnostic) is parsed. If the output indicates API-pool consumption, a critical alert is emitted and dispatching is paused pending operator review.

### FR-8: ProgressParser Simplification

The `streamJsonParser.ts` consumer in `claudeInvoker.ts` is removed (or made a no-op for backward compatibility tests). `progressParser.ts` is simplified to only consume MCP-originated events, since `--bg` interactive sessions do not emit `stream-json` to stdout.

### FR-9: Codebase Cleanup

A final check (e.g., a grep in CI) verifies that production source files (`src/**`) contain no remaining `claude -p` or `claude --print` invocations.

## Gherkin Scenarios

```gherkin
Feature: Migrate every Claude invocation to --bg mode

  Background:
    Given SPEC-168 has reported GO
    And the reviewflow-app systemd service runs under a user authenticated via claude /login
    And no ANTHROPIC_API_KEY environment variable is set in the service environment

  Scenario: Webhook triggers review dispatched via --bg
    Given a tracked GitLab MR receives a new review-request webhook
    When the review job is dequeued
    Then claudeInvoker spawns `claude --bg "<prompt>"` with the configured flags
    And a session ID is captured from the command output
    And the job state stores the session ID
    And no `claude -p` or `claude --print` invocation occurs

  Scenario: Completion detected via MCP primary signal
    Given a --bg session is dispatched
    When the MCP review-progress server reports set_phase("completed") for the job
    Then the review report is read from `.claude/reviews/YYYY-MM-DD-MR-XXXX-review.md`
    And the session is stopped via `claude stop <id>`
    And the session is removed via `claude rm <id>`
    And the job is marked completed

  Scenario: Completion detected via polling fallback
    Given a --bg session is dispatched
    And the MCP review-progress server emits no completion signal
    When `claude agents --json` reports status "completed" for the session ID
    Then the review report is read from the conventional path
    And cleanup proceeds as above
    And the job is marked completed

  Scenario: Hard timeout reached without completion signal
    Given a --bg session is dispatched
    And 15 minutes elapse without any completion signal
    Then `claude stop <id>` is invoked
    And `claude rm <id>` is invoked
    And the job is marked failed with reason "timeout"
    And an error log is emitted

  Scenario: Report file missing after completion
    Given a --bg session reports completion (via MCP or polling)
    And the expected report file does not exist
    Then the job is marked failed with reason "report-missing"
    And cleanup proceeds as above
    And an error log is emitted

  Scenario: Rate limit error on dispatch
    Given the Anthropic subscription rate limit has been hit
    When claudeInvoker attempts `claude --bg "<prompt>"`
    And the command exits with a rate-limit error
    Then the job is re-enqueued with exponential backoff (60s initial)
    And up to 5 retries are attempted with doubling delay
    And no job is silently dropped

  Scenario: Supervisor down detection
    Given the Claude supervisor daemon has crashed
    When the periodic health check runs `claude daemon status`
    And the command reports unreachable
    Then a critical log entry is emitted
    And the dashboard surfaces a "Claude supervisor down" alert
    And no new dispatches are attempted until the supervisor recovers

  Scenario: Billing regression detected pre-dispatch
    Given ANTHROPIC_API_KEY has somehow been set in the service environment
    When claudeInvoker prepares to dispatch a job
    Then the dispatch is aborted before invoking claude
    And a critical alert is emitted
    And the job is marked failed with reason "billing-regression-prevented"

  Scenario: Periodic billing audit detects API consumption
    Given the periodic billing audit runs
    When `claude /usage` indicates API-pool consumption
    Then a critical alert is emitted
    And the dispatch queue is paused
    And the dashboard surfaces a "Billing regression suspected" alert

  Scenario: Followup job uses same --bg dispatch path
    Given a tracked MR receives a push webhook triggering a followup
    When the followup job is dequeued
    Then the same claudeInvoker code path is used
    And the followup runs via `claude --bg` with the followup skill prompt
    And completion, cleanup, and report retrieval work identically to a review
```

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 10 | Every review and followup goes through `claudeInvoker.ts` — entire platform impact |
| Impact | 3 | Critical — failure blocks all reviews post-15-juin, or causes uncontrolled API billing |
| Confidence | 80% | Architecture is clear, dependencies on SPEC-168 outcome reduce certainty until POC done |
| Effort | 3 pts | Multiple files, three completion mechanisms, rate limit + supervisor + billing protections |
| **Score** | **8.0** | |

Priority: **Critical**

## INVEST Validation

| Criterion | Pass | Rationale |
|-----------|------|-----------|
| Independent | WARN | Depends on SPEC-168 outcome. Otherwise standalone (no SPEC-170 dependency) |
| Negotiable | Yes | Polling interval (30s), timeout (15min), retry policy (60s/5x), audit cadence (hourly) all tunable |
| Valuable | Yes | Unblocks ReviewFlow's continued operation past 2026-06-15. Existential value |
| Estimable | Yes | ~0.5-0.75 jour IA. Clear file list, clear mechanisms, no architectural unknowns |
| Small | WARN | Borderline: ~5-8 files touched. Splitting further (e.g., rate-limit as a separate spec) would slow delivery. Acceptable |
| Testable | Yes | Each scenario has deterministic inputs/outputs. Mocks for `claude` binary and MCP server enable unit-level coverage |

## Definition of Done

- [ ] FR-1: `claudeInvoker.ts` dispatches via `claude --bg`, no `-p` flag remains in production code
- [ ] FR-2: Three completion signals implemented (MCP, polling, timeout), first-wins logic verified
- [ ] FR-3: Report retrieved from `.claude/reviews/YYYY-MM-DD-MR-XXXX-{review,followup}.md`
- [ ] FR-4: Cleanup (`claude stop` + `claude rm`) runs in all completion paths
- [ ] FR-5: Rate-limit detection + exponential backoff re-enqueue
- [ ] FR-6: Supervisor health check every 5min + dashboard alert
- [ ] FR-7: Pre-dispatch ANTHROPIC_API_KEY check + hourly billing audit
- [ ] FR-8: `streamJsonParser.ts` removed or no-op; `progressParser.ts` consumes only MCP events
- [ ] FR-9: CI grep confirms zero `claude -p` / `claude --print` in `src/**`
- [ ] All scenarios covered by passing tests (unit + integration)
- [ ] `yarn verify` passes (typecheck + lint + test:ci)
- [ ] Acceptance test GREEN at `src/tests/acceptance/169-migrate-claude-invocation-to-bg-mode.acceptance.test.ts`
- [ ] Imports use `@/` alias + `.js` extension
- [ ] No `any`, no `as Type`, full words in naming
- [ ] Deployed to prod before 2026-06-10 (5-day safety margin before billing change)
- [ ] Tracker updated: SPEC-169 → status `implemented`

## Glossary

| Term | Definition |
|------|------------|
| `--bg` | Claude Code background invocation mode, subscription-billed (per SPEC-168 verdict) |
| Session ID | Short alphanumeric identifier returned by `claude --bg`, used with `claude attach/logs/stop/rm` |
| Supervisor | Per-user daemon hosting `--bg` sessions, managed by Claude Code, distinct from ReviewFlow process |
| Completion signal | Any of: MCP `set_phase("completed")`, `claude agents --json` status, or 15-min timeout |
| Billing regression | Observation that a `--bg` session consumed API pool instead of subscription pool |
| OAuth claude.ai | The only authentication method ReviewFlow ever uses. No API keys, ever |

## Risks

| Risk | Mitigation |
|------|------------|
| MCP `set_phase` reliability unknown in `--bg` mode (vs. `-p` where it was tested) | Polling fallback (FR-2.b) plus hard timeout (FR-2.c) compensate |
| Anthropic rate limits for Pro/Max in `--bg` mode unknown | FR-5 ensures jobs are queued, not dropped. Operator monitors quota dashboards |
| Supervisor daemon crash during heavy load | FR-6 alert; manual `claude daemon restart` recovers. Sessions resume on supervisor return |
| Anthropic changes `--bg` behavior between deployment and 15-juin | Deploy ≥5 days before. Operator-led monitoring catches drift |
| Report file race condition (read before Claude finished writing) | Read only after completion signal; verify file mtime > dispatch time; add small post-completion delay if needed |
