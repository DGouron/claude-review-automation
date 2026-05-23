---
title: "SPEC-174: Semi-automatic review trigger mode"
status: implemented
labels: enhancement, P2-important, dashboard, webhook
---

# SPEC-174: Semi-automatic review trigger mode

## Status: implemented

Delivered on 2026-05-23 on branch `worktree-spec-174-semi-auto-trigger`. Acceptance test GREEN (4/4), full suite 1775/1779 (4 unrelated CLI integration failures pre-existing).

## Implementation

### Artefacts

| Layer | Element | Path |
|-------|---------|------|
| Entity / schema | `PendingReviewRequest` Zod schema | `src/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.ts` |
| Entity / guard | `pendingReviewRequestGuard` | `src/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.guard.ts` |
| Entity / contract | `PendingReviewRequestGateway` | `src/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.gateway.ts` |
| Use case (chokepoint) | `GateClaudeInvocationUseCase` | `src/modules/review-execution/usecases/gateClaudeInvocation.usecase.ts` |
| Use case | `ConfirmPendingReviewUseCase` | `src/modules/review-execution/usecases/confirmPendingReview.usecase.ts` |
| Use case | `DismissPendingReviewUseCase` | `src/modules/review-execution/usecases/dismissPendingReview.usecase.ts` |
| Use case | `ListPendingReviewsUseCase` | `src/modules/review-execution/usecases/listPendingReviews.usecase.ts` |
| Gateway impl | File-system persistence (`~/.claude-review/pending/*.json`) | `src/modules/review-execution/interface-adapters/gateways/pendingReviewRequest.fileSystem.gateway.ts` |
| Controller (HTTP) | Confirm / dismiss / list routes | `src/modules/review-execution/interface-adapters/controllers/http/pendingReviews.routes.ts` |
| Presenter | `PendingReviewPresenter` | `src/modules/review-execution/interface-adapters/presenters/pendingReview.presenter.ts` |
| Dashboard view | "Pending Reviews" panel (humble object) | `src/dashboard/modules/pendingReviews.js` |
| Config | `triggerMode` field + French validation | `src/frameworks/config/configLoader.ts` |
| Composition root | Gateway + use cases wiring + processor registry | `src/main/routes.ts` |
| WebSocket | `broadcastPendingChanged` | `src/main/websocket.ts` |
| Webhook integration | Swap of 5 `enqueueReview` sites to `gateClaudeInvocation` | `src/modules/platform-integration/interface-adapters/controllers/webhook/{gitlab,github}.controller.ts` + `src/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.ts` |
| Dashboard wiring | Panel above `active-reviews-section` + desktop notification kind + French i18n key | `src/dashboard/index.html` + `src/dashboard/modules/desktopNotifications.js` + `src/dashboard/modules/i18n.js` |

### Endpoints

| Method | Route | Use case |
|--------|-------|----------|
| GET | `/api/pending-reviews` | `ListPendingReviewsUseCase` |
| POST | `/api/pending-reviews/:id/confirm` | `ConfirmPendingReviewUseCase` |
| DELETE | `/api/pending-reviews/:id` | `DismissPendingReviewUseCase` |

### Architectural decisions

- **Single chokepoint** — `GateClaudeInvocationUseCase` wraps every direct `enqueueReview` call (5 sites across the two webhook controllers + the manual followup HTTP route). When `triggerMode === 'semi-auto'`, the use case persists a `PendingReviewRequest` and skips `enqueueReview`; when `'full-auto'`, it delegates unchanged. This is the only place that knows about the mode.
- **Strategy A — processor registry** — `PendingReviewRequest` persists the `ReviewJob` snapshot but NOT the processor closure (it captures non-serialisable gateways). On boot, `routes.ts` rebinds named processor builders into an in-memory `ProcessorRegistry`, and `ConfirmPendingReviewUseCase` rehydrates the closure via the registry keyed by `triggerSource + platform + jobType`. Pending requests survive process restart; the processor is reconstructed from code.
- **Panel positioning** — the new `pending-reviews-section` is inserted in `src/dashboard/index.html` ABOVE `active-reviews-section`. The spec says "above the worktrees panel" (SPEC-173), which is not yet implemented; when SPEC-173 lands the worktrees panel will slot directly below this one, satisfying the spirit of the spec.
- **No new entity for `JobStatus`** — `JobStatus` in `pQueueAdapter` is unchanged. Pending requests are a NEW persisted entity, conceptually outside the in-memory queue (they live until confirm/dismiss, then enter the standard queued/running flow).
- **Desktop notification fallback** — reuses the existing `shouldNotifyDesktop` helper, which already returns `false` cleanly when permission is denied. No new fallback code; one dictionary entry in `messageKeyByKind` is enough.

### Tests

- Acceptance: `src/tests/acceptance/174-semi-auto-review-trigger-mode.acceptance.test.ts` (4 scenarios, GREEN)
- Unit (new): 11 new test files mirroring source layout under `src/tests/units/modules/review-execution/` + `src/tests/units/dashboard/modules/pendingReviews.test.ts`
- Doubles: `src/tests/stubs/pendingReviewRequest.stub.ts` + `src/tests/factories/pendingReviewRequest.factory.ts`
- Adapted: `configLoader.test.ts` + config factory
- Full suite: **1775 / 1779 GREEN** (4 unrelated CLI integration failures pre-existing: `cli.integration.test.ts` exits 127 because the CLI binary is not built in the worktree)

## Context

Today ReviewFlow launches a Claude review as soon as a webhook arrives (MR/PR assignment, or push for followups). The user wants to optionally gate every Claude invocation behind an explicit human confirmation, instance-wide, so that token budget is spent only on reviews actually wanted. The choice is a single global switch in the configuration: either `full-auto` (current behavior, default) or `semi-auto`.

## Rules

- trigger mode is a single global instance-wide setting; default value is `full-auto` for backward compatibility
- in `semi-auto` mode, every Claude invocation requires explicit human confirmation; this applies to both initial reviews (webhook assignment) and followup reviews (push on a tracked MR/PR)
- a job awaiting confirmation has status `pending-confirmation` and is persisted; it survives a process restart
- a `pending-confirmation` job has no expiration; it remains until the human confirms or dismisses it
- confirming a pending job transitions it to the standard queued/running flow and invokes Claude
- dismissing a pending job removes it from the system without invoking Claude
- a desktop notification is fired when a new `pending-confirmation` job appears; if the browser denies notification permission, the job is still created and no error is raised
- the dashboard exposes a "Pending Reviews" panel positioned above the worktrees panel; it lists every `pending-confirmation` job with confirm and dismiss actions
- toggling the trigger mode in configuration affects only future webhooks; in-flight jobs keep their current lifecycle
- error messages shown to the end user are in French

## Scenarios

- full-auto initial review: {triggerMode: "full-auto", event: "mr.assigned"} → status "queued" + claude invoked
- semi-auto initial review: {triggerMode: "semi-auto", event: "mr.assigned"} → status "pending-confirmation" + desktopNotificationFired true
- semi-auto followup: {triggerMode: "semi-auto", event: "mr.push", trackedMr: "pending-fix"} → status "pending-confirmation" + jobType "followup"
- full-auto followup unchanged: {triggerMode: "full-auto", event: "mr.push", trackedMr: "pending-fix"} → status "queued" + jobType "followup"
- confirm pending: {action: "confirm", jobStatus: "pending-confirmation"} → status "queued" + claude invoked
- dismiss pending: {action: "dismiss", jobStatus: "pending-confirmation"} → job removed + claude NOT invoked
- pending survives restart: {jobStatus: "pending-confirmation", event: "process.restart"} → status "pending-confirmation"
- notification permission denied: {triggerMode: "semi-auto", event: "mr.assigned", notificationPermission: "denied"} → status "pending-confirmation" + desktopNotificationFired false
- default mode when missing: {triggerMode: undefined, event: "mr.assigned"} → status "queued" + claude invoked
- toggle mode at runtime: {triggerMode change: "full-auto" → "semi-auto", in-flight job: "running"} → in-flight job stays "running" + next webhook produces "pending-confirmation"
- confirm already-running: {action: "confirm", jobStatus: "running"} → reject "Cette review est déjà en cours"
- dismiss already-running: {action: "dismiss", jobStatus: "running"} → reject "Cette review est déjà en cours, impossible de l'ignorer"
- confirm already-dismissed: {action: "confirm", jobStatus: "dismissed"} → reject "Cette review a déjà été ignorée"
- invalid trigger mode value: {triggerMode: "unknown-value"} → reject "Mode de déclenchement invalide : valeurs autorisées « full-auto » ou « semi-auto »"

## Out of Scope

- Per-repository override of trigger mode (global only; a single repo cannot opt-in or opt-out)
- Per-MR override (no MR-level flag forcing one mode or the other)
- Timeout / auto-expiration of pending jobs (covered separately if a need emerges)
- External notification channels: Slack, email, generic webhooks (dashboard + desktop notification only)
- Batch confirm or dismiss (one action = one job)
- Mobile push notifications
- Role-based access control on confirm/dismiss (any dashboard user can act)
- Editing review parameters (skill, agents, focus) at confirmation time — the job inherits whatever was decided at webhook reception
- Audit log of who confirmed or dismissed which job
- Visual / sound notification when dashboard is open (separate concern from desktop notification)
- Auto-confirm after N minutes as a fallback (out of scope by user decision — no timeout at all)
- Hot-reload of the trigger mode setting (a service restart after config change is acceptable)

## Glossary

| Term | Definition |
|------|------------|
| trigger mode | Global instance-wide setting controlling whether Claude reviews launch automatically or require human confirmation. Two values: `full-auto`, `semi-auto`. Default: `full-auto`. |
| full-auto | Trigger mode where any qualifying webhook (initial assignment or followup push) launches a Claude review immediately, exactly as today. |
| semi-auto | Trigger mode where every Claude invocation is gated behind a human confirmation step. Applies to both initial reviews and followups. |
| pending-confirmation | New job status used in `semi-auto` mode. The job exists, has all the context needed to run, but Claude is not invoked until a human confirms it. |
| confirm | Human action that promotes a `pending-confirmation` job into the standard execution flow. |
| dismiss | Human action that removes a `pending-confirmation` job without ever invoking Claude. |
| Pending Reviews panel | Dashboard component listing all `pending-confirmation` jobs with their confirm/dismiss actions. Positioned above the worktrees panel. |
| desktop notification | Browser-level OS notification fired via the Web Notifications API when a new `pending-confirmation` job appears. |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | No in-flight spec dependency. SPEC-163 (budget cap) already implemented. SPEC-173 (worktree panel) referenced only for UI positioning. |
| Negotiable | OK | Storage of the flag, exact UI of the panel, and confirmation mechanics are free. Only the "what" is fixed. |
| Valuable | OK | Direct token-budget control + transparency on what Claude is about to do. Aligns with SPEC-163 (budget cap) philosophy. |
| Estimable | OK | Surface is well-bounded: 1 config field, 1 new job status, 1 use case adjustment, 1 dashboard panel, 1 notification call. |
| Small | WARN | Touches configuration, Job entity (new status), enqueue use case, dashboard view (new panel), Web Notifications integration, two new dashboard routes (confirm/dismiss). On the high side of the 15-files limit; consider a V0 (mode + panel + confirm/dismiss) then V1 (desktop notification) split if planning shows the budget overflows. |
| Testable | OK | Each rule maps to one or more DSL scenarios. Confirmation/dismissal use cases are deterministic. Notification fallback is checkable via a feature flag in tests. |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.

Spec-specific completion criteria:

- [ ] `triggerMode` field added to config schema with default `full-auto` and Zod validation
- [ ] New `pending-confirmation` job status added to the Job entity
- [ ] Enqueue use case routes to `pending-confirmation` when `triggerMode === 'semi-auto'`
- [ ] Followup flow (SPEC-046) also routes through the same gate
- [ ] Confirm use case: `pending-confirmation` → `queued` → Claude invoked
- [ ] Dismiss use case: removes the pending job, never invokes Claude
- [ ] Pending jobs persisted across process restarts
- [ ] Dashboard "Pending Reviews" panel rendered above the worktrees panel
- [ ] Confirm and dismiss buttons wired to dedicated routes
- [ ] Web Notifications API integration with graceful fallback when permission is denied
- [ ] Acceptance test covers nominal `semi-auto` flow end-to-end
- [ ] All unit tests in English, error messages in French
- [ ] `yarn verify` GREEN
