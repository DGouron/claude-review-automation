import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Dependencies } from '@/main/dependencies.js';
import { healthRoutes } from '@/interface-adapters/controllers/http/health.routes.js';
import { settingsRoutes } from '@/interface-adapters/controllers/http/settings.routes.js';
import { reviewRoutes } from '@/interface-adapters/controllers/http/reviews.routes.js';
import { statsRoutes } from '@/interface-adapters/controllers/http/stats.routes.js';
import { mrTrackingRoutes } from '@/interface-adapters/controllers/http/mrTracking.routes.js';
import { mrTrackingAdvancedRoutes } from '@/interface-adapters/controllers/http/mrTrackingAdvanced.routes.js';
import { logsRoutes } from '@/interface-adapters/controllers/http/logs.routes.js';
import { cliStatusRoutes } from '@/interface-adapters/controllers/http/cliStatus.routes.js';
import { projectConfigRoutes } from '@/interface-adapters/controllers/http/projectConfig.routes.js';
import { registerWebSocketRoutes } from '@/main/websocket.js';
import { handleGitLabWebhook } from '@/interface-adapters/controllers/webhook/gitlab.controller.js';
import { handleGitHubWebhook } from '@/interface-adapters/controllers/webhook/github.controller.js';
import { cancelJob, getJobStatus } from '@/frameworks/queue/pQueueAdapter.js';
import { GitLabThreadFetchGateway, defaultGitLabExecutor } from '@/interface-adapters/gateways/threadFetch.gitlab.gateway.js';
import { GitLabDiffMetadataFetchGateway } from '@/interface-adapters/gateways/diffMetadataFetch.gitlab.gateway.js';
import { TrackAssignmentUseCase } from '@/usecases/tracking/trackAssignment.usecase.js';
import { RecordReviewCompletionUseCase } from '@/usecases/tracking/recordReviewCompletion.usecase.js';
import { RecordPushUseCase } from '@/usecases/tracking/recordPush.usecase.js';
import { TransitionStateUseCase } from '@/usecases/tracking/transitionState.usecase.js';
import { CheckFollowupNeededUseCase } from '@/usecases/tracking/checkFollowupNeeded.usecase.js';
import { SyncThreadsUseCase } from '@/usecases/tracking/syncThreads.usecase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function registerRoutes(
  app: FastifyInstance,
  deps: Dependencies
): Promise<void> {
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'interface-adapters', 'views', 'dashboard'),
    prefix: '/dashboard/',
  });

  await app.register(healthRoutes, {
    getConfig: () => ({ version: '1.0.0' }),
  });

  await app.register(settingsRoutes);

  await app.register(reviewRoutes, {
    reviewFileGateway: deps.reviewFileGateway,
    reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
    getRepositories: () => deps.config.repositories,
    queuePort: { getJobStatus, cancelJob },
    logger: deps.logger,
  });

  await app.register(statsRoutes, {
    statsGateway: deps.statsGateway,
    getRepositories: () => deps.config.repositories,
  });

  await app.register(mrTrackingRoutes, {
    reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
  });

  await app.register(mrTrackingAdvancedRoutes, {
    getRepositories: () => deps.config.repositories,
    reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
    logger: deps.logger,
  });

  await app.register(logsRoutes);
  await app.register(cliStatusRoutes);
  await app.register(projectConfigRoutes);

  await registerWebSocketRoutes(app, deps);

  const trackingGw = deps.reviewRequestTrackingGateway;
  const threadFetchGw = new GitLabThreadFetchGateway(defaultGitLabExecutor);

  app.post('/webhooks/gitlab', async (request, reply) => {
    await handleGitLabWebhook(request, reply, deps.logger, trackingGw, {
      reviewContextGateway: deps.reviewContextGateway,
      threadFetchGateway: threadFetchGw,
      diffMetadataFetchGateway: new GitLabDiffMetadataFetchGateway(defaultGitLabExecutor),
      trackAssignment: new TrackAssignmentUseCase(trackingGw),
      recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
      recordPush: new RecordPushUseCase(trackingGw),
      transitionState: new TransitionStateUseCase(trackingGw),
      checkFollowupNeeded: new CheckFollowupNeededUseCase(trackingGw),
      syncThreads: new SyncThreadsUseCase(trackingGw, threadFetchGw),
    });
  });

  app.post('/webhooks/github', async (request, reply) => {
    await handleGitHubWebhook(request, reply, deps.logger, deps.reviewRequestTrackingGateway);
  });

  app.get('/', async (_request, reply) => {
    reply.redirect('/dashboard/');
  });

  app.get('/api', async () => {
    return {
      name: 'reviewflow',
      version: '1.0.0',
      endpoints: {
        dashboard: '/dashboard/',
        health: '/health',
        status: '/api/status',
        gitlab: '/webhooks/gitlab',
        github: '/webhooks/github',
      },
    };
  });
}
