import { describe, it, expect } from 'vitest';
import { createIdleEmberSessionState } from '@/modules/ember-chat/entities/emberSession/emberSessionState.js';

const IDLE_TIMEOUT_MS = 60_000;

describe('EmberSessionState', () => {
  it('starts idle with no live process', () => {
    const state = createIdleEmberSessionState();

    expect(state.phase).toBe('idle');
  });

  it('becomes live when a question is asked', () => {
    const state = createIdleEmberSessionState().onQuestion(new Date('2026-05-28T10:00:00Z'));

    expect(state.phase).toBe('live');
  });

  it('stays live after an answer completes', () => {
    const state = createIdleEmberSessionState()
      .onQuestion(new Date('2026-05-28T10:00:00Z'))
      .onAnswerDone(new Date('2026-05-28T10:00:05Z'));

    expect(state.phase).toBe('live');
  });

  it('releases to idle when inactivity exceeds the timeout', () => {
    const state = createIdleEmberSessionState()
      .onQuestion(new Date('2026-05-28T10:00:00Z'))
      .onAnswerDone(new Date('2026-05-28T10:00:05Z'))
      .onIdleTick(new Date('2026-05-28T10:02:00Z'), IDLE_TIMEOUT_MS);

    expect(state.phase).toBe('idle');
  });

  it('stays live when inactivity is within the timeout', () => {
    const state = createIdleEmberSessionState()
      .onQuestion(new Date('2026-05-28T10:00:00Z'))
      .onAnswerDone(new Date('2026-05-28T10:00:05Z'))
      .onIdleTick(new Date('2026-05-28T10:00:30Z'), IDLE_TIMEOUT_MS);

    expect(state.phase).toBe('live');
  });

  it('reports needing a process when idle and a question arrives', () => {
    const idle = createIdleEmberSessionState();

    expect(idle.needsProcess()).toBe(true);
  });

  it('does not need a new process when already live', () => {
    const live = createIdleEmberSessionState().onQuestion(new Date('2026-05-28T10:00:00Z'));

    expect(live.needsProcess()).toBe(false);
  });
});
