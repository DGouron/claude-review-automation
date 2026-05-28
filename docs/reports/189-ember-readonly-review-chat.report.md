# Report — SPEC-189: Ask Ember about your reviews (read-only chat), Phase A

## Status: implemented — quality gate GREEN

- `yarn typecheck` — PASS (0 errors)
- `yarn lint` — PASS (biome, 956 files, 0 errors)
- `yarn test:ci` — PASS — **379 files / 2980 tests, 0 failures** (independently re-run by the orchestrator, exit 0) — includes 4 acceptance + 39 new ember unit tests
- `yarn build` — PASS
- Acceptance test `src/tests/acceptance/189-ember-readonly-review-chat.acceptance.test.ts` — **GREEN** (4 scenarios over a fixed review-data fixture + stub transport)

Streaming variant shipped (progressive chunk events folded client-side, avatar `working` during, `idle` on done) per the user's explicit decision — the non-streaming fallback was not taken.

## Files created

**Domain — `src/modules/ember-chat/entities/`**
- `emberSession/emberSession.schema.ts` — Zod phase enum (`idle | live`)
- `emberSession/emberSessionState.ts` — immutable lifecycle state machine (`onQuestion / onAnswerDone / onIdleTick / needsProcess`)
- `emberMessage/emberMessage.schema.ts` — `{ question: trimmed non-empty }`
- `emberMessage/emberMessage.guard.ts` — HTTP-boundary guard (empty-input rejection)
- `emberTool/emberTool.gateway.ts` — `EmberReadDataGateway` port: four read methods, **zero write methods** (read-only encoded as a type)
- `emberSession/emberSessionTransport.gateway.ts` — `EmberSessionTransportGateway` port (`spawn → handle{ask,onChunk,onDone,onError,isAlive,kill}`)

**Application**
- `services/emberSystemPrompt.ts` — pure grounding + read-only + Phase-B-decline directives (French)
- `usecases/emberSession/emberSessionRegistry.ts` — single shared session: ensure-live / reuse / transparent-revive / release + status fan-out
- `usecases/askEmber/askEmber.usecase.ts` — no-API-key guard + registry orchestration

**Interface adapters**
- `gateways/emberReadData.composite.gateway.ts` — façade over the four existing read gateways (stats / insights / tracking / worktree)
- `gateways/emberSessionTransport.claude.gateway.ts` — **real conversational claude transport (humble glue, not unit-tested)**
- `presenters/emberStatus.presenter.ts` — lifecycle/event → avatar state + French a11y text + unavailable message
- `controllers/http/emberChat.routes.ts` — `POST /api/ember/ask` + `GET /api/ember/stream` (SSE)

**View**
- `src/dashboard/modules/emberChat.js` — pure decisions (`parseEmberEvent`, `foldAnswer`, `avatarStateFromEvent`, `shouldShowRetry`, `shouldSendQuestion`) + humble `connectEmberStream`

**Tests / doubles**
- acceptance (4) + unit: state machine (7), message guard (4), composite gateway (3), system prompt (4), registry (4), askEmber (3), presenter (4), routes (4), client (14)
- `factories/emberMessage.factory.ts`, `stubs/emberReadData.stub.ts`, `stubs/emberSessionTransport.stub.ts`

**Modified (wiring, last)**
- `src/main/routes.ts` — composition root: transport gateway + registry + idle `setInterval(...).unref()` + environment gateway + `emberChatRoutes`
- `src/dashboard/index.html` — Ember panel markup (canvas avatar, `aria-live` regions, retry, form) + bootstrap reusing `mountSetupWizardAvatar`
- `src/dashboard/styles.css` — Ember panel CSS reusing the Agentic-OS DNA tokens + `.visually-hidden`

## Self-review

1 review-fix iteration. Violations found and fixed: an `useOptionalChain` lint in the registry; a presenter-convention hook requiring a class over a function export; a forbidden `as` assertion caught in the orchestrator's own composite-gateway test and replaced with a branded constructor. Audited: no `any` / `as` / non-null `!`; all imports `@/` + `.js`; no relative imports; no barrels; `null` (not `undefined`) in domain; tests in English; French for user-facing message + system prompt.

## Spec coverage

Every Rule and Scenario maps to a test (see the spec's `## Implementation` and the plan §10). Read-only is compile-enforced (port has no write method); grounding/decline asserted via prompt directives + acceptance decline-shape over fixed data; idle-revive and single-handle reuse asserted in the registry test (`spawnCount`); unavailable→French+retry asserted across usecase, routes, and client.

## Humble glue NOT unit-tested + manual-verification follow-ups

1. **`emberSessionTransport.claude.gateway.ts`** (real conversational claude transport) — modeled on `setupProcess.childProcess.gateway.ts`. Intentionally untested glue isolated behind the port + stub.
   - Confirm the `claude` CLI keeps a resumable conversational thread across turns in the chosen `--input-format stream-json --output-format stream-json` shape; if it differs, only `extractText` / `isTurnComplete` need adjusting.
   - Confirm the read tools reach the live session; decide dedicated read-only **MCP tools** vs the current in-process read allowlist (`Read,Glob,Grep` over the same review-data files). Composite gateway stays the read-only source of truth either way.
2. **Idle timer** — real `setInterval(...).unref()` in the composition root; release policy is the tested pure state machine. Defaults: idle 5 min, tick 30 s — conservative, tune after observing real cold-start cost.
3. **Dashboard markup/CSS + `connectEmberStream`** — browser-only humble glue; the pure client decisions it calls are unit-tested. **Drive end-to-end in a browser before relying on it.**
4. **Grounding limit (known, accepted in spec INVEST):** we test the read-only contract + prompt directives, not that the model never invents; acceptance asserts decline/answer shape over fixed data, not wording.
