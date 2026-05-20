import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/frameworks/queue/pQueueAdapter.js', () => ({
  enqueueReview: vi.fn(async () => true),
  createJobId: vi.fn(() => 'gitlab-followup-test-org/test-project-42'),
  updateJobProgress: vi.fn(),
}));

vi.mock('@/config/projectConfig.js', () => ({
  loadProjectConfig: vi.fn(() => null),
  getFollowupAgents: vi.fn(() => null),
}));

vi.mock('@/claude/invoker.js', () => ({
  invokeClaudeReview: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('@/main/websocket.js', () => ({
  startWatchingReviewContext: vi.fn(),
  stopWatchingReviewContext: vi.fn(),
}));

vi.mock('@/frameworks/logging/logBuffer.js', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { mrTrackingAdvancedRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.js';
import { enqueueReview } from '@/frameworks/queue/pQueueAdapter.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

interface BuildAppOptions {
  enforceBudgetAccepted: boolean;
  consumedUsd?: number;
  limitUsd?: number;
}

interface AppBundle {
  app: FastifyInstance;
  broadcastBudgetExceeded: ReturnType<typeof vi.fn>;
  enforceBudgetExecute: ReturnType<typeof vi.fn>;
}

async function buildApp(options: BuildAppOptions): Promise<AppBundle> {
  const consumedUsd = options.consumedUsd ?? 0;
  const limitUsd = options.limitUsd ?? 200;
  const broadcastBudgetExceeded = vi.fn();
  const enforceBudgetExecute = vi.fn(async () => ({
    accepted: options.enforceBudgetAccepted,
    status: {
      limitUsd,
      consumedUsd,
      remainingUsd: Math.max(0, limitUsd - consumedUsd),
      percentUsed: limitUsd === 0 ? 0 : (consumedUsd / limitUsd) * 100,
      exceeded: !options.enforceBudgetAccepted,
      periodStart: '2026-05-01T00:00:00.000Z',
    },
  }));

  const app = Fastify();
  await app.register(mrTrackingAdvancedRoutes, {
    getRepositories: () => [
      {
        name: 'test',
        platform: 'gitlab',
        localPath: '/home/user/projects/test',
        remoteUrl: 'https://gitlab.com/test-org/test-project.git',
        skill: 'review',
        enabled: true,
      },
    ],
    reviewRequestTrackingGateway: {
      getById: vi.fn(() => null),
      getByNumber: vi.fn(() => null),
      create: vi.fn(),
      update: vi.fn(),
      getByState: vi.fn(() => []),
      getActiveMrs: vi.fn(() => []),
      remove: vi.fn(() => true),
      archive: vi.fn(() => true),
      recordReviewEvent: vi.fn(),
      recordPush: vi.fn(() => null),
      loadTracking: vi.fn(() => null),
      saveTracking: vi.fn(),
    } as never,
    reviewContextGateway: { create: vi.fn(), read: vi.fn(() => null), updateProgress: vi.fn() } as never,
    threadFetchGatewayFactory: () => ({ fetchThreads: vi.fn(() => []) }) as never,
    diffMetadataFetchGatewayFactory: () => ({ fetchDiffMetadata: vi.fn(() => undefined) }) as never,
    diffStatsFetchGatewayFactory: () => ({ fetchDiffStats: vi.fn(() => null) }) as never,
    createSyncThreadsUseCase: () => ({ execute: vi.fn() }) as never,
    recordReviewCompletion: { execute: vi.fn() } as never,
    enforceBudget: { execute: enforceBudgetExecute } as never,
    broadcastBudgetExceeded,
    logger: createStubLogger(),
  });

  return { app, broadcastBudgetExceeded, enforceBudgetExecute };
}

describe('mrTrackingAdvancedRoutes POST /api/mr-tracking/followup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects with status=rejected and broadcasts budget-exceeded when enforceBudget refuses', async () => {
    const { app, broadcastBudgetExceeded, enforceBudgetExecute } = await buildApp({
      enforceBudgetAccepted: false,
      consumedUsd: 200.1,
      limitUsd: 200,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: {
        mrId: 'gitlab-test-org/test-project-42',
        projectPath: '/home/user/projects/test',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'rejected', reason: 'budget-exceeded' });
    expect(enforceBudgetExecute).toHaveBeenCalled();
    expect(enqueueReview).not.toHaveBeenCalled();
    expect(broadcastBudgetExceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        mrNumber: 42,
        platform: 'gitlab',
        limitUsd: 200,
        consumedUsd: 200.1,
      }),
    );

    await app.close();
  });

  it('enqueues the followup when enforceBudget accepts', async () => {
    const { app, broadcastBudgetExceeded, enforceBudgetExecute } = await buildApp({
      enforceBudgetAccepted: true,
    });

    await app.inject({
      method: 'POST',
      url: '/api/mr-tracking/followup',
      payload: {
        mrId: 'gitlab-test-org/test-project-42',
        projectPath: '/home/user/projects/test',
      },
    });

    expect(enforceBudgetExecute).toHaveBeenCalled();
    expect(enqueueReview).toHaveBeenCalled();
    expect(broadcastBudgetExceeded).not.toHaveBeenCalled();

    await app.close();
  });
});
