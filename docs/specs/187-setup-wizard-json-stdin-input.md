---
title: "SPEC-187: Read setup wizard answers from stdin in JSON mode"
status: drafted
milestone: Setup Wizard Jarvis
depends_on:
  - "183-setup-wizard-cli-orchestrator"
related:
  - "184-setup-wizard-dashboard-jarvis"
---

# SPEC-187: Read setup wizard answers from stdin in JSON mode

## Context

The setup wizard from SPEC-183 already streams its progress as JSON events on stdout when `--json` is set, but it still asks for user input through an interactive terminal prompt. A program driving the wizard (the SPEC-184 dashboard) pipes the subprocess and has no terminal, so the wizard hangs the moment a step needs an answer. This spec makes the wizard, in JSON mode only, announce that it is waiting and read the answer as one line of JSON from its standard input — closing the loop so an external UI can answer prompts.

## Rules

- in JSON mode, a step that needs an answer announces it is waiting and pauses until an answer arrives on standard input
- in JSON mode, each answer is read as exactly one line of input; the wizard never blocks on a terminal
- the human terminal experience is unchanged when JSON mode is off
- four answer shapes are supported: free text, yes/no confirmation, single choice, multiple choice
- a single choice must be one of the offered options
- every multiple-choice value must be one of the offered options
- an answer whose shape does not match the question is refused, and the question is announced again
- a malformed input line is refused, and the question is announced again
- if the input stream closes before an answer arrives, the waiting step is blocked with a clear message
- non-interactive mode (`-y`) keeps the SPEC-183 behaviour: a step that still needs an answer fails with a remediation hint, it never reads from standard input
- a default value offered by a step is used when the answer is an empty text line

## Scenarios

- text answer: {mode: json, prompt: text, line: "/home/u/api"} → value "/home/u/api"
- empty text uses default: {mode: json, prompt: text, default: "/home/u/api", line: ""} → value "/home/u/api"
- confirm yes: {mode: json, prompt: confirm, line: "true"} → value true
- confirm no: {mode: json, prompt: confirm, line: "false"} → value false
- single choice valid: {mode: json, prompt: choice, options: ["backend","frontend"], line: "\"backend\""} → value "backend"
- single choice not offered: {mode: json, prompt: choice, options: ["backend","frontend"], line: "\"mobile\""} → reject "Choix invalide, sélectionnez une option proposée"
- multi choice valid: {mode: json, prompt: multiSelect, options: ["solid","testing","security"], line: "[\"solid\",\"testing\"]"} → value ["solid","testing"]
- multi choice with unknown value: {mode: json, prompt: multiSelect, options: ["solid","testing"], line: "[\"solid\",\"mobile\"]"} → reject "Sélection invalide, une valeur n'est pas proposée"
- wrong shape for confirm: {mode: json, prompt: confirm, line: "\"maybe\""} → reject "Réponse invalide" + re-announce waiting
- malformed line: {mode: json, prompt: text, line: "{not json"} → reject "Réponse illisible" + re-announce waiting
- input stream closed before answer: {mode: json, prompt: text, line: EOF} → blocked "Aucune réponse reçue, le setup est interrompu"
- json mode off keeps terminal prompt: {mode: human, prompt: text} → terminal prompt unchanged
- non-interactive needs input: {mode: json, flags: -y, prompt: text} → reject "Mode non-interactif : aucune entrée disponible pour cette étape"

## Out of Scope

- the dashboard endpoint that writes the answer to standard input (handled in SPEC-184 Iteration B)
- the dashboard form rendering (SPEC-184 Iteration B)
- detecting a hung step or a timeout on a pending answer (the driving UI owns that, see SPEC-184)
- changing the set of steps, their order, or the events emitted on stdout (defined by SPEC-183)
- re-prompt limits / maximum retries (the wizard re-announces indefinitely until a valid answer or stream close)

## Glossary

| Term | Definition |
|------|------------|
| JSON mode | The wizard run started with `--json`, emitting machine-readable events instead of human terminal output |
| Awaiting answer | A step state where the wizard has announced a question and paused until an answer arrives |
| Answer line | A single line of standard input carrying the answer, encoded as JSON (a string, a boolean, or an array of strings) |
| Prompt shape | One of: free text, yes/no confirmation, single choice, multiple choice |
| Non-interactive mode | The `-y` run where no human is present; steps needing an answer fail instead of waiting |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | SPEC-183 (the event emitter, the prompt contract, the orchestrator) is merged; nothing in-flight is required. |
| Negotiable | OK | Line framing, value encoding, and re-announce wording are all open. |
| Valuable | OK | Unblocks dashboard-driven setup (SPEC-184 Iteration B); without it the piped wizard cannot collect any input. |
| Estimable | OK | One input gateway + a mode-based selection in the wizard wiring + tests. No grey zones. |
| Small | OK | ~5-8 files (gateway contract reuse, one new gateway, selection wiring, tests). Well under 15. |
| Testable | OK | Every rule maps to a concrete scenario; the gateway is pure given an injected line reader. |

## Definition of Done

Standard checklist from `.claude/skills/product-manager/rules/dod.md` applies. Specific to this spec:

- [ ] In `--json` mode, a step needing input announces `awaiting_input` and pauses (no TTY call)
- [ ] Answers read as one JSON line from standard input for all four prompt shapes
- [ ] Single/multiple choice values validated against the offered options
- [ ] Malformed or wrong-shape answers refused and the question re-announced
- [ ] Stream close before an answer blocks the step with a French remediation message
- [ ] Human (non-JSON) mode prompt path unchanged — regression test proves it
- [ ] `-y` non-interactive mode still fails on a step needing input (never reads stdin)
- [ ] Acceptance test: a scripted answer feed drives a full `--json` run that needs input to completion
