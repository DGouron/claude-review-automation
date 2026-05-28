# Implementation Report — SPEC-188 Setup wizard wireframe avatar (Phase 1)

- **Spec**: [188-setup-wizard-wireframe-avatar](../specs/188-setup-wizard-wireframe-avatar.md)
- **Plan**: [188-setup-wizard-wireframe-avatar.plan](../plans/188-setup-wizard-wireframe-avatar.plan.md)
- **Date**: 2026-05-28
- **Status**: Complete (Phase 1 — reactive avatar, no dialogue)

## Scope delivered

Replaces the wizard's visual layer on `/setup` with an animated wireframe "core" that reacts to
the setup step status, reusing the existing backend (SSE events, `POST /api/setup/input`) untouched.
The existing 2D HUD is kept as the fallback. Frontend only — no `src/modules/**` / `src/main/**` change.

## Files

### Created
| File | Layer | Responsibility |
|------|-------|----------------|
| `src/dashboard/modules/setupWizardAvatar.js` | View (pure) | `avatarStateFromEvents` (status → one of 6 states), `shouldUseAvatar`, `avatarStateToVisual`, icosahedron geometry + `projectVertex` |
| `src/dashboard/modules/setupWizardAvatarRenderer.js` | View (humble glue) | `mountSetupWizardAvatar`: rAF loop strokes the wireframe core, `setState`/`destroy`; delegates every visual decision to the pure module |
| `src/tests/units/dashboard/modules/setupWizardAvatar.test.ts` | Test | 24 unit tests (state map, fallback truth table, visuals, projection) |
| `src/tests/units/dashboard/modules/setupWizardAvatarRenderer.test.ts` | Test | 3 lifecycle tests (schedules a frame, cancels on destroy → no leak, exposes controls) via injected requestFrame/cancelFrame |
| `src/tests/acceptance/188-setup-wizard-wireframe-avatar.acceptance.test.ts` | Test | 5 — scripted stream drives idle→working→success→…→celebrating + `shouldUseAvatar` truth table |

### Modified
| File | Change |
|------|--------|
| `src/dashboard/setup.html` | `shouldUseAvatar({canvasSupported, reducedMotion})` branch → mount avatar + drive `setState(avatarStateFromEvents(...))` + reuse the B2 `awaiting_input` form (posts to `/api/setup/input` unchanged) + `destroy()` before redirect/switch; ELSE → existing 2D `setupWizard.js` view verbatim |
| `src/dashboard/styles.css` | Avatar container block reusing existing tokens + global reduced-motion |

## Tests
- Full suite (`yarn verify` = typecheck + lint + test:ci): **369 files / 2934 tests pass — exit 0**.
- New SPEC-188: **32 tests** (avatar pure 24, acceptance 5, renderer lifecycle 3).
- No regression: SPEC-184 (incl. the 2D fallback) + SPEC-187 suites green.

## Decisions
- **Lightweight wireframe on a 2D canvas** (no Three.js, no WebGL engine, no imported model): a fixed unit icosahedron (12 verts / 30 edges), hand-rolled Y-rotation + tilt + perspective in `projectVertex`. The 6 states reuse the same geometry and differ only by colour token / line width / rotation speed / pulse.
- **Capability gate = `getContext('2d') !== null`** (documented interpretation): Phase 1 renders no real 3D/WebGL, so the honest fallback trigger is "no usable 2D canvas OR reduced motion" rather than "no WebGL". Reduced motion always routes to the static 2D view.
- **Pure/glue split** mirrors the existing dashboard precedent: all logic in `setupWizardAvatar.js` (unit-tested); the rAF canvas loop in the renderer is humble glue. The renderer's lifecycle (schedule/cancel) IS tested via injected frame functions (no real DOM/rAF), proving the loop cannot leak.
- **No new dependency** — the core is hand-drawn on canvas. Bundle delta = two small JS modules + a CSS block; no `three`, no `lottie`.

## Out of scope (per spec)
Conversation/dialogue (text or voice), STT/TTS, imported 3D model / face / humanoid, agent fallback (SPEC-185), mobile avatar (uses the 2D fallback).

## Caveat
**UI not visually verified in a browser.** Coverage is unit (state map, projection, fallback truth table, renderer lifecycle) + acceptance (state sequence) — not a live pixel/click-through. The capability gate + the awaiting_input form path are covered by the truth table and the reused B2 contract, but the rendered appearance of the wireframe core was not eyeballed.

## Process note
The implementer agent stopped mid-task wrestling with a `as unknown as HTMLCanvasElement` in the renderer lifecycle test, and the test referenced the DOM type `FrameRequestCallback` which `tsc --noEmit` could not resolve. The orchestrator resolved both without `as`: the renderer's canvas param was typed structurally (`AvatarCanvas` = the `{width,height,getContext}` slice it actually uses), and the test's DOM type was replaced by its inline shape (`(time: number) => void`). `yarn verify` then ran green.
