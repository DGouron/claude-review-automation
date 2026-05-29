# Plan — SPEC-190: Answer Ember questions live via the Claude subscription

> Spec: `docs/specs/190-ember-live-answers-subscription.md`
> Module: `src/modules/ember-chat/` (extends — not a new module)
> Architecture decisions locked by operator. Do not relitigate.

```
PLAN:
  scope: Ember Phase B — live one-shot answers over the Claude subscription
  is_new_module: false

  LOCKED DECISIONS (operator):
    1. Transport = `claude --bg` one-shot + tail transcript JSONL. NEVER `-p`/`--print`/headless (API billing 2026-06-15).
    2. Grounding = bounded prompt (recent N + aggregates). No MCP read-tools (deferred to Phase C).
    3. One-shot, NO memory. Remove all SPEC-189 long-lived-session machinery.
    4. Read-only preserved (`--permission-mode plan`, no write tools).
```

## Architecture overview

The async streaming **shape stays** (`askEmber` → `{status:'streaming', subscribe}`, the SSE route, the `{onStatus,onChunk,onError,onDone}` subscriber). Only what sits behind `subscribe` changes: instead of a long-lived stdin process owned by a registry, a **one-shot transport port** does `dispatch(--bg)` then **tails the transcript JSONL** at `~/.claude/projects/<slug>/<sessionId>.jsonl`, emitting `onChunk` per assistant text segment and `onDone` on the terminal transcript line.

`askEmber` calls the new transport **directly** (no registry). `EmberSessionRegistry`, `EmberSessionState`, `EmberSession` schema, and the interactive stdin transport are deleted.

Anti-overengineering check (per `/anti-overengineering`): the new transport is a single humble glue gateway behind one port; no new entity/value-object/aggregate is justified. Grounding bounding is a pure function change. The removal of the registry/state-machine REDUCES complexity. Net file count stays well under the spec's 15-file budget. No new pattern introduced.

---

## ENTITIES

### Modify — widen permission mode to allow read-only `plan`
- **File**: `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts`
  - `ClaudeDispatchFlags.permissionMode` is currently `'auto'`. Widen to `'auto' | 'plan'` so the Ember dispatch can run read-only without an `as` assertion. Minimal, additive, does not affect existing review dispatch (still passes `'auto'`).
  - **Test impact**: `claudeSession.cli.gateway` dispatch test still passes `'auto'`; add no new entity test (type-only widening). If a guard/schema exists for the flag, update it too — verify `claudeSession.schema.ts` (NOT read yet → see OPEN RISKS).

### New — Ember one-shot transport port (replaces `emberSessionTransport.gateway.ts`)
- **File (CREATE)**: `src/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.ts`
  - Port for a **single question → streamed answer** run. No `ask()`/`isAlive()` reuse semantics.
  - Shape (contract, no impl):
    ```
    EmberAnswerSubscriber = { onChunk(text), onDone(), onError(message) }
    EmberAnswerStartOptions = { question, systemPrompt, projectPath }
    EmberAnswerRun = { cancel(): void }      // kill bg session + stop tailing (client disconnect / mid-stream failure → retry)
    EmberAnswerTransportGateway = {
      start(options: EmberAnswerStartOptions, subscriber: EmberAnswerSubscriber): EmberAnswerStartResult
    }
    EmberAnswerStartResult = { status: 'started'; run: EmberAnswerRun } | { status: 'failed'; reason: string }
    ```
  - `null` for absence, no `undefined`. No `as`. Handlers passed at `start` (not registered post-hoc) — simpler than the 189 handle.
- **File (DELETE)**: `src/modules/ember-chat/entities/emberSession/emberSessionTransport.gateway.ts` (old long-lived handle port).

### Delete — dead 189 session entities
- **DELETE** `src/modules/ember-chat/entities/emberSession/emberSessionState.ts`
- **DELETE** `src/modules/ember-chat/entities/emberSession/emberSession.schema.ts` (only consumed by the state machine — verify no other importer; see OPEN RISKS)

### Unchanged
- `emberMessage.schema.ts` already enforces `z.string().trim().min(1)` → empty question rejected at the boundary guard. Keep as-is. Covers scenario `empty question` (server-side; client focus-retention is the dashboard's job, out of this plan's TS scope but noted).
- `emberTool.gateway.ts` (`EmberReadDataGateway`) — unchanged, reused by grounding.

---

## USECASES

### Modify — `askEmber` calls the one-shot transport directly
- **File**: `src/modules/ember-chat/usecases/askEmber/askEmber.usecase.ts`
- **Test**: `src/tests/units/modules/ember-chat/usecases/askEmber.usecase.test.ts` (REWRITE)
- Changes:
  - Drop `registry` dependency; replace with `transport: EmberAnswerTransportGateway`.
  - Keep `environment.hasAnthropicApiKey()` guard at top → `{status:'billing-regression-prevented'}` (scenario `api key present`). UNCHANGED — do not touch line 29 logic.
  - Keep grounding read (`readData.*`) then `buildEmberSystemPrompt`.
  - Return `{status:'streaming', subscribe}` where `subscribe` calls `transport.start(...)`:
    - emit `onStatus('working')` first,
    - wire `onChunk` → subscriber.onChunk,
    - on transport `onDone` → `onStatus('idle')` + `onDone()`,
    - on transport `onError` → `onStatus('error')` + `onError(message)`,
    - if `start` returns `{status:'failed'}` → surface as `onStatus('error')` + `onError`.
  - Map `start` pre-failure (e.g. dispatch failed/rate-limited/not-logged-in) → `askEmber` returns `{status:'unavailable', reason}` BEFORE streaming when detectable synchronously; mid-stream failure goes through `onError`. (Both render the same UNAVAILABLE message in the route.)
  - `EmberStreamSubscriber` / `EmberStatus` type re-export moves into the usecase (or a small `emberStream.ts`) since the registry that hosted them is deleted. Keep `working|idle|error`.

> Note: `askEmber` stays the orchestration seam the acceptance test drives over a **stub transport** — never a real `claude` process.

---

## GATEWAYS / TRANSPORT

### New — one-shot `--bg` + transcript-tail transport (the real glue)
- **File (CREATE)**: `src/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.ts`
- **Unit test**: NONE for the I/O glue itself (humble object; same policy as the 189 transport, JSDoc-flagged). The behaviour above it is stub-tested. Add a unit test ONLY for any pure parsing helper it introduces.
- Design (`implements EmberAnswerTransportGateway`):
  1. **Dispatch** via the existing `ClaudeSessionGateway.dispatch(...)` (inject it — reuse `ClaudeSessionCliGateway`, do NOT re-implement `--bg` arg building). Build `DispatchInput`:
     - `prompt = options.question`
     - `flags = { model:'sonnet', permissionMode:'plan', systemPrompt: options.systemPrompt, mcpConfigJson: '{"mcpServers":{}}', allowedTools:'Read,Glob,Grep', disallowedTools:'Edit,Write,Bash,Task' }` (read-only enforced structurally: no write tools, plan mode). Confirm read-only tool set with operator (OPEN RISKS).
     - `localPath = options.projectPath`, `jobId` = generated Ember job id, `jobType` = an Ember/chat variant (verify `ClaudeSessionJobType` accepts it; see OPEN RISKS).
     - The `--` terminator is already handled inside `dispatch` (cli gateway lines 103-114) — nothing to add.
     - `dispatch` result: `dispatched`→ proceed to tail; `rate-limited`/`failed`→ return `{status:'failed', reason}` (route → UNAVAILABLE, retry visible). Covers `not logged in` (login failure surfaces as dispatch `failed`).
  2. **Tail transcript JSONL** at `join(homeDir,'.claude','projects', projectPath.replace(/\//g,'-'), \`${sessionId}.jsonl\`)` — reuse the EXACT path convention from `claudeSession.cli.gateway.ts:187-188`. Use `fs.watch`/poll-read (append-only tail): track byte offset, read new lines, parse each.
  3. **Parse lines** with the existing `parseStreamJsonEvent` + `extractText` + `isTurnComplete` helpers (`emberStreamJson.parser.ts`). Transcript `assistant`-typed lines carry text via `message.content[].text` → `extractText` already handles that branch. Emit `onChunk` per new assistant text segment. (For one-shot transcript there are no incremental deltas like interactive stream-json; expect whole-message `assistant` lines → emit each as a chunk. Acceptable: progressive at message granularity. Confirm framing — OPEN RISKS.)
  4. **Done detection** (primary): a terminal `result`-typed transcript line (`isTurnComplete` already returns true for `type:'result'`). On it → `onDone()` + stop tailing.
     **Fallback** (belt-and-suspenders, optional v1): poll `ClaudeSessionGateway.listAgents()` for terminal status of `sessionId` (pattern proven in `awaitSessionCompletion.usecase.ts:64`). Prefer transcript-only first to keep it simple; add polling fallback only if manual verification shows the `result` line is unreliable.
  5. **`cancel()`**: stop the tail loop AND `ClaudeSessionGateway.stop(sessionId)` (+ optional `remove`) to kill the bg agent. Called by the route on client `close` / on mid-stream `onError` so a retry starts clean.
  6. **Mid-stream failure**: transcript read error, parse-terminal-without-text, or watcher error → `onError('ember-answer-failed')` + auto-`cancel()`. Covers scenario `mid-stream failure`.
  7. **No API key**: relies on operator Claude OAuth login (subscription) exactly like the review `--bg` path — the dispatch inherits `process.env`. The API-key refusal is enforced one layer up in `askEmber` (unchanged).

### New stub — drives the acceptance/unit tests
- **File (CREATE)**: `src/tests/stubs/emberAnswerTransport.stub.ts` (`implements EmberAnswerTransportGateway`)
  - `respondWith(builder)` / `answerFromSystemPrompt()` (echo the system prompt so grounding traversal is proven — keep the 189 stub's clever trick), `failStart()` (→ `not logged in`), `failMidStream()` (chunks then `onError` → `mid-stream failure`), `startCount` counter. Streams answer word-by-word via `onChunk` then `onDone`, mirroring the deleted `emberSessionTransport.stub.ts`.
- **DELETE** `src/tests/stubs/emberSessionTransport.stub.ts` (old long-lived stub).

### Unchanged gateways
- `emberReadData.composite.gateway.ts` + `emberStreamJson.parser.ts` — reused as-is. The parser may need ONE added branch if the `--bg` transcript `assistant` line shape differs from the interactive shape; if so, extend `extractText`/add a transcript line schema and unit-test that branch.

---

## CONTROLLERS

### Modify — SSE route swaps registry for transport
- **File**: `src/modules/ember-chat/interface-adapters/controllers/http/emberChat.routes.ts`
- **Test**: `src/tests/units/modules/ember-chat/controllers/emberChat.routes.test.ts` (UPDATE)
- Changes:
  - `EmberChatRoutesOptions.registry: EmberSessionRegistry` → `transport: EmberAnswerTransportGateway`.
  - Pass `transport` into `askEmber` deps instead of `registry`.
  - **Keep** `reply.hijack()`, the `data: {...}\n\n` writer, `UNAVAILABLE_MESSAGE = '// EMBER INDISPONIBLE — réessayer'`, the `event: end` terminator, and the `request.raw.on('close', finish)` handler. The `close` handler must now also trigger the transport `cancel()` (kill bg session on client disconnect). Thread `run.cancel()` through — simplest: have `askEmber`'s `subscribe` expose cancellation, or have the route hold the `run` returned by `start`. Decide during impl (prefer the subscriber owning an `onClose`/cancel hook to keep the route dumb).
  - `onError` already writes UNAVAILABLE_MESSAGE → both `not logged in` and `mid-stream failure` render correctly. UNCHANGED logic.

---

## SERVICES (grounding)

### Modify — bound the grounding so large projects never fail
- **File**: `src/modules/ember-chat/services/emberSystemPrompt.ts`
- **Test**: `src/tests/units/modules/ember-chat/services/emberSystemPrompt.test.ts` (EXTEND)
- Change `buildEmberSystemPrompt` to **cap** the injected data:
  - `reviewScores`: keep aggregates (averages/totals) + only the **N most-recent reviews** (e.g. `MAX_RECENT_REVIEWS = 20`). Drop the long per-review tail; replace with a count summary (`"… et X reviews plus anciennes (résumé agrégé seulement)"`).
  - `jobHistory`: same — N most-recent jobs + counts.
  - `insights` / `worktrees`: cap array lengths similarly (small constant).
  - Keep it a **pure function** (sort by recency, slice, serialize). No new dependency. Constants defined at top of file, English-named.
  - This satisfies rule "Grounding must succeed regardless of project size" and scenario `large grounding`. The test feeds an oversized `ProjectStats` (many reviews) and asserts: (a) the prompt length is bounded under a ceiling, (b) the most-recent reviews are present, (c) aggregates are present.

---

## WIRING

### Modify — composition root
- **File**: `src/main/routes.ts` (~460-489)
- Changes:
  - REMOVE `EmberSessionRegistry` instantiation + the `setInterval(...onIdle...)` idle ticker (lines ~470-480).
  - REMOVE `EmberSessionTransportClaudeGateway` import + instantiation.
  - INSTANTIATE the new `EmberAnswerTransportClaudeGateway`, injecting a `ClaudeSessionCliGateway` (reuse the same runner used for review dispatch — verify the existing review composition for the runner instance; see OPEN RISKS) + `{ model:'sonnet', homeDir: homedir() }`.
  - Pass `transport` (not `registry`) into `app.register(emberChatRoutes, { transport, environment, readData, projectPath, now, logger })`.
  - Remove now-unused imports (`EmberSessionRegistry`, `EmberSessionTransportClaudeGateway`).

---

## DELETIONS (dead SPEC-189 machinery) — shown as a diff before applying

| File | Why |
|------|-----|
| `src/modules/ember-chat/usecases/emberSession/emberSessionRegistry.ts` | reuse/idle/revive registry — obsolete in one-shot model |
| `src/modules/ember-chat/entities/emberSession/emberSessionState.ts` | idle state machine — obsolete |
| `src/modules/ember-chat/entities/emberSession/emberSession.schema.ts` | only feeds the state machine (verify importers) |
| `src/modules/ember-chat/entities/emberSession/emberSessionTransport.gateway.ts` | long-lived handle port — replaced by `emberAnswerTransport.gateway.ts` |
| `src/modules/ember-chat/interface-adapters/gateways/emberSessionTransport.claude.gateway.ts` | interactive stdin `--input-format stream-json` transport — replaced by `--bg` one-shot |
| `src/tests/stubs/emberSessionTransport.stub.ts` | replaced by `emberAnswerTransport.stub.ts` |
| `src/tests/units/modules/ember-chat/usecases/emberSessionRegistry.test.ts` | tests deleted registry |
| `src/tests/units/modules/ember-chat/entities/emberSessionState.test.ts` | tests deleted state machine |

Tests to REWRITE (not delete): `askEmber.usecase.test.ts`, `emberChat.routes.test.ts`, `emberSystemPrompt.test.ts`, and the 189 acceptance test (superseded by 190 — keep the file but retarget it, or delete + replace; recommend retarget the *reuse* assertion out and let 190 acceptance own the suite). The `transport.spawnCount === 1` reuse assertion at lines 111-134 MUST be removed (one-shot starts once per question by design).

`emberStreamJson.parser.test.ts` — keep; extend only if a transcript branch is added.

---

## IMPLEMENTATION_ORDER

1. **`emberAnswerTransport.gateway.ts`** (port) — innermost contract; everything else depends on it. + delete old port.
2. **`emberAnswerTransport.stub.ts`** — needed to drive every test above the transport (start/fail/midstream/echo-prompt).
3. **`emberSystemPrompt.ts` bounding** (RED test first: oversized stats → bounded prompt) — pure, isolated, independently verifiable.
4. **`askEmber.usecase.ts`** rewrite (RED: stub transport drives streaming/working→idle, unavailable, billing-prevented) — the orchestration seam.
5. **`claudeSession.gateway.ts`** permissionMode widening (`'auto'|'plan'`) — unblocks the real transport flags.
6. **`emberAnswerTransport.claude.gateway.ts`** (real glue, no unit test) — dispatch + tail + done + cancel.
7. **`emberChat.routes.ts`** update (UPDATE route test: transport injected, client-close → cancel).
8. **Deletions** of 189 machinery + their tests (with the diff shown to operator first).
9. **`src/main/routes.ts`** wiring — LAST (composition root).
10. **190 acceptance test** authored FIRST in time (outer loop) but listed here as the GREEN gate verified last.

> SDD note: the 190 acceptance test is WRITTEN before step 1 (RED), stays RED through steps, GREEN at the end.

---

## SCENARIO → TEST MAP

| SPEC-190 scenario | Test |
|-------------------|------|
| `nominal` (streamed answer + status "idle") | acceptance 190 + `askEmber.usecase.test.ts` (stub `answerFromSystemPrompt`, assert answer contains grounded value + statuses `working`→`idle`) |
| `empty question` (rien envoyé) | `emberMessage.guard.test.ts` (existing, `trim().min(1)` rejects `""`) + route test (400 `invalid-question`) |
| `large grounding` (no failure) | `emberSystemPrompt.test.ts` (oversized `ProjectStats` → bounded prompt, recent N + aggregates present) |
| `not logged in` (UNAVAILABLE + retry) | `askEmber.usecase.test.ts` (stub `failStart` → `unavailable`) + route test (writes UNAVAILABLE_MESSAGE + `event: end`) + acceptance 190 |
| `mid-stream failure` (UNAVAILABLE + retry) | `askEmber.usecase.test.ts` (stub `failMidStream` → `onError`, status `error`) + route test + acceptance 190 |
| `api key present` (UNAVAILABLE) | `askEmber.usecase.test.ts` (env `hasAnthropicApiKey=true` → `billing-regression-prevented`, transport NOT started) + acceptance 190 |
| read-only invariant | structural (flags: plan mode, no write tools) — asserted in the real transport flags; documented, not unit-asserted (humble glue). Optionally assert the stub never exposes write capability. |

---

## ACCEPTANCE_TEST

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/190-ember-live-answers-subscription.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end. Drives askEmber over StubEmberAnswerTransportGateway (never a real claude process). Maps each SPEC-190 scenario: nominal grounded answer + working→idle, not-logged-in → unavailable + retry, mid-stream failure → unavailable + retry, api-key-present → billing-regression-prevented, large grounding → bounded prompt no failure. Reuse collectStream helper + projectStats/emberMessage factories."
  supersedes: "src/tests/acceptance/189-ember-readonly-review-chat.acceptance.test.ts (remove the session-reuse assertion; retarget to one-shot transport)"
```

---

## OPEN RISKS / MANUAL VERIFICATION

1. **Terminal-line shape in the `--bg` transcript** (the analogue of 189's flagged unknown). `isTurnComplete` treats `type:'result'` / `message_stop` as terminal, but it is UNVERIFIED that a one-shot `--bg` transcript JSONL actually writes a `result` line (vs. the agent simply going `completed` in `listAgents`). Manual verification against a live `claude` build required; if absent, fall back to `listAgents()` terminal-status polling (proven pattern). FLAG in the real gateway's JSDoc like the 189 file did.
2. **Assistant text framing in transcript** — confirm `--bg` transcript `assistant` lines carry text under `message.content[].text` (what `extractText` reads) and whether chunks are whole-message (coarse progressive) or deltas. Adjust `extractText`/add a transcript schema if needed.
3. **`ClaudeSessionJobType`** — verify it admits an Ember/chat value, or whether a generic value is acceptable. Not yet read: `claudeSession.schema.ts`. Resolve before step 6.
4. **`permissionMode: 'plan'`** — confirm the installed `claude` CLI accepts `plan` for `--permission-mode` and that it is genuinely read-only for a bg agent; otherwise use `default` + an empty/read-only `allowedTools` set as the structural guard. Confirm the exact read-only tool whitelist (`Read,Glob,Grep`?) with operator.
5. **Shared `ClaudeProcessRunner` instance** — the real review `--bg` path already constructs a `ClaudeSessionCliGateway` with a runner somewhere in `routes.ts` (not in the 460-489 window read). Reuse that instance for Ember rather than building a second one. Verify during wiring.
6. **`emberSession.schema.ts` importers** — confirm nothing outside the state machine imports it before deleting (grep `emberSession.schema`).
7. **Dashboard focus retention** (`empty question` client behaviour) — out of TS scope per spec "no UI change"; server-side guard is covered. Note only.

---

## REFERENCE_FILES

- `src/modules/ember-chat/usecases/askEmber/askEmber.usecase.ts` — seam to rewire; keep API-key guard.
- `src/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.ts` — reuse `dispatch(--bg)` + transcript path convention (lines 87-131, 183-188).
- `src/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.ts` — `DispatchInput`/`ClaudeDispatchFlags`; widen `permissionMode`.
- `src/modules/ember-chat/interface-adapters/gateways/emberStreamJson.parser.ts` — reuse `extractText`/`isTurnComplete`.
- `src/modules/ember-chat/services/emberSystemPrompt.ts` — add bounding.
- `src/modules/ember-chat/interface-adapters/controllers/http/emberChat.routes.ts` — swap registry→transport; keep SSE shape; add cancel-on-close.
- `src/modules/ember-chat/entities/emberSession/emberSessionTransport.gateway.ts` + `emberSessionTransport.claude.gateway.ts` — the deleted long-lived design to mirror (one-shot version).
- `src/modules/claude-invocation/usecases/awaitSessionCompletion.usecase.ts` — `listAgents` terminal-status polling pattern (done-detection fallback).
- `src/tests/stubs/emberSessionTransport.stub.ts` — template for the new one-shot stub.
- `src/tests/acceptance/189-ember-readonly-review-chat.acceptance.test.ts` — `collectStream` helper + scenario structure to retarget for 190.
- `src/main/routes.ts` (~460-489) — wiring to rewire.
```
```
