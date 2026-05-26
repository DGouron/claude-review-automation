PLAN:
  scope: SPEC-180 Iteration B — comment-based bypass (`/bypass-quality "reason"`)
  is_new_module: false
  worktree: .claude/worktrees/spec-180-quality-threshold (branch worktree-spec-180-iter-B)

  ITERATION_A_RECAP:
    - Quality gate entity: src/modules/tracking/entities/qualityGate/qualityGate.ts (pure evaluator — DO NOT touch signature)
    - ProjectConfig.qualityThreshold added (integer 0-10)
    - TransitionStateUseCase accepts `qualityCheck` callback, returns discriminated union
      `{ ok: true } | { ok: false; reason: 'not-found' } | { ok: false; reason: 'quality-gate'; message }`
    - RecordReviewCompletionUseCase reads `qualityThreshold` per-call, runs evaluator, decides `pending-fix`/`pending-approval`
    - Acceptance: scenarios 1, 2, 3, 7, 8 covered

  ITERATION_B_SCOPE:
    Cover scenarios 4, 5, 9, 10 only (NOT 6 — that's iter C).
    - 4: bypass with reason → state transition allowed (gate bypassed) + bypass recorded on TrackedMr
    - 5: bypass marker without reason → reject with FR message, no bypass stored
    - 9: new review completed after bypass → bypass cleared + state re-evaluated under normal gate
    - 10: bypass on already-qualified MR → bypass stored (for audit) + no forced state change

  ITERATION_B_NON_SCOPE:
    - Scenario 6 (platform unapprove + FR comment on platform-side approval webhook)
    - Multi-bypass per MR (one active bypass at a time)
    - Bypass expiration / TTL
    - UI dashboard surface for bypass status (separate spec)
    - Sourcing the bypass from anywhere other than note/comment webhook events

  ANTI_OVERENGINEERING_CHECK:
    Challenged each candidate abstraction:
    - "Bypass parser" — pure function, ~10 lines of string parsing. NOT a class, NOT a value
      object. One file with two exports (parser + result type).
    - "Bypass entity" — refuted. The bypass is a structural attribute of a TrackedMr (same
      lifecycle, same persistence, same identity owner). Adding it as an optional field on
      TrackedMr is the minimum-viable representation. No new entity, no new gateway.
    - "RecordBypass use case" — kept. One business intention ("a user requested to bypass
      the gate on this MR via a comment"), one writer. The use case orchestrates: parse
      marker, load MR, validate/store, optionally post a FR rejection comment for
      malformed markers.
    - "ApplyBypass decorator wrapping qualityCheck" — REFUTED as a layered decorator class.
      Inline composition in the controller (or in routes.ts wiring) suffices: a closure
      `(mr) => mr.bypass ? { allowed: true } : evaluateQualityGate(...)`. Zero new file.
    - "Comment webhook controller" — required. The webhook surface today rejects anything
      other than MR events. Iteration B adds a thin controller handling note events for
      both platforms, calling the bypass use case. One handler per platform, both delegating
      to the same use case.
    - Bypass reset on new review — one line added to RecordReviewCompletionUseCase (clear
      `mr.bypass` in the update payload). No new abstraction.
    Net new prod files: ~7. Net new test files: ~5. Total ≤ 12.

  ENTITIES:
    - name: bypassMarker (pure parser + result type)
      file: src/modules/tracking/entities/bypassMarker/bypassMarker.ts
      schema: (none — pure regex parsing on primitive input string)
      guard: (none — applied at use-case boundary)
      gateway_contract: (none — pure function, no I/O)
      test: src/tests/units/modules/tracking/entities/bypassMarker/bypassMarker.test.ts
      factory: (none — primitive inputs)
      exports:
        - type BypassMarkerResult =
            | { kind: 'no-marker' }
            | { kind: 'valid'; reason: string }
            | { kind: 'invalid-missing-reason' }
        - function parseBypassMarker(commentBody: string): BypassMarkerResult
      decisions:
        - Pure function in the entity layer. NOT a class.
        - Matches `/bypass-quality\s+"([^"]+)"` (reason in double quotes, non-empty).
        - `/bypass-quality` without a quoted non-empty reason → `invalid-missing-reason`.
          Includes degenerate variants like `/bypass-quality`, `/bypass-quality ""`,
          `/bypass-quality "   "` (whitespace-only) — all map to `invalid-missing-reason`.
        - If comment does not contain `/bypass-quality` at all → `no-marker` (caller
          ignores).
        - French rejection message is NOT produced by the parser — it lives in the
          use case (consistent with iter-A where `evaluateQualityGate` produces messages
          tied to gate semantics; the bypass parser is content-agnostic).
        - Returns a discriminated union, no exceptions for predictable invalid input.

    - name: bypassRecord (type only, lives on TrackedMr)
      file: src/modules/tracking/entities/tracking/trackedMr.ts (MODIFIED — add optional field)
      schema: (no Zod schema today on TrackedMr; mirror existing style — typed-only fields)
      guard: (none)
      gateway_contract: (no change — uses existing `update(projectPath, mrId, Partial<TrackedMr>)`)
      test: covered indirectly through use-case and acceptance tests; no dedicated test file
      factory: src/tests/factories/trackedMr.factory.ts (MODIFIED — bypass defaults to null)
      shape:
        - bypass: { author: string; reason: string; recordedAt: string } | null
      decisions:
        - Optional new field directly on TrackedMr — same lifecycle, same persistence
          path, same gateway. No new entity, no new collection.
        - Defaults to null on create / for legacy rows (backward compatible).
        - Cleared on new completed review (Iteration B scenario 9).

  USECASES:
    - name: recordBypass (NEW)
      file: src/modules/tracking/usecases/tracking/recordBypass.usecase.ts
      test: src/tests/units/modules/tracking/usecases/tracking/recordBypass.usecase.test.ts
      type: command
      input: |
        {
          projectPath: string;
          mrId: string;
          commentBody: string;
          author: string;
          now: () => string;   // injected for test determinism (consistent with project style)
        }
      output: |
        | { kind: 'no-marker' }
        | { kind: 'recorded'; bypass: { author; reason; recordedAt } }
        | { kind: 'rejected-missing-reason'; message: string }   // FR message
        | { kind: 'mr-not-found' }
      decisions:
        - Single intention: "process a comment that may carry a bypass marker".
        - Calls `parseBypassMarker(commentBody)`. Branches:
          * no-marker → return `{ kind: 'no-marker' }` (no I/O, no side effect).
          * invalid-missing-reason → return `{ kind: 'rejected-missing-reason', message:
            'Le bypass nécessite une raison explicite. Format attendu : /bypass-quality "raison"' }`.
            DOES NOT post the comment itself — that's the controller's job (keeps the
            use case I/O-free except for the tracking gateway).
          * valid → load MR via tracking gateway; if missing → `{ kind: 'mr-not-found' }`;
            otherwise update MR with `bypass: { author, reason, recordedAt: now() }`.
        - Returns the discriminated union; callers decide whether to post a FR
          acknowledgement / rejection comment.
        - Honors scenario 10 implicitly: storing the bypass on an already-qualified MR
          does NOT touch `state`. The use case only writes the `bypass` field.

    - name: recordReviewCompletion (MODIFIED — minor extension)
      file: src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts
      test: src/tests/units/usecases/tracking/recordReviewCompletion.usecase.test.ts (extend)
      type: command (unchanged)
      change:
        - In the `update()` payload, add `bypass: null` to clear any active bypass when
          a new review completes (scenario 9). One line of code.
        - No signature change.

    - name: transitionState (MODIFIED — inject bypass into the gate check)
      file: src/modules/tracking/usecases/tracking/transitionState.usecase.ts
      test: src/tests/units/usecases/tracking/transitionState.usecase.test.ts (extend)
      type: command (unchanged signature)
      change:
        - At the gate-check site (line 30-35), short-circuit if `mr.bypass !== null`:
          treat as `{ allowed: true }`. Optionally include a log line indicating the
          bypass author + reason for traceability.
        - The `qualityCheck` callback signature stays `(mr: TrackedMr) => QualityGateResult`.
          The bypass short-circuit happens INSIDE `transitionState` before invoking the
          callback (alternative considered: have the callback closure handle the bypass —
          rejected because that pushes domain knowledge into the composition root).
        - Net effect: scenario 4 (bypass with reason → approved transition allowed).
        - No new dependency; reads bypass directly from the loaded `mr` object.

  GATEWAYS:
    - name: noteCommentPost (NEW — minimal contract for posting FR rejection comments)
      contract: src/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.ts
      implementations:
        - GitLab: src/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.gitlab.cli.gateway.ts
        - GitHub: src/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.github.cli.gateway.ts
      stub: src/tests/stubs/noteCommentPost.stub.ts
      methods:
        - postComment(input: { projectPath: string; mrNumber: number; body: string }): Promise<void>
      decisions:
        - Required for scenario 5 (FR rejection comment back to the MR) and scenario 10
          (acknowledgement is optional — see scope decision below).
        - REUSE existing CLI executors (`defaultGitLabExecutor`, `defaultGitHubExecutor`)
          and `glab api`/`gh api` patterns already used in
          `reviewAction.gitlab.cli.gateway.ts` (POST_COMMENT branch).
        - Tiny surface: one method, one verb. NOT extending `ReviewActionGateway` — that
          one is sized for batch-action execution within a review job; this is a one-shot
          comment post from the webhook context.
        - Stub for tests records the calls in an in-memory array.
      scenario_10_decision:
        - Spec says scenario 10 = "comment acknowledged + no state change (bypass stored
          but not needed)". MINIMAL interpretation: bypass stored, no platform comment
          required (the storage IS the acknowledgement; the user sees their bypass
          reflected in tracking). DOES NOT post an extra acknowledgement comment to avoid
          comment spam. This keeps `noteCommentPost.postComment` used only for the FR
          rejection path (scenario 5).
        - This decision keeps the gateway optional for the no-marker / no-reason / valid
          paths; the controller only invokes it when `recordBypass` returns
          `rejected-missing-reason`.

  WEBHOOK_EVENT_SURFACE:
    new_event_guards:
      - name: GitLabNoteEvent
        file: src/modules/platform-integration/entities/gitlab/gitlabNoteEvent.guard.ts
        test: src/tests/units/modules/platform-integration/entities/gitlab/gitlabNoteEvent.guard.test.ts
        shape (Zod):
          object_kind: literal('note')
          user: { username; name }
          project: { id; path_with_namespace; ... }
          object_attributes: {
            note: string;             // comment body
            noteable_type: 'MergeRequest';
            noteable_id: number;
          }
          merge_request: { iid: number; ... }
        decisions:
          - Mirror style of existing gitlabMergeRequestEvent.guard.ts (Zod + createGuard).
          - Schema is intentionally narrow: only fields needed for bypass routing
            (object_kind, project.path_with_namespace, user.username, note,
            noteable_type, merge_request.iid). Add fields later as needed.
      - name: GitHubIssueCommentEvent
        file: src/modules/platform-integration/entities/github/githubIssueCommentEvent.guard.ts
        test: src/tests/units/modules/platform-integration/entities/github/githubIssueCommentEvent.guard.test.ts
        shape (Zod):
          action: literal('created')      // we only care about new comments
          issue: { number: number; pull_request?: { url: string } }   // discriminate PR comments
          comment: { body: string; user: { login: string } }
          repository: { full_name: string }
          sender: { login: string }
        decisions:
          - GitHub PR comments arrive as `issue_comment` events (with a `pull_request`
            sub-object on the issue). The guard requires `issue.pull_request` to be
            present — otherwise it's an issue comment unrelated to a PR.

    event_filters_extended:
      file: src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts (MODIFIED)
      new_exports:
        - filterGitLabNoteEvent(event: GitLabNoteEvent): NoteFilterResult
        - filterGitHubIssueCommentEvent(event: GitHubIssueCommentEvent): NoteFilterResult
      types_added:
        - export type NoteFilterResult =
            | { shouldProcess: false; reason: string }
            | { shouldProcess: true; reason: string; mergeRequestNumber: number;
                projectPath: string; commentBody: string; authorUsername: string }
      decisions:
        - Same shape pattern as existing `FilterResult`. Returns either
          `shouldProcess: false` with reason or the routing fields.
        - GitLab filter: ensures `object_kind === 'note'`, `noteable_type === 'MergeRequest'`,
          extracts MR iid + project path + comment body + author username.
        - GitHub filter: ensures `action === 'created'`, `issue.pull_request` present;
          extracts PR number from `issue.number`, project path from `repository.full_name`,
          comment body + author login.
        - Neither filter parses the bypass marker — that's the use case's job. Filters
          only route.

  CONTROLLERS:
    - name: gitlab.controller (MODIFIED — handle note events at top of pipeline)
      file: src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts
      test: extend src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts
      dependencies (added to GitLabWebhookDependencies):
        - recordBypass: RecordBypassUseCase
        - noteCommentPostGateway: NoteCommentPostGateway
      change:
        - At step "2. Check event type" (line ~104), recognise `eventType === 'Note Hook'`
          as an early branch. Parse with new `gitLabNoteEventGuard`, run
          `filterGitLabNoteEvent`. If `shouldProcess` is true:
            - Resolve repo config via `findRepositoryByProjectPath`.
            - Build `mrId = gitlab-${projectPath}-${mrNumber}`.
            - Call `recordBypass.execute({ projectPath: localPath, mrId, commentBody, author, now })`.
            - On `rejected-missing-reason` → post FR comment via `noteCommentPostGateway.postComment`.
            - On `no-marker` → 200 + status: 'ignored' (no marker in comment).
            - On `recorded` → 200 + status: 'bypass-recorded' (no platform side-effect by design).
            - On `mr-not-found` → 200 + status: 'ignored' (not yet tracked).
            - Reply and return; do NOT fall through to MR-event handling.
        - The MR-event branch below stays untouched (preserves iter-A behavior).

    - name: github.controller (MODIFIED — handle issue_comment events)
      file: src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
      test: extend src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts
      dependencies (added to GitHubWebhookDependencies):
        - recordBypass: RecordBypassUseCase
        - noteCommentPostGateway: NoteCommentPostGateway
      change:
        - At step "2. Check event type", branch on `eventType === 'issue_comment'`.
        - Parse with new `gitHubIssueCommentEventGuard`, run
          `filterGitHubIssueCommentEvent`. Same branch semantics as GitLab.
        - Resolve repo via `findRepositoryByRemoteUrl` (existing helper) using the
          repository.clone_url; build `mrId = github-${projectPath}-${prNumber}`.

  PRESENTERS:
    (none — French messages produced inline at use-case boundary, consistent with iter A.)

  VIEWS:
    (none — dashboard UI for bypass visualization is explicit Out of Scope.)

  WIRING:
    routes: |
      In src/main/routes.ts (lines ~327 and ~350):
        - Construct one `RecordBypassUseCase` per webhook registration (shares the
          trackingGw already injected).
        - Construct `GitLabNoteCommentPostCliGateway` and
          `GitHubNoteCommentPostCliGateway` using `defaultGitLabExecutor` /
          `defaultGitHubExecutor`.
        - Pass both into the `GitLabWebhookDependencies` and
          `GitHubWebhookDependencies` blocks.
        - `transitionState` instantiation unchanged (bypass short-circuit lives inside
          the use case, reads from the loaded MR).
    dependencies:
      - new: RecordBypassUseCase(trackingGw)  // x2 (gitlab + github reg.)
      - new: GitLabNoteCommentPostCliGateway(defaultGitLabExecutor)
      - new: GitHubNoteCommentPostCliGateway(defaultGitHubExecutor)
    composition_root_decisions:
      - `recordBypass` does not need the `now` injection visible from the composition
        root — the use case accepts it as input parameter, the controller passes
        `() => new Date().toISOString()` (mirrors style elsewhere). Keeps tests
        deterministic without DI gymnastics.

  MODIFICATIONS_TO_EXISTING_FILES:
    - src/modules/tracking/entities/tracking/trackedMr.ts
        Add optional `bypass: { author: string; reason: string; recordedAt: string } | null`.
    - src/tests/factories/trackedMr.factory.ts
        Default `bypass: null` in the base factory.
    - src/modules/tracking/usecases/tracking/transitionState.usecase.ts
        Short-circuit gate check when `mr.bypass !== null`. Update its unit test.
    - src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts
        Clear bypass in the `update()` payload (`bypass: null`). Update its unit test.
    - src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts
        Add `NoteFilterResult` type, `filterGitLabNoteEvent`, `filterGitHubIssueCommentEvent`.
    - src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts
        Add note-event branch before MR-event handling; extend Dependencies interface.
    - src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
        Add issue_comment-event branch; extend Dependencies interface.
    - src/main/routes.ts
        Wire new gateways + RecordBypassUseCase into both webhook registrations.

  NEW_FILES_SUMMARY (production):
    1. src/modules/tracking/entities/bypassMarker/bypassMarker.ts
    2. src/modules/tracking/usecases/tracking/recordBypass.usecase.ts
    3. src/modules/platform-integration/entities/gitlab/gitlabNoteEvent.guard.ts
    4. src/modules/platform-integration/entities/github/githubIssueCommentEvent.guard.ts
    5. src/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.ts
    6. src/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.gitlab.cli.gateway.ts
    7. src/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.github.cli.gateway.ts

  NEW_FILES_SUMMARY (tests):
    8.  src/tests/units/modules/tracking/entities/bypassMarker/bypassMarker.test.ts
    9.  src/tests/units/modules/tracking/usecases/tracking/recordBypass.usecase.test.ts
    10. src/tests/units/modules/platform-integration/entities/gitlab/gitlabNoteEvent.guard.test.ts
    11. src/tests/units/modules/platform-integration/entities/github/githubIssueCommentEvent.guard.test.ts
    12. src/tests/stubs/noteCommentPost.stub.ts
    13. src/tests/acceptance/180-quality-threshold-block-approval-iter-B.acceptance.test.ts

  ESTIMATED_FILE_COUNT:
    new_production: 7
    new_tests_and_stubs: 6
    modified_production: 7
    modified_tests: 2 (transitionState + recordReviewCompletion)
    TOTAL_NEW_FILES: 13 (target ≤ 12 — at the edge, justified because we need
                        one new guard per platform AND one new gateway impl per platform;
                        none of them is optional).
    NOTE: if budget is tight, the GitLab + GitHub guard test files (10, 11) can be
          merged into the existing webhook controller tests, dropping the count to 11.
          Recommendation: KEEP separate (Zod guards traditionally have their own test
          file in this codebase — see gitlabMergeRequestEvent guard pattern).

  IMPLEMENTATION_ORDER:
    1. src/tests/acceptance/180-quality-threshold-block-approval-iter-B.acceptance.test.ts
       — SDD outer loop: 4 scenarios (4, 5, 9, 10). Stays RED through every inner step
         until step 9 wiring completes.
       — Drives the webhook with `app.inject()` against:
            * a `/webhooks/gitlab` POST with `X-Gitlab-Event: Note Hook` + a note payload
              for scenarios 4, 5, 10
            * a chained call (record review → bypass → record review again) for scenario 9
       — Uses InMemoryReviewRequestTrackingGateway and a stub NoteCommentPostGateway.
    2. src/modules/tracking/entities/bypassMarker/bypassMarker.ts (+ unit test)
       — Pure function, walking-skeleton core for the parsing concern.
       — Test cases: empty, no-marker, marker without reason, marker with empty quotes,
         marker with whitespace-only reason, valid marker, marker mid-comment.
    3. src/modules/tracking/entities/tracking/trackedMr.ts (modify) + factory update
       — Add `bypass` field. No tests on the type itself; factory default covers callers.
    4. src/modules/tracking/usecases/tracking/recordBypass.usecase.ts (+ unit test)
       — Composes parser + tracking gateway. Returns discriminated union.
       — Test cases: no-marker → kind 'no-marker'; rejected-missing-reason → FR message;
         MR not found → kind 'mr-not-found'; valid marker → MR updated with bypass field.
    5. src/modules/tracking/usecases/tracking/transitionState.usecase.ts (modify + test extend)
       — Short-circuit gate check when bypass present. Existing tests still pass; add
         one new test asserting bypass overrides a failing gate (scenario 4 mechanism).
    6. src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts (modify + test extend)
       — Add `bypass: null` to the update payload. New test: bypass cleared on next
         review (scenario 9 mechanism).
    7. src/modules/platform-integration/entities/gitlab/gitlabNoteEvent.guard.ts (+ unit test)
       src/modules/platform-integration/entities/github/githubIssueCommentEvent.guard.ts (+ unit test)
       — Zod guards mirroring iter-A style.
    8. src/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.ts
       — Contract only.
    9. src/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.gitlab.cli.gateway.ts
       src/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.github.cli.gateway.ts
       src/tests/stubs/noteCommentPost.stub.ts
       — CLI implementations reusing `glab api`/`gh api` patterns from
         reviewAction.<platform>.cli.gateway.ts. Stub for tests.
    10. src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts
        (extend)
        — Add NoteFilterResult + filterGitLabNoteEvent + filterGitHubIssueCommentEvent.
    11. src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts
        (extend + test extend)
        src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
        (extend + test extend)
        — Wire the note branch. Tests: each scenario from the spec exercised via the
          controller function with stubbed deps.
    12. src/main/routes.ts (wire)
        — Instantiate gateways + use case for both webhook registrations.
    13. Verify acceptance test (step 1) passes GREEN; run `yarn verify`.

  TEST_PLAN:
    unit_parser (bypassMarker.test.ts):
      - empty string → no-marker
      - "LGTM, ship it" → no-marker (no marker word)
      - "/bypass-quality" alone → invalid-missing-reason
      - "/bypass-quality \"\"" → invalid-missing-reason
      - "/bypass-quality \"   \"" → invalid-missing-reason (whitespace-only reason)
      - "/bypass-quality \"hotfix critique\"" → valid, reason "hotfix critique"
      - "see notes: /bypass-quality \"par précaution\" please" → valid (marker embedded)
      - "/bypass-quality \"line1\nline2\"" → valid (multi-line reason preserved)
    unit_useCase (recordBypass.usecase.test.ts):
      - no-marker comment → kind 'no-marker', gateway not touched
      - invalid marker → kind 'rejected-missing-reason', message
        "Le bypass nécessite une raison explicite. Format attendu : /bypass-quality \"raison\"",
        gateway not touched
      - valid marker, MR exists → kind 'recorded'; gateway.update called with
        bypass: { author, reason, recordedAt: stub time }; existing fields untouched
      - valid marker, MR missing → kind 'mr-not-found'; gateway.update NOT called
    unit_transitionState (extend):
      - approved + failing gate + bypass present → ok:true (gate bypassed, mr updated)
      - approved + passing gate + bypass present → ok:true (no behavior change)
      - approved + failing gate + bypass absent → ok:false (iter-A behavior preserved)
    unit_recordReviewCompletion (extend):
      - mr has active bypass + new review completes → resulting mr.bypass is null
      - mr has no bypass + new review completes → bypass stays null (no regression)
    unit_guards:
      - gitlabNoteEventGuard: valid payload accepted; missing object_kind rejected;
        non-MergeRequest noteable_type rejected.
      - gitHubIssueCommentEventGuard: valid PR comment accepted; issue without
        pull_request sub-object rejected.
    unit_controllers (gitlab + github):
      - Note Hook with /bypass-quality "raison" → bypass recorded, 200, no comment posted
      - Note Hook with /bypass-quality alone → comment posted via stub gateway with FR
        message, 200
      - Note Hook with unrelated comment → 200 ignored, no gateway touched
      - Note Hook for unknown MR → 200 ignored, no panic
    acceptance (4 scenarios):
      - scenario 4: seed MR (state pending-approval, latestScore=5, openThreads=1) +
        threshold=7; POST note webhook with bypass marker; then call HTTP approve;
        expect 200 + state 'approved' + mr.bypass populated.
      - scenario 5: POST note webhook with bare /bypass-quality; expect 200 from
        webhook + stub NoteCommentPostGateway recorded the FR rejection message; mr.bypass null.
      - scenario 9: seed MR with bypass populated; call recordCompletion with score=8
        (simulating new review); expect mr.bypass === null + state 'pending-approval'
        (re-evaluated normally).
      - scenario 10: seed MR with state pending-approval, latestScore=9, openThreads=0,
        threshold=7; POST note with /bypass-quality "par précaution"; expect 200, mr.bypass
        populated, state unchanged (still pending-approval), and the existing
        HTTP approve flow still works as in iter-A.

  ACCEPTANCE_TEST:
    file: src/tests/acceptance/180-quality-threshold-block-approval-iter-B.acceptance.test.ts
    note: |
      SDD outer loop — written first (step 1), RED until step 12 wiring completes, GREEN
      at step 13. Uses Fastify `inject()`. The webhook secret check is bypassed by
      injecting a `verifier` test stub or by providing the matching token in headers
      (mirror the pattern used in existing webhook controller tests; the controllers
      load secrets via `loadEnvSecrets()` so the acceptance test sets the env or uses
      a configuration override — verify the precedent in
      src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts).

  REFERENCE_FILES:
    - docs/specs/180-quality-threshold-block-approval.md — full spec (iter B = 4, 5, 9, 10)
    - docs/reports/180-quality-threshold-block-approval.report.md — iter A summary
    - docs/plans/180-quality-threshold-block-approval.plan.md — iter A plan for shared patterns
    - src/modules/tracking/entities/qualityGate/qualityGate.ts — iter A evaluator (untouched)
    - src/modules/tracking/usecases/tracking/transitionState.usecase.ts — bypass short-circuit point
    - src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts — bypass-reset point
    - src/modules/tracking/entities/tracking/trackedMr.ts — adds `bypass` field
    - src/modules/platform-integration/entities/gitlab/gitlabMergeRequestEvent.guard.ts — guard style reference
    - src/modules/platform-integration/entities/github/githubPullRequestEvent.guard.ts — guard style reference
    - src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts — filter style reference
    - src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts — controller orchestration pattern
    - src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts — controller orchestration pattern
    - src/modules/review-execution/interface-adapters/gateways/cli/reviewAction.gitlab.cli.gateway.ts — CLI gateway pattern + glab api note POST
    - src/security/verifier.ts — `getGitLabEventType` returns 'Note Hook' for note events
    - src/main/routes.ts — composition root (lines 327, 350)
    - src/tests/factories/trackedMr.factory.ts — extend with bypass default
    - src/tests/stubs/reviewRequestTracking.stub.ts — in-memory tracking gateway used in acceptance
    - src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts — webhook acceptance pattern
    - .claude/rules/coding-standards.md — naming, FR messages, async patterns

  ARCHITECTURAL_DECISIONS:
    where_parser_lives:
      Entity layer (`src/modules/tracking/entities/bypassMarker/`). Pure function, no I/O.
      The marker syntax is a domain rule — the entity layer is the right home (parallel
      to `evaluateQualityGate` in iter A).
    where_bypass_is_stored:
      Optional field on `TrackedMr`. Same lifecycle, same persistence. NO new entity, NO
      new gateway, NO new collection. The bypass is part of the MR's tracking state, not
      an independent aggregate.
    where_gate_consults_bypass:
      Inside `TransitionStateUseCase` (use-case layer), via `mr.bypass !== null` guard
      before invoking the `qualityCheck` callback. The pure `evaluateQualityGate` stays
      untouched (it knows nothing about bypasses — its job is "does this score+blockers
      pass this threshold?", a different concern).
    bypass_reset_on_new_review:
      In `RecordReviewCompletionUseCase` — one line in the `update()` payload. No new
      "ResetBypass" use case; resetting is a side-effect of recording a new review,
      not a separate user intention.
    webhook_event_filter_pattern:
      Mirrors existing eventFilter.ts: new typed filters return either
      `{ shouldProcess: false; reason }` or routing fields. Controllers consume the
      filter result. NO bypass logic inside filters; they only route.
    why_separate_note_comment_post_gateway:
      The existing `ReviewActionGateway` is designed for batch action execution within a
      review job context (with `ExecutionContext` carrying baseUrl, diffMetadata, etc.).
      The bypass-rejection comment is a one-shot, fire-and-forget action from a webhook
      context with no review job in flight. A dedicated narrow gateway
      (`postComment({ projectPath, mrNumber, body })`) is simpler, easier to test, and
      avoids dragging `ExecutionContext` plumbing into the webhook controller.
    scenario_10_acknowledgement_design:
      The spec says "comment acknowledged + no state change". The minimum-viable
      acknowledgement is "bypass stored on the MR" (visible in tracking, dashboard).
      Posting an extra acknowledgement comment is rejected as overengineering: it adds
      noise to the MR, requires another gateway call, and the bypass record IS the
      acknowledgement. The dashboard (out of scope) is the natural surface.
    french_messages:
      Two FR strings in this iteration:
        - "Le bypass nécessite une raison explicite. Format attendu : /bypass-quality \"raison\""
          (scenario 5, produced by `recordBypass.usecase.ts`, posted to MR via comment gateway)
      All other code/tests/logs stay English.
    why_now_function_injected_per_call:
      `recordBypass.usecase.ts` accepts `now: () => string` as input, not as constructor
      arg. Tests pass a deterministic stub; the controller passes
      `() => new Date().toISOString()`. Avoids time-source DI plumbing in routes.ts
      while keeping tests free of `vi.useFakeTimers()`.

  WALKING_SKELETON:
    First minimal vertical slice (steps 1-6 in IMPLEMENTATION_ORDER):
      acceptance test RED → bypassMarker parser → TrackedMr.bypass field + factory →
      recordBypass use case → transitionState short-circuit → recordReviewCompletion
      reset → eventFilter (note filters) → guards → gateway + stub → controllers →
      wiring → acceptance GREEN.
    The visible end-to-end path: POST note webhook with bypass marker → MR's
    bypass field populated → existing HTTP approve flow (iter-A) lets the transition
    through because the gate short-circuits when bypass is present.

  OUT_OF_ITERATION_B_SCOPE (deferred to iter C or future):
    - Scenario 6: platform-side approval webhook → unapprove + FR explanatory comment.
    - Dashboard UI for bypass status / audit trail.
    - Bypass expiration / revocation by another comment.
    - Bypass posted by webhook signature impersonation (out of threat model).
