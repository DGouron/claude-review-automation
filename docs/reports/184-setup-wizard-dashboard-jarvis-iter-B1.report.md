# Implementation Report — SPEC-184 Iteration B1 (backend input duplex)

- **Spec**: [184-setup-wizard-dashboard-jarvis](../specs/184-setup-wizard-dashboard-jarvis.md)
- **Plan**: [184-setup-wizard-dashboard-jarvis-iter-B](../plans/184-setup-wizard-dashboard-jarvis-iter-B.plan.md)
- **Date**: 2026-05-28
- **Status**: B1 complete — B2 (frontend forms) pending

## Scope delivered (B1 — backend duplex)

Closes the input half of the wizard so an HTTP client can answer a piped `--json` run.
Frontend forms are Iteration B2 (separate run); `src/dashboard/*` untouched here.

### Gap 1 — Option A: self-describing `awaiting_input` events
- `services/wizardEventEmitter.ts` + `jsonWizardEventEmitter.ts` + `humanWizardEventEmitter.ts`: `emitAwaitingInput(stepId, prompt, kind, options, defaultValue)`. JSON emitter emits `{step, status:"awaiting_input", prompt, kind, options, defaultValue}`; TTY emitter ignores the new args (output unchanged).
- `entities/promptOption/promptOption.schema.ts`: `PromptKind` (`text|confirm|choice|multiSelect`) + `PromptOption` ({label,value}).
- `entities/wizardStreamEvent/wizardStreamEvent.schema.ts`: `awaiting_input` member extended with `kind`, `options`, `defaultValue` (+ guard/factory updated).
- `interface-adapters/gateways/prompt.stdinJson.gateway.ts`: the 4 ask methods forward their kind + choices + default into the emit.

### Gap 2 — stdin writable + endpoint
- `entities/setupProcess/setupProcess.gateway.ts`: `SetupProcessHandle.writeLine(line)`.
- `interface-adapters/gateways/setupProcess.childProcess.gateway.ts`: spawn `stdio: ['pipe','pipe','pipe']`; `writeLine` writes `line + "\n"` (guards `stdin.writable` against EPIPE).
- `usecases/streamSetupRun.usecase.ts`: `submitInput(runId, line): { status: 'written' | 'no-active-run' }` (guards active/non-exited).
- `entities/setupInput/setupInput.schema.ts` (+ guard): `setupInputSchema` discriminated union + `serializeSetupInput` mapping to the EXACT stdin line the SPEC-187 gateway parses — text = raw string, confirm = `true`/`false`, choice = `"value"`, multiSelect = `["a","b"]`.
- `interface-adapters/controllers/http/setupWizard.routes.ts`: `POST /api/setup/input` validates `{runId, kind, value}` (Zod), serializes, calls `submitInput` → 200 `written` / 409 `no-active-run` / 400 invalid body.

## Tests
- Full suite: **365 files / 2877 tests** green. `yarn verify` (typecheck + lint + test:ci) exit 0.
- New/extended: routes 11 (5 + 6 input-endpoint), `setupInput` guard 7 + serializer 5, acceptance `184-setup-wizard-forms` 8/8 (duplex via fake process), emitter/gateway/guard/factory ripple updated.
- Regression: SPEC-187 TTY output unchanged; Iteration A SSE/render green.

## Decisions
- Option A (events carry kind/options/defaultValue) keeps the future dashboard a humble object; the serializer contract is derived from and cross-checked against the SPEC-187 gateway parsing.
- Required `awaiting_input` fields ship together with the emitter so the SSE boundary guard never drops a current-shape line.

## Deferred to B2
- Frontend forms (`setupWizardForms.js` pure model + stream glue + `setup.html`): render the form from the `awaiting_input` view-model (kind/options/defaultValue) and POST the answer to `/api/setup/input`.

## Process note
The implementer agent stopped before implementing `ChildProcessSetupHandle.writeLine` (left the contract requiring it → typecheck red) and before wiring `POST /api/setup/input`. The orchestrator completed both (writeLine + stdin pipe + the endpoint and its 6 route tests) and re-ran `yarn verify` to confirm green.
