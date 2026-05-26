# Block approval below quality threshold with comment-based bypass

## Status: implementing

Iteration A — internal quality gate — **implemented** (scenarios 1, 2, 3, 7, 8).
Iteration B — comment-based bypass — pending (scenarios 4, 5, 9, 10).
Iteration C — platform unapprove + explanatory comment — pending (scenario 6).

See [report](../reports/180-quality-threshold-block-approval.report.md) and [plan](../plans/180-quality-threshold-block-approval.plan.md).

## Implementation (Iteration A)

**Artefacts**:
- Entity: `src/modules/tracking/entities/qualityGate/qualityGate.ts` (pure evaluator + result type).
- Use cases modified: `transitionState.usecase.ts` (adds `qualityCheck` callback, returns discriminated union) and `recordReviewCompletion.usecase.ts` (accepts optional threshold, gates auto-transition to `pending-approval`).
- Config: `qualityThreshold?: number` (integer 0-10) added to `ProjectConfig`; absent → no gating (backward compatible).
- HTTP enforcement: `POST /api/mr-tracking/approve` returns 409 + French message on rejection.
- Wiring: `src/main/routes.ts` injects a `getQualityThreshold` closure reading from `loadProjectConfig`.

**Architectural decisions**:
- Pure-function evaluator in the entity layer (no class, no value object).
- Business policy enforced one layer above the state machine (use-case guards), keeping `ReviewRequestState` a pure structural transition value object.
- French messages produced by the evaluator and returned untouched at HTTP boundary.
- Single write per transition — `transitionState` modified rather than wrapped in a new `ApproveMr` use case.

## Context

ReviewFlow transitions a merge request to `pending-approval` or `approved` based only on the binary presence of blockers — a low-score review with no blockers can still be approved by mistake. We need a configurable **quality threshold** that blocks those transitions when the latest review score is below the bar, and an explicit **bypass mechanism** via comment so teams can consciously accept the quality debt with traceability.

## Rules

- A merge request cannot transition to `pending-approval` while its latest review score is below the project threshold or blockers remain — unless an active bypass exists.
- A merge request cannot transition to `approved` while the same gate is not satisfied — unless an active bypass exists.
- When a platform approval event reaches ReviewFlow on a non-qualified merge request without active bypass: ReviewFlow revokes the approval on the platform and posts a French comment explaining the rejection and the bypass procedure.
- A bypass is activated when a comment containing the marker `/bypass-quality "reason"` is posted on the merge request.
- Any author may post the bypass marker; the system records author, reason, and timestamp.
- The bypass marker must include a non-empty reason; otherwise the bypass is rejected and a French comment explains why.
- A bypass is valid for the current review cycle and is reset when a new review completes on the merge request.
- The quality threshold is a number between 0 and 10, configured per project in `.claude/reviews/config.json` under the field `qualityThreshold`.
- When `qualityThreshold` is absent from the project configuration: no quality gating is applied (backward compatible).
- The signal "latest review score" is the score of the most recent completed review for this merge request.
- A merge request with no completed review yet is not subject to the quality gate.
- The gate applies symmetrically on GitLab and GitHub.

## Scenarios

- score above threshold no blockers: {lastScore: 8, blockers: 0, threshold: 7, bypass: none, transitionTo: "pending-approval"} → status "pending-approval"
- score below threshold blocks transition: {lastScore: 6, blockers: 0, threshold: 7, bypass: none, transitionTo: "pending-approval"} → reject "Seuil qualité non atteint (6/10 < 7/10)"
- blockers present block transition: {lastScore: 9, blockers: 2, threshold: 7, bypass: none, transitionTo: "approved"} → reject "Issues bloquantes non résolues"
- bypass with reason allows transition: {lastScore: 5, blockers: 1, threshold: 7, bypass: {author: "alice", reason: "hotfix critique"}, transitionTo: "approved"} → status "approved" + bypass recorded
- bypass without reason rejected: {comment: "/bypass-quality"} → reject "Le bypass nécessite une raison explicite. Format attendu : /bypass-quality \"raison\""
- platform approval on non-qualified MR triggers unapprove: {lastScore: 6, blockers: 0, threshold: 7, bypass: none, platformAction: "approved"} → unapprove + comment "Approbation annulée : seuil qualité 7/10 non atteint (6/10). Utilisez `/bypass-quality \"raison\"` pour forcer."
- no review yet allows transition: {lastScore: null, threshold: 7, transitionTo: "pending-approval"} → status "pending-approval"
- no threshold configured allows transition: {lastScore: 6, threshold: null, transitionTo: "approved"} → status "approved"
- new review after bypass resets the bypass: {bypass: active, newReviewScore: 8, transitionTo: "approved"} → bypass cleared + status "approved" (under new gate evaluation)
- bypass on a merge request already qualified: {lastScore: 9, blockers: 0, threshold: 7, comment: "/bypass-quality \"par précaution\""} → comment acknowledged + no state change (bypass stored but not needed)

## Out of Scope

- Multi-tier thresholds (different thresholds by severity or area).
- Auto-bypass by role or whitelist of users.
- Dashboard UI to visualize gate status and bypasses (separate spec).
- Push notifications on bypass events.
- Persistent audit log of bypasses beyond the in-process tracking entity.
- Configuring the threshold via HTTP API or dashboard form.
- Applying the gate to merge events (only approval transitions are gated).

## Glossary

| Term | Definition |
|------|------------|
| Quality threshold | Minimum review score (0-10) required to allow transitions to `pending-approval` or `approved`. Configured per project in `.claude/reviews/config.json`. |
| Quality gate | Conjunction "latest score ≥ threshold AND blockers == 0". Must pass (or be bypassed) to allow approval transitions. |
| Bypass | Explicit override of the quality gate triggered by a comment marker `/bypass-quality "reason"`, recorded with author, reason, and timestamp. |
| Latest review | Most recent completed review for the merge request, identified by the most recent score entry attributable to this MR. |
| Review cycle | Lifecycle of a MR between two successive ReviewFlow reviews. A new review completing on the MR ends the previous cycle. |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | No dependency on other in-flight specs. |
| Negotiable | OK | Only the behavior is fixed; implementation patterns are free. |
| Valuable | OK | Prevents inadvertent approval of low-quality MRs and traces explicit overrides. |
| Estimable | WARN | Requires building two missing capabilities: platform `unapprove` (GitLab + GitHub) and comment-note webhook parsing. Both are well-scoped but new. |
| Small | WARN | ~12-15 files estimated. Recommended split for implementation: (1) threshold + internal gate, (2) comment-based bypass, (3) platform unapprove on approval event. |
| Testable | OK | 10 scenarios cover every rule. Acceptance tests can drive each rule. |

Verdict: **READY** with recommendation to implement in three iterations.

## Implementation Iterations (recommended)

1. **Iteration A — Internal gate**
   - Extend project config schema with `qualityThreshold`.
   - Add a quality-gate evaluator (score + blockers) at the state-transition boundary.
   - Block internal transitions `pending-fix → pending-approval` and `pending-approval → approved` when gate fails.
   - Acceptance: scenarios 1, 2, 3, 7, 8.

2. **Iteration B — Comment-based bypass**
   - Add webhook handling for note/comment events (GitLab + GitHub).
   - Parse the `/bypass-quality "reason"` marker.
   - Record bypass on the tracked MR (author, reason, timestamp).
   - Reset bypass on next completed review.
   - Acceptance: scenarios 4, 5, 9, 10.

3. **Iteration C — Platform unapprove**
   - Add `unapprove` gateways for GitLab and GitHub.
   - On platform `approved` event without satisfied gate and no active bypass: trigger unapprove + post French explanation comment.
   - Acceptance: scenario 6.

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
