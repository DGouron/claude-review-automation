import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { budgetRoutes } from '@/modules/token-accounting/interface-adapters/controllers/http/budget.routes.js';
import { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js';
import { UpdateBudgetUseCase } from '@/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.js';
import { EnforceBudgetUseCase } from '@/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.js';
import { BudgetStatusPresenter } from '@/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.js';
import { StubBudgetGateway } from '@/tests/stubs/budget.stub.js';
import { StubTokenUsageGateway } from '@/tests/stubs/tokenUsage.stub.js';
import { TokenUsageRecordFactory } from '@/tests/factories/tokenUsage.factory.js';

interface TestContext {
  app: FastifyInstance;
  budgetGateway: StubBudgetGateway;
  tokenUsageGateway: StubTokenUsageGateway;
  enforceBudget: EnforceBudgetUseCase;
  presenter: BudgetStatusPresenter;
  now: Date;
}

const LOCAL_PATH = '/tmp/acceptance-project';
const PROJECT_PATH = 'group/project';
const PLATFORM = 'gitlab' as const;

async function buildContext(now: Date): Promise<TestContext> {
  const budgetGateway = new StubBudgetGateway();
  const tokenUsageGateway = new StubTokenUsageGateway();
  const getBudgetStatus = new GetBudgetStatusUseCase({
    budgetGateway,
    tokenUsageGateway,
  });
  const updateBudget = new UpdateBudgetUseCase({ budgetGateway });
  const enforceBudget = new EnforceBudgetUseCase({ getBudgetStatus });
  const presenter = new BudgetStatusPresenter();

  const app = Fastify();
  await app.register(budgetRoutes, {
    getBudgetStatus,
    updateBudget,
    budgetGateway,
    presenter,
    getRepositories: () => [
      { name: 'repo', platform: PLATFORM, remoteUrl: '', localPath: LOCAL_PATH, skill: 'review', enabled: true },
    ],
    now: () => now,
  });

  return { app, budgetGateway, tokenUsageGateway, enforceBudget, presenter, now };
}

describe('Acceptance — Spec #163: Token Budget Cap with Live Indicator', () => {
  describe('Scenario 2: Move the slider to 350', () => {
    let context: TestContext;

    beforeEach(async () => {
      context = await buildContext(new Date('2026-05-20T12:00:00Z'));
      await context.budgetGateway.save({ limitUsd: 200 });
    });

    it('updates the budget to 350 and persists it', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/budget',
        payload: { limitUsd: 350 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { success: boolean; limitUsd: number };
      expect(body.success).toBe(true);
      expect(body.limitUsd).toBe(350);

      const persisted = await context.budgetGateway.load();
      expect(persisted).toEqual({ limitUsd: 350 });

      await context.app.close();
    });
  });

  describe('Scenario 3: Try to push the budget above the ceiling', () => {
    let context: TestContext;

    beforeEach(async () => {
      context = await buildContext(new Date('2026-05-20T12:00:00Z'));
      await context.budgetGateway.save({ limitUsd: 200 });
    });

    it('rejects 750 with HTTP 400 and leaves the on-disk budget unchanged', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/budget',
        payload: { limitUsd: 750 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json() as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain('0');
      expect(body.error).toContain('600');

      const persisted = await context.budgetGateway.load();
      expect(persisted).toEqual({ limitUsd: 200 });

      await context.app.close();
    });
  });

  describe('Scenario 6: Block a fresh review when over budget', () => {
    let context: TestContext;

    beforeEach(async () => {
      context = await buildContext(new Date('2026-05-20T12:00:00Z'));
      await context.budgetGateway.save({ limitUsd: 200 });
      context.tokenUsageGateway.setRecords([
        TokenUsageRecordFactory.create({
          recordedAt: '2026-05-10T00:00:00Z',
          localPath: LOCAL_PATH,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            costUsd: 200.1,
          },
        }),
      ]);
    });

    it('returns accepted=false and exposes the consumption that triggered the rejection', async () => {
      const decision = await context.enforceBudget.execute({
        localPaths: [LOCAL_PATH],
        now: context.now,
      });

      expect(decision.accepted).toBe(false);
      expect(decision.status.exceeded).toBe(true);
      expect(decision.status.limitUsd).toBe(200);
      expect(decision.status.consumedUsd).toBeCloseTo(200.1, 2);

      const viewModel = context.presenter.present(decision.status);
      expect(viewModel.exceeded).toBe(true);

      await context.app.close();
    });
  });

  describe('Scenario 8: Allow when within budget', () => {
    let context: TestContext;

    beforeEach(async () => {
      context = await buildContext(new Date('2026-05-20T12:00:00Z'));
      await context.budgetGateway.save({ limitUsd: 200 });
      context.tokenUsageGateway.setRecords([
        TokenUsageRecordFactory.create({
          recordedAt: '2026-05-10T00:00:00Z',
          localPath: LOCAL_PATH,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            costUsd: 199.99,
          },
        }),
      ]);
    });

    it('returns accepted=true when consumption is under the limit', async () => {
      const decision = await context.enforceBudget.execute({
        localPaths: [LOCAL_PATH],
        now: context.now,
      });

      expect(decision.accepted).toBe(true);
      expect(decision.status.exceeded).toBe(false);
      expect(decision.status.consumedUsd).toBeCloseTo(199.99, 2);

      await context.app.close();
    });

    void PROJECT_PATH;
  });

  describe('Scenario 10: New calendar month resets the period', () => {
    let context: TestContext;

    beforeEach(async () => {
      context = await buildContext(new Date('2026-06-01T00:00:00Z'));
      await context.budgetGateway.save({ limitUsd: 200 });
      context.tokenUsageGateway.setRecords([
        TokenUsageRecordFactory.create({
          recordedAt: '2026-05-31T23:00:00Z',
          localPath: LOCAL_PATH,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            costUsd: 200.5,
          },
        }),
      ]);
    });

    it('ignores prior-month consumption and accepts new reviews in June', async () => {
      const decision = await context.enforceBudget.execute({
        localPaths: [LOCAL_PATH],
        now: context.now,
      });

      expect(decision.accepted).toBe(true);
      expect(decision.status.consumedUsd).toBe(0);
      expect(decision.status.periodStart).toBe('2026-06-01T00:00:00.000Z');

      await context.app.close();
    });
  });
});
