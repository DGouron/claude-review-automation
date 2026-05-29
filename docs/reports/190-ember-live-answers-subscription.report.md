# Implementation Report — SPEC-190 (Ember Phase B)

**Spec:** Answer Ember questions live via the Claude subscription
**Status:** Complete
**Date:** 2026-05-29

## Summary

Ember now answers for real. Each question spawns ONE `claude --bg` one-shot dispatch on the
operator's Claude subscription (same billing path as reviews — never `--print`, which switches to
API billing on 2026-06-15), grounded on the current project's review data via a bounded system
prompt, with the answer tailed from the session transcript JSONL and streamed back over SSE. No
memory between questions; the SPEC-189 long-lived-session machinery was removed.

## Files

### Created (4)
- `src/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.ts` — one-shot transport port (`start(options, subscriber) → started{run.cancel()} | failed`), plus subscriber/handler types.
- `src/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.ts` — real `--bg` + transcript-tail glue (HUMBLE GLUE, not unit-tested; JSDoc-flagged).
- `src/tests/stubs/emberAnswerTransport.stub.ts` — `answerFromSystemPrompt()` / `failStart()` / `failMidStream()` / `startCount`.
- `src/tests/acceptance/190-ember-live-answers-subscription.acceptance.test.ts`.

### Modified (6)
- `src/modules/ember-chat/usecases/askEmber/askEmber.usecase.ts` — registry → one-shot transport; API-key guard kept; `AnswerRelay` buffers chunks until the SSE subscriber attaches.
- `src/modules/ember-chat/usecases/askEmber/emberStream.ts` — new home of `EmberStatus`/`EmberStreamSubscriber` (was in the deleted registry).
- `src/modules/ember-chat/services/emberSystemPrompt.ts` — **bounded grounding** (recent N reviews/MRs/developers/worktrees + aggregate "older reviews" note), pure function.
- `src/modules/ember-chat/interface-adapters/controllers/http/emberChat.routes.ts` — inject `transport`; client `close` → `cancel()`; `now` dependency dropped.
- `src/modules/ember-chat/interface-adapters/presenters/emberStatus.presenter.ts` — re-point `EmberStatus` import to `emberStream.js`.
- `src/main/routes.ts` — wire `EmberAnswerTransportClaudeGateway` (reusing `ClaudeSessionCliGateway` + exported `defaultProcessRunner`); remove registry + idle ticker.
- `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts` — `permissionMode: 'auto' | 'plan'` (read-only).
- `src/modules/claude-invocation/entities/claudeSession/claudeSession.schema.ts` — job type enum gains `'ember-chat'`.
- `src/frameworks/claude/claudeInvoker.ts` — export `defaultProcessRunner` for reuse.

### Deleted (8 — dead SPEC-189 long-lived-session machinery; verified no live production importer)
`emberSessionRegistry.ts`, `emberSessionState.ts`, `emberSession.schema.ts`, `emberSessionTransport.gateway.ts`, `emberSessionTransport.claude.gateway.ts`, `emberSessionTransport.stub.ts`, and tests `emberSessionRegistry.test.ts`, `emberSessionState.test.ts`. The SPEC-189 acceptance test (long-lived-session behavior, now obsolete) was removed and replaced by the SPEC-190 acceptance test.

## Tests

- `yarn verify` (typecheck + lint + test:ci): **GREEN** — 380 files, 3001 tests pass.
- Acceptance `190-ember-live-answers-subscription.acceptance.test.ts`: **GREEN** (on the stub transport — no real `claude` process in CI).

## Spec coverage

| Rule / scenario | Covered by |
|---|---|
| Subscription only, never API key / `api key present` → refuse | `askEmber.usecase.ts:90` guard + acceptance "api key present" |
| One-shot, no memory | one-shot transport (no registry); acceptance `startCount === 1` |
| Grounded on current review data / `nominal` | acceptance "nominal" (answer contains `42` via grounding path) |
| Grounding survives large projects / `large grounding` | `buildEmberSystemPrompt` bounding + acceptance "large grounding" (500 reviews, prompt < 60k) + pure-function test |
| Answer streams progressively | SSE `chunk` events; `AnswerRelay` + transcript tail |
| `empty question` → nothing sent | `emberMessageGuard` (trim().min(1)) → 400 at the HTTP boundary; client keeps focus |
| `not logged in` → retry message | acceptance "not logged in" (dispatch fails → `unavailable` → `// EMBER INDISPONIBLE — réessayer` + client retry) |
| `mid-stream failure` → retry | acceptance "mid-stream failure" (`error` status + onError) |
| Read-only | transport `--permission-mode plan`, allowedTools `Read,Glob,Grep`, disallow `Edit,Write,Bash,Task`; port exposes no write |

## Self-review / scope

All out-of-plan modifications are justified consequences of the plan (runner export for reuse, `permissionMode` widening, `ember-chat` job type, presenter import re-point). No scope pollution. A mid-implementation interruption left the `now`-removal refactor half-applied (typecheck broke in 8 spots); the orchestrator completed the cleanup consistently across the route, wiring, and tests.

## Manual verification — DONE (claude 2.1.154, real `--bg` dispatch)

Verified live against `claude --bg`; the glue was corrected to match the real transcript shape:

1. **Permission mode** — switched `plan` → **`auto`** (proven reviews path). Read-only stays enforced by the tool whitelist (`Read,Glob,Grep`) + blacklist (`Edit,Write,Bash,Task`) + no MCP. (`plan` also answered, but `auto` removes any risk of "plan-instead-of-answer".)
2. **Transcript filename** — the file is named with the FULL session UUID, while `backgrounded · <id>` only yields the short prefix. Fixed: resolve by prefix glob `<shortId>*.jsonl` in the project dir (was an exact-name lookup that would never match → no streaming).
3. **Done-detection** — there is NO `result`/`message_stop` line; completion is the `assistant` `stop_reason: end_turn` + a `system` `subtype: turn_duration` line (both now in `isTurnComplete`, TDD-covered). The earlier `listAgents()` fallback was removed: a `--bg` session is persistent and goes `idle` (non-terminal) after answering, and `agents --json` reports the full UUID, so the poll could neither match nor detect done. A bounded attempt budget (`MAX_TAIL_ATTEMPTS`) replaces it as the no-hang safeguard.
4. **One-shot cleanup** — the persistent `--bg` session is now `stop`-ped on done/cancel.
5. **End-to-end algorithm replay** — a fresh dispatch + the corrected tail produced the grounded chunk "Le score de la MR 7 est **9**." and detected completion. Assistant text is whole-message granularity (coarse progressive), per `message.content[].text`.

### Still open
- Drive the chat end-to-end in a browser (the SSE client glue is humble, browser-only).
