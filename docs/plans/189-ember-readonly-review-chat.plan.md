# Plan — SPEC-189: Ask Ember about your reviews (read-only chat)

> Phase A of Ember. A strictly read-only conversational chat in the dashboard.
> NOT a CRUD: the bulk of the work is (1) a long-lived conversational assistant
> session, (2) a chat HTTP/SSE surface, (3) exposing the four existing review
> read paths to the session as read-only tools, and (4) a dashboard chat view
> that reuses the SPEC-188 reactor-core avatar.

```
PLAN:
  scope: ember-readonly-review-chat (SPEC-189, Phase A)
  is_new_module: true  — new module src/modules/ember-chat/, but heavily reuses
                         existing read paths (SPEC-125/126/176/173), the bg
                         session machinery (SPEC-169), the supervisor (SPEC-172),
                         the SSE+registry streaming pattern (SPEC-184), and the
                         avatar (SPEC-188).
```

## 0. Project layout reality (important — coding-standards is aspirational)

The repo is a **modular monolith**: `src/modules/<context>/{entities,usecases,interface-adapters,services}/`,
NOT the flat `src/entities|usecases|interface-adapters` shown in `coding-standards.md`.
Dashboard browser JS lives in `src/dashboard/modules/*.js` (NOT `src/interface-adapters/views/`).
Tests mirror under `src/tests/units/modules/<context>/...`. New code follows the
modular layout. New module: `src/modules/ember-chat/`.

---

## 1. Reuse vs Create (the load-bearing distinction)

### REUSE — do NOT re-implement (verified file:line)

**Four read data sources (grounding):**
- Review scores/stats (SPEC-126) — `StatsGateway.loadProjectStats(projectPath)`
  - contract: `src/modules/statistics-insights/entities/stats/stats.gateway.ts:3`
  - impl: `src/modules/statistics-insights/interface-adapters/gateways/fileSystem/stats.fileSystem.ts`
- Developer/team insights (SPEC-125) — `InsightsGateway.loadPersistedInsights(projectPath)`
  - contract: `src/modules/statistics-insights/entities/insight/insights.gateway.ts:3`
  - impl: `src/modules/statistics-insights/interface-adapters/gateways/fileSystem/insights.fileSystem.ts`
- Job history (SPEC-176) — review-request tracking read path
  - contract: `src/modules/tracking/entities/tracking/reviewRequestTracking.gateway.ts`
  - impl: `src/modules/tracking/interface-adapters/gateways/fileSystem/reviewRequestTracking.fileSystem.ts`
- Worktree state (SPEC-173) — `WorktreeGateway.list()`
  - contract: `src/modules/worktree-management/entities/worktree/worktree.gateway.ts:22`
  - impl: `src/modules/worktree-management/interface-adapters/gateways/worktree.fileSystem.gateway.ts`

> Grounding is enforced structurally: Ember is given ONLY these read paths as its
> tools (no write tools, no shell, no platform CLI). There is no Ember-owned data
> access — it calls the four existing read gateways.

**Long-lived session / streaming / avatar template (SPEC-184/188) — the architectural blueprint:**
- `SetupRunRegistry` — long-lived child process + `subscribe(onEvent,onClose)` + `submitInput`
  - `src/modules/setup-wizard/usecases/streamSetupRun.usecase.ts:28`
- Long-lived process handle (spawn / onLine / onExit / writeLine / kill)
  - contract: `src/modules/setup-wizard/entities/setupProcess/setupProcess.gateway.ts:4`
  - impl: `src/modules/setup-wizard/interface-adapters/gateways/setupProcess.childProcess.gateway.ts:81`
- SSE route pattern (`reply.hijack()` + `text/event-stream` + registry.subscribe)
  - `src/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.ts:83`
- Dashboard pure decisions + humble SSE connector (`EventSource`)
  - `src/dashboard/modules/setupWizardStream.js:117` (`connectSetupWizardStream`)
- **Avatar — reuse verbatim, do NOT rebuild:**
  - pure logic + states: `src/dashboard/modules/setupWizardAvatar.js` (`AVATAR_STATES`, `avatarStateToVisual`, geometry/projection)
  - renderer: `src/dashboard/modules/setupWizardAvatarRenderer.js:53` (`mountSetupWizardAvatar({canvas}).setState('working'|'idle'|...)`)

**Claude bg session machinery (SPEC-169/172) — reuse the daemon-reachability + no-API-key guard:**
- `ClaudeSessionGateway` (`dispatch`, `stop`, `remove`, `listAgents`, `daemonStatus`)
  - contract: `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts:56`
  - impl: `src/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.ts:77`
- No-API-key guard pattern: `dispatchClaudeSession.usecase.ts:42` (`hasAnthropicApiKey()` → `billing-regression-prevented`)
- Supervisor probe/respawn lifecycle template: `checkSupervisorAndRespawn.usecase.ts:21`

> IMPORTANT GAP (drives a new gateway): the existing `ClaudeSessionGateway.dispatch`
> is **one-shot, fire-and-forget** (review jobs answer via the MCP completion file,
> NOT back to a caller). Ember needs a **conversational** session: send a question
> → stream an answer back → keep the thread → reuse for the next question. That
> conversational transport does not exist yet. It is the genuinely NEW + RISKIEST
> piece (see §5). It follows the SetupRunRegistry/long-lived-process model, not
> the `dispatch` one.

### Composition root wiring point (verified)
- `src/main/routes.ts:443` registers `setupWizardRoutes` with a `new SetupRunRegistry(...)`.
  Ember's route registration + `EmberSessionRegistry` instantiation go right beside it.

---

## 2. ENTITIES (new) — `src/modules/ember-chat/entities/`

Keep the domain THIN. Ember is read-only Q&A; there is little true domain logic.
The one genuinely domain-worthy piece is the **session lifecycle state machine**
(idle / live / reviving) — that is pure, testable, and risky.

```
ENTITIES:
  - name: EmberSessionState (lifecycle state machine — PURE)
    file:   src/modules/ember-chat/entities/emberSession/emberSessionState.ts
    schema: src/modules/ember-chat/entities/emberSession/emberSession.schema.ts
    test:   src/tests/units/modules/ember-chat/entities/emberSessionState.test.ts
    notes:  states: 'idle' (no live process) | 'live' (process up, last-activity ts)
            | 'reviving' (transparent revive after idle release).
            Pure transitions: onQuestion(now), onAnswerDone(now), onIdleTick(now,timeoutMs),
            onRelease(). Drives idle-release + transparent-revive scenarios.
            Decides avatar status mapping input too (question→working, answerDone→idle).

  - name: EmberMessage (chat turn value + guard at the HTTP boundary)
    file:   src/modules/ember-chat/entities/emberMessage/emberMessage.schema.ts
    guard:  src/modules/ember-chat/entities/emberMessage/emberMessage.guard.ts
    test:   src/tests/units/modules/ember-chat/entities/emberMessage.guard.test.ts
    notes:  Zod schema for { question: non-empty trimmed string }. Empty-input
            scenario rejects at this boundary (R: empty input → nothing sent).
            Brand SessionId-equivalent reused from claudeSession.schema if useful.

  - name: EmberTool contract (read-only tool descriptors)
    file:   src/modules/ember-chat/entities/emberTool/emberTool.gateway.ts
    test:   (contract only — exercised via the grounding gateway test)
    notes:  interface EmberReadDataGateway { reviewScores(projectPath), insights(projectPath),
            jobHistory(projectPath), worktrees() }. READ-ONLY by construction — no
            write methods exist on the contract. This is the read-only guarantee
            encoded as a type (testable: the contract has no mutating member).
```

Anti-overengineering note: NO `EmberConversation` aggregate, NO message-history
entity (durable memory is out of scope; the live `claude` session owns thread
context). NO branded `Answer` value object — an answer is a streamed string.

---

## 3. USECASES (new) — `src/modules/ember-chat/usecases/`

```
USECASES:
  - name: askEmber
    file:   src/modules/ember-chat/usecases/askEmber/askEmber.usecase.ts
    test:   src/tests/units/modules/ember-chat/usecases/askEmber.usecase.test.ts
    type:   command (read-only effect: starts/continues a session, returns a stream handle)
    input:  { question: string }  (already guard-validated)
    output: discriminated result:
              | { status: 'streaming'; subscribe(onChunk,onDone,onError) }
              | { status: 'unavailable'; reason }           (daemon unreachable / spawn failed)
              | { status: 'billing-regression-prevented' }  (API key present — reuse SPEC-169 guard)
    deps:   EmberSessionRegistry (lifecycle + transport), EnvironmentGateway (no-API-key guard),
            now: () => Date
    notes:  Orchestrates: API-key guard → ensure session live (spawn-or-revive via
            registry) → forward question → return the stream subscription. Does NOT
            build the grounding prompt itself if that lives in a service (below).
            Idle-revive + unreachable-fallback decisions are delegated to the
            registry/state machine so this stays thin.

  - name: buildEmberSystemPrompt (service, not a usecase) — see §services
```

```
SERVICES (new) — src/modules/ember-chat/services/
  - emberSystemPrompt.ts
    test: src/tests/units/modules/ember-chat/services/emberSystemPrompt.test.ts
    role: PURE. Builds the --append-system-prompt that (a) names the four tools as
          the ONLY data sources, (b) instructs "if outside review data, say you
          don't know — never invent", (c) instructs "writing arrives in Phase B —
          perform no writes". This encodes the grounding + read-only + Phase-B
          decline behavior as testable prompt content (asserts the directive
          strings are present; does NOT assert model wording).
```

Anti-overengineering: only ONE usecase. No `reviveEmber`, no `releaseEmber` usecases —
those are registry/timer concerns (humble glue + the pure state machine), not
user intentions. No per-data-source usecase — the four reads are tools the
session calls, not app-layer orchestration.

---

## 4. GATEWAYS / TOOLS (read-only) — `src/modules/ember-chat/interface-adapters/gateways/`

```
GATEWAYS:
  - name: EmberReadDataGateway (the grounding adapter)
    contract:       src/modules/ember-chat/entities/emberTool/emberTool.gateway.ts
    implementation: src/modules/ember-chat/interface-adapters/gateways/emberReadData.composite.gateway.ts
    test:           src/tests/units/modules/ember-chat/gateways/emberReadData.composite.gateway.test.ts
    stub:           src/tests/stubs/emberReadData.stub.ts
    methods (ALL read-only): reviewScores(projectPath) → delegates StatsGateway.loadProjectStats
                             insights(projectPath)      → delegates InsightsGateway.loadPersistedInsights
                             jobHistory(projectPath)     → delegates reviewRequestTracking read
                             worktrees()                → delegates WorktreeGateway.list
    notes:  This is a thin façade over the four EXISTING gateways. No new data
            access. The read-only guarantee is enforced here (no write method
            exists) + tested (composite only exposes reads; delegated gateways are
            the existing read methods).

  - name: EmberSessionTransportGateway (the conversational transport — NEW, RISKY)
    contract:       src/modules/ember-chat/entities/emberSession/emberSessionTransport.gateway.ts
    implementation: src/modules/ember-chat/interface-adapters/gateways/emberSessionTransport.claude.gateway.ts
    test:           (HUMBLE GLUE — not unit-tested; mirrors setupProcess gateway precedent)
    stub:           src/tests/stubs/emberSessionTransport.stub.ts
    methods: spawn(systemPrompt) → handle; handle: ask(question), onChunk, onDone, onError, isAlive, kill
    notes:  Spawns ONE long-lived `claude` bg conversational session (subscription
            OAuth, no API key) exposing the EmberReadData tools, and streams the
            answer back. Models on SetupProcessChildProcessGateway (long-lived
            child, line streaming, stdin writeLine), NOT on the one-shot dispatch
            path. The exact CLI invocation (resume/continue a thread, stream-json
            output) is the open unknown — see §5/§12.
```

> The four data tools must be reachable BY the claude session. Two viable HOWs
> (left to the implementer per Negotiable, flag in report):
> (A) expose them through the existing MCP server (`src/mcp/server.ts`) as new
>     read-only MCP tools, wired via `--mcp-config` like reviews do; or
> (B) a thin in-process tool bridge the transport gateway feeds.
> Plan assumes (A) is preferred (reuses the proven `--mcp-config` path) — if MCP
> tool surface changes push file count over budget, fall back to (B). The
> composite gateway above is the in-process source of truth either way.

---

## 5. SESSION LIFECYCLE (NEW + RISKIEST) — `src/modules/ember-chat/usecases/` + glue

This is the heart of the spec and the only genuinely new mechanism. Split it
cleanly into **pure logic (unit-tested)** vs **humble I/O glue (not unit-tested)**:

```
EmberSessionRegistry  (src/modules/ember-chat/usecases/emberSession/emberSessionRegistry.ts)
  test: src/tests/units/modules/ember-chat/usecases/emberSessionRegistry.test.ts
  role: ONE shared session per machine (R: single shared Ember). Holds the live
        transport handle (or null), the EmberSessionState, the subscriber set, and
        the idle timer hook. Mirrors SetupRunRegistry but:
          - single shared conversation (no per-run id churn)
          - ensureLive(): spawn if idle/released, OR transparently revive (R:
            idle release → next question revives, accepting a short delay)
          - ask(question): forward to handle, fan out chunks to subscribers
          - onIdle(now): consult EmberSessionState → release transport if timed out
        PURE decisions (spawn-vs-reuse, release-vs-keep, revive) live in
        EmberSessionState; the registry wires them to the transport handle + a
        clock. The registry itself is unit-tested with a STUB transport (state
        transitions + "reuses one handle for consecutive questions" + "revives
        after release" are assertable without real processes).
```

Testable-as-pure-logic:
- `EmberSessionState` transitions (idle→live→idle-release→reviving→live).
- "consecutive questions reuse one session (no cold start)" — registry with stub transport asserts `spawn` called once across two `ask` calls.
- "first question after idle release transparently revives" — advance the clock past timeout, assert release then a fresh `spawn` on the next `ask`.
- "unreachable" mapping — stub transport spawn fails → `askEmber` returns `{status:'unavailable'}`.

Humble I/O glue (NOT unit-tested, exercised by acceptance + manual):
- `emberSessionTransport.claude.gateway.ts` (real child process / claude CLI).
- the real idle timer (setInterval) wired in the composition root.

---

## 6. CONTROLLERS (HTTP chat surface) — `src/modules/ember-chat/interface-adapters/controllers/http/`

```
CONTROLLERS:
  - name: emberChatRoutes (Fastify plugin, mirrors setupWizard.routes.ts)
    file: src/modules/ember-chat/interface-adapters/controllers/http/emberChat.routes.ts
    test: src/tests/units/modules/ember-chat/controllers/emberChat.routes.test.ts
    dependencies: { registry: EmberSessionRegistry, askEmber: AskEmberUseCase deps, logger }
    endpoints:
      POST /api/ember/ask
        body: { question } guarded by emberMessage.guard (empty → 400, nothing sent — R)
        starts/continues the session, returns { status } (streaming|unavailable|...)
      GET  /api/ember/stream   (SSE — reply.hijack(), text/event-stream)
        emits: data: {type:'chunk', text}      (streamed answer fragments — R: stream)
               data: {type:'status', state}    (idle|working — drives avatar + a11y live region)
               data: {type:'error', message}   (French unavailable message — R)
               event: end
    notes: Pure SSE transport reuse of the setupWizard.routes precedent. No
           business logic in the controller — it forwards to registry/usecase and
           serializes guarded events.
```

---

## 7. PRESENTERS — `src/modules/ember-chat/interface-adapters/presenters/`

```
PRESENTERS:
  - name: emberStatusPresenter (status/state → avatar state + a11y announcement)
    file:  src/modules/ember-chat/interface-adapters/presenters/emberStatus.presenter.ts
    test:  src/tests/units/modules/ember-chat/presenters/emberStatus.presenter.test.ts
    input: EmberSessionState lifecycle status + chunk/done/error events
    output: { avatarState: 'idle'|'working'|'error', liveRegionText: string (French),
              unavailableMessage: '// EMBER INDISPONIBLE — réessayer' | null }
    notes: PURE. Maps lifecycle → the SPEC-188 avatar states (reuse 'working' on
           question-in-flight, 'idle' when done, 'error' on unreachable) + the
           screen-reader live-region text (R: announce status change + answer).
           This is the testable presentation logic for the a11y + identity rules.
```

> Decision: put avatar-state mapping in this server-side presenter so it is
> unit-tested in TS, then the dashboard view just applies it. (The browser avatar
> module already maps its own states from events; the chat view drives it via
> `mountSetupWizardAvatar(...).setState(viewModel.avatarState)`.)

---

## 8. VIEWS (dashboard chat) — `src/dashboard/modules/`

```
VIEWS:
  - name: emberChat.js (pure decisions + humble SSE connector)
    file: src/dashboard/modules/emberChat.js
    test: src/tests/units/dashboard/modules/emberChat.test.ts
    notes: Mirrors setupWizardStream.js: PURE functions (parse chunk/status/error
           events, fold streamed text, decide retry visibility, empty-input guard
           keeps field focused) are unit-tested; the thin connectEmberStream glue
           (EventSource + DOM) is NOT unit-tested. Drives the avatar via the
           REUSED mountSetupWizardAvatar(...).setState(...). Reuses the visual DNA
           (// EMBER label, amber/green, monospace, no emoji) and an aria-live
           region for announcements.
```

> The chat panel HTML/CSS shell is added to the existing dashboard page
> (`src/dashboard/index.html` + existing CSS tokens). No new HTML file (reuse the
> dashboard shell). If a separate panel partial is unavoidable, it is markup only
> (humble, not tested).

---

## 9. WIRING (composition root)

```
WIRING:
  routes (src/main/routes.ts, beside the setupWizardRoutes block at :443):
    await app.register(emberChatRoutes, {
      registry: emberSessionRegistry,
      askEmberDeps: { environment, now },
      logger: deps.logger,
    });
  dependencies (instantiate once — single shared Ember per machine):
    - EmberReadDataComposite(statsGateway, insightsGateway, trackingGateway, worktreeGateway)
        (reuse the gateway instances already built in routes.ts / dependencies.ts)
    - EmberSessionTransportClaudeGateway({ claudePath, systemPromptBuilder })
    - EmberSessionRegistry(transport, EmberSessionState, now, idleTimeoutMs)
    - idle timer: setInterval(() => registry.onIdle(new Date()), tick) — humble glue
    - reuse EnvironmentGateway (no-API-key guard, SPEC-169)
  dashboard:
    - add the Ember chat panel markup to src/dashboard/index.html
    - import emberChat.js + reuse setupWizardAvatarRenderer.js in the dashboard bootstrap
```

---

## 10. TEST STRATEGY per scenario (spec §Scenarios)

| Scenario (spec) | Level | Where |
|---|---|---|
| ask about scores → grounded answer + avatar working→idle | acceptance (grounding + status sequence, not wording) | `189-...acceptance.test.ts` over fixed stats fixture |
| ask about blocked review → from job history/insights | acceptance | same, job-history fixture |
| follow-up keeps context | acceptance + unit | registry reuses one handle across asks (unit, stub transport); thread context itself is humble glue |
| streamed answer (progressive) | unit (pure fold) + humble glue | `emberChat.js` fold of chunk events (unit); real streaming = glue |
| out-of-data question → "I don't know", no invention | unit (prompt content) + acceptance | `emberSystemPrompt.test.ts` asserts the directive; acceptance asserts decline shape (answer generation = glue) |
| write attempt → Phase-B decline, no mutation | unit (prompt content) + structural | `emberSystemPrompt.test.ts` + EmberReadDataGateway contract has NO write method (read-only enforced by type) |
| empty input → nothing sent, field stays focused | unit | `emberMessage.guard.test.ts` (server reject) + `emberChat.test.ts` (client keeps focus) |
| first question after idle release → transparent revive | unit | `emberSessionRegistry.test.ts` (advance clock, assert release then re-spawn) |
| assistant unreachable → French message + retry, no hang | unit | `askEmber.usecase.test.ts` (stub transport spawn fails → unavailable) + `emberChat.test.ts` (retry control visible) |
| screen reader → live region announces status then answer | unit | `emberStatus.presenter.test.ts` (liveRegionText) |
| visual identity (DNA, no emoji) | not unit-tested (humble markup) | reuse avatar + CSS tokens |

Detroit/inside-out: start at `EmberSessionState` + `emberSystemPrompt` (pure),
work outward. Factories: `EmberMessageFactory` (+ reuse existing `ProjectStats` /
insights / tracking factories for grounding fixtures). Stubs:
`emberReadData.stub.ts`, `emberSessionTransport.stub.ts`.

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/189-ember-readonly-review-chat.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at
         the end. Scripts a question over a FIXED review-data fixture, asserts a
         grounded answer references the fixture + the idle→working→idle status
         sequence. Uses the transport STUB (no real claude process in CI)."
```

---

## 11. IMPLEMENTATION_ORDER (Walking Skeleton first)

1. `189-...acceptance.test.ts` — outer loop RED first (defines "done": grounded answer + status sequence over a stub transport).
2. `emberSessionState.ts` (+test) — pure lifecycle state machine. Smallest core, riskiest logic, zero I/O.
3. `emberMessage.schema.ts` + `.guard.ts` (+test) — HTTP boundary + empty-input rule.
4. `emberTool/emberTool.gateway.ts` (contract) + `emberReadData.composite.gateway.ts` (+test, +stub) — grounding façade over the four existing read gateways (read-only by type).
5. `emberSystemPrompt.ts` (+test) — grounding + read-only + Phase-B decline directives (pure).
6. `emberSessionTransport.gateway.ts` (contract) + `emberSessionTransport.stub.ts` — conversational transport port (+stub for tests).
7. `emberSessionRegistry.ts` (+test) — single-shared-session, reuse/revive/release wiring against the stub transport. **Walking skeleton crosses here: state→registry→(stub)transport.**
8. `askEmber.usecase.ts` (+test) — API-key guard + ensureLive + return stream/unavailable. Acceptance goes GREEN at the use-case + registry level with the stub.
9. `emberStatus.presenter.ts` (+test) — lifecycle → avatar state + a11y text.
10. `emberChat.routes.ts` (+test) — POST /ask + GET /stream SSE (mirrors setupWizard.routes).
11. `emberChat.js` (+test) — pure client decisions; humble `connectEmberStream` glue.
12. `emberSessionTransport.claude.gateway.ts` — REAL claude bg conversational transport (humble glue, no unit test).
13. Wiring in `src/main/routes.ts` + dashboard panel markup + bootstrap import (LAST).

---

## 12. RISKIEST / UNKNOWN AREAS (call these out explicitly)

1. **Conversational transport over `claude` bg (HIGHEST RISK).** The existing
   `ClaudeSessionGateway.dispatch` is one-shot and answers via an MCP completion
   FILE, never back to a caller. A *chat* (ask → stream answer → keep thread →
   ask again) is a different invocation shape. Open unknowns: which CLI mode
   keeps a resumable conversational thread while streaming text back
   (`--resume`/`--continue` + `--output-format stream-json`?), and whether the
   `claude agents` supervisor hosts it or it's a directly-spawned long-lived
   child like the setup process. MITIGATION: the port (`EmberSessionTransportGateway`)
   + stub isolate every layer above it from this unknown; the real gateway is
   humble glue validated by acceptance/manual, swappable without touching domain.
2. **Streaming end-to-end** (claude stream-json → SSE chunk events → client fold →
   avatar stays 'working'). Pure parts unit-tested; the live pipe is glue. Risk:
   chunk framing / partial-line buffering (mitigated by reusing `splitLines`
   precedent from the setup process gateway).
3. **Grounding enforcement.** Structural (read-only tools only, no write tools, no
   shell) + prompt directive. We can test the *contract* (no write method) and the
   *prompt* (directives present); we CANNOT unit-test that the model never invents
   — acceptance asserts the decline SHAPE over fixed data, not wording. Flag as a
   known limit.
4. **Idle timeout value + supervisor interaction.** A wrong timeout degrades UX
   (cold starts) or wastes resources. The value is config, the policy is the pure
   state machine (tested); pick a conservative default, flag in report.
5. **MCP vs in-process tool exposure** (see §4 note) — affects whether the four
   tools touch `src/mcp/server.ts`. If MCP route adds files beyond budget, use the
   in-process bridge.

---

## REFERENCE_FILES

- `docs/specs/189-ember-readonly-review-chat.md` — the spec (rules, scenarios, scope).
- `src/modules/setup-wizard/usecases/streamSetupRun.usecase.ts` — registry/subscribe/onClose template for EmberSessionRegistry.
- `src/modules/setup-wizard/interface-adapters/gateways/setupProcess.childProcess.gateway.ts` — long-lived child process + line streaming template for the transport gateway.
- `src/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.ts` — SSE route template.
- `src/dashboard/modules/setupWizardStream.js` — pure-decision + humble-connector client template for emberChat.js.
- `src/dashboard/modules/setupWizardAvatar.js` + `setupWizardAvatarRenderer.js` — REUSE for the avatar (states + `mountSetupWizardAvatar`).
- `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts` + `.cli.gateway.ts` — bg session contract/impl; daemon reachability + no-API-key guard.
- `src/modules/claude-invocation/usecases/dispatchClaudeSession.usecase.ts` — `hasAnthropicApiKey()` billing-regression guard to reuse.
- `src/modules/supervisor-management/usecases/checkSupervisorAndRespawn.usecase.ts` — probe/respawn lifecycle template.
- Read gateways for grounding: `statistics-insights/entities/stats/stats.gateway.ts`, `.../insight/insights.gateway.ts`, `tracking/entities/tracking/reviewRequestTracking.gateway.ts`, `worktree-management/entities/worktree/worktree.gateway.ts`.
- `src/main/routes.ts:443` — composition-root wiring point.

---

## INVEST-Small assessment + summary for validation

### New-file count (production), inside-out

| # | File | Layer |
|---|------|-------|
| 1 | `entities/emberSession/emberSessionState.ts` (+schema) | Domain |
| 2 | `entities/emberMessage/emberMessage.schema.ts` + `.guard.ts` | Domain |
| 3 | `entities/emberTool/emberTool.gateway.ts` | Domain (port) |
| 4 | `entities/emberSession/emberSessionTransport.gateway.ts` | Domain (port) |
| 5 | `services/emberSystemPrompt.ts` | App/service (pure) |
| 6 | `usecases/askEmber/askEmber.usecase.ts` | App |
| 7 | `usecases/emberSession/emberSessionRegistry.ts` | App |
| 8 | `interface-adapters/gateways/emberReadData.composite.gateway.ts` | Adapter |
| 9 | `interface-adapters/gateways/emberSessionTransport.claude.gateway.ts` | Adapter (glue) |
| 10 | `interface-adapters/presenters/emberStatus.presenter.ts` | Adapter |
| 11 | `interface-adapters/controllers/http/emberChat.routes.ts` | Adapter |
| 12 | `src/dashboard/modules/emberChat.js` | View |

**12 production files** (+ schema files counted with their entity). Test mirrors,
2 stubs, 1 factory, 1 acceptance test are additional but expected by convention.
Composition-root + dashboard-HTML edits are modifications, not new files.

### Layer breakdown
- Domain: 4 (state machine, message guard, 2 gateway ports)
- App: 3 (system-prompt service, askEmber usecase, session registry)
- Adapters: 4 (read-data composite, claude transport, status presenter, chat routes)
- View: 1 (emberChat.js, reusing the existing avatar)

### INVEST-Small verdict
**Fits ~15 files (12 production).** It holds because we REUSE: four read gateways,
the no-API-key guard, the SSE+registry+long-lived-process template, and the entire
avatar. The spec's own scope cuts (no respawn-from-transcript, no durable memory,
no writes, no worktree) are what keep it Small.

**Genuine INVEST-Small concern (flag to user):** the conversational transport
(item #9) is the one truly new mechanism and its CLI shape is unverified (see §12.1).
If hosting Ember as a resumable streaming chat through the `claude` CLI proves to
need its own sub-pieces (resume/continue handling, stream-json parsing distinct
from the existing one-shot path), item #9 could split into 2–3 files and push the
total to ~14. That is still within budget, but it is the cost driver to watch. If
it balloons, the tighter cut is: ship Phase A.0 with a **non-streaming** answer
(single response, avatar working→idle, no progressive chunks) — drops the streaming
plumbing and `emberChat.js` fold complexity, defers "answers may stream in
progressively" (the spec allows it as "may", not "must"). Recommend confirming
streaming-vs-non-streaming with the user before implementation.
