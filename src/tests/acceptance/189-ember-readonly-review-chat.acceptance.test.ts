import { describe, it, expect } from 'vitest';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';
import { StubEmberReadDataGateway } from '@/tests/stubs/emberReadData.stub.js';
import { StubEmberSessionTransportGateway } from '@/tests/stubs/emberSessionTransport.stub.js';
import { EmberSessionRegistry } from '@/modules/ember-chat/usecases/emberSession/emberSessionRegistry.js';
import { askEmber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';
import type { EmberStreamSubscriber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';

const PROJECT_PATH = '/projects/alpha';
const FIXED_NOW = (): Date => new Date('2026-05-28T10:00:00Z');

function fixedReviewData(): StubEmberReadDataGateway {
  const worstProject = ProjectStatsFactory.withReviews([
    ReviewStatsFactory.create({ mrNumber: 42, score: 3, blocking: 4, warnings: 1 }),
    ReviewStatsFactory.create({ mrNumber: 43, score: 4, blocking: 2, warnings: 0 }),
  ]);
  const readData = new StubEmberReadDataGateway();
  readData.setReviewScores(PROJECT_PATH, worstProject);
  return readData;
}

function buildRegistry(transport: StubEmberSessionTransportGateway): EmberSessionRegistry {
  return new EmberSessionRegistry({ transport, now: FIXED_NOW, idleTimeoutMs: 60_000 });
}

function buildEnvironment(hasApiKey: boolean): StubEnvironmentGateway {
  const environment = new StubEnvironmentGateway();
  environment.setHasAnthropicApiKey(hasApiKey);
  return environment;
}

function collectStream(subscribe: (subscriber: EmberStreamSubscriber) => void): Promise<{
  answer: string;
  statuses: string[];
}> {
  return new Promise((resolve) => {
    let answer = '';
    const statuses: string[] = [];
    subscribe({
      onStatus: (state) => {
        statuses.push(state);
      },
      onChunk: (text) => {
        answer += text;
      },
      onDone: () => {
        resolve({ answer, statuses });
      },
      onError: () => {
        resolve({ answer, statuses });
      },
    });
  });
}

describe('Ask Ember about your reviews (acceptance, SPEC-189 Phase A)', () => {
  describe('Ember answers from review data with a working then idle status sequence', () => {
    it('ask about scores: the answer is grounded in the current review scores', async () => {
      const readData = fixedReviewData();
      const transport = new StubEmberSessionTransportGateway();
      transport.answerFromSystemPrompt();

      const result = await askEmber(
        { question: 'Quel projet a le pire score moyen cette semaine ?' },
        {
          registry: buildRegistry(transport),
          environment: buildEnvironment(false),
          readData,
          projectPath: PROJECT_PATH,
          now: FIXED_NOW,
        },
      );

      expect(result.status).toBe('streaming');
      if (result.status !== 'streaming') {
        return;
      }

      const { answer, statuses } = await collectStream(result.subscribe);

      // "42" reaches the answer only by traversing the production grounding path:
      // readData -> askEmber -> system prompt -> session. The stub echoes the prompt.
      expect(answer).toContain('42');
      expect(statuses[0]).toBe('working');
      expect(statuses.at(-1)).toBe('idle');
    });
  });

  describe('Ember requires no API key', () => {
    it('billing regression: declines to spawn when an Anthropic API key is present', async () => {
      const transport = new StubEmberSessionTransportGateway();
      transport.answerFromSystemPrompt();

      const result = await askEmber(
        { question: 'Quel projet a le pire score moyen cette semaine ?' },
        {
          registry: buildRegistry(transport),
          environment: buildEnvironment(true),
          readData: fixedReviewData(),
          projectPath: PROJECT_PATH,
          now: FIXED_NOW,
        },
      );

      expect(result.status).toBe('billing-regression-prevented');
      expect(transport.spawnCount).toBe(0);
    });
  });

  describe('within a session, consecutive questions reuse one Ember', () => {
    it('follow-up keeps context: a second question does not cold-start a new session', async () => {
      const transport = new StubEmberSessionTransportGateway();
      transport.answerFromSystemPrompt();
      const deps = {
        registry: buildRegistry(transport),
        environment: buildEnvironment(false),
        readData: fixedReviewData(),
        projectPath: PROJECT_PATH,
        now: FIXED_NOW,
      };

      const first = await askEmber({ question: 'Quel projet a le pire score moyen ?' }, deps);
      if (first.status === 'streaming') {
        await collectStream(first.subscribe);
      }
      const second = await askEmber({ question: 'Et le mois dernier ?' }, deps);
      if (second.status === 'streaming') {
        await collectStream(second.subscribe);
      }

      expect(transport.spawnCount).toBe(1);
    });
  });

  describe('when Ember cannot be reached, the chat reports unavailability', () => {
    it('assistant unreachable: returns unavailable when the transport fails to spawn', async () => {
      const transport = new StubEmberSessionTransportGateway();
      transport.failSpawn();

      const result = await askEmber(
        { question: 'Quel projet a le pire score moyen ?' },
        {
          registry: buildRegistry(transport),
          environment: buildEnvironment(false),
          readData: fixedReviewData(),
          projectPath: PROJECT_PATH,
          now: FIXED_NOW,
        },
      );

      expect(result.status).toBe('unavailable');
    });
  });
});
