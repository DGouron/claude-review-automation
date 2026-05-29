import { describe, it, expect } from 'vitest';
import { StubEmberAnswerTransportGateway } from '@/tests/stubs/emberAnswerTransport.stub.js';
import { StubEmberReadDataGateway } from '@/tests/stubs/emberReadData.stub.js';
import { StubEnvironmentGateway } from '@/tests/stubs/environment.stub.js';
import { askEmber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';
import type { EmberStreamSubscriber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

const PROJECT_PATH = '/projects/alpha';
const FIXED_NOW = (): Date => new Date('2026-05-28T10:00:00Z');

interface DepsOptions {
  hasApiKey: boolean;
  failStart?: boolean;
  failMidStream?: boolean;
}

function buildDeps(options: DepsOptions): {
  transport: StubEmberAnswerTransportGateway;
  environment: StubEnvironmentGateway;
  readData: StubEmberReadDataGateway;
  projectPath: string;
  now: () => Date;
} {
  const transport = new StubEmberAnswerTransportGateway();
  transport.answerFromSystemPrompt();
  if (options.failStart === true) {
    transport.failStart();
  }
  if (options.failMidStream === true) {
    transport.failMidStream();
  }
  const environment = new StubEnvironmentGateway();
  environment.setHasAnthropicApiKey(options.hasApiKey);
  const readData = new StubEmberReadDataGateway();
  readData.setReviewScores(
    PROJECT_PATH,
    ProjectStatsFactory.withReviews([ReviewStatsFactory.create({ mrNumber: 42 })]),
  );
  return { transport, environment, readData, projectPath: PROJECT_PATH, now: FIXED_NOW };
}

function collectStream(subscribe: (subscriber: EmberStreamSubscriber) => void): Promise<{
  answer: string;
  statuses: string[];
  errored: boolean;
}> {
  return new Promise((resolve) => {
    let answer = '';
    let errored = false;
    const statuses: string[] = [];
    subscribe({
      onStatus: (state) => statuses.push(state),
      onChunk: (text) => {
        answer += text;
      },
      onDone: () => resolve({ answer, statuses, errored }),
      onError: () => {
        errored = true;
        resolve({ answer, statuses, errored });
      },
    });
  });
}

describe('askEmber', () => {
  it('streams a grounded answer with a working then idle status sequence', async () => {
    const deps = buildDeps({ hasApiKey: false });

    const result = await askEmber({ question: 'Quel projet a le pire score ?' }, deps);

    expect(result.status).toBe('streaming');
    if (result.status !== 'streaming') {
      return;
    }
    const { answer, statuses } = await collectStream(result.subscribe);
    expect(answer).toContain('42');
    expect(statuses[0]).toBe('working');
    expect(statuses.at(-1)).toBe('idle');
    expect(deps.transport.startCount).toBe(1);
  });

  it('prevents the billing regression when an Anthropic API key is present', async () => {
    const deps = buildDeps({ hasApiKey: true });

    const result = await askEmber({ question: 'Quel projet a le pire score ?' }, deps);

    expect(result.status).toBe('billing-regression-prevented');
    expect(deps.transport.startCount).toBe(0);
  });

  it('returns unavailable when the transport cannot start', async () => {
    const deps = buildDeps({ hasApiKey: false, failStart: true });

    const result = await askEmber({ question: 'Quel projet a le pire score ?' }, deps);

    expect(result.status).toBe('unavailable');
  });

  it('surfaces an error status when answering fails mid-stream', async () => {
    const deps = buildDeps({ hasApiKey: false, failMidStream: true });

    const result = await askEmber({ question: 'Quel projet a le pire score ?' }, deps);

    expect(result.status).toBe('streaming');
    if (result.status !== 'streaming') {
      return;
    }
    const { statuses, errored } = await collectStream(result.subscribe);
    expect(errored).toBe(true);
    expect(statuses).toContain('error');
  });
});
