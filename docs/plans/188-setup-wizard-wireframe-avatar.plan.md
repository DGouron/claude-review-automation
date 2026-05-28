# Plan — SPEC-188: Setup Wizard Reactive Wireframe Avatar (Phase 1)

> Spec: `docs/specs/188-setup-wizard-wireframe-avatar.md`
> Branch: `feat/188-setup-wizard-wireframe-avatar`
> Status: planned
> Scope: PURELY `src/dashboard/*` — backend reused as-is, ZERO changes to `src/modules/**` or `src/main/**`.

## PLAN

- scope: Setup wizard reactive wireframe avatar (Phase 1 — 6 states, 2D fallback, form reuse)
- is_new_module: false (adds two view modules inside the existing `src/dashboard/` layer + a styles block + setup.html wiring)

## Architectural placement

In Clean Architecture terms, everything here is **Interface Adapters → Views (humble objects)** plus the dashboard's pure presentation helpers. There is NO entity / use case / gateway / controller work: the spec's Rule "the avatar is purely a presentation layer" forbids it, and the backend (events SSE, `/api/setup/input`, `/api/setup/state`, `/api/setup/start`) already exists on master and stays untouched.

Layer mapping for each deliverable:

| Deliverable | Layer | Tested? |
|-------------|-------|---------|
| `setupWizardAvatar.js` — pure state mapping + fallback decision + geometry projection | Interface Adapters / View presentation logic (pure functions) | YES — unit tests, mirror under `src/tests/units/dashboard/modules/` |
| `setupWizardAvatarRenderer.js` — requestAnimationFrame canvas glue | Interface Adapters / View (humble glue, like `connectSetupWizardStream`) | NO — humble glue, browser-only (matches existing stream-glue precedent) |
| `setup.html` branch (avatar vs 2D fallback wiring) | Composition glue inside the page (analogous to `routes.ts` for the page) | NO — exercised by acceptance via the pure pieces |
| `styles.css` avatar block | Presentation styling | NO |
| Acceptance test | `src/tests/acceptance/188-*.acceptance.test.ts` | asserts STATE SEQUENCE only |

This mirrors the established pure/glue split already used by `setupWizard.js` (pure) + `setupWizardStream.js` (`connectSetupWizardStream` glue) + `setupWizardForms.js` (pure) wired in `setup.html`.

## Canvas approach (lightest viable — confirmed)

**Chosen: hand-rolled 3D-to-2D projection on a plain 2D `<canvas>` (`getContext('2d')`), drawing line segments of a static procedural wireframe (icosahedron — 12 vertices / 30 edges).**

Rationale and why it is the lightest viable option:
- Zero dependency. The geometry (a fixed unit-sphere vertex/edge list) is a constant in the pure module. Rotation is one 3x3-style rotate of each vertex around Y (and a slight X tilt) per frame; projection is a trivial perspective divide `(x', y') = (x / (z + d), y / (z + d)) * scale`. No matrix library, no WebGL, no shaders, no asset file, no `three`, no `lottie`.
- The 6 states differ only by **stroke colour, line width, rotation speed, and a scalar pulse** (radius/opacity envelope) — all cheap scalars driven by the avatar state. No per-state bespoke geometry (satisfies the "single abstract wireframe core" rule).
- `requestAnimationFrame` with ~30–60 fps is trivially achievable for 30 line segments on 2D canvas on a typical laptop (spec target ~60 fps).
- "Hardware 3D rendering unavailable" in the spec is satisfied conceptually by a **canvas capability probe** (`canvas.getContext('2d') !== null`). We deliberately do NOT require WebGL because we do not use it — so the probe is "can we get a 2D context", which is the honest capability gate for this renderer. (Documented as a deliberate interpretation: the spec says "hardware 3D rendering", but Phase 1 renders no real 3D; the meaningful fallback trigger is "no usable canvas" OR reduced motion.)

Reduced motion: when `prefersReducedMotion` is true we either (a) fall back to the 2D view, or (b) draw a single **static** frame and never call `requestAnimationFrame` (status changes conveyed by instant colour + label). The spec allows either; plan picks **2D fallback when reduced motion** to keep one code path simple and guarantee identical functionality + zero animation. `shouldUseAvatar` returns false on reduced motion.

## New-dependency check

**NO new dependency.** Confirmed:
- No `three`, no `@react-three/*`, no `lottie-web`, no any 3D/animation engine.
- The wireframe is a hand-drawn constant + arithmetic, rendered via the browser-native `CanvasRenderingContext2D`.
- Bundle delta = two small browser JS modules + a CSS block. Documented in the report as required by DoD ("avatar bundle delta is documented").

If implementer believes a dependency is warranted, STOP and flag — the user has explicitly closed this question (lightweight hand-drawn only).

## PURE LOGIC MODULE (unit-tested)

`src/dashboard/modules/setupWizardAvatar.js` — browser JS + JSDoc types, sibling `.js` imports, `escapeHtml` for any interpolated text (the remediation announcement). Exports:

- `AVATAR_STATES` — `['idle','working','success','error','listening','celebrating']` constant.
- `avatarStateFromEvents(events)` → `AvatarState`. Folds the ordered event list to the latest relevant status and maps:
  - nothing yet / no step events → `idle`
  - latest relevant status `in_progress` → `working`
  - `warning` → `working` (non-fatal; keep working, never error — spec Rule)
  - `succeeded` | `skipped` → `success`
  - `awaiting_input` → `listening`
  - `blocked` → `error`
  - terminal `{step:'done', status:'completed'}` → `celebrating`
  - Banner-only events (`instructions`/`warning`/`resume`) must not be treated as step status except `warning`→working per spec.
  - Reuses the same "latest relevant event" notion as the 2D `announce()` (last in_progress, else last non-pending).
- `shouldUseAvatar({ canvasSupported, reducedMotion })` → `boolean`. `true` only when `canvasSupported === true && reducedMotion === false`. Otherwise `false` (→ 2D fallback).
- `avatarStateToVisual(state)` → `{ color, lineWidth, rotationSpeed, pulse }` view model (pure mapping to the existing CSS tokens by name: `--accent` idle/working/listening base, `--success` success/celebrating, `--danger` error). Keeps the renderer humble (no branching in glue).
- `buildAvatarAnnouncement(rows | activeRow)` → reuse `buildAriaAnnouncement` from `setupWizard.js` (do not duplicate). If a small wrapper is needed for the blocked/remediation verbatim case, add `buildRemediationAnnouncement(row)` returning the exact `row.remediation` text verbatim (spec: "exact CLI remediation message verbatim, never paraphrased").
- `WIREFRAME_VERTICES` / `WIREFRAME_EDGES` — the constant unit icosahedron geometry.
- `projectVertex(vertex, rotationRadians, projection)` → `{ x, y }` — pure 3D→2D projection helper (rotate around Y + tilt, perspective divide, scale). Minimal, unit-tested for determinism (e.g. zero rotation maps known vertex to known 2D point; rotation by 2π returns to start within epsilon).

Keep geometry helpers MINIMAL — only `projectVertex` is worth a unit test; do not add a matrix abstraction.

## CANVAS RENDER GLUE (humble, NOT unit-tested)

`src/dashboard/modules/setupWizardAvatarRenderer.js` — thin wiring, browser-only, NO branching logic of its own (all decisions come from the pure module). Mirrors the `connectSetupWizardStream` precedent.

Exports `mountSetupWizardAvatar(options)`:
- `options`: `{ canvas, getState: () => AvatarState, reducedMotion, requestFrame?, now? }` (injectable `requestAnimationFrame`/`performance.now` for testability if ever needed; default to globals).
- Behaviour: starts a `requestAnimationFrame` loop; each frame reads `getState()`, asks the pure module for `avatarStateToVisual(state)`, clears canvas, iterates `WIREFRAME_EDGES`, projects both endpoints via `projectVertex` with the running rotation angle, strokes them with the visual's colour/lineWidth, applies the scalar `pulse` envelope (e.g. success/celebration brief amplitude bump, listening gentle breathe).
- Returns `{ setState(state), destroy() }`. `destroy()` calls `cancelAnimationFrame` and nulls handlers — **mandatory clean teardown** to avoid leaks (risk below). `setup.html` calls `destroy()` on completion/auto-redirect and on stream loss before switching to polling/2D.
- Decision: **separate glue module** (not inline in setup.html) so teardown and the rAF handle are owned in one place and the page stays a thin composition root — matches the existing module layout.

## INTEGRATION (setup.html)

Single decision point at boot, then identical event flow as today:

1. Compute `canvasSupported` = `document.createElement('canvas').getContext('2d') !== null`.
2. Compute `reducedMotion` via the existing `prefersReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)'))`.
3. `if (shouldUseAvatar({ canvasSupported, reducedMotion }))`:
   - Show the avatar `<canvas>` container (new markup, hidden by default), hide the `<ol id="setup-steps">` list (the 2D rows).
   - `const avatar = mountSetupWizardAvatar({ canvas, getState, reducedMotion })`.
   - In `render(events)`: compute `avatarStateFromEvents(events)` → `avatar.setState(...)`; STILL render the `awaiting_input` form via the existing `renderActiveForm`/`buildFormModel`/`renderForm`/`bindForm`/`buildInputPayload` path (now mounted into a form slot **next to the avatar** instead of inside a step row); STILL update the screen-reader live region via `announce(...)` (reusing `buildStepRowsModel`+`buildAriaAnnouncement`) and use the verbatim remediation for blocked steps.
   - On `onComplete` and on disconnect-before-polling: call `avatar.destroy()` before redirect / before falling back to polling rendering.
4. `else` (fallback): mount the EXISTING 2D path exactly as today — `buildStepRowsModel`/`renderStepRow`/`renderBanner`/`renderActiveForm`. No behavioural change to the fallback.
5. Keep untouched: disconnect banner (`// CONNEXION PERDUE` + relaunch), polling fallback (`pollOnce`/`startPolling`), multi-tab read-only (`buildMultiTabViewState`), `storage` auto-redirect, `startRun`/`subscribe`.

The form slot for the avatar branch reuses the SAME `buildInputPayload` → `POST /api/setup/input` code that already exists in `setup.html`; we only change WHERE the form is mounted (a dedicated container beside the canvas), not how it posts. This directly protects the "form still posts to /api/setup/input" DoD item.

## FILE LIST (create vs modify)

CREATE (4):
1. `src/dashboard/modules/setupWizardAvatar.js` — pure logic (state mapping, fallback decision, geometry + projection, visual mapping).
2. `src/dashboard/modules/setupWizardAvatarRenderer.js` — humble canvas rAF glue (`mountSetupWizardAvatar`).
3. `src/tests/units/dashboard/modules/setupWizardAvatar.test.ts` — unit tests for the pure module (state mapping for every status, fallback truth table, projection determinism).
4. `src/tests/acceptance/188-setup-wizard-wireframe-avatar.acceptance.test.ts` — scripted event stream drives idle→working→success→…→celebration, asserts the STATE SEQUENCE (not pixels), plus fallback selection truth.

MODIFY (3):
5. `src/dashboard/setup.html` — add avatar canvas + form-slot markup (hidden by default), add the `shouldUseAvatar` branch wiring, teardown calls. Existing 2D path preserved as the `else` branch.
6. `src/dashboard/styles.css` — add the avatar canvas/container block (corner brackets reuse, dark warm bg, amber/green tokens, `prefers-reduced-motion` already handled globally; ensure canvas container respects it).
7. `docs/feature-tracker.md` — flip SPEC-188 status to `planned` (planning bookkeeping, not implementation).

Total: 4 create + 3 modify = **7 files** (well under the ~12 ceiling; the spec's `Small=WARN` budget of ~8–12 is respected). No split needed.

Note: `setupWizardAvatarRenderer.js` has no test mirror BY DESIGN (humble glue, same precedent as `setupWizardStream.js`'s `connectSetupWizardStream` — that function is also not unit-tested). The `no-barrel-exports` hook is respected (no `index.ts`).

## IMPLEMENTATION_ORDER

Inside-out within the view layer (pure first, glue last, page last — mirrors the project's inside-out rule):

1. `src/tests/acceptance/188-setup-wizard-wireframe-avatar.acceptance.test.ts` — SDD outer loop: write FIRST, RED. Uses `WizardStreamEventFactory` + `wizardStreamEventGuard.filterCollection` like the 184 acceptance test; asserts `avatarStateFromEvents` over a scripted sequence and `shouldUseAvatar` truth table.
2. `src/tests/units/dashboard/modules/setupWizardAvatar.test.ts` + `src/dashboard/modules/setupWizardAvatar.js` — TDD inner loop for the pure module (every status mapping, warning→working, blocked→error verbatim, fallback truth table, `projectVertex` determinism). GREEN.
3. `src/dashboard/modules/setupWizardAvatarRenderer.js` — humble glue, no test (browser-only), consumes the now-green pure module.
4. `src/dashboard/styles.css` — avatar container/canvas styling block.
5. `src/dashboard/setup.html` — wire the `shouldUseAvatar` branch, mount avatar + form slot, keep 2D fallback path, teardown on complete/disconnect. Acceptance from step 1 stays GREEN (it tests the pure pieces, not the page).
6. `docs/feature-tracker.md` — status `planned` → (later, by implementer) `implemented`.

`setup.html` wiring is intentionally LAST (it is this page's composition root, analogous to `routes.ts` being last in the TS layers).

## ACCEPTANCE_TEST

- file: `src/tests/acceptance/188-setup-wizard-wireframe-avatar.acceptance.test.ts`
- note: "SDD outer loop — written first by the implementer, RED during impl, GREEN at the end. Asserts the avatar STATE SEQUENCE (idle → working → success → … → celebrating) from a scripted event list built with `WizardStreamEventFactory`, plus the fallback selection truth table (`shouldUseAvatar`). Asserts STATE, never pixels. Reuses `wizardStreamEventGuard.filterCollection` to validate the scripted stream exactly as the 184 acceptance test does."

Concretely it should assert at least:
- empty events → `idle`
- after `stepStarted(dependencies)` → `working`
- after `stepCompleted(succeeded)` → `success`
- after `stepCompleted(skipped)` → `success`
- after `stepCompleted(blocked, message)` → `error` and the remediation/message is available verbatim
- after `awaitingInput(choice)` → `listening`
- after `warning()` → still `working` (non-fatal)
- after `done()` → `celebrating`
- `shouldUseAvatar`: `{canvasSupported:true, reducedMotion:false}`→true; reducedMotion true→false; canvasSupported false→false.

## RISKS

1. **Regression on the 2D fallback** (it MUST keep working identically): the avatar branch must be additive — the `else` path is the current code verbatim. Mitigation: do not refactor `renderStepRow`/`buildStepRowsModel`/`renderActiveForm`; keep the existing 184/187 acceptance + unit tests green (run `yarn test:ci`). Treat any change to existing pure modules as out of scope (flag, don't fix).
2. **Canvas teardown / rAF leaks**: a dangling `requestAnimationFrame` loop after auto-redirect or stream loss leaks and can keep the tab busy. Mitigation: `mountSetupWizardAvatar` returns `destroy()`; `setup.html` calls it on `onComplete` (before redirect) and before switching to polling/2D. Single owner of the rAF handle.
3. **Reduced-motion correctness**: must produce NO continuous animation and convey status by instant colour + label. Mitigation: `shouldUseAvatar` returns false on reduced motion → 2D path (no rAF at all), which already handles colour-by-status + live region. This is the simplest correct option and avoids a half-animated state.
4. **`awaiting_input` form must still POST to `/api/setup/input`**: the form moves location (beside the canvas) but reuses `buildInputPayload`/`fetch` unchanged. Mitigation: reuse the exact existing `submitForm`/`bindForm` code; the only change is the mount container; covered indirectly by keeping `buildInputPayload` unit/acceptance tests green and by the form-path acceptance scenarios in 187/184.
5. **Capability-probe semantics**: spec says "hardware 3D rendering unavailable" but Phase 1 uses 2D canvas (no real 3D). Risk of mismatched expectation. Mitigation: documented deliberate interpretation — the meaningful gate is "no usable 2D canvas OR reduced motion". `shouldUseAvatar` takes `canvasSupported`, computed from `getContext('2d')`. Flagged here so a reviewer can object before implementation.
6. **Performance on a weak laptop**: 30 edges on 2D canvas at 60fps is cheap; risk is low. Mitigation: keep geometry constant small (icosahedron, not a dense line field); no per-frame allocation in the loop (reuse arrays). If a frame budget issue appears, drop to 30fps — still within "smooth" and decorative.

## REFERENCE_FILES

- `src/dashboard/modules/setupWizard.js` — the 2D HUD (becomes fallback); reuse `buildStepRowsModel`, `buildAriaAnnouncement`, `STEP_ROW_IDS`; do NOT modify.
- `src/dashboard/modules/setupWizardStream.js` — pure/glue split precedent; reuse `connectSetupWizardStream`, `prefersReducedMotion`, `pollingStateToEvents`, `buildMultiTabViewState`; the avatar renderer mirrors `connectSetupWizardStream`'s humble-glue shape (not unit-tested).
- `src/dashboard/modules/setupWizardForms.js` — reuse `buildFormModel`/`renderForm`/`buildInputPayload` verbatim for `awaiting_input`; do NOT modify.
- `src/dashboard/setup.html` — the page to modify; existing render/submit/poll/subscribe wiring to preserve as the fallback branch.
- `src/dashboard/styles.css` — tokens `--accent`, `--success`, `--warning`, `--danger`, `--bg-*`, corner brackets, global `@media (prefers-reduced-motion: reduce)` handling to extend.
- `src/dashboard/modules/html.js` — `escapeHtml` for any interpolated remediation text.
- `src/tests/factories/wizardStreamEvent.factory.ts` — REUSE for both the unit and acceptance tests (stepStarted/stepCompleted/awaitingInput/warning/done).
- `src/tests/acceptance/184-setup-wizard-dashboard-jarvis.acceptance.test.ts` — template for the 188 acceptance test (factory + `wizardStreamEventGuard.filterCollection`, state-sequence assertions).
- `src/tests/units/dashboard/modules/setupWizard.test.ts` — template for the pure-module unit test style.
- `docs/specs/188-setup-wizard-wireframe-avatar.md` — source of truth for the 6 states, fallback rules, and DoD.
