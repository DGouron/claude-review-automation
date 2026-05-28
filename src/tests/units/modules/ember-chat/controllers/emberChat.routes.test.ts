import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { emberChatRoutes } from '@/modules/ember-chat/interface-adapters/controllers/http/emberChat.routes.js';
import { EmberSessionRegistry } from '@/modules/ember-chat/usecases/emberSession/emberSessionRegistry.js';
import { StubEmberSessionTransportGateway } from '@/tests/stubs/emberSessionTransport.stub.js';
import { StubEmberReadDataGateway } from '@/tests/stubs/emberReadData.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

const PROJECT_PATH = '/projects/alpha';

function parseSseEvents(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)));
}

describe('emberChat routes', () => {
  let application: FastifyInstance;
  let transport: StubEmberSessionTransportGateway;
  let environment: StubEnvironmentGateway;

  function buildApplication(): FastifyInstance {
    transport = new StubEmberSessionTransportGateway();
    transport.respondWith(async (question) => `Réponse à ${question}`);
    environment = new StubEnvironmentGateway();
    environment.setHasAnthropicApiKey(false);
    const registry = new EmberSessionRegistry({
      transport,
      now: () => new Date('2026-05-28T10:00:00Z'),
      idleTimeoutMs: 60_000,
    });

    const instance = Fastify();
    void instance.register(emberChatRoutes, {
      registry,
      environment,
      readData: new StubEmberReadDataGateway(),
      projectPath: PROJECT_PATH,
      now: () => new Date('2026-05-28T10:00:00Z'),
      logger: createStubLogger(),
    });
    return instance;
  }

  beforeEach(async () => {
    application = buildApplication();
    await application.ready();
  });

  afterEach(async () => {
    await application.close();
  });

  it('rejects an empty question with 400 and never spawns', async () => {
    const response = await application.inject({
      method: 'POST',
      url: '/api/ember/ask',
      payload: { question: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(transport.spawnCount).toBe(0);
  });

  it('streams chunk, status and end events for a valid question', async () => {
    const response = await application.inject({
      method: 'POST',
      url: '/api/ember/ask',
      payload: { question: 'Quel projet a le pire score ?' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');

    const events = parseSseEvents(response.body);
    const statuses = events.filter((event) => event.type === 'status').map((event) => event.state);
    const chunks = events.filter((event) => event.type === 'chunk').map((event) => event.text);

    expect(statuses[0]).toBe('working');
    expect(statuses.at(-1)).toBe('idle');
    expect(chunks.join('')).toContain('Réponse');
  });

  it('emits an error event when the assistant is unreachable', async () => {
    application = buildApplication();
    transport.failSpawn();
    await application.ready();

    const response = await application.inject({
      method: 'POST',
      url: '/api/ember/ask',
      payload: { question: 'Quel projet a le pire score ?' },
    });

    const events = parseSseEvents(response.body);
    const errors = events.filter((event) => event.type === 'error');

    expect(errors.length).toBeGreaterThan(0);
    expect(String(errors[0].message)).toContain('INDISPONIBLE');
  });

  it('does not stream when an Anthropic API key is present', async () => {
    application = buildApplication();
    environment.setHasAnthropicApiKey(true);
    await application.ready();

    const response = await application.inject({
      method: 'POST',
      url: '/api/ember/ask',
      payload: { question: 'Quel projet a le pire score ?' },
    });

    const events = parseSseEvents(response.body);
    const errors = events.filter((event) => event.type === 'error');

    expect(errors.length).toBeGreaterThan(0);
    expect(transport.spawnCount).toBe(0);
  });
});
