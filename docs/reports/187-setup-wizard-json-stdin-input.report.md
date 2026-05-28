# Implementation Report — SPEC-187: Read setup wizard answers from stdin in JSON mode

> Spec: `docs/specs/187-setup-wizard-json-stdin-input.md`
> Plan: `docs/plans/187-setup-wizard-json-stdin-input.plan.md`
> Branch: `feat/187-setup-wizard-json-stdin`

## Status

COMPLETE — acceptance GREEN, full `yarn verify` GREEN, self-review clean (0 violations).

## Summary

In `--json` mode the setup wizard now announces it is waiting (`awaiting_input`)
and reads each answer as one JSON line from standard input instead of calling the
interactive TTY prompt. The implementation is a new `PromptGateway` implementation
(`PromptStdinJsonGateway`) selected by the composition root when `args.json` is
true, plus an injectable `LineReader` seam so the gateway is unit-testable with a
scripted feed. This is the first real caller of `emitAwaitingInput`. The human
(non-JSON) prompt path is untouched, proven by a regression test.

## Files created (11)

| File | Description |
|------|-------------|
| `src/modules/setup-wizard/entities/lineReader/lineReader.gateway.ts` | `LineReader` port — `read(): Promise<string \| null>` (null = EOF) |
| `src/modules/setup-wizard/entities/promptInputError/promptInputError.ts` | Typed domain errors: `AwaitingInputClosedError`, `NonInteractiveInputError` (verbatim French messages, `instanceof`-identifiable) |
| `src/modules/setup-wizard/entities/answerLine/answerLine.schema.ts` | Zod schemas for confirm / choice / multiSelect shapes |
| `src/modules/setup-wizard/entities/answerLine/answerLine.guard.ts` | Boundary guards via `createGuard` |
| `src/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.ts` | Core gateway — announce, read one line, validate per shape, re-announce loop on refusal, EOF/-y throws |
| `src/modules/setup-wizard/interface-adapters/gateways/lineReader.stdin.gateway.ts` | Production `node:readline` wrapper over `process.stdin` (humble I/O object, not unit-tested) |
| `src/tests/stubs/setup-wizard/lineReader.stub.ts` | `StubLineReader` — finite scripted queue; exhaustion → null (EOF) |
| `src/tests/units/modules/setup-wizard/entities/promptInputError/promptInputError.test.ts` | 4 tests |
| `src/tests/units/modules/setup-wizard/entities/answerLine/answerLine.guard.test.ts` | 6 tests |
| `src/tests/units/modules/setup-wizard/interface-adapters/gateways/prompt.stdinJson.gateway.test.ts` | 15 tests (one per spec scenario for the gateway) |
| `src/tests/acceptance/187-setup-wizard-json-stdin-input.acceptance.test.ts` | 8 acceptance tests (SDD outer loop) |

## Files modified (4)

| File | Change |
|------|--------|
| `src/modules/setup-wizard/entities/wizardContext/wizardContext.ts` | Added `currentStepId: StepId \| null` |
| `src/modules/setup-wizard/usecases/orchestrateSetup.usecase.ts` | Set `context.currentStepId = step.id` before `emitStepStarted`; wrap `step.execute` in `runStep` try/catch mapping `AwaitingInputClosedError` / `NonInteractiveInputError` → `blocked()` |
| `src/main/commands/setup.command.ts` | Added `buildLineReader` dependency; in `--json` mode build `PromptStdinJsonGateway`, otherwise keep the `buildGateways` prompt (TTY); init `currentStepId: null` |
| `src/tests/units/main/commands/setup.command.test.ts` | Added `buildLineReader` to helper; TTY-mode regression test (never builds a line reader in human mode) + json-mode counterpart |

Plus the 11 existing step/acceptance context literals that gained `currentStepId: null`
to satisfy the new required field (fixed during the verify pass).

## Design decisions (matched the validated plan)

1. **stepId coupling** — orchestrator sets `context.currentStepId` before each
   step; the stdin gateway reads it via an injected `() => StepId` getter. No
   `PromptGateway` signature change, no per-step edits.
2. **EOF → blocked** — `LineReader.read()` returns `null` on stream close; the
   gateway throws `AwaitingInputClosedError`; the orchestrator maps it to
   `blocked("Aucune réponse reçue, le setup est interrompu", …)`. StepOutcome
   construction stays in the application layer.
3. **Re-announce loop** — invalid/malformed/wrong-shape → `emitWarning(refusal)`
   + re-`emitAwaitingInput` + read next line, no cap. Terminable in tests because
   the stub reader is finite (exhaustion → null → blocked).
4. **Injectable I/O** — `LineReader` port + `StubLineReader` (tests) +
   `NodeStdinLineReader` (prod, the only file touching real stdin, intentionally
   not unit-tested).
5. **Value encoding** — text = raw line (empty → default, never JSON-parsed);
   confirm = JSON boolean; choice = JSON string ∈ offered; multiSelect = JSON
   string[] all ∈ offered. Refusal messages verbatim per spec. JSON parse failure
   → `"Réponse illisible"`. Wrong shape → `"Réponse invalide"`.
6. **`-y` non-interactive** — gateway throws `NonInteractiveInputError(...)` up
   front; orchestrator maps to `blocked`. Steps already short-circuit `flags.yes`
   before prompting, so this is a defensive net (verified never hit on happy path).

## Test results

`yarn verify` (typecheck + lint + test:ci) — **GREEN**:

- typecheck: `tsc --noEmit` — clean (exit 0)
- lint: `biome check src/` — 914 files checked, no fixes applied
- test:ci: **361 test files passed, 2834 tests passed, 0 failed**

SPEC-187 unit + acceptance subset: **35 test files, 206 tests, all passing**
(includes SPEC-183 acceptance as a regression guard).

New SPEC-187 test counts:
- `promptInputError.test.ts`: 4
- `answerLine.guard.test.ts`: 6
- `prompt.stdinJson.gateway.test.ts`: 15
- `setup.command.test.ts`: +2 (TTY regression + json counterpart), 4 total
- acceptance: 8
- `orchestrateSetup.usecase.test.ts`: +3 (currentStepId set, two error→blocked mappings), 10 total

## Acceptance status

`src/tests/acceptance/187-setup-wizard-json-stdin-input.acceptance.test.ts` — **8/8 GREEN**.

Harness fixes applied this session (test-only; production code untouched):

1. **Full `--json` run to completion** — removed the impossible `localPath: null`
   path (the `secrets` step runs before `add-project` and blocks on a missing
   path). The run now uses a real project path, `daemonInactive: true` (so the
   daemon step prompts a `confirm`, then the stub transitions to active and reports
   healthy), an ambiguous platform (so `add-project` prompts a `choice`), and a
   `custom` preset (so `pipeline` prompts a `multiSelect` + `choice`s). It reaches
   `done`/`completed` with exitCode 0, exercising confirm + choice + multiSelect.
2. **Empty text → default** — rewritten to run `AddProjectStep` in isolation with
   `localPath: null` and an empty line, with the gitRemote stub pointed at
   `process.cwd()`. Asserts the step succeeds and `context.project.localPath`
   equals the step's default — proving the empty-text→default behaviour through
   real step + gateway orchestration without depending on `generate-files`.
3. **`-y` non-interactive** — uses a real project path + ambiguous platform so the
   wizard reaches `add-project`, which then blocks in `-y` mode (exitCode 2) with
   an empty `StubLineReader` that is never read.

The text shape's empty→default rule is additionally pinned at the gateway unit
level (`prompt.stdinJson.gateway.test.ts`).

## Spec coverage mapping

| Rule / Scenario | Covered by |
|-----------------|------------|
| JSON mode announces waiting + pauses for stdin | gateway `askText`/`askConfirm`/`askChoice`/`askMultiSelect` announce tests; acceptance "announces awaiting_input" |
| Each answer = one line; never blocks on a terminal | `LineReader` seam + `StubLineReader`; `NodeStdinLineReader` reads one line per `read()` |
| Human terminal experience unchanged when JSON off | `setup.command.test.ts` "never builds a line reader in human mode" regression |
| Four answer shapes supported | gateway tests for text / confirm / choice / multiSelect (15) |
| text answer → value | gateway "returns the raw line as the value" |
| empty text uses default | gateway "uses the default value when the line is empty"; acceptance "uses the step default when an empty text line is read" |
| confirm yes/no → boolean | gateway "returns true/false for the line" |
| single choice valid → value | gateway "returns the chosen value when it is offered" |
| single choice not offered → `Choix invalide, sélectionnez une option proposée` | gateway + acceptance "re-announces … single choice is not offered" |
| multi choice valid → values | gateway "returns the selected values when all are offered" |
| multi choice unknown value → `Sélection invalide, une valeur n'est pas proposée` | gateway + acceptance "re-announces … multiSelect value is not offered" |
| wrong shape → `Réponse invalide` + re-announce | gateway confirm/choice/multiSelect wrong-shape tests |
| malformed line → `Réponse illisible` + re-announce | gateway "malformed input"; acceptance "re-announces … malformed line" |
| input stream closed → blocked `Aucune réponse reçue, le setup est interrompu` | gateway EOF test; orchestrator mapping test; acceptance "blocks … stream closes" |
| `-y` needs input → `Mode non-interactif : aucune entrée disponible pour cette étape` | gateway non-interactive test; orchestrator mapping test; acceptance `-y` test |

## Self-review

| Criterion | Result |
|-----------|--------|
| Naming (full words, camelCase, suffixes) | PASS |
| Imports (`@/` + `.js`, no relative, no barrel) | PASS |
| TypeScript (no `any` / `as` / `!`) | PASS — verified by scan |
| Architecture (dependency rule, ports in entities, no StepOutcome in gateway) | PASS |
| Tests (factories/stubs, state-based, mocks only at I/O) | PASS |
| Clean code (no superfluous comments) | PASS |
| Domain (`null` for absence, no `undefined` in domain types) | PASS |

Review-fix loop iterations: 0 (no violations found).

## Blockers

None.

## Notes for the orchestrator

- No commit made, spec/tracker status unchanged, no push (per instructions).
- No new runtime dependency (`node:readline` built-in, `zod` already present).
- `NodeStdinLineReader` is the only non-unit-tested file (real stdin I/O boundary),
  covered indirectly by the wiring tests and intended for SPEC-184 Iteration B.
