PLAN:
  scope: SPEC-180 Iteration A — Internal quality gate (score + blockers + threshold)
  is_new_module: false
  iteration: A (of A/B/C)
  iteration_scope: |
    Scenarios 1, 2, 3, 7, 8 from the spec.
    Internal state-transition guard only (HTTP approval endpoint + auto-transition
    in RecordReviewCompletion). NO note-webhook parsing, NO platform unapprove,
    NO bypass mechanism — those are Iteration B and C.

  ANTI-OVERENGINEERING_CHECK:
    - Quality gate is a pure function (5 lines of conditional logic). Implementing it as
      a domain-layer pure function (not a class, not a value object) — score + blockers
      + threshold → { allowed: true } | { allowed: false; reason: string }.
    - We do NOT introduce a "QualityGate" entity, value object, or service interface.
      One file, one function, one Zod-checked threshold parameter.
    - We do NOT add a new gateway: `latestScore` already lives on `TrackedMr`. Threshold
      already lives in `ProjectConfig` (extension). No new I/O port needed.
    - We do NOT introduce an `ApproveMr` use case wrapping `TransitionStateUseCase`.
      Instead, `TransitionStateUseCase` accepts an optional gate-check delegate so the
      composition root injects the threshold-bearing check at the call site (HTTP API).
      For the auto `pending-approval` transition inside `RecordReviewCompletionUseCase`,
      the same pure evaluator is called inline. Two call sites = one shared function.
    - Net: 4 new files + 3 modifications. Far below the 10-file cap.

  ENTITIES:
    - name: qualityGate (pure evaluator + result type)
      file: src/modules/tracking/entities/qualityGate/qualityGate.ts
      schema: (none — pure function with primitive inputs; threshold validated at config boundary)
      guard: (none — Zod validation happens in projectConfig parser, see Modifications)
      gateway_contract: (none — pure function, no I/O)
      test: src/tests/units/modules/tracking/entities/qualityGate/qualityGate.test.ts
      factory: (none — primitive inputs; existing TrackedMrFactory covers callers)
      exports:
        - type QualityGateResult = { allowed: true } | { allowed: false; reason: 'below-threshold' | 'blockers-present'; message: string }
        - function evaluateQualityGate(input: { latestScore: number | null; blockingIssues: number; threshold: number | null }): QualityGateResult
      decisions:
        - Pure function in the entity layer. NOT a class, NOT a value object — no identity, no state, no invariants beyond input validity.
        - latestScore=null → allowed (scenario 7: no review yet).
        - threshold=null → allowed (scenario 8: no threshold configured, backward compat).
        - blockingIssues > 0 → rejected with French message "Issues bloquantes non résolues" (scenario 3).
        - latestScore < threshold → rejected with French message "Seuil qualité non atteint ({score}/10 < {threshold}/10)" (scenario 2).
        - Otherwise → allowed (scenario 1).
        - The discriminated-union return shape lets callers (HTTP controller, use case) react explicitly without exceptions; aligns with project's "no business exceptions for predictable rejections" idiom (existing `validateProjectPath` in `mrTracking.routes.ts` uses the same pattern).

  USECASES:
    - name: transitionState (MODIFIED — does not own a new file)
      file: src/modules/tracking/usecases/tracking/transitionState.usecase.ts
      test: src/tests/units/usecases/tracking/transitionState.usecase.test.ts (extend existing)
      type: command
      input: { projectPath, mrId, targetState, qualityCheck?: (mr: TrackedMr) => QualityGateResult }
      output: { ok: true } | { ok: false; reason: string }
      decisions:
        - Replace boolean return with discriminated union to carry the rejection reason.
        - Add optional `qualityCheck` parameter (function). When `targetState === 'approved'`
          and `qualityCheck` is provided, run it before mutating. If it rejects, return
          `{ ok: false; reason }` and do NOT touch the gateway.
        - For non-approval transitions (`merged`, `closed`), the check is skipped — keeps
          spec rule "Applying the gate to merge events is out of scope".
        - The threshold is NOT a constructor dep — it's a per-call decision made by the
          composition root after loading project config. This keeps the use case agnostic
          to the configuration source.

    - name: recordReviewCompletion (MODIFIED — does not own a new file)
      file: src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts
      test: src/tests/units/usecases/tracking/recordReviewCompletion.usecase.test.ts (extend existing)
      type: command
      input: same as today + optional `qualityThreshold: number | null`
      output: same TrackedMr | null
      decisions:
        - Today line 68: `state: hasBlockingIssues ? 'pending-fix' : 'pending-approval'`.
        - After change: if gate rejects (below threshold OR blockers), state stays
          `pending-fix`. Only when gate passes can the auto-transition reach `pending-approval`.
        - The use case receives `qualityThreshold` from its caller (controllers in
          composition root load it from project config). It does NOT load config itself
          — preserves use case independence from infrastructure.
        - When `qualityThreshold` is null → behave identically to today (backward compat).
        - Reuses `evaluateQualityGate` from the entity layer.

  GATEWAYS:
    (none — no new I/O. `TrackedMr.latestScore` already exists. Threshold is read from
    ProjectConfig via the existing `loadProjectConfig` in `src/config/projectConfig.ts`.)

  CONTROLLERS:
    - name: mrTrackingRoutes (MODIFIED)
      file: src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts
      test: src/tests/units/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.test.ts (create — file does not exist today)
      dependencies:
        - reviewRequestTrackingGateway (existing)
        - getQualityThreshold: (projectPath: string) => number | null (new — injected from routes.ts, reads ProjectConfig)
      decisions:
        - In `POST /api/mr-tracking/approve`: before calling `transitionState.execute`,
          fetch the tracked MR, load the threshold via the injected getter, call
          `evaluateQualityGate`. If rejected → reply 409 with the French message
          ({ success: false, error: message }). If allowed → proceed with transition.
        - Alternative: pass a closure as `qualityCheck` to `transitionState.execute` and
          inspect the discriminated-union result. Choose whichever keeps the controller
          thinner; recommended: pass the closure so the gate logic is co-located with
          the transition (single point of decision).
        - HTTP code: 409 Conflict (state precondition failed). Existing 400/404 codes
          retained for invalid-path / missing MR.

  PRESENTERS:
    (none — French messages are produced by the pure evaluator and returned as-is to the
    HTTP client. No view transformation needed for Iteration A.)

  VIEWS:
    (none for Iteration A — dashboard UI for gate status is explicit Out of Scope.)

  WIRING:
    routes: |
      In src/main/routes.ts, the `mrTrackingRoutes` registration (line ~156) gets a new
      `getQualityThreshold` option whose value is a closure:
        (projectPath: string) => loadProjectConfig(projectPath)?.qualityThreshold ?? null
      Import `loadProjectConfig` from `@/config/projectConfig.js` (already exists).
    dependencies: |
      No new gateways instantiated. The `getQualityThreshold` closure uses the existing
      `loadProjectConfig` function — same source the rest of the codebase reads from.
    recordCompletion_wiring: |
      `RecordReviewCompletionUseCase` is currently instantiated in routes.ts and passed
      to webhook controllers. Two options:
        (a) Pass `qualityThreshold` per-call from the controller (controller already loads
            ProjectConfig for other reasons, see gitlab.controller.ts:25 import).
        (b) Inject a `getQualityThreshold(projectPath)` function via constructor.
      Choose (a) — keeps `RecordReviewCompletionUseCase` stateless and removes any
      threshold-source coupling. The controllers (`gitlab.controller.ts`,
      `github.controller.ts`) already call `loadProjectConfig(localPath)` for other
      fields; they pass the threshold alongside `reviewData`.

  MODIFICATIONS_TO_EXISTING_FILES:
    - src/config/projectConfig.ts
        Add optional `qualityThreshold?: number` to the `ProjectConfig` interface.
        Add parsing in `parseProjectConfig`: validate as integer 0-10 if present, throw
        with French message if invalid (consistent with existing validation style),
        assign to `config.qualityThreshold` only when present.
    - src/modules/tracking/usecases/tracking/transitionState.usecase.ts
        Add optional `qualityCheck` parameter. Change return type to discriminated union.
        Existing callers that ignore the boolean are updated to handle the new shape.
    - src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts
        Accept optional `qualityThreshold` in input. Use `evaluateQualityGate` to decide
        between `pending-fix` and `pending-approval`.
    - src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts
        Add `getQualityThreshold` to options. Apply the gate before transition. Return 409
        with French message on rejection.
    - src/main/routes.ts
        Pass `getQualityThreshold` closure when registering `mrTrackingRoutes`.
    - src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts
        When calling `recordCompletion.execute`, pass `qualityThreshold` from the already-
        loaded `ProjectConfig`. NO change to the `targetState: 'approved'` branch
        (line 231) — that handles platform approval events, scoped to Iteration C.
    - src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts
        Same as gitlab.controller.ts for the `recordCompletion.execute` call.
    - src/tests/factories/projectConfig.factory.ts
        Add optional `qualityThreshold?: number` to `ProjectConfigOverrides` and propagate
        to payload (mirror existing optional-field pattern).
    - src/tests/units/usecases/tracking/transitionState.usecase.test.ts
        Update existing assertions for new return shape; add tests for `qualityCheck`
        rejection paths.
    - src/tests/units/usecases/tracking/recordReviewCompletion.usecase.test.ts
        Add tests: with threshold + low score → stays `pending-fix`; with threshold
        satisfied + no blockers → `pending-approval`; no threshold → unchanged behavior.

  NEW_FILES_SUMMARY:
    1. src/modules/tracking/entities/qualityGate/qualityGate.ts
    2. src/tests/units/modules/tracking/entities/qualityGate/qualityGate.test.ts
    3. src/tests/units/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.test.ts
    4. src/tests/acceptance/180-quality-threshold-block-approval.acceptance.test.ts

  TOTAL_FILE_COUNT:
    new: 4
    modified: 9 (incl. tests, factory)
    total: 13 (under the 10-file cap for production code — 4 new + 7 prod modifications;
              2 of the 9 modifications are test files)

  IMPLEMENTATION_ORDER:
    1. src/tests/acceptance/180-quality-threshold-block-approval.acceptance.test.ts
       — SDD outer loop: write the 5 acceptance scenarios first, they stay RED through
         every inner-loop step until wiring is done.
    2. src/modules/tracking/entities/qualityGate/qualityGate.ts (+ unit test)
       — Walking-skeleton core: pure function, no dependencies, drives every later layer.
         Covers scenarios 1, 2, 3, 7, 8 at the unit level.
    3. src/config/projectConfig.ts (extend Zod-style parsing + ProjectConfigFactory test
       fixture update)
       — Threshold reaches the system through config. Validate range 0-10.
    4. src/modules/tracking/usecases/tracking/transitionState.usecase.ts (modify)
       — Accept `qualityCheck` callback, return discriminated union. Update existing
         test file in same step.
    5. src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts (modify)
       — Plug `evaluateQualityGate` into the `pending-fix` vs `pending-approval` branch.
         Update existing test file in same step.
    6. src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts
       (modify + new unit test)
       — Enforce the gate at HTTP boundary, return 409 + French message.
    7. src/modules/platform-integration/interface-adapters/controllers/webhook/
       {gitlab,github}.controller.ts (modify)
       — Pass `qualityThreshold` to `recordCompletion.execute` so the auto-transition
         honors the threshold. NO change to platform-approval branches (that's Iter. C).
    8. src/main/routes.ts (wire `getQualityThreshold` closure)
       — Last step: composition root binds everything together.
    9. Verify src/tests/acceptance/180-quality-threshold-block-approval.acceptance.test.ts
       passes GREEN.

  TEST_PLAN:
    unit_evaluator (src/tests/units/.../qualityGate.test.ts):
      - latestScore=null → allowed (scenario 7)
      - threshold=null → allowed (scenario 8)
      - blockingIssues > 0 → rejected with "Issues bloquantes non résolues" (scenario 3)
      - latestScore < threshold → rejected with "Seuil qualité non atteint (6/10 < 7/10)" (scenario 2)
      - latestScore >= threshold && blockingIssues === 0 → allowed (scenario 1)
      - boundary: latestScore === threshold → allowed
      - boundary: threshold=0 → only blockers matter
    unit_transitionState:
      - approved + passing gate → ok:true, gateway updated, approvedAt set
      - approved + failing gate → ok:false with reason, gateway NOT touched
      - merged/closed → gate skipped (out of scope per spec)
    unit_recordReviewCompletion:
      - threshold=null + no blockers → pending-approval (unchanged)
      - threshold=7, score=6, no blockers → pending-fix
      - threshold=7, score=8, no blockers → pending-approval
      - threshold=7, score=8, blockers=1 → pending-fix (blockers still dominate)
    unit_mrTrackingRoutes:
      - approve with gate passing → 200 success
      - approve with score below threshold → 409 + "Seuil qualité non atteint (6/10 < 7/10)"
      - approve with blockers > 0 → 409 + "Issues bloquantes non résolues"
      - approve with no review yet (latestScore=null) → 200 (scenario 7)
      - approve with no threshold configured → 200 (scenario 8)
    acceptance (src/tests/acceptance/180-quality-threshold-block-approval.acceptance.test.ts):
      Each of the 5 in-scope scenarios from the spec, exercising:
      ProjectConfig (via factory) → TrackedMr seeded in InMemoryReviewRequestTrackingGateway
      → call POST /api/mr-tracking/approve via Fastify inject() → assert HTTP status + body.
      Scenario coverage:
        - 1: score=8, blockers=0, threshold=7 → 200 + state 'approved'
        - 2: score=6, blockers=0, threshold=7 → 409 + "Seuil qualité non atteint (6/10 < 7/10)"
        - 3: score=9, blockers=2, threshold=7 → 409 + "Issues bloquantes non résolues"
        - 7: latestScore=null, threshold=7 → 200 + state 'approved'
        - 8: latestScore=6, threshold=null → 200 + state 'approved'

  REFERENCE_FILES:
    - docs/specs/180-quality-threshold-block-approval.md — spec (Iteration A == scenarios 1,2,3,7,8)
    - src/modules/review-execution/entities/reviewRequest/reviewRequestState.valueObject.ts — state machine (unchanged: gate enforced one layer outside)
    - src/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.ts — current `pending-fix` vs `pending-approval` decision point (line 68)
    - src/modules/tracking/usecases/tracking/transitionState.usecase.ts — current approval transition use case
    - src/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.ts — HTTP approve endpoint (line 53)
    - src/modules/tracking/entities/tracking/trackedMr.ts — `latestScore`, `openThreads` already on entity
    - src/modules/tracking/entities/tracking/reviewRequestTracking.gateway.ts — gateway contract (no change needed)
    - src/config/projectConfig.ts — where `qualityThreshold` field is added to ProjectConfig + parsed
    - src/tests/factories/projectConfig.factory.ts — extend overrides for threshold
    - src/tests/factories/trackedMr.factory.ts — covers seed data for tests, no change needed
    - src/tests/stubs/reviewRequestTracking.stub.ts — in-memory gateway, no change needed
    - src/tests/acceptance/174-semi-auto-review-trigger-mode.acceptance.test.ts — pattern reference for acceptance tests
    - src/shared/foundation/usecase.base.ts — UseCase interface
    - .claude/rules/coding-standards.md — file naming, French messages for end-user UI

  ARCHITECTURAL_DECISIONS:
    where_evaluator_lives:
      Entity layer (`src/modules/tracking/entities/qualityGate/`). Pure function, no I/O,
      no framework. The decision rule belongs to the domain (it encodes a business
      invariant: "what does it mean for an MR to qualify for approval?").
    where_gate_is_enforced:
      Use-case layer guards (not in `ReviewRequestState` value object). The state machine
      remains pure structural transitions (pending-approval ↔ approved is valid). The
      business policy "approval is conditional on score + blockers + threshold" is an
      application-level rule, enforced by `TransitionStateUseCase` and
      `RecordReviewCompletionUseCase`. Keeps the state machine reusable and pure.
    how_threshold_enters_config:
      Optional integer 0-10 in `.claude/reviews/config.json`. Validated in
      `parseProjectConfig` with the same defensive style as `parseRetentionDays`. Absent
      → null → no gating (backward compatible per spec rule).
    how_latest_score_is_retrieved:
      Already on `TrackedMr.latestScore` (maintained by `recordReviewEvent` in the
      gateway and `RecordReviewCompletionUseCase`). No new gateway, no new fetch path.
      The `recalculateProjectStats` flow operates on `stats.json` separately and is
      orthogonal to this gate.
    new_approve_use_case_or_modify_existing:
      Modify `TransitionStateUseCase` (option chosen). Introducing an `ApproveMr` use case
      wrapping the existing one would duplicate the gateway call and split responsibility
      for one identical write. The optional `qualityCheck` callback keeps the use case
      single-purpose (state transition) while letting the composition root inject policy.
    french_messages_at_boundary:
      The pure evaluator produces French messages directly (consistent with project rule
      "French for end-user messages"). They're returned untouched to the HTTP client.
      Code/tests/logs around the evaluator stay English.

  WALKING_SKELETON:
    First minimal vertical slice (step 1-6 in IMPLEMENTATION_ORDER):
      acceptance test RED → qualityGate.ts (entity) → projectConfig threshold field →
      transitionState modification → mrTrackingRoutes enforcement → wiring → acceptance
      GREEN.
    The HTTP approval endpoint is the visible end-to-end path that crosses every layer
    and exercises scenarios 1, 2, 3, 7, 8.

  ACCEPTANCE_TEST:
    file: src/tests/acceptance/180-quality-threshold-block-approval.acceptance.test.ts
    note: |
      SDD outer loop — written first (step 1), RED until step 8 wiring completes, GREEN
      at step 9. Uses Fastify `inject()` against routes built with
      InMemoryReviewRequestTrackingGateway + a stubbed `getQualityThreshold` closure
      backed by per-test configuration (no filesystem). Covers the 5 in-scope scenarios.

  OUT_OF_ITERATION_A_SCOPE:
    - Comment-based bypass (`/bypass-quality "reason"`) — Iteration B
    - Note webhook parsing (GitLab/GitHub) — Iteration B
    - Bypass reset on new review — Iteration B
    - Platform-side unapprove on approval webhook — Iteration C
    - French explanatory comment on platform approval events — Iteration C
    - Dashboard UI to visualize gate status / bypasses — Out of Scope per spec
    - Configuring threshold via HTTP API or dashboard form — Out of Scope per spec
