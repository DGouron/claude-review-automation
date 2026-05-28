---
title: "SPEC-188: Render the setup wizard as a reactive wireframe avatar"
status: implemented
milestone: Setup Wizard Jarvis
depends_on:
  - "184-setup-wizard-dashboard-jarvis"
  - "187-setup-wizard-json-stdin-input"
related:
  - "185-setup-wizard-mcp-agent-fallback"
---

# SPEC-188: Render the setup wizard as a reactive wireframe avatar

## Status: implemented (Phase 1)

Phase 1 (reactive avatar, no dialogue) is implemented. See
[report](../reports/188-setup-wizard-wireframe-avatar.report.md) and
[plan](../plans/188-setup-wizard-wireframe-avatar.plan.md). Conversation/voice remain a later phase.

## Implementation

### Artefacts (frontend views — backend reused untouched)
- **Pure view** `setupWizardAvatar.js`: `avatarStateFromEvents` (status → idle/working/success/error/listening/celebrating), `shouldUseAvatar({canvasSupported, reducedMotion})`, `avatarStateToVisual`, icosahedron geometry + `projectVertex`.
- **Humble glue** `setupWizardAvatarRenderer.js`: `mountSetupWizardAvatar` — rAF loop stroking the wireframe core on a 2D canvas, with `setState`/`destroy`.
- **Integration** `setup.html`: branches on `shouldUseAvatar`; mounts the avatar + drives `setState(avatarStateFromEvents(events))` + reuses the SPEC-184 B2 `awaiting_input` form (posts to `/api/setup/input` unchanged) + `destroy()` before redirect/switch; ELSE renders the existing 2D step view (fallback).
- `styles.css`: avatar container reusing existing tokens.

### Decisions
- Lightweight wireframe on a **2D canvas** (no Three.js/WebGL engine, no imported model); the 6 states reuse one icosahedron and differ only by colour/line-width/rotation-speed/pulse.
- Capability gate = `getContext('2d') !== null`; reduced motion routes to the static 2D fallback.
- Pure logic unit-tested; the canvas loop is humble glue (its schedule/cancel lifecycle is tested via injected frame functions, proving no leak).
- No new dependency.

### Reuses (unchanged)
The SSE event stream, `awaiting_input` (kind/options/defaultValue), `POST /api/setup/input`, and the 2D HUD (now the fallback) from SPEC-184/187.

## Context

The setup wizard works (SPEC-184) but its 2D step-row HUD is functional, not the signature "assistant" the product is aiming for. Phase 1 replaces the wizard's **visual layer** with an animated wireframe "core" — an abstract reactor-like avatar that reacts to each setup step — while reusing the existing event backend untouched. This supersedes the visual rendering of SPEC-184 (the 2D HUD is demoted to a fallback); free conversation and voice are explicitly a later phase.

## Rules

- the avatar is purely a presentation layer: it consumes the existing setup event stream and never runs setup logic or talks to config files
- the avatar shows the current step's status through one distinct visual state among: idle, working, success, error, listening, celebrating
- the avatar reacts to each event in under 100ms
- whenever the wizard waits for an answer, the matching input form is presented next to the avatar so the user can always respond
- when hardware 3D rendering is unavailable, or the user prefers reduced motion, the wizard falls back to the existing 2D step view with identical functionality
- the avatar uses a single abstract wireframe core (procedural geometry); no imported 3D model, no face, no per-step bespoke artwork
- the avatar adds no heavy 3D engine dependency: lightweight wireframe rendering only
- the avatar holds a smooth frame rate (target 60 images per second) on a typical laptop
- animations are decorative and never block interaction: forms and keyboard stay usable during any animation
- the avatar view keeps the existing visual identity: dark warm background, amber and green accents, monospace labels, `// LABEL` prefixes, no emoji
- every step status change is announced as text to screen-reader users, regardless of the animation
- on failure the avatar shows the exact CLI remediation message verbatim, never paraphrased

## Scenarios

### Avatar reacts to step status

- page mount: {} → avatar in `idle` state (slow rotating/pulsing core)
- step starts: {event: {step: "dependencies", status: "in_progress"}} → avatar transitions to `working`
- step succeeds: {event: {status: "succeeded"}} → avatar plays a `success` pulse (green), then settles for the next step
- step skipped: {event: {status: "skipped"}} → treated as success (green), no error state
- step blocked: {event: {status: "blocked", message: "Aucun remote git"}} → avatar enters `error` (red) + the remediation message is shown verbatim
- awaiting input: {event: {status: "awaiting_input", kind: "choice", options: [...]}} → avatar enters `listening` + the matching form appears next to it
- final completion: {event: {step: "done", status: "completed"}} → avatar plays `celebration`, then auto-redirect to the dashboard after the existing countdown

### Input still works through the avatar view

- user answers a prompt: {form submitted: choice="github"} → answer posted to the existing input endpoint → avatar returns to `working` → next event arrives
- client-side invalid answer: {choice not in offered options} → form shows an inline error, nothing is posted, avatar stays `listening`

### Fallback to the 2D view

- no hardware 3D rendering: {webgl: unavailable} → render the existing 2D step view with full functionality, no avatar
- reduced motion preferred: {prefers-reduced-motion: reduce} → avatar shown static (or 2D view); status changes conveyed by instant colour + label, no continuous animation
- stream lost: {event stream: closed unexpectedly} → same "// CONNEXION PERDUE" banner + relaunch button as the 2D view

### Accessibility

- screen reader: {NVDA active} → live region announces each status change ("étape 3 sur 10, terminée : authentification Claude")
- keyboard only: {tab + enter} → every form control reachable and submittable without a mouse, avatar present or not

### Identity & performance

- visual identity: {} → dark warm background + amber/green accents + monospace + `// LABEL`, no emoji
- performance: {typical laptop} → avatar holds ~60 images per second; the added avatar code stays small (no heavy 3D engine)

## Out of Scope

- any conversation or dialogue with the avatar, text or voice (later phase)
- voice interaction, speech-to-text, text-to-speech, audio feedback
- the backend event stream, input endpoint, and CLI (SPEC-183 / SPEC-184 B1 / SPEC-187 — reused as-is, untouched)
- an imported or rigged 3D model, a face or humanoid avatar, per-step bespoke art
- the agent fallback (SPEC-185)
- a mobile-optimised avatar (mobile uses the 2D fallback)
- anything on the dashboard outside the `/setup` route

## Glossary

| Term | Definition |
|------|------------|
| Wireframe core | The single abstract animated geometry that represents the assistant in Phase 1 |
| Avatar state | One of idle / working / success / error / listening / celebrating, derived from the current step status |
| 2D fallback | The existing SPEC-184 step-row HUD, used when 3D rendering is unavailable or reduced motion is preferred |
| Event stream | The existing one-way feed of setup events the wizard already exposes (SPEC-184 B1 + SPEC-187) |
| Reduced motion | The OS/browser setting requesting minimal animation |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Backend (events + input endpoint) is on master; this adds only a new view. No in-flight dependency. |
| Negotiable | OK | Exact geometry, animation curves, colour shades, transition timings — all open. |
| Valuable | OK | Turns functional onboarding into the product's signature first impression; the durable backend is reused. |
| Estimable | OK | Lightweight wireframe + procedural core (no 3D engine, no asset) → one view module + status→state mapping + fallback wiring + tests. |
| Small | WARN | One new view + fallback toggle + tests (~8-12 files). Borderline only if animation polish expands — keep Phase 1 to the 6 states + fallback; defer polish. |
| Testable | OK | Status→avatar-state mapping and fallback selection are pure functions (unit-tested); the canvas/render loop is humble glue (not unit-tested) — acceptance asserts the state sequence, not pixels. |

## Definition of Done

Standard checklist from `.claude/skills/product-manager/rules/dod.md` applies. Specific to this spec:

- [ ] On `/setup`, when 3D rendering is available and reduced-motion is off, the wireframe avatar renders and reacts to the event stream
- [ ] Pure status→avatar-state mapping covers all observed statuses (in_progress, succeeded, skipped, blocked, warning, awaiting_input, completed) and is unit-tested
- [ ] 2D fallback is used when 3D rendering is unavailable OR reduced motion is preferred — verified by test
- [ ] Forms still appear for `awaiting_input` and post to the existing input endpoint (no backend change)
- [ ] Screen-reader live region announces every status change
- [ ] No heavy 3D engine dependency added; the avatar bundle delta is documented
- [ ] Acceptance test: a scripted event stream drives the avatar idle → working → success → … → celebration, asserting the state sequence
