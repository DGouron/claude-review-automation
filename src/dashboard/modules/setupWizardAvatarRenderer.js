/**
 * Dashboard module — Setup Wizard wireframe avatar renderer (SPEC-188, Phase 1).
 * Humble glue: a thin requestAnimationFrame loop that strokes the procedural
 * wireframe core on a 2D canvas. It owns the rAF handle and its teardown, and
 * delegates EVERY decision (state, colour, line width, rotation speed, pulse,
 * geometry, projection) to the pure setupWizardAvatar.js module — so it carries
 * no branching logic of its own. Not unit-tested (browser-only), mirroring the
 * connectSetupWizardStream precedent.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

import {
  avatarStateToVisual,
  projectVertex,
  WIREFRAME_VERTICES,
  WIREFRAME_EDGES,
} from './setupWizardAvatar.js';

/**
 * @param {CanvasRenderingContext2D} context
 * @param {string} colorToken
 * @returns {string}
 */
function resolveColor(context, colorToken) {
  const value = getComputedStyle(context.canvas).getPropertyValue(colorToken).trim();
  return value === '' ? '#F4A93D' : value;
}

/**
 * The structural slice of a canvas the renderer actually depends on. A real
 * HTMLCanvasElement satisfies it; tests can pass a lightweight fake without casts.
 *
 * @typedef {Object} AvatarCanvas
 * @property {number} width
 * @property {number} height
 * @property {(contextId: '2d') => CanvasRenderingContext2D | null} getContext
 */

/**
 * Mounts the animated wireframe avatar on a 2D canvas and returns its controls.
 * The page calls setState() on each stream event and destroy() before any
 * redirect or fallback switch so the rAF loop never leaks.
 *
 * @param {Object} options
 * @param {AvatarCanvas} options.canvas
 * @param {import('./setupWizardAvatar.js').AvatarState} [options.initialState]
 * @param {(callback: FrameRequestCallback) => number} [options.requestFrame]
 * @param {(handle: number) => void} [options.cancelFrame]
 * @param {() => number} [options.now]
 * @returns {{ setState: (state: import('./setupWizardAvatar.js').AvatarState) => void; destroy: () => void }}
 */
export function mountSetupWizardAvatar(options) {
  const requestFrame = options.requestFrame ?? globalThis.requestAnimationFrame.bind(globalThis);
  const cancelFrame = options.cancelFrame ?? globalThis.cancelAnimationFrame.bind(globalThis);
  const now = options.now ?? (() => performance.now());
  const context = options.canvas.getContext('2d');

  let currentState = options.initialState ?? 'idle';
  let rotation = 0;
  let lastTime = now();
  /** @type {number | null} */
  let frameHandle = null;

  const projection = {
    tilt: 0.5,
    distance: 4,
    scale: Math.min(options.canvas.width, options.canvas.height) * 0.28,
    centerX: options.canvas.width / 2,
    centerY: options.canvas.height / 2,
  };

  /**
   * @param {number} time
   */
  function draw(time) {
    if (context === null) {
      return;
    }
    const elapsedSeconds = Math.max(0, (time - lastTime) / 1000);
    lastTime = time;

    const visual = avatarStateToVisual(currentState);
    rotation += visual.rotationSpeed * elapsedSeconds;

    const breathe = 1 + visual.pulse * Math.sin(time / 600);
    const framedProjection = { ...projection, scale: projection.scale * breathe };

    context.clearRect(0, 0, options.canvas.width, options.canvas.height);
    context.lineWidth = visual.lineWidth;
    context.strokeStyle = resolveColor(context, visual.color);
    context.beginPath();
    for (const [from, to] of WIREFRAME_EDGES) {
      const start = projectVertex(WIREFRAME_VERTICES[from], rotation, framedProjection);
      const end = projectVertex(WIREFRAME_VERTICES[to], rotation, framedProjection);
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
    }
    context.stroke();

    frameHandle = requestFrame(draw);
  }

  frameHandle = requestFrame(draw);

  return {
    setState: (state) => {
      currentState = state;
    },
    destroy: () => {
      if (frameHandle !== null) {
        cancelFrame(frameHandle);
        frameHandle = null;
      }
    },
  };
}
