PLAN:
  scope: SPEC-181 — Manually mark a pending-fix MR as merged
  is_new_module: false

  ANTI-OVERENGINEERING_CHECK:
    - Thin manual override. No new entity, no new gateway, no new use case class.
    - State machine: a single line edit in `VALID_TRANSITIONS` adds `merged` to the allowed targets of `pending-fix`.
    - Use case: reuse the existing `TransitionStateUseCase`. It already supports `targetState: 'merged'`, already sets `mergedAt`, already short-circuits the `qualityCheck` for non-approval transitions. The ONLY missing piece is "ensure current state is `pending-fix`" — handled by extending the existing discriminated union with a new rejection reason and validating the current state before mutating.
    - HTTP layer: mirror `POST /api/mr-tracking/approve` exactly. Same validateProjectPath, same `mrId`/`projectPath` body shape, same French error messages.
    - Dashboard: one button in the `pending-fix` action group + one modal (re-using the existing cancel-modal markup is over-coupled — a dedicated modal pair is cleaner; ~30 lines of HTML + 3 short JS functions, identical pattern).
    - Result: 0 new entities, 0 new gateways, 0 new use cases. 1 modified state machine entry, 1 extended use case, 1 new HTTP route, 1 new dashboard modal + button + handler, 1 i18n block per language, 1 wiring touch (already covered — the existing mrTrackingRoutes registration is untouched).

  ENTITIES:
    - name: reviewRequestState (MODIFIED — single entry in VALID_TRANSITIONS)
      file: src/modules/review-execution/entities/reviewRequest/reviewRequestState.valueObject.ts
      schema: (unchanged — already in same file)
      guard: (none)
      gateway_contract: (none)
      test: src/tests/units/entities/reviewRequest/reviewRequestState.valueObject.test.ts (extend)
      change: |
        VALID_TRANSITIONS['pending-fix'] currently = ['pending-review', 'pending-approval', 'closed'].
        Add 'merged' → ['pending-review', 'pending-approval', 'merged', 'closed'].
        This is the structural permission. The "only from pending-fix" rule is enforced
        one layer up (use case) so the state machine remains pure structural transitions.

  USECASES:
    - name: transitionState (MODIFIED — extend rejection union)
      file: src/modules/tracking/usecases/tracking/transitionState.usecase.ts
      test: src/tests/units/usecases/tracking/transitionState.usecase.test.ts (extend)
      type: command
      input: { projectPath, mrId, targetState, qualityCheck?, requireCurrentState? }
      output: |
        | { ok: true }
        | { ok: false; reason: 'not-found' }
        | { ok: false; reason: 'quality-gate'; message: string }
        | { ok: false; reason: 'invalid-current-state'; message: string }   ← NEW
      decisions:
        - Add OPTIONAL parameter `requireCurrentState?: ReviewRequestStateValue` to the input.
        - When provided, after the not-found check, compare `mr.state` to it; mismatch → return
          `{ ok: false, reason: 'invalid-current-state', message: <French> }`. No gateway write.
        - Caller is responsible for the French message (passed in or constant) — keeping the
          use case agnostic to UI language. For SPEC-181 the controller passes the literal
          "Seules les MR en correction peuvent être marquées comme mergées".
        - Decision rationale (vs new MarkPendingFixAsMergedUseCase):
            * Reuse: the existing use case already does the gateway read, the timestamp
              assignment, and the not-found path. A dedicated use case would duplicate all of it.
            * Symmetry: the same "guarded transition" pattern can be reused later for
              "mark as closed" (out of scope, but the door is left open).
            * Single write path: every state transition still flows through one method —
              good for any future logging/auditing.

  GATEWAYS:
    (none — `ReviewRequestTrackingGateway.update()` already handles state + mergedAt.
     `getById()` already used by the use case to fetch current state.)

  CONTROLLERS:
    - name: mrTrackingRoutes (MODIFIED — add POST /api/mr-tracking/mark-as-merged)
      file: src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts
      test: src/tests/units/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.test.ts (new — no existing unit test today; acceptance covers most of it)
      decisions:
        - Mirror the existing `POST /api/mr-tracking/approve` handler.
        - Body: { mrId, projectPath }. Same validateProjectPath. Same French error texts.
        - Call `TransitionStateUseCase.execute` with:
            { projectPath, mrId, targetState: 'merged',
              requireCurrentState: 'pending-fix' }
        - Map results:
            ok:true                                           → 200 { success: true, mrId, message: 'MR marquée comme mergée' }
            ok:false, reason:'not-found'                      → 404 { success: false, error: 'MR non trouvée' }
            ok:false, reason:'invalid-current-state'          → 409 { success: false, error: 'Seules les MR en correction peuvent être marquées comme mergées' }
        - The French message at the boundary is passed as the controller's chosen literal —
          it is not produced by the use case.

  PRESENTERS:
    (none — JSON body of HTTP route is already the view model. No domain → ViewModel transformation needed.)

  VIEWS:
    - name: dashboardMarkAsMergedModal (NEW — markup + JS in src/dashboard/index.html)
      file: src/dashboard/index.html
      test: (covered by spec acceptance + manual verification; the dashboard has no per-modal unit test today — pattern matches existing cancel-modal which is also untested)
      changes:
        1. Markup near line 318 (after #cancel-modal):
             <div id="mark-merged-modal" class="modal-overlay hidden" onclick="closeMarkMergedModal(event)">
               <div class="modal-content" onclick="event.stopPropagation()">
                 <div class="modal-title" id="mark-merged-modal-title"></div>
                 <div class="modal-message" id="i18n-mark-merged-modal-message"></div>
                 <div class="modal-actions">
                   <button class="btn-modal-back" onclick="closeMarkMergedModal()" id="i18n-mark-merged-modal-back"></button>
                   <button class="btn-modal-confirm" id="mark-merged-modal-confirm" onclick="confirmMarkAsMerged()"></button>
                 </div>
               </div>
             </div>
        2. In renderMrItem(mr, type) at ~line 1624, when `type === 'pending-fix'`,
           inject a new button between the followup actions and openBtn:
             <button class="btn-action" onclick="showMarkMergedModal('${encodedMrId}', '${mr.mrNumber}')">
               <i data-lucide="git-merge"></i> ${t('button.markAsMerged')}
             </button>
           Reason: keep auto-followup / followup as the primary corrective actions; the
           manual override sits to their right, before "Open".
        3. JS handlers near showCancelModal (line ~2881):
             let markMergedModalMrId = null;
             function showMarkMergedModal(encodedMrId, mrNumber) {
               markMergedModalMrId = safeDecodeURIComponent(encodedMrId);
               document.getElementById('mark-merged-modal-title').textContent =
                 t('modal.markMerged.title', { label: getMrLabel(), number: mrNumber });
               // unhide + animate (same pattern as showCancelModal)
             }
             function closeMarkMergedModal(event) { /* mirror closeCancelModal */ }
             async function confirmMarkAsMerged() {
               if (!markMergedModalMrId) return;
               trackUsefulAction('markAsMerged');
               const mrId = markMergedModalMrId;
               closeMarkMergedModal();
               try {
                 const response = await fetch(`${API_URL}/api/mr-tracking/mark-as-merged`, {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ mrId, projectPath: currentProjectPath || undefined }),
                 });
                 const data = await response.json();
                 if (data.success) {
                   const card = document.querySelector(`.mr-item-accordion[data-mr-id="${mrId}"]`);
                   if (card) card.remove();
                   showToast(t('success.markedAsMerged'), 'success');
                   fetchStatus();
                 } else {
                   showToast(data.error || t('error.markAsMerged'), 'error');
                 }
               } catch (error) {
                 console.error('Error marking as merged:', error);
                 showToast(t('error.markAsMerged'), 'error');
               }
             }
        4. Wire the static labels for the new modal in renderStaticLabels() (the function
           that maps `id="i18n-*"` to t() — same pattern as the existing modal labels).

  I18N_KEYS:
    file: src/dashboard/modules/i18n.js
    en block (insert next to neighbouring keys):
      'button.markAsMerged': 'Mark as merged'
      'modal.markMerged.title': 'Mark {{label}} !{{number}} as merged?'
      'modal.markMerged.message': 'This manually marks the MR as merged. The card will leave "Corrections requises".'
      'modal.markMerged.back': 'Go back'
      'modal.markMerged.confirm': 'Mark as merged'
      'success.markedAsMerged': 'MR marked as merged'
      'error.markAsMerged': 'Error marking as merged'
    fr block (mirror):
      'button.markAsMerged': 'Marquer comme mergée'
      'modal.markMerged.title': 'Marquer la {{label}} !{{number}} comme mergée ?'
      'modal.markMerged.message': 'Marque manuellement la MR comme mergée. La carte quittera "Corrections requises".'
      'modal.markMerged.back': 'Revenir'
      'modal.markMerged.confirm': 'Marquer comme mergée'
      'success.markedAsMerged': 'MR marquée comme mergée'
      'error.markAsMerged': 'Erreur lors du marquage'

  WIRING:
    routes: |
      No change to src/main/routes.ts. The existing `mrTrackingRoutes` registration at line
      163 already provides the gateway. The new POST handler is added to the same plugin
      file, so it is automatically wired by the existing `app.register(mrTrackingRoutes, ...)`.
    dependencies: |
      None new. The route handler uses the same `reviewRequestTrackingGateway` already
      passed via plugin options. `getQualityThreshold` is irrelevant here (target state is
      `merged`, not `approved`).

  MODIFICATIONS_TO_EXISTING_FILES:
    Production:
      - src/modules/review-execution/entities/reviewRequest/reviewRequestState.valueObject.ts
          Add 'merged' to VALID_TRANSITIONS['pending-fix'].
      - src/modules/tracking/usecases/tracking/transitionState.usecase.ts
          Add optional `requireCurrentState?: ReviewRequestStateValue` (import the type).
          Extend TransitionStateResult union with the `'invalid-current-state'` branch.
          Implement the check between not-found and qualityCheck.
      - src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts
          Add `POST /api/mr-tracking/mark-as-merged` handler.
      - src/dashboard/index.html
          New modal markup + new button in renderMrItem + new JS handlers + static label wiring.
      - src/dashboard/modules/i18n.js
          Add 7 keys to en block + 7 keys to fr block.
    Tests:
      - src/tests/units/entities/reviewRequest/reviewRequestState.valueObject.test.ts
          Add test asserting `pending-fix → merged` is now valid.
      - src/tests/units/usecases/tracking/transitionState.usecase.test.ts
          Add tests for `requireCurrentState` happy path + rejection path.

  NEW_FILES_SUMMARY:
    1. src/tests/units/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.test.ts
       (light coverage — exhaustive coverage lives in the acceptance test)
    2. src/tests/acceptance/181-mark-pending-fix-as-merged.acceptance.test.ts

  TOTAL_FILE_COUNT:
    new: 2
    modified: 7 (5 production + 2 tests)
    total: 9

  ACCEPTANCE_TEST:
    file: src/tests/acceptance/181-mark-pending-fix-as-merged.acceptance.test.ts
    note: |
      SDD outer loop — written FIRST (step 1), stays RED through every inner step, GREEN
      after the HTTP route lands (step 5). Mirrors the structure of
      src/tests/acceptance/180-quality-threshold-block-approval.acceptance.test.ts: build a
      Fastify app via `app.register(mrTrackingRoutes, { reviewRequestTrackingGateway })`,
      seed via TrackedMrFactory + InMemoryReviewRequestTrackingGateway, hit the endpoint
      via `app.inject()`, assert HTTP status + body + gateway state.
    scenarios_covered:
      - pending-fix → merged: status 200, body.success=true, gateway state='merged', mergedAt set
      - pending-approval rejected: 409, error="Seules les MR en correction peuvent être marquées comme mergées"
      - approved rejected: 409, same message
      - merged rejected: 409, same message
      - unknown MR: 404, error="MR non trouvée"
      - missing mrId: 400, error="mrId requis"
      - missing project path: 400, error="Chemin du projet requis"
      - invalid project path: 400, error="Chemin invalide"

  IMPLEMENTATION_ORDER (TDD, inside-out):
    1. RED — write src/tests/acceptance/181-mark-pending-fix-as-merged.acceptance.test.ts
       covering the 8 scenarios above. Fails with 404 (route does not exist).
    2. RED — add test "should allow transition pending-fix → merged" in
       src/tests/units/entities/reviewRequest/reviewRequestState.valueObject.test.ts.
       GREEN — add 'merged' to VALID_TRANSITIONS['pending-fix'] in the value object.
    3. RED — add tests in src/tests/units/usecases/tracking/transitionState.usecase.test.ts:
         - "should reject transition when requireCurrentState does not match"
             — seed mr in state 'approved', execute with requireCurrentState:'pending-fix',
               expect ok:false, reason:'invalid-current-state', message preserved, gateway untouched.
         - "should accept transition when requireCurrentState matches"
             — seed mr in state 'pending-fix', execute with targetState:'merged' and
               requireCurrentState:'pending-fix', expect ok:true and state='merged' and mergedAt set.
       GREEN — implement `requireCurrentState` check + extend the result union in
       src/modules/tracking/usecases/tracking/transitionState.usecase.ts.
    4. RED — create src/tests/units/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.test.ts
       with one happy path + one rejection (invalid current state) for the new route.
       Use Fastify inject + InMemoryReviewRequestTrackingGateway (mirror existing approve tests if any).
    5. GREEN — add `POST /api/mr-tracking/mark-as-merged` in
       src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts.
       Pass the French message literal at the boundary. At this point the acceptance test
       from step 1 turns GREEN for the API portion.
    6. UI — add i18n keys (en + fr) in src/dashboard/modules/i18n.js.
    7. UI — modify src/dashboard/index.html: modal markup, renderMrItem button injection,
       JS handlers (showMarkMergedModal, closeMarkMergedModal, confirmMarkAsMerged),
       and renderStaticLabels wiring.
    8. Verify acceptance GREEN end-to-end.
    9. Update docs/feature-tracker.md line 50: status `drafted` → `planned`, append plan link.

  REFERENCE_FILES:
    - docs/specs/181-mark-pending-fix-as-merged.md — spec, source of truth for rules + scenarios
    - docs/plans/180-quality-threshold-block-approval.plan.md — plan template for SDD/TDD layout
    - src/modules/review-execution/entities/reviewRequest/reviewRequestState.valueObject.ts — the line to edit
    - src/modules/tracking/usecases/tracking/transitionState.usecase.ts — host of the new `requireCurrentState` guard
    - src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts — HTTP plugin where the new route lives
    - src/tests/acceptance/180-quality-threshold-block-approval.acceptance.test.ts — exact acceptance scaffold to mirror
    - src/tests/units/usecases/tracking/transitionState.usecase.test.ts — current behaviour & test style
    - src/dashboard/index.html lines 309-318 (cancel modal markup), 1610-1712 (renderMrItem), 2881-2933 (cancel-modal handlers)
    - src/dashboard/modules/i18n.js lines 221-271 (en) and 645-698 (fr) for insertion points
    - src/main/routes.ts lines 163-167 — confirms the route plugin is already registered and needs no change
    - .claude/rules/coding-standards.md — naming, imports, French for end-user UI text

  TRACKER_UPDATE:
    file: docs/feature-tracker.md
    line: 50
    change: |
      Before: | Manually mark a pending-fix MR as merged | [181-mark-pending-fix-as-merged](specs/181-mark-pending-fix-as-merged.md) | drafted | 2026-05-27 |
      After:  | Manually mark a pending-fix MR as merged | [181-mark-pending-fix-as-merged](specs/181-mark-pending-fix-as-merged.md) — [plan](plans/181-mark-pending-fix-as-merged.plan.md) | planned | 2026-05-27 |

  VALIDATION_GATES:
    - yarn typecheck
    - yarn lint
    - yarn test:ci
