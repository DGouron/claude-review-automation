import { describe, it, expect } from 'vitest';
import { StubEmberSessionTransportGateway } from '@/tests/stubs/emberSessionTransport.stub.js';
import { EmberSessionRegistry } from '@/modules/ember-chat/usecases/emberSession/emberSessionRegistry.js';
import type { EmberStreamSubscriber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';

const SYSTEM_PROMPT = 'you are ember';
const PROJECT_PATH = '/projects/alpha';

function drain(
  subscribe: (subscriber: EmberStreamSubscriber) => void,
): Promise<{ answer: string; statuses: string[] }> {
  return new Promise((resolve) => {
    let answer = '';
    const statuses: string[] = [];
    subscribe({
      onStatus: (state) => statuses.push(state),
      onChunk: (text) => {
        answer += text;
      },
      onDone: () => resolve({ answer, statuses }),
      onError: () => resolve({ answer, statuses }),
    });
  });
}

describe('EmberSessionRegistry', () => {
  it('reuses one transport handle across consecutive questions', async () => {
    const transport = new StubEmberSessionTransportGateway();
    let clock = new Date('2026-05-28T10:00:00Z');
    const registry = new EmberSessionRegistry({
      transport,
      now: () => clock,
      idleTimeoutMs: 60_000,
    });

    const first = registry.ask({ question: 'q1', systemPrompt: SYSTEM_PROMPT, projectPath: PROJECT_PATH });
    if (first.status === 'streaming') {
      await drain(first.subscribe);
    }
    clock = new Date('2026-05-28T10:00:10Z');
    const second = registry.ask({ question: 'q2', systemPrompt: SYSTEM_PROMPT, projectPath: PROJECT_PATH });
    if (second.status === 'streaming') {
      await drain(second.subscribe);
    }

    expect(transport.spawnCount).toBe(1);
  });

  it('emits a working then idle status sequence for one question', async () => {
    const transport = new StubEmberSessionTransportGateway();
    const registry = new EmberSessionRegistry({
      transport,
      now: () => new Date('2026-05-28T10:00:00Z'),
      idleTimeoutMs: 60_000,
    });

    const result = registry.ask({ question: 'q', systemPrompt: SYSTEM_PROMPT, projectPath: PROJECT_PATH });
    expect(result.status).toBe('streaming');
    if (result.status !== 'streaming') {
      return;
    }
    const { statuses } = await drain(result.subscribe);

    expect(statuses[0]).toBe('working');
    expect(statuses.at(-1)).toBe('idle');
  });

  it('transparently revives with a fresh spawn after the idle timeout releases the session', async () => {
    const transport = new StubEmberSessionTransportGateway();
    let clock = new Date('2026-05-28T10:00:00Z');
    const registry = new EmberSessionRegistry({
      transport,
      now: () => clock,
      idleTimeoutMs: 60_000,
    });

    const first = registry.ask({ question: 'q1', systemPrompt: SYSTEM_PROMPT, projectPath: PROJECT_PATH });
    if (first.status === 'streaming') {
      await drain(first.subscribe);
    }

    clock = new Date('2026-05-28T10:05:00Z');
    registry.onIdle(clock);

    const second = registry.ask({ question: 'q2', systemPrompt: SYSTEM_PROMPT, projectPath: PROJECT_PATH });
    if (second.status === 'streaming') {
      await drain(second.subscribe);
    }

    expect(transport.spawnCount).toBe(2);
  });

  it('returns unavailable when the transport fails to spawn', () => {
    const transport = new StubEmberSessionTransportGateway();
    transport.failSpawn();
    const registry = new EmberSessionRegistry({
      transport,
      now: () => new Date('2026-05-28T10:00:00Z'),
      idleTimeoutMs: 60_000,
    });

    const result = registry.ask({ question: 'q', systemPrompt: SYSTEM_PROMPT, projectPath: PROJECT_PATH });

    expect(result.status).toBe('unavailable');
  });
});
