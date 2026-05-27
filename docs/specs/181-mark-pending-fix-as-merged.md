# Manually mark a pending-fix MR as merged

## Status: implemented

See [report](../reports/181-mark-pending-fix-as-merged.report.md) and [plan](../plans/181-mark-pending-fix-as-merged.plan.md).

## Implementation

**Artefacts**:
- State machine: `src/modules/review-execution/entities/reviewRequest/reviewRequestState.valueObject.ts` — `'merged'` added to `VALID_TRANSITIONS['pending-fix']`.
- Use case (modified): `src/modules/tracking/usecases/tracking/transitionState.usecase.ts` — optional `requireCurrentState` input + new `'invalid-current-state'` branch in the result union.
- HTTP route: `POST /api/mr-tracking/mark-as-merged` in `src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts`. Body `{ mrId, projectPath }`. Status mapping: 200 ok / 400 invalid input / 404 not found / 409 invalid current state.
- Dashboard: confirmation modal `#mark-merged-modal` in `src/dashboard/index.html`, button on each `pending-fix` card via `renderMrItem`, JS handlers and i18n keys (EN + FR) wired through `renderStaticLabels`.

**Architectural decisions**:
- No new entity, gateway, or use case class — the manual override extends the existing transition path.
- French rejection message lives at the controller boundary; the use case stays UI-language agnostic.
- The state machine grants the structural permission; the business policy ("only from pending-fix") is enforced one layer above via `requireCurrentState`.
- Dedicated modal markup rather than retrofitting the cancel modal.

**Endpoints**:

| Method | Route | Use case |
|--------|-------|----------|
| POST | `/api/mr-tracking/mark-as-merged` | `TransitionStateUseCase` with `targetState: 'merged'` and `requireCurrentState: 'pending-fix'` |

## Context

Some merge requests get merged on GitLab/GitHub but stay stuck in the dashboard's **"Corrections requises"** lane (state `pending-fix`) because the platform merge event was missed or the tracking gateway never received it.

Today, the only way out is the chain `pending-fix → pending-approval → approved → merged`, which is impractical for a manual override. We need a one-click action on each pending-fix card to mark the MR as merged, with an explicit confirmation step (same pattern as the existing cancel-review modal).

The target dashboard section **"Reviews terminées"** is fed by review report files, not by tracking state. So this action does not move the item there visually — it removes the MR from "Corrections requises" by transitioning to the terminal `merged` state. That is the user-facing intent.

## Rules

- A pending-fix MR can be transitioned directly to `merged` through an explicit manual action.
- The transition is restricted to MRs in state `pending-fix` — calling the action on any other state must be rejected.
- The transition sets the `mergedAt` timestamp on the tracked MR.
- The transition requires a confirmation step before the change is applied.
- The manual mark-as-merged action is available only on cards in the "Corrections requises" lane (state `pending-fix`).
- After a successful transition, the MR disappears from "Corrections requises" without any reload required.
- The action requires a valid project path; missing or invalid path is rejected with a French error message.
- The action requires a valid `mrId`; missing `mrId` is rejected with a French error message.
- Calling the action on an unknown MR returns a 404 with a French error message.

## Scenarios

- valid pending-fix transition: {state: "pending-fix", mrId: "mr-42", projectPath: "/home/user/proj"} → status "merged" + mergedAt set
- pending-approval rejected: {state: "pending-approval", mrId: "mr-42", projectPath: "/home/user/proj"} → reject "Seules les MR en correction peuvent être marquées comme mergées"
- approved rejected: {state: "approved", mrId: "mr-42", projectPath: "/home/user/proj"} → reject "Seules les MR en correction peuvent être marquées comme mergées"
- merged rejected: {state: "merged", mrId: "mr-42", projectPath: "/home/user/proj"} → reject "Seules les MR en correction peuvent être marquées comme mergées"
- unknown MR: {mrId: "ghost", projectPath: "/home/user/proj"} → reject "MR non trouvée"
- missing mrId: {mrId: "", projectPath: "/home/user/proj"} → reject "mrId requis"
- missing project path: {mrId: "mr-42", projectPath: ""} → reject "Chemin du projet requis"
- invalid project path: {mrId: "mr-42", projectPath: "../etc"} → reject "Chemin invalide"

## Out of Scope

- Bulk mark-as-merged across multiple MRs.
- Automatic detection of platform-side merges via background polling.
- Manual transitions out of any state other than `pending-fix`.
- A symmetric "mark as closed" manual action (separate spec if needed).
- Modifying the "Reviews terminées" section's data source.
- Undo / revert of the manual mark-as-merged action.

## Glossary

| Term | Definition |
|------|------------|
| Pending-fix MR | A tracked merge request whose state is `pending-fix`, displayed in the "Corrections requises" lane. |
| Manual mark-as-merged | An explicit user action that transitions a pending-fix MR directly to the terminal `merged` state. |
| Confirmation modal | The same UX pattern used for review cancellation: title with MR identifier, back/confirm buttons, French copy. |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | No dependency on other in-flight specs. |
| Negotiable | OK | Behavior is fixed; implementation patterns are free. |
| Valuable | OK | Unblocks a recurring stuck-state in the dashboard. |
| Estimable | OK | Mirrors the existing `/api/mr-tracking/approve` flow + cancel modal pattern. |
| Small | OK | ~5-7 files: state machine entry, use case adjustment, HTTP route, dashboard button + modal + handler, i18n. |
| Testable | OK | 8 scenarios cover every rule. |

Verdict: **READY**.

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
