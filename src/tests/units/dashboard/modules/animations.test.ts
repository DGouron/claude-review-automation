/**
 * animations.test.ts — Smoke tests for the animations helper module.
 *
 * The module is a browser-side JS file using window.matchMedia and DOM APIs.
 * Tests focus on the exportable contracts without requiring a real DOM:
 * - All expected functions are exported
 * - reducedMotion() returns a boolean given a mocked matchMedia
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const globalAny = globalThis as unknown as Record<string, unknown>;

describe('animations module — export contracts', () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = globalAny.window;
    // Provide minimal window stub so the module can import
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: vi.fn().mockReturnValue({ matches: false }) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  it('exports reducedMotion as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.reducedMotion).toBe('function');
  });

  it('exports animateMount as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.animateMount).toBe('function');
  });

  it('exports animateCounter as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.animateCounter).toBe('function');
  });

  it('exports slideTabUnderline as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.slideTabUnderline).toBe('function');
  });

  it('exports heartbeat as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.heartbeat).toBe('function');
  });

  it('exports pulseLive as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.pulseLive).toBe('function');
  });

  it('exports springIn as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.springIn).toBe('function');
  });

  it('exports liftCard as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.liftCard).toBe('function');
  });

  it('exports unliftCard as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.unliftCard).toBe('function');
  });

  it('exports pulseStatusDot as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.pulseStatusDot).toBe('function');
  });

  it('exports breatheLogo as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.breatheLogo).toBe('function');
  });

  it('exports crossFadeTab as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.crossFadeTab).toBe('function');
  });

  it('exports reviewCompleted as a function', async () => {
    const module = await import('@/dashboard/modules/animations.js');
    expect(typeof module.reviewCompleted).toBe('function');
  });

  it('reducedMotion returns false when matchMedia matches is false', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: vi.fn().mockReturnValue({ matches: false }) },
      writable: true,
      configurable: true,
    });
    const { reducedMotion } = await import('@/dashboard/modules/animations.js');
    expect(reducedMotion()).toBe(false);
  });

  it('reducedMotion returns true when matchMedia matches is true', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: vi.fn().mockReturnValue({ matches: true }) },
      writable: true,
      configurable: true,
    });
    const { reducedMotion } = await import('@/dashboard/modules/animations.js');
    expect(reducedMotion()).toBe(true);
  });
});
