---
title: "SPEC-168: Verify --bg Subscription Billing (Post-Deploy Checklist)"
labels: validation, P1-critical, claude-invocation
milestone: June 15 Migration
status: VERIFYING
---

# SPEC-168: Verify `--bg` Subscription Billing (Post-Deploy Checklist)

> **Note (2026-05-22)** — Originally drafted as a pre-migration POC. POC stage was bypassed: SPEC-169 was migrated and deployed in v3.13.0 without a single-MR experiment. This spec is now a **post-deploy verification checklist** to confirm subscription billing is actually in effect.

## Context

On 2026-06-15, Anthropic moves Claude Code `--print` mode invocations to API-pool billing. ReviewFlow has migrated to `--bg` (SPEC-169, v3.13.0) on the documented assumption that `--bg` consumes the subscription pool. Because the POC was bypassed, the subscription-billing hypothesis must now be verified empirically on the running daemon — a silent misconfiguration (stray API key in the service env) would route every review through API billing without any code-level signal, exposing the project to ~$1,549/month against a $200/month budget.

## User Story

**As** the operator of ReviewFlow,
**I want** to verify on the running daemon that `claude --bg` invocations consume the OAuth subscription pool and never the API pool,
**So that** the SPEC-169 migration is operationally validated rather than assumed.

## Scope

### In Scope

| # | Capability |
|---|------------|
| 1 | OAuth-only auth verified on the running daemon |
| 2 | Subscription pool consumption observed over a monitoring window |
| 3 | Zero API pool consumption observed over the same window |
| 4 | Verification report produced with binary verdict |

### Out of Scope

| Item | Reason |
|------|--------|
| Refactoring the Claude invocation layer | Done by SPEC-169 |
| Worktree lifecycle | SPEC-170 territory |
| Rate-limit measurement / concurrency test | Verification focused on billing, not capacity |
| Single-MR POC patching | Skipped — SPEC-169 already deployed in full |
| GO/NO-GO gating of SPEC-169 | Decision was taken implicitly by merging SPEC-169 |

## Rules

- subscription billing requires: active OAuth claude.ai session AND no API key in the daemon environment
- the verification window is between 48 hours and 7 days after deploy
- the verdict is binary: `CONFIRMED` (non-zero subscription consumption + zero API charge) or `REGRESSION` (any API charge attributable to the daemon)
- a `REGRESSION` verdict triggers immediate rollback and pauses downstream specs
- a silent window (no review traffic) extends the deadline rather than producing a verdict

## Scenarios

- OAuth verified: {env: "no API key", auth: "claude.ai + firstParty + max plan"} → FR-2 validated
- OAuth missing: {env: "no API key", auth: "logged out"} → reject "Session OAuth requise avant déploiement"
- API key leaked: {env: "API key present", auth: "*"} → reject "Aucune clé API ne doit être présente dans l'environnement du démon"
- subscription confirmed: {subscription usage: "non-zero", api charge: "zero", window: "48-72h"} → verdict "CONFIRMED"
- regression detected: {subscription usage: "*", api charge: "non-zero"} → verdict "REGRESSION" + rollback
- silent window: {subscription usage: "zero", api charge: "zero", reviews in window: "0"} → extend window to 7 days

## Acceptance Criteria

- [x] AC-1: Daemon environment contains no API key (verified 2026-05-22)
- [x] AC-2: `claude auth status` reports `authMethod: claude.ai`, `apiProvider: firstParty`, `subscriptionType: max` (verified 2026-05-22)
- [ ] AC-3: Within the verification window, the Pro/Max usage dashboard shows non-zero token consumption attributable to ReviewFlow review sessions
- [ ] AC-4: Within the verification window, the API billing dashboard shows zero new charges
- [ ] AC-5: `docs/reports/168-verify-bg-subscription-billing.report.md` exists with a binary verdict (CONFIRMED or REGRESSION) and the collected evidence
- [ ] AC-6: Tracker updated — status `implemented` if CONFIRMED, status `blocked` if REGRESSION (with SPEC-170 also paused)

## Operational Notes

Commands used to collect AC-1 / AC-2 evidence on the running daemon:

```bash
# AC-1: no API key in service env
systemctl --user show reviewflow-app -p Environment | grep -i ANTHROPIC

# AC-2: OAuth auth status (run as the service user)
claude auth status
```

`claude auth status` output captured 2026-05-22:

```json
{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "email": "damien@mentorgoal.com",
  "subscriptionType": "max"
}
```

AC-3 / AC-4 evidence is collected from the Anthropic Console: Pro/Max usage page and API billing dashboard. Window opened 2026-05-22, closes by default 2026-05-25.

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 10 | Validates the entire Claude invocation path for all reviews |
| Impact | 3 | Critical — undetected misconfiguration = silent monthly API bill |
| Confidence | 90% | AC-1/AC-2 already collected on the live daemon; AC-3/AC-4 are observation, not experiment |
| Effort | 0.5 pt | Reading two dashboards + writing the report |
| **Score** | **54.0** | |

Priority: **Critical**

## INVEST Validation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Verification of an already-deployed change |
| Negotiable | WARN | Dashboard source is open; verdict criteria is binary |
| Valuable | OK | Closes the billing risk loop opened by skipping the POC |
| Estimable | OK | ~0.5 jour IA wall-clock — gated by the monitoring window |
| Small | OK | Two checks + one report |
| Testable | OK | CONFIRMED if subscription shows usage AND API shows zero |

## Glossary

| Term | Definition |
|------|------------|
| `--bg` flag | Claude Code CLI flag launching an interactive session in background, managed by a per-user supervisor daemon |
| Subscription pool | Token quota covered by an active Claude Pro/Max plan, billed flat-rate monthly |
| API pool | Per-token billing via an Anthropic API key, separate from subscription |
| OAuth claude.ai | Authentication method used by `claude /login`, distinct from API key auth |
| First-party provider | `apiProvider: firstParty` in `claude auth status` — Anthropic-direct subscription, not third-party gateway |
| CONFIRMED / REGRESSION | Binary verdict of the post-deploy verification |
| Verification window | Time range between 48 hours and 7 days after deploy during which billing dashboards are observed |

## Risks

| Risk | Mitigation |
|------|------------|
| Pro/Max usage page is aggregate-only | Aggregate is sufficient: any non-zero subscription consumption proves subscription billing is engaged |
| Low review volume during window | Silent-window rule extends the deadline to 7 days, or operator triggers a representative review manually |
| Anthropic changes `--bg` behavior before 2026-06-15 cutoff | Repeat AC-3/AC-4 after each Claude Code minor version bump until 2026-06-15 |
| OAuth session expires silently — daemon could fall back to API key if one is added later | Add a periodic auth-status healthcheck (separate spec) |
