# Implementation Report — SPEC-184 Iteration B2 (frontend forms)

- **Spec**: [184-setup-wizard-dashboard-jarvis](../specs/184-setup-wizard-dashboard-jarvis.md) — "Forms inside the wizard"
- **Plan**: [184-setup-wizard-dashboard-jarvis-iter-B](../plans/184-setup-wizard-dashboard-jarvis-iter-B.plan.md) — section B2
- **Branch**: `feat/184b-setup-wizard-forms` (worktree)
- **Date**: 2026-05-28
- **Status**: B2 complete — `yarn verify` green

## Scope delivered (frontend only — `src/dashboard/*`)

When an `awaiting_input` event arrives, the wizard renders the matching form under that step row;
on submit it POSTs the answer to the B1 `POST /api/setup/input` endpoint; the form clears on the
next SSE event so the wizard advances. No backend (`src/modules/**`, `src/main/**`) touched, no new
dependency.

### Pure humble object (all logic, unit-tested)

`src/dashboard/modules/setupWizardForms.js` — JSDoc-typed, no DOM, no globals, `escapeHtml` from
`./html.js`:

- `buildFormModel(awaitingInputEvent)` → `{ stepId, kind, prompt, options, defaultValue }`, or
  `null` when the event is absent / not `awaiting_input` / has an unknown kind. Options default to
  `[]`, defaultValue to `null`.
- `renderForm(formModel)` → HTML string per kind:
  - **text** — `<input type="text">` with `defaultValue` as placeholder + a submit.
  - **confirm** — Confirmer / Annuler buttons (`data-confirm-value="true|false"`).
  - **choice** — selectable button list of `options` (`data-choice-value`).
  - **multiSelect** — checkbox list of `options` + a submit.
  - All controls are native and keyboard-reachable (tab + enter); `// LABEL` prefix; four corner
    brackets matching the step rows; prompt and option labels escaped (no emoji).
- `buildInputPayload(kind, runId, rawValue, options)` → `{ ok: true, body: {runId, kind, value} }`
  or `{ ok: false, error }`. Coerces per kind (text→string, confirm→boolean, choice→string,
  multiSelect→string[]) and rejects any choice/multiSelect value not among the offered `options`,
  so junk is never posted.

### Thin glue (untested, like Iteration A's wiring)

`src/dashboard/setup.html` — on each render, if the latest event is `awaiting_input`, build the
model, inject the form under the matching `data-step-id` row, bind submit/click handlers that build
the payload and `fetch('/api/setup/input', POST json)`. On the next SSE event the re-render no longer
sees a trailing `awaiting_input`, so the form disappears and the row advances. 409 (`no-active-run`)
and any 400/non-OK surface an inline `role="alert"` error without crashing the stream; read-only
secondary tabs render no form.

`src/dashboard/styles.css` — `.setup-form*` classes reuse the existing design tokens
(`--accent`, `--accent-ghost`, `--bg-*`, `--font-mono`), corner-bracket frame, and a visible focus
outline. The forms are plain markup with no entrance animation, so a `prefers-reduced-motion` user
gets instant, usable forms (no gating).

## Files

**CREATE (2):**
- `src/dashboard/modules/setupWizardForms.js` — pure humble object (3 functions).
- `src/tests/units/dashboard/modules/setupWizardForms.test.ts` — 20 unit tests.

**MODIFY (3):**
- `src/dashboard/setup.html` — form render/submit/clear glue + module import.
- `src/dashboard/styles.css` — `.setup-form*` classes (design-DNA consistent).
- `src/tests/acceptance/184-setup-wizard-forms.acceptance.test.ts` — +5 B2 tests (DOM-free:
  pure functions produce the exact body the B1 endpoint accepts and writes to stdin).

The factory already carried `awaitingInput` with `kind`/`options`/`defaultValue` (added in B1) —
no factory change needed. `setupWizardStream.js` left untouched: the glue lives in `setup.html`
where `runId`, the DOM, and the existing `render` loop already are, keeping the pure module the sole
logic holder.

## Tests

| Suite | Result |
|-------|--------|
| `setupWizardForms.test.ts` (new) | 20 pass |
| `184-setup-wizard-forms.acceptance.test.ts` (8 B1 + 5 B2) | 13 pass |
| Iteration A units (`setupWizard`, `setupWizardStream`) + acceptance | 33 pass (no regression) |
| Full `yarn verify` (typecheck + lint + test:ci) | **366 files / 2902 tests pass — exit 0** |

B2 net adds 25 tests over B1 (365 files / 2877 → 366 / 2902): 20 forms unit + 5 acceptance.

Biome check on the changed JS/TS files: clean (3 files, 0 fixes).

## Acceptance status

GREEN. The outer-loop acceptance test drives, for each kind, a real `awaiting_input` event →
`buildFormModel` → `buildInputPayload` → `POST /api/setup/input` (the B1 controller over the stub
process gateway) and asserts `processGateway.lastWrittenLine` equals the exact stdin line the
SPEC-187 gateway parses (`/home/u/api` for text, `true` for confirm, `"backend"` for choice,
`["solid","testing"]` for multiSelect), plus an invalid-choice case that is rejected before posting.

## Self-review

Single pass, 0 violations, 0 fix loops:
- Naming: full words, camelCase `.js`. OK.
- Imports: sibling `./html.js` (browser JS convention); tests `@/...js`. OK.
- TypeScript: no `any`/`as`/`!` (explicit null guards in the acceptance test instead of `!`);
  `unknown` + narrowing in `buildInputPayload`. OK.
- Architecture: pure module holds all logic; `setup.html` glue only delegates; no backend edits. OK.
- Domain: `null` for absence. OK.
- Accessibility: native controls, tab+enter reachable, `aria-label` on text input, `role="alert"`
  error slot, no animation gating (reduced-motion safe). OK.

## Visual verification

Not visually verified in a browser — coverage is by unit tests (render markup assertions) +
acceptance (payload/stdin contract). The CSS reuses existing tokens/classes, but the rendered look
was not eyeballed.

## Blockers

None.
