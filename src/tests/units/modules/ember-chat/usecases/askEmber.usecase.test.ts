import { describe, it, expect } from 'vitest';
import { StubEmberSessionTransportGateway } from '@/tests/stubs/emberSessionTransport.stub.js';
import { StubEmberReadDataGateway } from '@/tests/stubs/emberReadData.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';
import { EmberSessionRegistry } from '@/modules/ember-chat/usecases/emberSession/emberSessionRegistry.js';
import { askEmber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';

const PROJECT_PATH = '/projects/alpha';

function buildDeps(options: { hasApiKey: boolean; failSpawn?: boolean }): {
  registry: EmberSessionRegistry;
  environment: StubEnvironmentGateway;
  readData: StubEmberReadDataGateway;
  projectPath: string;
  now: () => Date;
} {
  const transport = new StubEmberSessionTransportGateway();
  if (options.failSpawn === true) {
    transport.failSpawn();
  }
  const registry = new EmberSessionRegistry({
    transport,
    now: () => new Date('2026-05-28T10:00:00Z'),
    idleTimeoutMs: 60_000,
  });
  const environment = new StubEnvironmentGateway();
  environment.setHasAnthropicApiKey(options.hasApiKey);
  const readData = new StubEmberReadDataGateway();
  return {
    registry,
    environment,
    readData,
    projectPath: PROJECT_PATH,
    now: () => new Date('2026-05-28T10:00:00Z'),
  };
}

describe('askEmber', () => {
  it('returns a streaming result for a valid question with no API key', async () => {
    const deps = buildDeps({ hasApiKey: false });

    const result = await askEmber({ question: 'Quel projet a le pire score ?' }, deps);

    expect(result.status).toBe('streaming');
  });

  it('prevents the billing regression when an Anthropic API key is present', async () => {
    const deps = buildDeps({ hasApiKey: true });

    const result = await askEmber({ question: 'Quel projet a le pire score ?' }, deps);

    expect(result.status).toBe('billing-regression-prevented');
  });

  it('returns unavailable when the transport cannot spawn', async () => {
    const deps = buildDeps({ hasApiKey: false, failSpawn: true });

    const result = await askEmber({ question: 'Quel projet a le pire score ?' }, deps);

    expect(result.status).toBe('unavailable');
  });
});
