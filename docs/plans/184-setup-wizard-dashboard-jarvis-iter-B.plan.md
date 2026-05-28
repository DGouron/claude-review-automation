# Plan — SPEC-184 Iteration B: Setup Wizard interactive forms + `POST /api/setup/input`

Branch: `feat/184b-setup-wizard-forms` (worktree). Iteration A (read-only live view) is on master.
This plan adds the interactive input half: stdin-writable subprocess, the `POST /api/setup/input`
endpoint, self-describing `awaiting_input` events, and the dashboard forms.

Planning only — no production code written here.

---

## Gap resolutions (decided)

### Gap 1 — dashboard cannot know the prompt kind/options → **Option A: self-describing `awaiting_input` events**

Extend the `awaiting_input` event with `kind` + `options` so the dashboard renders the right
form with the right options, fully decoupled from per-step knowledge.

**Why A over B:**
- The browser is a humble object; baking per-step prompt schemas into JS (Option B) couples the
  view to backend step internals and breaks the Iteration A split where the view never knows
  domain specifics. Any future step change would silently desync the form.
- The backend already holds the kind + `PromptChoice[]` at the call site (`addProject.step.ts`,
  `configurePipeline.step.ts`, etc.). Forwarding them is cheaper than re-deriving them client-side.
- Self-describing events keep the boundary Zod schema as the single source of truth and let the
  acceptance test assert one contract.

**Shape after change** (new optional-by-status fields, additive — existing 7 shapes untouched
except `awaiting_input`):
```
{ step, status: "awaiting_input", prompt, kind, options }
  kind:    "text" | "confirm" | "choice" | "multiSelect"
  options: PromptOption[]   // [] for text/confirm; the PromptChoice[] for choice/multiSelect
                            // text default carried as a single option { value: <default> } (see note)
```
- `kind` is a 4-value enum mirrored from `PromptGateway`'s 4 ask methods.
- `options` reuses the existing `PromptChoice` shape `{ label, value }` from
  `prompt.gateway.ts`. New boundary type `PromptOption` = Zod mirror of `PromptChoice`.
- text default: keep the `askText` default value out of `options`; carry it as `defaultValue: string | null`
  on the event so the form can use it as placeholder (matches `askText(prompt, defaultValue)`).
  Final awaiting_input shape: `{ step, status, prompt, kind, options, defaultValue }`.

**Emitter signature change** (the in-module SPEC-187 evolution we own):
- `WizardEventEmitter.emitAwaitingInput(stepId, prompt)` →
  `emitAwaitingInput(stepId, prompt, kind, options, defaultValue)`.
  `JsonWizardEventEmitter` serializes all five; `HumanWizardEventEmitter` keeps printing only the
  prompt line (ignores the extra args — TTY behaviour unchanged).
- `PromptStdinJsonGateway`'s 4 ask methods pass their kind + choices (+ default for text) into
  `emitAwaitingInput`. `requestLine`/`requestValidated` gain the kind/options/default parameters
  so each ask method forwards them.

This is acceptable in-module evolution of the just-merged SPEC-187. It ripples into 3 existing
tests (see RISKS).

### Gap 2 — stdin not writable → spawn piped + `writeLine` + registry `submitInput` + endpoint

- `SetupProcessChildProcessGateway.spawn`: `stdio: ['ignore','pipe','pipe']` → `['pipe','pipe','pipe']`.
- `SetupProcessHandle` contract gains `writeLine(line: string): void` (writes `line + "\n"` to child stdin).
  Impl: `ChildProcessSetupHandle` holds a `Writable` stdin and writes; type becomes
  `ChildProcessByStdio<Writable, Readable, Readable>`.
- `SetupRunRegistry.submitInput(runId, line): SubmitInputResult` — validates the run is the active
  one and not exited, calls `handle.writeLine(line)`; returns `{ status: 'written' }` |
  `{ status: 'no-active-run' }`.
- `POST /api/setup/input` controller: Zod body `{ runId: string; value: SetupInputValue }`,
  maps `value` → exact stdin line the SPEC-187 gateway parses, calls `registry.submitInput`.

**stdin line contract (verified against `prompt.stdinJson.gateway.test.ts`):**

| kind | gateway reads | stdin line written |
|------|---------------|--------------------|
| text | raw line (not JSON) | the raw string, e.g. `/home/u/api` (empty → default applies) |
| confirm | JSON boolean | `true` / `false` |
| choice | JSON string | `"backend"` |
| multiSelect | JSON array | `["solid","testing"]` |

So the `POST /api/setup/input` payload-to-line mapping is **kind-driven**:
- text → write `value` verbatim
- confirm → `JSON.stringify(boolean)`
- choice → `JSON.stringify(string)`
- multiSelect → `JSON.stringify(string[])`

Encapsulated in a tiny boundary entity `setupInput` (Zod discriminated union on `kind` →
serializer), so both the controller and the acceptance test share one mapping and it stays
typed without `as`.

## File list by layer (create vs modify + counts)

**CREATE (13):**
1. `src/modules/setup-wizard/entities/setupInput/setupInput.schema.ts` — Zod discriminated union `{ kind, value }` + `serializeSetupInput` line mapper.
2. `src/modules/setup-wizard/entities/setupInput/setupInput.guard.ts` — guard (parse/safeParse/isValid/type guard).
3. `src/modules/setup-wizard/entities/promptOption/promptOption.schema.ts` — boundary mirror of `PromptChoice` `{ label, value }` + `promptKindSchema` enum.
4. `src/tests/units/modules/setup-wizard/entities/setupInput/setupInput.test.ts`
5. `src/tests/units/modules/setup-wizard/entities/setupInput/setupInput.guard.test.ts`
6. `src/tests/factories/setupInput.factory.ts`
7. `src/tests/units/modules/setup-wizard/interface-adapters/controllers/http/setupInput.routes.test.ts` — (or extend existing routes test; see note) covering `POST /api/setup/input`.
8. `src/dashboard/modules/setupWizardForms.js` — humble object: awaiting_input view-model → form render + POST payload builder (pure functions).
9. `src/tests/units/dashboard/modules/setupWizardForms.test.ts`
10. `src/tests/acceptance/184-setup-wizard-forms.acceptance.test.ts` — SDD outer loop.
11. (B2 view glue, untested per Iteration A pattern — counted, not a unit) covered by edits to existing files; no new prod file beyond #8.
12. (reserved) `src/tests/units/modules/setup-wizard/entities/promptOption/promptOption.test.ts` — only if `promptOption` carries logic beyond a passthrough schema; otherwise fold into setupInput tests. Default: SKIP (YAGNI) unless guard added.
13. (reserved) factory extension for awaiting_input lives in existing `wizardStreamEvent.factory.ts` (MODIFY) — no new file.

Net new files after YAGNI pruning of #11–#13: **9 create**
(#1 #2 #3 #4 #5 #6 #7 #8 #9 #10) — #10 is the acceptance test.

**MODIFY (11):**
1. `src/modules/setup-wizard/services/wizardEventEmitter.ts` — extend `emitAwaitingInput` signature.
2. `src/modules/setup-wizard/services/jsonWizardEventEmitter.ts` — serialize kind/options/defaultValue.
3. `src/modules/setup-wizard/services/humanWizardEventEmitter.ts` — accept (ignore) new args.
4. `src/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.ts` — forward kind/choices/default into emit.
5. `src/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.schema.ts` — extend `awaitingInputEventSchema` (+ kind/options/defaultValue). Guard unchanged (re-derives).
6. `src/modules/setup-wizard/entities/setupProcess/setupProcess.gateway.ts` — add `writeLine` to handle contract.
7. `src/modules/setup-wizard/interface-adapters/gateways/setupProcess.childProcess.gateway.ts` — pipe stdin + implement `writeLine`.
8. `src/modules/setup-wizard/usecases/streamSetupRun.usecase.ts` — add `submitInput`.
9. `src/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.ts` — add `POST /api/setup/input`.
10. `src/dashboard/modules/setupWizardStream.js` — wire form render + submit + clear-on-next-event (thin glue).
11. `src/main/routes.ts` — no new instantiation needed (registry already wired); confirm `POST /api/setup/input` is served by the same `setupWizardRoutes` plugin. **No change** unless the plugin signature changes — likely **0 edit** here.

**MODIFY tests/factories/stubs (5):**
12. `src/tests/factories/wizardStreamEvent.factory.ts` — `awaitingInput` carries kind/options/defaultValue.
13. `src/tests/stubs/setupProcess.stub.ts` — `writeLine` + `writtenLines: string[]` recorder.
14. `src/tests/units/modules/setup-wizard/services/jsonWizardEventEmitter.test.ts` — update `emitAwaitingInput` call + assert new fields.
15. `src/tests/units/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.test.ts` — `RecordingEmitter.emitAwaitingInput` new signature.
16. `src/tests/units/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.guard.test.ts` — add awaiting_input-with-kind acceptance case.
17. `src/tests/units/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.test.ts` — if folding `POST /api/setup/input` here instead of a new file (then drop CREATE #7).
18. `setup.html` (`src/dashboard/setup.html`) — mount point/script include for forms if not already present (verify; likely a script tag add).

**Decision on routes test split:** fold the new endpoint into the existing
`setupWizard.routes.test.ts` (MODIFY #17) rather than a new file (drop CREATE #7), since both
endpoints share the same plugin + Fastify harness. → Net **8 create**, **~12 modify**.

**Total touched ≈ 20 files** → exceeds the ~18 soft cap → **split into B1 / B2 (below).**

## Proposed split (B1 / B2)

Two commits, both independently shippable and each ending green.

### B1 — Backend duplex: stdin write + endpoint + self-describing events
Delivers `POST /api/setup/input` end-to-end at the backend boundary (no UI). The acceptance
test for B1 drives the run via the registry + a fake process and asserts the written stdin line.

- MODIFY: `wizardEventEmitter.ts`, `jsonWizardEventEmitter.ts`, `humanWizardEventEmitter.ts`,
  `prompt.stdinJson.gateway.ts`, `wizardStreamEvent.schema.ts`,
  `setupProcess.gateway.ts`, `setupProcess.childProcess.gateway.ts`,
  `streamSetupRun.usecase.ts`, `setupWizard.routes.ts`.
- CREATE: `setupInput.schema.ts`, `setupInput.guard.ts`, `promptOption.schema.ts` + their tests,
  `setupInput.factory.ts`.
- MODIFY tests/doubles: `wizardStreamEvent.factory.ts`, `setupProcess.stub.ts`,
  `jsonWizardEventEmitter.test.ts`, `prompt.stdinJson.gateway.test.ts`,
  `wizardStreamEvent.guard.test.ts`, `setupWizard.routes.test.ts`.
- Acceptance (B1 slice): `184-setup-wizard-forms.acceptance.test.ts` — fake process emits
  awaiting_input(kind/options) → `POST /api/setup/input` writes the expected line → run advances.

### B2 — Frontend forms
Delivers the 4 form shapes wired into the live view.

- CREATE: `src/dashboard/modules/setupWizardForms.js` + `setupWizardForms.test.ts`.
- MODIFY: `setupWizardStream.js` (render/submit/clear glue), `setup.html` (script include / mount),
  `setupWizard.js` (only if the awaiting_input row must expose a form anchor — likely a small
  hook; otherwise untouched).
- Extends the same acceptance test with the "form model produces the right payload" assertion
  (pure-function call, no DOM), so the outer loop covers both halves.

## ENTITIES

- **PromptOption** (boundary type) — `entities/promptOption/promptOption.schema.ts`
  - `promptOptionSchema = z.object({ label: z.string(), value: z.string() })`
  - `promptKindSchema = z.enum(['text','confirm','choice','multiSelect'])`
  - Types `PromptOption`, `PromptKind`. Mirrors `PromptChoice` so the event boundary stays Zod-typed.
  - No guard needed unless reused at an input boundary; default no separate guard (folded into schema).

- **SetupInput** (boundary command) — `entities/setupInput/setupInput.{schema,guard}.ts`
  - Discriminated union on `kind`:
    - `{ kind: 'text', value: string }`
    - `{ kind: 'confirm', value: boolean }`
    - `{ kind: 'choice', value: string }`
    - `{ kind: 'multiSelect', value: string[] }`
  - `serializeSetupInput(input: SetupInput): string` — pure mapper to the stdin line per the
    contract table. The single place that knows text=raw / others=JSON.
  - Guard exports parse/safeParse/isValid/type guard (standard pattern). Validates the
    `POST /api/setup/input` body shape (`{ runId, ...setupInput }` or `{ runId, value, kind }`).
  - test: `setupInput.test.ts` (serializer per kind, incl. empty-string text), `setupInput.guard.test.ts`.
  - factory: `setupInput.factory.ts` (`SetupInputFactory.text/confirm/choice/multiSelect`).

- **WizardStreamEvent.awaiting_input** (MODIFY boundary schema) —
  `entities/wizardStreamEvent/wizardStreamEvent.schema.ts`
  - `awaitingInputEventSchema` gains `kind: promptKindSchema`, `options: z.array(promptOptionSchema)`,
    `defaultValue: z.string().nullable()`.
  - Keep them required in the emitted shape but tolerant in the guard if needed (decide: make them
    required — the emitter always sets them; Iteration A no longer emits the old 3-field shape).
  - guard file unchanged (re-derives from schema).
  - test: `wizardStreamEvent.guard.test.ts` add an awaiting_input-with-kind case + reject malformed kind.

## USECASES

- **SetupRunRegistry.submitInput** (MODIFY) — `usecases/streamSetupRun.usecase.ts`
  - `submitInput(runId: string, line: string): SubmitInputResult`
  - `SubmitInputResult = { status: 'written' } | { status: 'no-active-run' }`
  - Guards: active run exists, matches `runId`, not exited → `handle.writeLine(line)`.
  - Does NOT serialize — receives the already-serialized line from the controller (keeps the
    registry transport-agnostic; mapping is the boundary entity's job).
  - test: extend `streamSetupRun.usecase.test.ts` — writes to the active handle / rejects unknown
    or exited run.

## GATEWAYS

- **SetupProcessHandle.writeLine** (MODIFY contract) — `entities/setupProcess/setupProcess.gateway.ts`
  - add `writeLine(line: string): void`.
- **SetupProcessChildProcessGateway** (MODIFY impl) —
  `interface-adapters/gateways/setupProcess.childProcess.gateway.ts`
  - `stdio: ['pipe','pipe','pipe']`; handle type → `ChildProcessByStdio<Writable, Readable, Readable>`.
  - `writeLine(line)` → `this.child.stdin.write(line + '\n')`.
  - test: extend `setupProcess.childProcess.gateway.test.ts` — spawned child echoes stdin lines;
    assert a line written via `writeLine` is received by the child. (Uses a small node `-e` echo
    script as the fake process, mirroring the existing spawn test.)
- **StubSetupProcessGateway** (MODIFY stub) — `src/tests/stubs/setupProcess.stub.ts`
  - `StubSetupProcessHandle.writeLine(line)` pushes to `writtenLines: string[]`; expose
    `lastWrittenLine` / `writtenLines` on the gateway for assertions.

## CONTROLLERS

- **POST /api/setup/input** (MODIFY) —
  `interface-adapters/controllers/http/setupWizard.routes.ts`
  - Zod body: `{ runId: z.string().min(1) }` merged with the `setupInput` discriminated union
    (`{ kind, value }`). 400 on invalid body.
  - `serializeSetupInput(input)` → `registry.submitInput(runId, line)`.
  - 200 `{ status: 'written' }`; 409/404 `{ error: 'no-active-run' }` when registry says so.
  - No new dependency injected — uses the already-injected `registry`.
  - test: fold into `setupWizard.routes.test.ts` — start a run, POST each of the 4 kinds, assert
    `processGateway.lastWrittenLine` equals the contract line; POST to unknown runId → error.

## SERVICES (event emitters)

- **WizardEventEmitter** (MODIFY) — `services/wizardEventEmitter.ts`
  - `emitAwaitingInput(stepId, prompt, kind: PromptKind, options: PromptOption[], defaultValue: string | null): void`
- **JsonWizardEventEmitter** (MODIFY) — `services/jsonWizardEventEmitter.ts`
  - emits `{ step, status:'awaiting_input', prompt, kind, options, defaultValue }`.
- **HumanWizardEventEmitter** (MODIFY) — `services/humanWizardEventEmitter.ts`
  - accepts the new params, still prints only `? <prompt>` (TTY unchanged).
- **PromptStdinJsonGateway** (MODIFY) —
  `interface-adapters/gateways/prompt.stdinJson.gateway.ts`
  - `askText` → emit kind `'text'`, options `[]`, default `defaultValue ?? null`.
  - `askConfirm` → kind `'confirm'`, options `[]`, default `null`.
  - `askChoice` → kind `'choice'`, options = choices, default `null`.
  - `askMultiSelect` → kind `'multiSelect'`, options = choices, default `null`.
  - `requestLine`/`requestValidated` carry the kind/options/default through to the emit call.

## VIEWS (dashboard humble objects)

- **setupWizardForms.js** (CREATE) — pure functions, no DOM, no globals:
  - `buildFormViewModel(event)` — awaiting_input event → `{ stepId, prompt, kind, options, defaultValue }`
    or `null` if not an awaiting_input event.
  - `buildSubmitPayload(kind, rawInput)` — form field value(s) → `POST /api/setup/input` body
    `{ runId, kind, value }` (value typed per kind: string / boolean / string / string[]).
  - `renderForm(viewModel)` — returns HTML string for the 4 shapes:
    text (input + default as placeholder), confirm (Confirm/Cancel buttons),
    choice (radio/card grid from options), multiSelect (checkbox grid from options).
    Keyboard-reachable (native inputs/buttons, tabindex order = DOM order), no mouse-only path.
  - test: `setupWizardForms.test.ts` — view-model extraction per kind; payload builder per kind
    (incl. multiSelect array + empty text); render contains the option labels + `// ` prefix +
    corner brackets; reduced-motion path is static (no animation classes that gate input).
- **setupWizardStream.js** (MODIFY) — thin glue: on an awaiting_input event, call
  `buildFormViewModel` + `renderForm`, inject under the matching step row; on submit, build payload
  via `buildSubmitPayload` and `fetch('/api/setup/input', POST)`; clear the form when the next SSE
  event for that step (or any subsequent event) arrives. No branching logic beyond delegation.
- **setupWizard.js** (MODIFY, only if needed) — expose a stable anchor element/`data-` hook on the
  awaiting_input row so the stream glue can mount the form deterministically. Prefer reusing the
  existing `setup-step-message` slot → likely **no change**.
- **setup.html** (MODIFY) — include `setupWizardForms.js` (module script) + a live-region note
  reused from Iteration A; verify ARIA live region already announces status changes.

## WIRING

- `src/main/routes.ts`: **no new instantiation** — `POST /api/setup/input` is served by the
  existing `setupWizardRoutes` plugin which already receives the `registry`. Confirm during impl
  that the plugin options are unchanged. Composition root edit expected: **0** (or trivial).

## IMPLEMENTATION_ORDER

Inside-out, B1 then B2. Walking skeleton = first vertical slice crossing Entity → Use case →
Controller → acceptance (the "submit one input line and the run advances" path).

**B1**
1. `entities/promptOption/promptOption.schema.ts` — kind enum + option mirror (no deps).
2. `entities/setupInput/setupInput.schema.ts` + serializer — RED `setupInput.test.ts` first.
3. `entities/setupInput/setupInput.guard.ts` — RED `setupInput.guard.test.ts`.
4. `entities/wizardStreamEvent/wizardStreamEvent.schema.ts` — extend awaiting_input; RED guard test.
5. `entities/setupProcess/setupProcess.gateway.ts` — add `writeLine` to contract (type only).
6. `services/wizardEventEmitter.ts` + `jsonWizardEventEmitter.ts` + `humanWizardEventEmitter.ts` —
   extend signature; RED-update `jsonWizardEventEmitter.test.ts`.
7. `interface-adapters/gateways/prompt.stdinJson.gateway.ts` — forward kind/options/default;
   update `prompt.stdinJson.gateway.test.ts` RecordingEmitter.
8. `usecases/streamSetupRun.usecase.ts` — `submitInput`; RED test in `streamSetupRun.usecase.test.ts`
   (uses extended `setupProcess.stub.ts`).
9. `interface-adapters/gateways/setupProcess.childProcess.gateway.ts` — pipe stdin + `writeLine`;
   RED `setupProcess.childProcess.gateway.test.ts`.
10. `interface-adapters/controllers/http/setupWizard.routes.ts` — `POST /api/setup/input`;
    RED in `setupWizard.routes.test.ts`. **← walking skeleton GREEN.**
11. `src/tests/factories/setupInput.factory.ts`, extend `wizardStreamEvent.factory.ts`,
    extend `setupProcess.stub.ts` (created alongside the tests that need them, steps 2/8).
12. Acceptance `184-setup-wizard-forms.acceptance.test.ts` (B1 slice): RED at start, GREEN at end of B1.

**B2**
13. `src/dashboard/modules/setupWizardForms.js` — RED `setupWizardForms.test.ts` (pure functions).
14. `src/dashboard/modules/setupWizardStream.js` — wire render/submit/clear (glue, browser-only).
15. `src/dashboard/setup.html` — script include + ARIA verify.
16. Extend the acceptance test with the form-payload assertion → final GREEN.

## ACCEPTANCE_TEST

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/184-setup-wizard-forms.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end"
  shape:
    - Wire SetupRunRegistry over StubSetupProcessGateway behind the real setupWizardRoutes plugin.
    - Fake process emits an awaiting_input event with kind+options (e.g. choice [github|gitlab]).
    - The dashboard form model (buildFormViewModel + buildSubmitPayload) produces { kind, value }
      for that event (pure-function assertion — no DOM).
    - POST /api/setup/input with that payload → assert processGateway.lastWrittenLine equals the
      exact stdin line the SPEC-187 gateway parses ('"github"' for choice, true/false for confirm,
      raw string for text, JSON array for multiSelect).
    - Fake process then emits the next event (e.g. step succeeded) → the run advances.
```

## REFERENCE_FILES

- `src/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.ts` — exact line
  contract each kind parses (text=raw, others=JSON). Load-bearing for the payload mapping.
- `src/tests/units/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.test.ts`
  — pins the stdin line shapes per kind; the acceptance test must match these byte-for-byte.
- `src/modules/setup-wizard/services/{wizardEventEmitter,jsonWizardEventEmitter,humanWizardEventEmitter}.ts`
  — the emitter triad whose `emitAwaitingInput` signature changes (Gap 1).
- `src/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.schema.ts` — boundary
  schema to extend; the routes `parseLine` re-validates against it, so the new fields must pass.
- `src/modules/setup-wizard/usecases/steps/{addProject,configurePipeline,daemonInstall,generateSecrets}.step.ts`
  — call sites proving which kind + choices each prompting step passes (text+choice / choice+multiSelect+choice / confirm / confirm).
- `src/modules/setup-wizard/usecases/streamSetupRun.usecase.ts` + `entities/setupProcess/setupProcess.gateway.ts`
  + `interface-adapters/gateways/setupProcess.childProcess.gateway.ts` — Gap 2 surface (stdin write).
- `src/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.ts` — where the
  new endpoint lands; existing start/events/state patterns to mirror (Zod body, reply codes).
- `src/dashboard/modules/{setupWizard,setupWizardStream}.js` — Iteration A pure/glue split to
  preserve for B2.
- `src/tests/{factories/wizardStreamEvent.factory.ts,stubs/setupProcess.stub.ts}` — doubles to extend.
- `src/main/routes.ts:443-451` — confirms the registry is already wired (no new DI expected).

## RISKS

1. **Iteration A SSE/render regression (LOW-MED).** The routes `parseLine` re-validates every line
   against `wizardStreamEventGuard`; making awaiting_input fields *required* in the schema means any
   producer (or buffered replay) emitting the old 3-field shape would be dropped. Mitigation: ship
   the emitter change and schema change together (same commit B1); the only producer is the
   in-repo emitter triad. Iteration A view (`setupWizard.js` `messageFromEvent`) reads `prompt`
   only — additive fields don't break it.
2. **SPEC-187 TTY mode + existing tests (MED).** Changing `emitAwaitingInput`'s signature ripples
   into 3 existing tests that implement/call the old 2-arg form:
   - `jsonWizardEventEmitter.test.ts` (calls `emitAwaitingInput('add-project', 'Chemin du projet ?')`)
   - `prompt.stdinJson.gateway.test.ts` (`RecordingEmitter.emitAwaitingInput(stepId, prompt)`)
   - `orchestrateSetup.usecase.test.ts:64` (`RecordingEmitter.emitAwaitingInput(): void {}` — no-arg
     body is structurally compatible with a widened signature, so likely no edit, but verify).
   Verified exhaustively by grep: exactly 2 prod implementers (`JsonWizardEventEmitter`,
   `HumanWizardEventEmitter`) + the interface + 1 caller (`prompt.stdinJson.gateway.ts:94`) + 2 test
   doubles. These are in-module SPEC-187
     tests → updating them is acceptable evolution, but they MUST stay green. `HumanWizardEventEmitter`
     behaviour (TTY output) must be byte-identical — assert it ignores the new args.
3. **Event-schema change rippling into the Iteration A guard/factory tests (MED).**
   `wizardStreamEvent.guard.test.ts` and `wizardStreamEvent.factory.ts` encode the old awaiting_input
   shape; both MUST be updated in B1. The dashboard `setupWizardStream.test.ts`/`setupWizard.test.ts`
   only assert `step`/`status`/`prompt` → should stay green, verify.
4. **stdin pipe lifecycle (LOW).** With `stdin: 'pipe'`, writing after the child exits throws EPIPE.
   `submitInput` already guards `!exited`; also wrap `writeLine` defensively (no throw on a dead
   stream). The childProcess spawn test should cover write-after-exit = no-op.
5. **Multi-tab write contention (LOW, out of scope to fully solve).** Two tabs could both POST input
   for the same run. Single-active-run + single stdin means last-write-wins; Iteration A already
   shows a read-only notice in secondary tabs. No new guarantee added in B; flag only.
6. **Payload/line mismatch (HIGH if wrong, fully mitigated).** The whole feature breaks silently if
   the serialized line doesn't match what `PromptStdinJsonGateway` parses (text raw vs JSON-wrapped
   is the trap). Mitigated by deriving the contract directly from `prompt.stdinJson.gateway.test.ts`
   and asserting it in the acceptance test.

## NEW DEPENDENCIES

- **None.** Uses node `child_process` (already used), Fastify, Zod — all in-tree. No `lottie-web`,
  no new packages. Frontend forms are vanilla DOM (matching Iteration A).
