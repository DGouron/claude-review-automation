# PLAN — SPEC-187: Read setup wizard answers from stdin in JSON mode

> Spec: `docs/specs/187-setup-wizard-json-stdin-input.md`
> Branch: `feat/187-setup-wizard-json-stdin`
> Status: planned

```
PLAN:
  scope: setup-wizard-json-stdin-input
  is_new_module: false   # extends existing src/modules/setup-wizard/
```

## Summary

In `--json` mode the wizard must, for any step that needs an answer, emit an
`awaiting_input` event and then read exactly one JSON line from stdin instead of
calling inquirer (TTY). The cleanest implementation is a **new `PromptGateway`
implementation** (`PromptStdinJsonGateway`) that is selected by the composition
root when `args.json` is true, plus a tiny **injectable line-reader seam** so it
is unit-testable with a scripted feed. The existing steps already handle `-y`
themselves and never touch the prompt gateway in that mode, so SPEC-183 behaviour
is preserved without touching any step.

The single non-trivial coupling — the gateway needs the **current stepId** for
`emitAwaitingInput(stepId, prompt)` — is solved by having the orchestrator set a
`currentStepId` on `WizardContext` (it already iterates steps and calls
`emitStepStarted(step.id, …)` right before each step), and constructing the
stdin gateway with a getter that reads that field. This is the smallest
Clean-Architecture-correct change: no `PromptGateway` signature change, no
per-step rewrite, no new call sites in the 4 prompting steps.

Verified facts driving this plan:
- `emitAwaitingInput` exists on `WizardEventEmitter` / both emitters but is
  **never called by production code today** (`jsonWizardEventEmitter.ts:27`,
  `humanWizardEventEmitter.ts:34`; only tests reference it). SPEC-187 is the
  first real caller — via the stdin gateway.
- All 4 prompting steps already guard `flags.yes` BEFORE calling the prompt
  gateway (`addProject.step.ts:18,42`, `configurePipeline.step.ts:25,54`,
  `daemonInstall.step.ts:24`, `generateSecrets.step.ts:29`). So in `-y` mode the
  prompt gateway is never invoked; the `-y` scenario already passes from SPEC-183.
  We add a defensive throw in the gateway anyway (decision 6).
- The orchestrator (`orchestrateSetup.usecase.ts:59`) already calls
  `context.emitter.emitStepStarted(step.id, …)` before `step.execute` — the
  natural place to also record `context.currentStepId = step.id`.

## Design Decisions (the hard parts)

1. **stepId coupling** — The orchestrator sets `context.currentStepId = step.id`
   immediately before `emitStepStarted` (one new line). The stdin gateway is
   constructed in the composition root with a `() => StepId` getter closing over
   `context.currentStepId`. `PromptGateway` signatures are untouched; no step
   call site changes. (Rejected: extending `PromptGateway` with a stepId param →
   breaks 4 steps + TTY gateway + stub for no gain; rejected: per-step wrapper →
   more files, more wiring.)

2. **EOF / stream-close → blocked** — The line reader resolves with `null` on
   stream close. The gateway converts `null` into a thrown typed domain error
   `AwaitingInputClosedError` (new tiny entity error). It bubbles out of
   `step.execute`; the orchestrator wraps `step.execute(context)` in a
   `try/catch` that maps `AwaitingInputClosedError` to
   `blocked("Aucune réponse reçue, le setup est interrompu", <hint>)`. This keeps
   the gateway pure (no StepOutcome knowledge in interface-adapters) and the
   blocked-outcome construction stays in the application layer where
   `blocked()` lives (`stepOutcome.ts:21`).

3. **Re-announce loop** — On a malformed/wrong-shape/invalid-option answer the
   gateway emits a `warning` (refusal message) **and re-emits `awaiting_input`**,
   then reads the next line. Loop continues until a valid answer or EOF (no cap,
   per spec). Terminable in tests because the injected line reader is a finite
   scripted queue whose exhaustion = EOF = the blocked path (decision 2), so no
   test can hang.

4. **stdin reading is I/O → injectable seam** — Introduce a `LineReader`
   contract in entities: `interface LineReader { read(): Promise<string | null> }`
   (`null` = stream closed). Production impl wraps `readline.createInterface`
   over `process.stdin` (one line per `read()`); unit tests inject a scripted
   array-backed `StubLineReader`. The gateway depends only on the `LineReader`
   interface — Dependency Rule respected.

5. **value encoding + boundary validation** — One JSON line per answer, validated
   with Zod at the boundary:
   - `askText`: raw line is the value (NOT JSON-parsed); empty line → `defaultValue ?? ''`.
   - `askConfirm`: line must be exactly `true` or `false` (Zod boolean from
     `JSON.parse`); anything else → refuse `"Réponse invalide"` + re-announce.
   - `askChoice`: `JSON.parse(line)` must be a string AND ∈ offered values;
     not-a-string → `"Réponse invalide"`; valid string but not offered →
     `"Choix invalide, sélectionnez une option proposée"`.
   - `askMultiSelect`: `JSON.parse(line)` must be `string[]` with every element ∈
     offered values; shape error → `"Réponse invalide"`; unknown element →
     `"Sélection invalide, une valeur n'est pas proposée"`.
   - Any `JSON.parse` throw → `"Réponse illisible"` + re-announce.
   Validation lives in a new guard `answerLine.guard.ts` (offered-options check is
   a runtime closure over the choices passed to the method). Note: `askText`
   never `JSON.parse`es (a raw path like `/home/u/api` is not valid JSON) — the
   spec scenario `line:"{not json"` is the malformed case for shapes that DO
   parse; for text the only refusal is never (raw line always accepted, empty →
   default).

6. **non-interactive `-y` guard** — Wiring already prevents this: steps short-
   circuit `flags.yes` before prompting, so the TTY/stdin gateway is never called
   in `-y` mode (verified). To be defensive and satisfy the spec's exact message
   for any future step that forgets, the stdin gateway throws
   `NonInteractiveInputError("Mode non-interactif : aucune entrée disponible pour
   cette étape")` if constructed/called while `flags.yes` is true. The orchestrator
   `try/catch` maps it to `blocked(...)`. We pick the gateway-throw (not a separate
   `-y` gateway) because `-y` already implies the JSON-vs-TTY selection is moot —
   the gateway is simply never reached on the happy path, and the throw is a
   cheap safety net, not a new code path.

## ENTITIES

```
ENTITIES:
  - name: LineReader (contract, port)
    file: src/modules/setup-wizard/entities/lineReader/lineReader.gateway.ts
    test: (covered via gateway + stub; no logic to unit-test on the interface)
    note: interface LineReader { read(): Promise<string | null> }  // null = EOF

  - name: AnswerLine (validation guards for the 4 shapes)
    schema: src/modules/setup-wizard/entities/answerLine/answerLine.schema.ts
    guard:  src/modules/setup-wizard/entities/answerLine/answerLine.guard.ts
    test:   src/tests/units/modules/setup-wizard/entities/answerLine/answerLine.guard.test.ts
    note: Zod schemas — confirm = z.boolean(); choice = z.string(); multi = z.array(z.string()).
          Offered-option membership is checked in the gateway (runtime closure), not the schema.

  - name: PromptInputError (typed domain errors)
    file: src/modules/setup-wizard/entities/promptInputError/promptInputError.ts
    test: src/tests/units/modules/setup-wizard/entities/promptInputError/promptInputError.test.ts
    note: AwaitingInputClosedError, NonInteractiveInputError (named classes extending Error,
          identifiable via instanceof — no `as`). Used by gateway → caught by orchestrator.
```

> WizardContext gains `currentStepId: StepId | null` (modify existing file, not a new entity).

## USECASES

```
USECASES:
  - name: orchestrateSetup (MODIFY existing)
    file: src/modules/setup-wizard/usecases/orchestrateSetup.usecase.ts
    test: src/tests/units/modules/setup-wizard/usecases/orchestrateSetup.usecase.test.ts (extend)
    changes:
      - set context.currentStepId = step.id before emitStepStarted (decision 1)
      - wrap step.execute(context) in try/catch; map AwaitingInputClosedError and
        NonInteractiveInputError to blocked() outcomes (decisions 2 & 6)
    type: command (no signature change)
```

No new use case. The 4 prompting steps are **not modified** (they already call
`context.gateways.prompt.*` and already handle `-y`).

## GATEWAYS

```
GATEWAYS:
  - name: PromptStdinJsonGateway   (NEW — implements existing PromptGateway)
    contract: src/modules/setup-wizard/entities/prompt/prompt.gateway.ts (REUSED, unchanged)
    implementation: src/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.ts
    test: src/tests/units/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.test.ts
    constructor deps (injected): { lineReader: LineReader; emitter: WizardEventEmitter;
                                   currentStepId: () => StepId; isNonInteractive: () => boolean }
    methods: askText, askConfirm, askChoice, askMultiSelect
    behaviour per method: emitAwaitingInput(currentStepId(), prompt) → lineReader.read()
      → null ? throw AwaitingInputClosedError : validate(decision 5)
      → invalid ? emit warning(refusal) + loop : return value
    guards: -y check throws NonInteractiveInputError up front (decision 6)

  - name: NodeStdinLineReader   (NEW — implements LineReader)
    contract: src/modules/setup-wizard/entities/lineReader/lineReader.gateway.ts
    implementation: src/modules/setup-wizard/interface-adapters/gateways/lineReader.stdin.gateway.ts
    test: NOT unit-tested (thin readline wrapper over process.stdin = I/O boundary;
          covered indirectly + by acceptance). Documented as humble I/O object.
    methods: read(): Promise<string | null>

  - name: PromptTtyGateway (UNCHANGED — human mode regression baseline)
```

## CONTROLLERS / PRESENTERS / VIEWS

None. No controller, presenter, or view changes. (The HTTP route + child-process
gateway from SPEC-184 are out of scope — SPEC-184 Iteration B owns writing to the
child's stdin; current `setupProcess.childProcess.gateway.ts:86` uses
`stdio:['ignore',...]` and stays as-is.)

## WIRING

```
WIRING:
  file: src/main/commands/setup.command.ts
  changes:
    1. WizardContext now carries currentStepId — initialise to null in executeSetup (~line 61).
    2. buildGateways currently builds prompt unconditionally as PromptTtyGateway and
       does NOT have the emitter. Two viable shapes — PICK (A):
       (A) Move prompt selection out of buildGateways into executeSetup, AFTER the
           emitter is built (emitter built at setup.command.ts:59). executeSetup wires:
             context.gateways.prompt = args.json
               ? new PromptStdinJsonGateway({
                   lineReader: deps.buildLineReader(),
                   emitter,
                   currentStepId: () => context.currentStepId,
                   isNonInteractive: () => context.flags.yes,
                 })
               : new PromptTtyGateway();
           buildGateways drops the prompt field (or keeps a TTY default that
           executeSetup overrides). Add deps.buildLineReader: () => LineReader
           (default NodeStdinLineReader) so tests inject a stub.
       (B) Keep prompt in buildGateways but pass emitter+context getters in —
           requires threading emitter into buildGateways(args). Rejected: emitter
           is built separately by buildEmitter; threading it into buildGateways
           muddies the dependency seams.
    dependencies:
      - PromptStdinJsonGateway (json mode only)
      - NodeStdinLineReader (via new deps.buildLineReader factory, injectable)
```

## IMPLEMENTATION_ORDER

Walking skeleton = one prompt shape (text) crossing entity → gateway → orchestrator
→ acceptance, then fan out to the other 3 shapes and edge cases.

```
IMPLEMENTATION_ORDER:
  1. src/tests/acceptance/187-setup-wizard-json-stdin-input.acceptance.test.ts
     — SDD outer loop. Write FIRST, RED. Scripted line feed drives a full --json
       run that needs input (text answer) to completion. Reuse SPEC-183/184 stub
       wiring + StubLineReader.
  2. entities/lineReader/lineReader.gateway.ts (+ StubLineReader stub)
     — the injectable seam; nothing else compiles without it.
  3. entities/promptInputError/promptInputError.ts (+ test)
     — typed errors for EOF + non-interactive; needed by gateway & orchestrator.
  4. entities/answerLine/answerLine.schema.ts + .guard.ts (+ test)
     — boundary validation for confirm/choice/multi shapes.
  5. interface-adapters/gateways/prompt.stdinJson.gateway.ts (+ test)
     — the core. Drive each shape + each refusal/re-announce + EOF via StubLineReader.
       This is the bulk of the unit coverage (one test per spec scenario).
  6. entities/wizardContext/wizardContext.ts — add currentStepId field.
  7. usecases/orchestrateSetup.usecase.ts (+ extend test)
     — set currentStepId; try/catch → blocked mapping for both typed errors.
  8. interface-adapters/gateways/lineReader.stdin.gateway.ts
     — production readline wrapper (humble object, no unit test).
  9. main/commands/setup.command.ts — wire selection + buildLineReader (decision A).
 10. Run acceptance GREEN; add the human-mode regression assertion (decision: prove
     TTY path still calls PromptTtyGateway, never the stdin gateway, when json=false).
```

## ACCEPTANCE_TEST

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/187-setup-wizard-json-stdin-input.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end"
  cases (mirror spec scenarios + DoD):
    - full --json run with a scripted feed (text + choice + multiSelect + confirm)
      reaches done/completed (the DoD acceptance).
    - awaiting_input event emitted before each needed answer (no TTY call).
    - empty text line → default used.
    - choice not offered → refusal warning + re-announce, next valid line accepted.
    - multiSelect unknown value → refusal + re-announce.
    - malformed line → "Réponse illisible" + re-announce.
    - EOF before answer → step blocked "Aucune réponse reçue, le setup est interrompu".
    - REGRESSION: json=false uses PromptTtyGateway, stdin gateway never constructed,
      human prompt path unchanged (assert via a spy/stub on prompt selection).
    - -y + step needing input → blocked (already SPEC-183 behaviour; pin it here).
```

## FILE LIST (create vs modify)

CREATE (10):
1. `src/modules/setup-wizard/entities/lineReader/lineReader.gateway.ts`
2. `src/modules/setup-wizard/entities/promptInputError/promptInputError.ts`
3. `src/modules/setup-wizard/entities/answerLine/answerLine.schema.ts`
4. `src/modules/setup-wizard/entities/answerLine/answerLine.guard.ts`
5. `src/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.ts`
6. `src/modules/setup-wizard/interface-adapters/gateways/lineReader.stdin.gateway.ts`
7. `src/tests/stubs/setup-wizard/lineReader.stub.ts`
8. `src/tests/units/modules/setup-wizard/entities/promptInputError/promptInputError.test.ts`
9. `src/tests/units/modules/setup-wizard/entities/answerLine/answerLine.guard.test.ts`
10. `src/tests/units/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.test.ts`
11. `src/tests/acceptance/187-setup-wizard-json-stdin-input.acceptance.test.ts`

MODIFY (3):
1. `src/modules/setup-wizard/entities/wizardContext/wizardContext.ts` (+ currentStepId field)
2. `src/modules/setup-wizard/usecases/orchestrateSetup.usecase.ts` (set currentStepId + try/catch→blocked)
3. `src/main/commands/setup.command.ts` (mode-based prompt selection + buildLineReader)

Plus extend existing test (not a new file): `orchestrateSetup.usecase.test.ts`.

**Count: 11 create + 3 modify = 14 touched files.** Within the ≤15 target; no A/B
split needed. (Spec rated Small; estimate holds.)

## RISKS

- **TTY-mode regression (HIGH visibility, LOW likelihood)**: selection logic moves
  out of `buildGateways`. MUST have an explicit regression test proving `json=false`
  constructs `PromptTtyGateway` and never the stdin gateway (in IMPLEMENTATION_ORDER
  step 10 / acceptance). The existing SPEC-183 human-mode acceptance test is a
  secondary guard.
- **Hanging test**: a real `readline` over `process.stdin` would hang Vitest.
  Mitigated by the `LineReader` seam — unit + acceptance tests NEVER touch
  `process.stdin`; the production `NodeStdinLineReader` is the only file with real
  stdin and is intentionally not unit-tested.
- **stepId coupling correctness**: if a step calls the prompt gateway during
  `detect()` (before the orchestrator sets `currentStepId`), the getter would
  return the previous/`null` id. Verified: no step prompts in `detect()` — all
  prompt calls are inside `execute()`, which runs after `currentStepId` is set.
  Re-verify when adding the orchestrator change.
- **`-y` defensive throw vs existing step guards**: the throw is a safety net only;
  the happy path never reaches it because steps short-circuit `flags.yes`. Ensure
  the throw message matches the spec verbatim so the (currently theoretical) path
  is correct if a future step forgets the guard.
- **No new runtime dependency**: `readline` is a Node built-in; `zod` already used.
  No package.json change.

## NEW-DEPENDENCY FLAGS

None. `node:readline` (built-in) + `zod` (already present). No `package.json` edit.

## REFERENCE_FILES

- `src/modules/setup-wizard/entities/prompt/prompt.gateway.ts` — the contract to re-implement (unchanged).
- `src/modules/setup-wizard/interface-adapters/gateways/prompt.tty.gateway.ts` — the human-mode sibling / regression baseline.
- `src/modules/setup-wizard/services/jsonWizardEventEmitter.ts` — `emitAwaitingInput` shape (`{step,status:"awaiting_input",prompt}`).
- `src/modules/setup-wizard/services/wizardEventEmitter.ts` — emitter interface (warning + awaitingInput).
- `src/modules/setup-wizard/usecases/orchestrateSetup.usecase.ts` — where currentStepId is set + where blocked mapping goes (lines 47-86).
- `src/modules/setup-wizard/entities/wizardContext/wizardContext.ts` — add `currentStepId`.
- `src/modules/setup-wizard/entities/stepOutcome/stepOutcome.ts` — `blocked()` factory used for EOF/-y mapping.
- `src/modules/setup-wizard/usecases/steps/addProject.step.ts`, `configurePipeline.step.ts`, `daemonInstall.step.ts`, `generateSecrets.step.ts` — confirm prompt usage + existing `-y` short-circuits (no edits).
- `src/main/commands/setup.command.ts` — composition root, `buildGateways`/`buildEmitter`/`executeSetup`.
- `src/tests/stubs/setup-wizard/prompt.stub.ts` — stub pattern to mirror for `StubLineReader`.
- `src/tests/acceptance/183-setup-wizard.acceptance.test.ts` — acceptance harness/stub wiring to copy (`jsonLines`, stub map, tmp state file).
- `src/shared/foundation/guard.base.ts` — `createGuard(schema, instigator)` for answerLine guard.
```
