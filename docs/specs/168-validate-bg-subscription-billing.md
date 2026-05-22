---
title: "SPEC-168: Validate --bg Subscription Billing (POC)"
labels: validation, P1-critical, claude-invocation
milestone: June 15 Migration
status: DRAFT
---

# SPEC-168: Validate `--bg` Subscription Billing (POC)

## Problem Statement

On 2026-06-15, Anthropic will move Claude Code `--print` (`-p`) mode invocations to API-pool billing. Subscription Pro/Max coverage will no longer apply to programmatic `claude -p` usage. ReviewFlow currently spawns `claude -p` from `claudeInvoker.ts` for every review, exposing the project to ~$1,549/month at API rates against a $200/month budget.

The documented replacement path is `claude --bg`, which the official agent-view documentation describes as subscription-billed: *"background sessions consume your subscription usage the same as interactive sessions"*. However, this is a research-preview feature and the claim has not been empirically verified on ReviewFlow's production environment.

Before re-architecting `claudeInvoker.ts` and migrating 620+ reviews/month, the subscription-billing hypothesis must be validated end-to-end on the actual production server. A failed validation invalidates SPEC-169 and SPEC-170 entirely — the whole migration strategy fails.

## User Story

**As** the operator of ReviewFlow,
**I want** to empirically confirm that `claude --bg` invocations on the production server consume the OAuth claude.ai subscription pool and never the API pool,
**So that** I can commit to the full migration (SPEC-169) with evidence rather than documentation hopium.

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | Single review dispatched via `claude --bg` | One real review (not a fake/test prompt) triggered through ReviewFlow on the prod server, switched from `-p` to `--bg` for this single invocation |
| 2 | Authentication via OAuth claude.ai | The session runs under the existing `claude /login` OAuth credentials on the prod server. No `ANTHROPIC_API_KEY` env var, no API key anywhere |
| 3 | Observable proof of subscription billing | Verifiable signal that the consumed quota came from the Pro/Max pool (Anthropic Console usage page, `claude /usage` output, or absence of API charges in the API billing dashboard) |
| 4 | Observable proof of NO API billing | No new API charge appears on the API billing dashboard during the test window |
| 5 | Documented GO/NO-GO decision | A short report (`docs/reports/168-validate-bg-subscription-billing.report.md`) capturing the evidence and the decision |

### Out of Scope

| Item | Reason |
|------|--------|
| Refactoring `claudeInvoker.ts` for all reviews | That is SPEC-169's job. This spec only switches one invocation |
| Worktree lifecycle management | SPEC-170 territory |
| Rate limit measurement / concurrent sessions test | A POC focused on billing, not on capacity |
| ProgressParser adaptation | This spec accepts that the single test review may have degraded progress reporting |
| Production deployment of the change | The switched invocation can be a temporary patch, reverted after evidence collection |
| Multi-project validation | A single project (main-app-v3) is sufficient to prove or disprove the billing model |

## Functional Requirements

### FR-1: Single-Invocation Switch

A single, controlled `claude -p` call in `claudeInvoker.ts` is temporarily replaced by `claude --bg "<prompt>"` for the duration of the test, behind a feature flag or a hardcoded condition (e.g., job ID match). Other reviews continue on `-p` to keep the prod system functional during the experiment.

### FR-2: OAuth-Only Authentication

Before launching the test review, the operator verifies on the prod server:
- No `ANTHROPIC_API_KEY` environment variable is set in the `reviewflow-app` systemd service environment.
- `claude auth status` (run as the `reviewflow-app` user) reports a claude.ai OAuth session, not an API key.

If either check fails, the spec is BLOCKED until OAuth-only auth is confirmed.

### FR-3: Test Invocation

The operator triggers one real review on a real MR (production data, not synthetic). The `--bg` session ID is captured. The review runs to completion (or failure) and the result is observed.

### FR-4: Billing Evidence Collection

Within 24 hours of the test invocation, the operator collects:
- A screenshot or export of the Pro/Max usage page showing the test session's token consumption.
- A screenshot or export of the API billing dashboard showing **no new charge** for the test window.
- `claude /usage` output before and after the test (if available).

### FR-5: GO/NO-GO Decision Report

A report at `docs/reports/168-validate-bg-subscription-billing.report.md` is produced with:
- The evidence collected (FR-4).
- A binary verdict: **GO** (proceed with SPEC-169) or **NO-GO** (abort migration, escalate).
- If NO-GO: the observed billing behavior and proposed next step.

## Gherkin Scenarios

```gherkin
Feature: Empirical validation of --bg subscription billing

  Background:
    Given the reviewflow-app systemd service runs under a user authenticated via `claude /login`
    And no ANTHROPIC_API_KEY environment variable is set for that user
    And `claude --version` reports v2.1.139 or later on the prod server

  Scenario: One review is dispatched via --bg and consumes subscription pool
    Given ReviewFlow is patched to spawn `claude --bg` for one specific test MR
    When a real webhook triggers a review on that test MR
    Then a background session ID is returned by the claude binary
    And the session completes (or fails) within the normal review timeout
    And within 24 hours, the Pro/Max usage dashboard shows token consumption attributed to this session
    And within 24 hours, the API billing dashboard shows zero new charges for the test window

  Scenario: GO decision when subscription billing is confirmed
    Given the test review completed
    And evidence shows Pro/Max consumption and zero API charges
    Then a GO report is written documenting the evidence
    And SPEC-169 is unblocked

  Scenario: NO-GO decision when API billing is observed
    Given the test review completed
    And the API billing dashboard shows any new charge attributable to the test
    Then a NO-GO report is written documenting the observation
    And SPEC-169 and SPEC-170 are marked blocked
    And the operator is alerted to escalate (Anthropic support, alternate strategy)

  Scenario: Prerequisite check fails — OAuth not active
    Given the reviewflow-app user has no active claude.ai OAuth session
    Or an ANTHROPIC_API_KEY is set in the service environment
    Then the test is not run
    And the spec is blocked pending OAuth setup
```

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 10 | Validates the entire claude-invocation path for all reviews across the platform |
| Impact | 3 | Critical — wrong hypothesis = entire migration fails = ReviewFlow unsustainable post-15-juin |
| Confidence | 80% | Doc strongly suggests subscription billing, but research preview means empirical proof is mandatory |
| Effort | 1 pt | Small, surgical change. Bulk of effort is evidence collection, not coding |
| **Score** | **24.0** | |

Priority: **Critical**

## INVEST Validation

| Criterion | Pass | Rationale |
|-----------|------|-----------|
| Independent | Yes | Standalone validation. No dependency on SPEC-169 or SPEC-170 (those depend on this) |
| Negotiable | Yes | The exact patching mechanism (feature flag vs hardcoded condition vs branch deploy) is open |
| Valuable | Yes | Removes the largest unknown in the migration strategy. Failure here saves days of wasted refactor |
| Estimable | Yes | ~0.25 jour IA for the code change. Evidence collection is wall-clock time, not effort |
| Small | Yes | One file touched, one invocation switched, one report produced |
| Testable | Yes | Binary outcome: Pro/Max usage visible AND zero API charge = GO. Otherwise = NO-GO |

## Definition of Done

- [ ] FR-1 implemented (single `claude --bg` invocation in `claudeInvoker.ts`, gated)
- [ ] FR-2 verified (OAuth-only auth confirmed on prod server, evidence stored in report)
- [ ] FR-3 executed (one real review dispatched, session ID captured, completion observed)
- [ ] FR-4 collected (Pro/Max usage evidence + API billing zero-charge evidence)
- [ ] FR-5 written (`docs/reports/168-validate-bg-subscription-billing.report.md` with verdict)
- [ ] Tracker updated: SPEC-168 → status `implemented` after report merged
- [ ] If GO: SPEC-169 unblocked
- [ ] If NO-GO: SPEC-169 and SPEC-170 set to status `blocked`, escalation logged

## Glossary

| Term | Definition |
|------|------------|
| `--bg` | Claude Code CLI flag launching an interactive session in background, managed by a per-user supervisor daemon. Documented at https://code.claude.com/docs/en/agent-view |
| Subscription pool | Token quota covered by an active Claude Pro/Max plan, billed flat-rate monthly |
| API pool | Per-token billing via an Anthropic API key, separate from subscription |
| OAuth claude.ai | Authentication method used by `claude /login`, distinct from API key auth |
| Research preview | Anthropic status indicating a feature is functional but subject to API/contract change |
| GO/NO-GO | Binary decision gate: GO unblocks downstream specs; NO-GO halts the migration strategy |

## Risks

| Risk | Mitigation |
|------|------------|
| Pro/Max usage page doesn't itemize per-session — billing evidence is ambiguous | Compare aggregate usage before/after; supplement with API dashboard zero-charge |
| Anthropic changes `--bg` behavior between POC and SPEC-169 production rollout | Run SPEC-169 within 1 week of SPEC-168 completion |
| The single test review is atypical (small diff, easy review) — billing extrapolation is unreliable | Pick a typical review (~300 lines diff, full agent run) for the test |
| OAuth session expires mid-test | Verify `claude auth status` before launch and immediately after |
