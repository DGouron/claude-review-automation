PLAN:
  scope: SPEC-180 Iteration C — platform unapprove + FR explanatory comment on platform approval of non-qualified MR (no active bypass)
  is_new_module: false
  worktree: .claude/worktrees/spec-180-quality-threshold (branch worktree-spec-180-iter-C, stacked on iter-B 0fef4df)

  ITERATION_AB_RECAP (assume present, DO NOT touch):
    - Entity: `src/modules/tracking/entities/qualityGate/qualityGate.ts` — pure evaluator
      `evaluateQualityGate({ latestScore, blockingIssues, threshold }) → { allowed; reason?; message? }`.
    - Entity: `src/modules/tracking/entities/tracking/trackedMr.ts` — `bypass: BypassRecord | null`.
    - Use case: `RecordBypassUseCase` (iter B), `TransitionStateUseCase` already short-circuits
      gate when `mr.bypass !== null`.
    - Gateway: `NoteCommentPostGateway` (iter B contract) + CLI impls
      (`GitLabNoteCommentPostCliGateway`, `GitHubNoteCommentPostCliGateway`). REUSE for the FR comment.
    - Existing GitLab approval branch: `gitlab.controller.ts:300-311` calls
      `transitionState.execute({ ..., targetState: 'approved' })` on `filterGitLabMrApprove`.
    - GitHub: NO equivalent today — `pull_request_review` is never handled.

  ITERATION_C_SCOPE:
    Cover ONLY spec scenario 6:
      { lastScore: 6, blockers: 0, threshold: 7, bypass: none, platformAction: "approved" }
      → revoke platform approval (unapprove)
      → post FR comment
         "Approbation annulée : seuil qualité 7/10 non atteint (6/10).
          Utilisez `/bypass-quality \"raison\"` pour forcer."
    NOT in iter C: scenarios 1, 2, 3, 4, 5, 7, 8, 9, 10 (already covered).

  ANTI_OVERENGINEERING_CHECK (per /anti-overengineering):
    Each candidate abstraction challenged:
    - "PlatformApprovalGuard entity" — REFUTED. Decision shape is the same `evaluateQualityGate`
      from iter A + the `mr.bypass !== null` check from iter B. No new pure function needed —
      it's the SAME policy as the HTTP `POST /api/mr-tracking/approve` enforcement. Iter A's
      evaluator + iter B's bypass short-circuit already encode the rule.
    - "HandlePlatformApproval use case" — KEPT. One business intention: "react to a platform
      approval event by checking the gate and reverting if it fails". Composes
      `evaluateQualityGate` + tracking gateway read + `UnapproveGateway` + `NoteCommentPostGateway`.
      Controllers stay thin (parse event, delegate). Discriminated-union return shape
      consistent with iter A/B (`{ kind: 'allowed' | 'reverted' | 'mr-not-found' | 'bypass-active' }`).
    - "Unapprove gateway" — REQUIRED. New I/O. One method `unapprove({ projectPath, mrNumber })`.
      One contract + two CLI impls (glab, gh). Stub for tests.
    - "FR message template entity / value object" — REFUTED. The literal string is owned by
      the use case (mirrors iter A's pattern: `evaluateQualityGate` produces FR strings inline).
      Formatting is `Approbation annulée : seuil qualité ${threshold}/10 non atteint (${score}/10). Utilisez \`/bypass-quality "raison"\` pour forcer.`
    - "GitHub pull_request_review event handler" — REQUIRED for symmetry with GitLab. Without
      it, iter C only covers GitLab (spec says "applies symmetrically on GitLab and GitHub").
      One new Zod guard, one new filter, one new event-type branch in `github.controller.ts`.
    - "Retry the unapprove call on failure" — REFUTED. Spec is silent; simplest is best.
      Log and proceed. If unapprove throws → log error, still post the comment (best-effort
      revert + always inform the user). Documented in DECISIONS below.
    - Net new prod files: 4 (use case, gateway contract, 2 CLI impls) + 1 GitHub guard.
      Net modified: 4 (eventFilter, gitlab.controller, github.controller, routes.ts).
      Tests: 4 unit + 1 acceptance + 1 stub.

  DECISIONS:
    unapprove_api_per_platform:
      GitLab:
        Command shape: `glab api --method POST projects/<encoded>/merge_requests/<iid>/approvals/unapprove`
        — REST `POST .../approvals/unapprove` (GitLab API endpoint, returns 201 on success).
        Equivalent CLI: `glab mr unapprove <iid>` exists, but we keep the `glab api` shape
        for consistency with the rest of the codebase (`threadFetch.gitlab.gateway.ts`,
        `reviewAction.gitlab.cli.gateway.ts`, `noteCommentPost.gitlab.cli.gateway.ts` all
        use `glab api`).
        Auth: relies on `glab auth login` (no token plumbing — same as other gateways).
        Permission caveat: the OAuth user must have rights to revoke approvals on the MR.
        If 403 → executor throws → use case catches and logs (see error-handling decision).
      GitHub:
        GitHub has no clean "unapprove" primitive. Two options:
          (a) `gh api --method POST repos/<owner>/<repo>/pulls/<pr>/reviews -f event=REQUEST_CHANGES -f body="..."`
              — posts a new `REQUEST_CHANGES` review that supersedes the prior APPROVE.
              Side effects: visible review entry from the bot.
          (b) `gh api --method PUT repos/<owner>/<repo>/pulls/<pr>/reviews/<review_id>/dismissals -f message="..."`
              — dismisses a specific review by id. Requires knowing the review_id, which
              the event payload provides (`event.review.id` on `pull_request_review`).
              Cleanest semantics, mirrors GitLab "revoke approval".
        CHOSEN: (b) — dismissal is the closest to "revoke approval".
        Command shape: `gh api --method PUT repos/<owner>/<repo>/pulls/<pr>/reviews/<review_id>/dismissals --field message="Seuil qualité non atteint"`
        Note: the dismissal message is required by GitHub; we pass a short FR string. The
        full FR explanation is posted separately as an issue comment via the iter-B gateway.
        Auth: relies on `gh auth login`. Caveat: dismissing a review requires write access
        to the repo + the branch protection must allow review dismissal (or the bot must
        have admin/maintain rights). If forbidden → executor throws → use case catches.

    where_gate_detection_lives:
      In a new use case `HandlePlatformApprovalUseCase`. Reads MR via tracking gateway,
      computes the gate via `evaluateQualityGate(latestScore, openThreads, threshold)`,
      checks `mr.bypass !== null` first. Returns a discriminated union; the controller
      reacts (call unapprove + post comment) only on `{ kind: 'reverted' }`. This keeps
      the controllers thin and the policy testable in isolation.

    where_orchestration_sits:
      Use case (option b in inputs). Mirrors iter B (`RecordBypassUseCase` returns a
      discriminated union; controller orchestrates the I/O). Controllers do NOT call the
      `UnapproveGateway` or `NoteCommentPostGateway` directly — they receive the use-case
      verdict and act on `kind: 'reverted'`. This keeps the policy "approve → check gate
      → maybe revert" testable without webhook plumbing.

    why_use_case_does_not_own_the_unapprove_call:
      Same rationale as iter B's `recordBypass`: the use case stays I/O-free except for
      the tracking gateway. The unapprove + FR comment are platform-side side effects
      driven by the discriminated-union result. This:
        - keeps the use case unit-testable without mocking 3 I/O ports;
        - allows the controller to decide ordering (unapprove FIRST, then comment, so the
          user sees the revert before the explanation);
        - if either I/O fails, the controller can log without aborting the other.

    french_comment_template_owner:
      The literal FR text lives in `HandlePlatformApprovalUseCase` (same place as iter A's
      gate messages, same pattern as iter B's `MISSING_REASON_MESSAGE`). Template:
        `Approbation annulée : seuil qualité ${threshold}/10 non atteint (${score}/10). Utilisez \`/bypass-quality "raison"\` pour forcer.`
      Edge case: the spec scenario specifies `lastScore: 6, threshold: 7`. The template
      substitutes those values. The use case returns the message as part of the
      `{ kind: 'reverted'; message: string; threshold: number; latestScore: number }`
      shape — the controller posts it as-is.

    handling_blocker_only_rejection:
      Spec scenario 6 only specifies the below-threshold path. But the same gate logic
      could reject a platform approval because of `blockers-present` (e.g. score is high
      but open threads remain). DECISION: the use case reverts in BOTH gate-failure cases
      (below-threshold + blockers-present), with the message reflecting the actual reason:
        - below-threshold → spec literal: "Approbation annulée : seuil qualité X/10 non
          atteint (Y/10). Utilisez `/bypass-quality \"raison\"` pour forcer."
        - blockers-present → adapted: "Approbation annulée : issues bloquantes non
          résolues. Utilisez `/bypass-quality \"raison\"` pour forcer."
      Rationale: the spec rule (line 54) says "When a platform approval event reaches
      ReviewFlow on a non-qualified merge request without active bypass". "Non-qualified"
      maps to the full gate predicate, not just below-threshold. Tests cover both branches.
      ALTERNATIVE if user objects: scope iter C strictly to below-threshold; the use case
      returns `{ kind: 'allowed' }` on blockers-present (no revert). Plan reflects the
      first option; flag for confirmation but proceed (Auto Mode).

    no_review_yet_handling:
      Per iter A `evaluateQualityGate`: when `latestScore === null`, gate returns
      `{ allowed: true }`. The use case therefore returns `{ kind: 'allowed' }`, controller
      lets the platform approval stand. Matches spec scenario 7 logic carried into iter C.

    no_threshold_configured_handling:
      Per iter A: when `threshold === null`, gate returns `{ allowed: true }`. Same
      `{ kind: 'allowed' }` outcome. Matches spec rule "absent threshold → no gating".

    active_bypass_handling:
      Use case checks `mr.bypass !== null` BEFORE invoking the evaluator. If bypass active
      → `{ kind: 'bypass-active' }`, controller takes no platform action. Mirrors iter B's
      `transitionState.usecase.ts` short-circuit.

    error_handling_on_unapprove_failure:
      Controller wraps `unapproveGateway.unapprove(...)` in try/catch. On failure: log
      `error` at warn level (mr id, platform, error message), STILL proceed to post the
      FR comment (so the user knows ReviewFlow attempted to revert and why). Internal
      tracking state is NOT mutated (the platform approval may stand). Spec rule 54
      "ReviewFlow revokes the approval on the platform" is best-effort; failure is
      observable in logs. Documented in tests (one test asserts the catch path).
      Comment-post failure: same try/catch, log only.

    internal_state_after_revert:
      QUESTION: should the internal `TrackedMr.state` revert from `approved` back to
      `pending-approval`? GitLab's existing approve branch (line 306) calls
      `transitionState.execute({ ..., targetState: 'approved' })`. With iter A/B in place,
      that call now goes through the gate. If the gate rejects → `{ ok: false, reason: 'quality-gate' }`
      → internal state stays whatever it was (likely `pending-approval`). NO action needed
      to revert internal state; iter A's discriminated-union return already prevents the
      bad transition. The controller's existing approve branch needs to STOP returning
      `200 + status: 'approved'` blindly — it should now react to the gate-failure result
      and trigger the iter-C use case.
      Concrete change: `gitlab.controller.ts:300-311` becomes:
        1. Call `transitionState.execute({ ..., targetState: 'approved' })`.
        2. If result `{ ok: false, reason: 'quality-gate' }` → call iter-C use case
           → if `kind: 'reverted'` → call unapprove + post FR comment.
        3. Reply with revised status payload.

    why_not_a_new_state_in_state_machine:
      No new `state` value. The existing states cover the lifecycle. The revert
      surfaces as: internal state stays `pending-approval` (or whatever it was);
      platform sees the approval removed; user sees the FR comment. The audit trail is
      the log + the comment.

    why_separate_unapprove_gateway_from_review_action_gateway:
      `ReviewActionGateway` is keyed for in-review batched actions (THREAD_RESOLVE,
      POST_COMMENT, POST_INLINE_COMMENT, ADD_LABEL, ...) with an `ExecutionContext` carrying
      diffMetadata, baseUrl, etc. Unapprove is a one-shot fired from a webhook context
      with no review job, no diff context, no batching. A narrow dedicated gateway is
      simpler, easier to test, and avoids dragging `ExecutionContext` into the webhook
      flow. Mirrors the iter-B rationale for splitting `NoteCommentPostGateway` out.

    github_event_surface_choice:
      GitHub fires `pull_request_review` event with `action: 'submitted'` and
      `review.state: 'approved'` when a reviewer approves a PR. The PR's
      `pull_request` event does NOT carry approval action (unlike GitLab's
      `merge_request` with `action: 'approved'`).
      So we add a new event-type branch `pull_request_review` to `github.controller.ts`.
      Guard captures `action`, `review.state`, `review.id`, `pull_request.number`,
      `repository.full_name`, `repository.clone_url`, `sender.login`.
      Filter: returns `shouldProcess: true` only when
      `action === 'submitted' && review.state === 'approved'`.

  ENTITIES:
    - name: gitHubPullRequestReviewEvent (NEW guard only)
      file: src/modules/platform-integration/entities/github/githubPullRequestReviewEvent.guard.ts
      schema: (Zod inline within guard file, same pattern as gitlabNoteEvent.guard.ts)
      guard: same file (uses `createGuard`)
      gateway_contract: (none — pure schema)
      test: src/tests/units/modules/platform-integration/entities/github/githubPullRequestReviewEvent.guard.test.ts
      factory: (none — event payloads built inline in tests, same pattern as iter B)
      shape (Zod, minimal):
        action: z.string()              // we only care about 'submitted'
        review: z.object({
          id: z.number(),
          state: z.string(),            // 'approved' | 'changes_requested' | 'commented' | 'dismissed'
          user: z.object({ login: z.string() }),
        })
        pull_request: z.object({
          number: z.number(),
          html_url: z.string().optional(),
          state: z.enum(['open', 'closed']).optional(),
        })
        repository: z.object({
          full_name: z.string(),
          clone_url: z.string(),
        })
        sender: z.object({ login: z.string() })
      decisions:
        - Narrow schema: only fields needed for filtering + unapprove command.
        - Mirrors iter B's `githubIssueCommentEvent.guard.ts` style.
        - No `BypassRecord`-like type — we don't store the review event.

  USECASES:
    - name: handlePlatformApproval (NEW)
      file: src/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.ts
      test: src/tests/units/modules/tracking/usecases/handlePlatformApproval.usecase.test.ts
      type: command (returns a verdict; the controller acts on it)
      input: |
        {
          projectPath: string;     // local path
          mrId: string;
          qualityThreshold: number | null;  // injected by controller from project config
        }
      output: |
        | { kind: 'allowed' }                // gate passes OR no review yet OR no threshold
        | { kind: 'bypass-active' }          // mr.bypass !== null
        | { kind: 'mr-not-found' }
        | { kind: 'reverted'; message: string; threshold: number; latestScore: number; reason: 'below-threshold' | 'blockers-present' }
      decisions:
        - Reads TrackedMr via `trackingGateway.getById`.
        - If bypass active → `{ kind: 'bypass-active' }`.
        - Calls `evaluateQualityGate({ latestScore: mr.latestScore, blockingIssues: mr.openThreads, threshold: input.qualityThreshold })`.
        - If `allowed === true` → `{ kind: 'allowed' }`.
        - If `allowed === false` → build FR message based on reason:
          * below-threshold:
            `Approbation annulée : seuil qualité ${threshold}/10 non atteint (${latestScore}/10). Utilisez \`/bypass-quality "raison"\` pour forcer.`
          * blockers-present:
            `Approbation annulée : issues bloquantes non résolues. Utilisez \`/bypass-quality "raison"\` pour forcer.`
          return `{ kind: 'reverted', message, threshold, latestScore, reason }`.
        - Use case does NOT touch internal `state` — iter A already prevents the bad
          transition; the platform-side revert + comment are pure side effects driven by
          the controller from the discriminated-union result.
        - Pure (only tracking-gateway read, no write). Same I/O profile as the iter-B
          parser-style use cases.

  GATEWAYS:
    - name: ApprovalRevocationGateway (NEW contract — single method)
      contract: src/modules/platform-integration/entities/approvalRevocation/approvalRevocation.gateway.ts
      implementations:
        - GitLab: src/modules/platform-integration/interface-adapters/gateways/cli/approvalRevocation.gitlab.cli.gateway.ts
        - GitHub: src/modules/platform-integration/interface-adapters/gateways/cli/approvalRevocation.github.cli.gateway.ts
      stub: src/tests/stubs/approvalRevocation.stub.ts
      methods:
        - revoke(input: { projectPath: string; mrNumber: number; reviewId?: number; dismissalMessage?: string }): Promise<void>
      decisions:
        - One method, one verb. The optional `reviewId` and `dismissalMessage` are present
          to accommodate GitHub's `reviews/<id>/dismissals` endpoint. GitLab impl ignores them.
        - Reuses existing `CommandExecutor` type from `threadFetch.gitlab.gateway.ts` /
          `threadFetch.github.gateway.ts` (same pattern as iter-B note-comment gateways).
        - GitLab command: `glab api --method POST projects/<encoded>/merge_requests/<iid>/approvals/unapprove`
        - GitHub command: `gh api --method PUT repos/<full_name>/pulls/<pr>/reviews/<review_id>/dismissals --field message="<dismissalMessage>"`
          (the controller passes a short FR dismissal message; the full FR explanation
          comes via the iter-B `NoteCommentPostGateway`.)
        - Errors propagate; controller catches and logs.
        - Stub records calls in an in-memory array for tests.
      naming_rationale:
        "ApprovalRevocation" rather than "Unapprove" — the latter is a GitLab-specific
        verb; "revocation" is platform-agnostic and reflects the semantic ("undo the
        approval"). Aligns with the "ubiquitous language" rule.

  CONTROLLERS:
    - name: gitlab.controller (MODIFIED — replace the existing approve branch)
      file: src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts
      test: extend src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts
      dependencies (added to GitLabWebhookDependencies):
        - handlePlatformApproval: HandlePlatformApprovalUseCase
        - approvalRevocationGateway: ApprovalRevocationGateway
        - (REUSE existing) noteCommentPostGateway: NoteCommentPostGateway
      change (replaces gitlab.controller.ts:300-311):
        1. `const approveResult = filterGitLabMrApprove(event);` (unchanged)
        2. If `approveResult.shouldProcess` and `repoConfig` found:
             - Build `mrId = gitlab-${projectPath}-${mrNumber}`.
             - Call `transitionState.execute({ projectPath: repoConfig.localPath, mrId, targetState: 'approved', qualityCheck: closure injecting qualityThreshold + evaluateQualityGate })`
               where the closure reads threshold from `loadProjectConfig(repoConfig.localPath)?.qualityThreshold ?? null`.
             - If transition result `{ ok: true }` → status approved (current behavior preserved).
             - If `{ ok: false, reason: 'quality-gate' }` → call
               `handlePlatformApproval.execute({ projectPath: repoConfig.localPath, mrId, qualityThreshold: loadedThreshold })`.
               * `kind: 'reverted'` → try/catch `approvalRevocationGateway.revoke({ projectPath, mrNumber })`
                 then try/catch `noteCommentPostGateway.postComment({ projectPath, mrNumber, body: message })`.
                 Reply 200 with `{ status: 'unapproved', reason: result.reason }`.
               * other kinds → log + reply 200 with appropriate status.
             - If `{ ok: false, reason: 'not-found' }` → existing log + reply.
        3. Existing `logger.info('MR marked as approved')` only fired on the success path.
      decisions:
        - Keeps the controller thin: orchestrates the existing `transitionState` (which
          now carries the gate via the `qualityCheck` closure) + new `handlePlatformApproval`.
        - The `qualityCheck` closure construction mirrors how `mrTracking.routes.ts:75`
          builds it for the HTTP approve endpoint (iter A pattern). Factor into a single-
          line helper `(mr) => evaluateQualityGate({ latestScore: mr.latestScore, blockingIssues: mr.openThreads, threshold })` — no new exported function.
        - Currently the iter-A change did NOT propagate the `qualityCheck` callback into
          this branch. That gap is closed by iter C: the platform-side approve now goes
          through the same gate the HTTP API does. This is the actual mechanism for
          "non-qualified → revert".

    - name: github.controller (MODIFIED — add new `pull_request_review` event branch)
      file: src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
      test: extend src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts
      dependencies (added to GitHubWebhookDependencies):
        - handlePlatformApproval: HandlePlatformApprovalUseCase
        - approvalRevocationGateway: ApprovalRevocationGateway
        - (REUSE existing) noteCommentPostGateway, transitionState
      change:
        - Top-of-pipeline: before existing `eventType !== 'pull_request'` check, branch on
          `eventType === 'pull_request_review'` and call a new local helper
          `handleGitHubPullRequestReviewHook(request, reply, logger, deps)`.
        - The helper: parse with `gitHubPullRequestReviewEventGuard`, run new filter
          `filterGitHubPullRequestReviewEvent` returning either `shouldProcess: false`
          or fields { mergeRequestNumber, projectPath, reviewId, reviewerLogin }.
        - Find repo via `findRepositoryByRemoteUrl(event.repository.clone_url)`.
        - Build `mrId = github-${projectPath}-${prNumber}`.
        - Call `transitionState.execute({ ..., targetState: 'approved', qualityCheck })`
          (same shape as GitLab). On `{ ok: false, reason: 'quality-gate' }` → call
          `handlePlatformApproval` → on `kind: 'reverted'`, call
          `approvalRevocationGateway.revoke({ projectPath, mrNumber, reviewId, dismissalMessage: shortFR })`
          + post FR comment via `noteCommentPostGateway`.
        - The `shortFR` for dismissal is derived from the message but truncated
          (e.g. "Seuil qualité non atteint" or "Issues bloquantes non résolues"). Keep
          this in the controller (presentation choice, not policy).

  EVENT_FILTER_EXTENSION:
    file: src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts (MODIFIED)
    new_exports:
      - export type PullRequestReviewFilterResult =
          | { shouldProcess: false; reason: string }
          | { shouldProcess: true; reason: string; mergeRequestNumber: number;
              projectPath: string; reviewId: number; reviewerLogin: string }
      - export function filterGitHubPullRequestReviewEvent(event: GitHubPullRequestReviewEvent): PullRequestReviewFilterResult
    decisions:
      - Mirrors `NoteFilterResult` shape (iter B).
      - Filter: `shouldProcess: true` only when `action === 'submitted' && review.state === 'approved'`.
      - Returns `reviewId` for use in GitHub dismissals API.

  PRESENTERS:
    (none — FR strings produced in the use case + a short dismissal label produced inline
    in the controller. Same pattern as iter A/B.)

  VIEWS:
    (none — dashboard surface for platform-revert events is out of scope.)

  WIRING:
    routes_modifications:
      In src/main/routes.ts (around lines 330-378):
        - Construct ONE `HandlePlatformApprovalUseCase(trackingGw)` per webhook (or
          reuse same instance — stateless). Use one instance per registration for
          symmetry with iter B style.
        - Construct `GitLabApprovalRevocationCliGateway(defaultGitLabExecutor)`.
        - Construct `GitHubApprovalRevocationCliGateway(defaultGitHubExecutor)`.
        - Add to each Dependencies block. Existing
          `noteCommentPostGateway` is REUSED (no new instance).
    dependencies_new:
      - new: HandlePlatformApprovalUseCase(trackingGw)  // x2
      - new: GitLabApprovalRevocationCliGateway(defaultGitLabExecutor)
      - new: GitHubApprovalRevocationCliGateway(defaultGitHubExecutor)
    no_new_executor_needed:
      Reuses `defaultGitLabExecutor` and `defaultGitHubExecutor` exported from
      threadFetch.<platform>.gateway.ts.

  MODIFICATIONS_TO_EXISTING_FILES:
    1. src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts
       — Add `filterGitHubPullRequestReviewEvent` + `PullRequestReviewFilterResult`.
    2. src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts
       — Replace the existing approve branch (lines 300-311) with the gate-aware flow.
       — Extend `GitLabWebhookDependencies` with `handlePlatformApproval`,
         `approvalRevocationGateway`. Reuse `noteCommentPostGateway` already injected.
    3. src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
       — Add `pull_request_review` event-type branch at the top of `handleGitHubWebhook`.
       — Extend `GitHubWebhookDependencies` with `handlePlatformApproval`,
         `approvalRevocationGateway`. Reuse `noteCommentPostGateway`, `transitionState`.
    4. src/main/routes.ts
       — Instantiate `HandlePlatformApprovalUseCase` + 2 `ApprovalRevocation*CliGateway`
         and pass into both webhook registrations.
    5. src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts
       — Extend with tests for the new revert path.
    6. src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts
       — Extend with tests for the new `pull_request_review` branch.

  NEW_FILES_SUMMARY (production):
    1. src/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.ts
    2. src/modules/platform-integration/entities/approvalRevocation/approvalRevocation.gateway.ts
    3. src/modules/platform-integration/interface-adapters/gateways/cli/approvalRevocation.gitlab.cli.gateway.ts
    4. src/modules/platform-integration/interface-adapters/gateways/cli/approvalRevocation.github.cli.gateway.ts
    5. src/modules/platform-integration/entities/github/githubPullRequestReviewEvent.guard.ts

  NEW_FILES_SUMMARY (tests):
    6. src/tests/units/modules/tracking/usecases/handlePlatformApproval.usecase.test.ts
    7. src/tests/units/modules/platform-integration/entities/github/githubPullRequestReviewEvent.guard.test.ts
    8. src/tests/stubs/approvalRevocation.stub.ts
    9. src/tests/acceptance/180-quality-threshold-block-approval-iter-C.acceptance.test.ts

  ESTIMATED_FILE_COUNT:
    new_production: 5
    new_tests_and_stubs: 4
    modified_production: 4 (eventFilter, gitlab.controller, github.controller, routes.ts)
    modified_tests: 2 (gitlab.controller.test, github.controller.test)
    TOTAL_NEW_FILES: 9
    TOTAL_TOUCHED: 15
    Under the ≤ 10 cap on NEW files. The plan respects the budget.

  IMPLEMENTATION_ORDER (Walking Skeleton):
    1. src/tests/acceptance/180-quality-threshold-block-approval-iter-C.acceptance.test.ts
       — SDD outer loop: ONE scenario (6) with both GitLab and GitHub variants. RED
         through every step. Uses InMemoryReviewRequestTrackingGateway +
         StubApprovalRevocationGateway + StubNoteCommentPostGateway (reused from iter B).
    2. src/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.ts
       (+ unit test)
       — Walking-skeleton core. Pure-ish use case (tracking-gateway read only). Tests:
         allowed (score=8, threshold=7) / reverted-below-threshold (score=6, threshold=7) /
         reverted-blockers-present (score=9, openThreads=2, threshold=7) /
         bypass-active (mr.bypass populated, gate would fail) / mr-not-found /
         no review yet (latestScore=null) / no threshold (null) / boundary (score===threshold).
    3. src/modules/platform-integration/entities/approvalRevocation/approvalRevocation.gateway.ts
       — Contract only (TypeScript interface). No test (contract).
    4. src/modules/platform-integration/interface-adapters/gateways/cli/approvalRevocation.gitlab.cli.gateway.ts
       — Implements contract via `glab api`. Test in iter-C unit test (executor stub
         asserting command string), modeled on iter-B noteCommentPost gateway tests.
       — Skip dedicated unit-test file for the CLI gateway — mirror iter-B pattern where
         note-comment CLI gateways have no standalone test (tested via controller tests +
         acceptance). If reviewer requests, add `noteCommentPost.*.cli.gateway.test.ts`
         pattern later.
    5. src/modules/platform-integration/interface-adapters/gateways/cli/approvalRevocation.github.cli.gateway.ts
       — Implements contract via `gh api` dismissals endpoint.
    6. src/tests/stubs/approvalRevocation.stub.ts
       — In-memory stub recording revoke() calls. Mirrors `noteCommentPost.stub.ts`.
    7. src/modules/platform-integration/entities/github/githubPullRequestReviewEvent.guard.ts
       (+ unit test)
       — Zod guard, validates `action`, `review.state`, `review.id`, `pull_request.number`,
         `repository.full_name`, `repository.clone_url`, `sender.login`.
    8. src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts
       (modify)
       — Add `PullRequestReviewFilterResult` + `filterGitHubPullRequestReviewEvent`.
       — No new test file; extend `eventFilter.test.ts` (existing).
    9. src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts
       (modify + test extend)
       — Replace approve branch with gate-aware flow. Inject `handlePlatformApproval`
         + `approvalRevocationGateway` deps.
    10. src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
        (modify + test extend)
        — Add `pull_request_review` event handler. Wire same deps.
    11. src/main/routes.ts (wire)
        — Instantiate the new use case + 2 CLI gateways, pass into both webhook regs.
    12. Verify acceptance test (step 1) passes GREEN; run `yarn verify`.

  TEST_PLAN:
    unit_useCase (handlePlatformApproval.usecase.test.ts):
      - mr not found → kind 'mr-not-found'
      - mr with bypass populated, gate would fail → kind 'bypass-active' (gate not evaluated)
      - latestScore=null + threshold=7 → kind 'allowed' (no review yet)
      - threshold=null + latestScore=6 → kind 'allowed' (no threshold)
      - latestScore=8, openThreads=0, threshold=7 → kind 'allowed' (passes)
      - latestScore=7, openThreads=0, threshold=7 → kind 'allowed' (boundary)
      - latestScore=6, openThreads=0, threshold=7 → kind 'reverted', reason 'below-threshold',
        message matches spec literal with score=6, threshold=7
      - latestScore=9, openThreads=2, threshold=7 → kind 'reverted', reason 'blockers-present',
        message includes "issues bloquantes non résolues"

    unit_guard (githubPullRequestReviewEvent.guard.test.ts):
      - Valid payload (action=submitted, review.state=approved) → parsed.
      - Missing review.id → rejected.
      - Missing pull_request.number → rejected.
      - Extra fields ignored (Zod default strict behavior — confirm with existing guards).

    unit_eventFilter (extend eventFilter.test.ts):
      - filterGitHubPullRequestReviewEvent:
        * action=submitted + review.state=approved → shouldProcess true with all fields.
        * action=submitted + review.state=changes_requested → shouldProcess false.
        * action=submitted + review.state=commented → shouldProcess false.
        * action=submitted + review.state=dismissed → shouldProcess false.
        * action=edited → shouldProcess false.

    unit_controllers (gitlab + github extensions):
      gitlab.controller.test.ts:
        - approved event + gate passes → unapprove NOT called, transitionState succeeds,
          200 status 'approved'.
        - approved event + gate fails (below-threshold) → unapprove called once with
          (projectPath, mrNumber), noteCommentPostGateway.postComment called with FR
          message, 200 status 'unapproved', reason 'below-threshold'.
        - approved event + gate fails + bypass active → unapprove NOT called, 200.
        - approved event + mr-not-found → 200 ignored (existing behavior).
        - unapprove gateway throws → still posts comment, logs warn, 200.
        - comment gateway throws → logs warn, 200 (unapprove already succeeded).
      github.controller.test.ts:
        - pull_request_review event with state=approved + gate passes → revoke NOT called,
          transitionState success.
        - pull_request_review event with state=approved + gate fails (below-threshold) →
          revoke called with (projectPath, prNumber, reviewId, dismissalMessage),
          comment posted, 200 status 'unapproved'.
        - pull_request_review event with state=approved + bypass active → revoke NOT called.
        - pull_request_review event with state=changes_requested → ignored (no MR-revert path).

    acceptance (1 scenario, both platforms):
      file: src/tests/acceptance/180-quality-threshold-block-approval-iter-C.acceptance.test.ts
      pattern: mirror iter-B acceptance test (vi.mock loader/verifier/queue/projectConfig).
      Test 1 (GitLab):
        Setup:
          - Seed TrackedMr with state='pending-approval', latestScore=6, openThreads=0,
            bypass=null via TrackedMrFactory.
          - loadProjectConfig returns { qualityThreshold: 7 }.
          - StubApprovalRevocationGateway recording revoke calls.
          - StubNoteCommentPostGateway recording posts.
        Act:
          POST /webhooks/gitlab with X-Gitlab-Event: 'Merge Request Hook' and a payload
          containing object_attributes.action = 'approved'.
        Assert:
          - StubApprovalRevocationGateway.calls has one entry with projectPath
            'test-org/test-project' and mrNumber 42.
          - StubNoteCommentPostGateway.calls has one entry with body containing
            "Approbation annulée : seuil qualité 7/10 non atteint (6/10)" and
            "/bypass-quality".
          - Reply status 200, payload includes `status: 'unapproved'`.
          - Tracking gateway: internal state still 'pending-approval' (not 'approved').
      Test 2 (GitHub):
        Setup: same MR seed but platform='github'. POST /webhooks/github with
        X-GitHub-Event: 'pull_request_review' and payload action=submitted, review.state=approved,
        review.id=12345.
        Assert: revoke called with reviewId=12345, comment posted with same FR body.

  ACCEPTANCE_TEST:
    file: src/tests/acceptance/180-quality-threshold-block-approval-iter-C.acceptance.test.ts
    note: |
      SDD outer loop — written first (step 1), RED until step 11 wiring completes, GREEN
      at step 12. Two scenarios in one file (GitLab + GitHub) since the spec rule applies
      symmetrically. Uses Fastify-style invocation via `handleGitLab/GitHubWebhook` direct
      call (matches iter-B pattern, NOT `app.inject()` — iter-B controller-direct pattern
      is already established and simpler).

  REFERENCE_FILES:
    - docs/specs/180-quality-threshold-block-approval.md — spec (iter C = scenario 6)
    - docs/plans/180-quality-threshold-block-approval.plan.md — iter A plan
    - docs/plans/180-quality-threshold-block-approval-iter-B.plan.md — iter B plan
    - docs/reports/180-quality-threshold-block-approval.report.md — iter A report
    - docs/reports/180-quality-threshold-block-approval-iter-B.report.md — iter B report
    - src/modules/tracking/entities/qualityGate/qualityGate.ts — pure evaluator (iter A, reused)
    - src/modules/tracking/entities/tracking/trackedMr.ts — bypass field (iter B)
    - src/modules/tracking/usecases/tracking/transitionState.usecase.ts — gate enforced here
    - src/modules/tracking/usecases/tracking/recordBypass.usecase.ts — pattern for use case
    - src/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.ts — REUSE
    - src/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.gitlab.cli.gateway.ts — pattern for CLI gateway
    - src/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.github.cli.gateway.ts — pattern for GitHub CLI gateway
    - src/modules/review-execution/interface-adapters/gateways/cli/reviewAction.gitlab.cli.gateway.ts — `glab api` pattern reference
    - src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts — branch at line 300-311 (approve)
    - src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts — issue_comment pattern (line 86-147) to mirror for pull_request_review
    - src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts — filter style (lines 35-69, 249-265)
    - src/modules/platform-integration/entities/gitlab/gitlabNoteEvent.guard.ts — guard style reference
    - src/modules/platform-integration/entities/github/githubIssueCommentEvent.guard.ts — guard style reference
    - src/main/routes.ts — composition root (lines 330, 356)
    - src/tests/acceptance/180-quality-threshold-block-approval-iter-B.acceptance.test.ts — acceptance test pattern
    - src/tests/stubs/noteCommentPost.stub.ts — stub pattern
    - src/tests/factories/trackedMr.factory.ts — seed factory
    - src/tests/stubs/reviewRequestTracking.stub.ts — in-memory tracking
    - .claude/rules/coding-standards.md — naming, FR rule, async patterns

  ARCHITECTURAL_DECISIONS:
    where_policy_lives:
      Use case `HandlePlatformApprovalUseCase` (use-case layer). Composes the
      already-existing iter-A evaluator + iter-B bypass check. No new entity.
    where_io_lives:
      Two gateways: new `ApprovalRevocationGateway` (platform unapprove) + reused
      iter-B `NoteCommentPostGateway` (FR explanatory comment). Both are interface-adapter
      level concerns invoked by controllers based on the use-case verdict.
    why_not_replace_existing_approve_branch_with_a_pure_transitionState_call:
      Because the platform side-effects (unapprove + comment) are NOT internal state
      transitions — they're outbound calls to the platform. `TransitionStateUseCase` is
      pure tracking-gateway business. Keeping the two concerns separate (gate check
      inside `transitionState`; revert side-effects inside `handlePlatformApproval` +
      controller orchestration) preserves SRP.
    why_dedicated_use_case_vs_inline_controller_logic:
      Iter B's pattern: controllers stay thin, use cases own discriminated-union policy.
      This iteration repeats the pattern for consistency + unit-testability without
      mocking webhook frameworks. The use case can be tested with a TrackedMrFactory +
      InMemoryReviewRequestTrackingGateway, no Fastify needed.
    why_handlePlatformApproval_does_not_call_transitionState_itself:
      Because the controller already calls `transitionState` first (current flow). On
      gate failure, `transitionState` returns the failure verdict and the controller
      escalates to `handlePlatformApproval`. This avoids double-calling the gate
      evaluator and keeps both use cases idempotent.
    error_handling_best_effort:
      Documented in DECISIONS above: log + proceed. No retries. The platform truth state
      may be temporarily out of sync with internal tracking on transient errors; the user
      sees the FR comment regardless. Acceptable for iter C; revisit if observability
      surfaces real flake.
    why_no_new_state_in_state_machine:
      Internal `TrackedMr.state` does not need a "revoked" state. The lifecycle remains
      `pending-review → pending-fix → pending-approval → approved → merged`. The revert
      acts on the platform side; internal state simply doesn't advance to `approved`
      (iter A enforces this).
    french_messages_two_strings:
      - `Approbation annulée : seuil qualité ${threshold}/10 non atteint (${latestScore}/10). Utilisez \`/bypass-quality "raison"\` pour forcer.` (below-threshold revert)
      - `Approbation annulée : issues bloquantes non résolues. Utilisez \`/bypass-quality "raison"\` pour forcer.` (blockers-present revert; derived form for spec coverage symmetry)
      Plus a short FR dismissal label for GitHub `dismissals` endpoint (e.g.
      "Seuil qualité non atteint" or "Issues bloquantes non résolues") — owned by
      controller.

  WALKING_SKELETON:
    First minimal vertical slice (steps 1-7):
      acceptance test RED → `HandlePlatformApprovalUseCase` (+ tests) →
      `ApprovalRevocationGateway` contract → GitLab CLI impl → GitHub CLI impl + stub →
      GitHub guard → eventFilter extension → controllers wired → routes.ts → acceptance GREEN.

    Visible end-to-end path:
      Platform webhook (GitLab "Merge Request Hook" with action=approved, OR GitHub
      "pull_request_review" with state=approved) → controller calls `transitionState`
      with gate → gate fails (score<threshold, no bypass) → controller calls
      `handlePlatformApproval` → verdict `kind: 'reverted'` → controller calls
      `approvalRevocationGateway.revoke()` (unapprove on platform) → controller calls
      `noteCommentPostGateway.postComment()` (FR explanation) → 200 status 'unapproved'.

  OPEN_QUESTIONS (flagged, not blocking — Auto Mode chose defaults):
    - Q1: Should iter C revert ALL gate-failure cases (below-threshold + blockers-present)
      or strictly below-threshold (literal scenario 6)?
      Plan default: BOTH (consistent with spec rule line 54 "non-qualified" semantics).
      Trade-off: if reviewer wants strict literal-scenario-6 only, drop the
      `blockers-present` branch from `handlePlatformApproval` → it returns
      `{ kind: 'allowed' }` and the controller does nothing. Reduces scope marginally;
      leaves a hole when blockers exist but score is high. Flag in implementation PR.
    - Q2: GitHub's dismissal endpoint requires `dismissal_message`. Acceptable to use a
      short FR string ("Seuil qualité non atteint") + the full FR explanation in a
      separate comment? Plan: YES — keeps the spec FR template literal in the comment;
      the dismissal label is just to satisfy GitHub's API constraint.
    - Q3: If branch protection forbids dismissals on the GitHub side (org-level
      policy), the `gh api` call fails. Plan: log + still post the FR comment so the
      user knows the system tried. No retry. Flag observability gap for follow-up spec
      if it surfaces.

  OUT_OF_ITERATION_C_SCOPE:
    - Retry/backoff for unapprove + comment posting.
    - Dashboard UI for revert events.
    - Audit log persistence beyond `pino` log lines.
    - Revert-on-merge or revert-on-close (the gate doesn't apply to those transitions per spec).
    - Notifying the dismissed reviewer via @-mention (FR comment is the only surface).

ACCEPTANCE_TEST:
  file: src/tests/acceptance/180-quality-threshold-block-approval-iter-C.acceptance.test.ts
  note: |
    SDD outer loop — written first (step 1), RED through every inner-loop step until
    routes.ts wiring (step 11) completes, GREEN at step 12. Two scenarios per file
    (GitLab + GitHub), one file. Stubs: StubApprovalRevocationGateway (new) +
    StubNoteCommentPostGateway (reused from iter B) + InMemoryReviewRequestTrackingGateway.
