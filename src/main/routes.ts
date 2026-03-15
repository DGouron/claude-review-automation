import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { readFileSync } from 'node:fs';
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
import { cleanupRoutes } from '@/interface-adapters/controllers/http/cleanup.routes.js';
import { versionRoutes } from '@/interface-adapters/controllers/http/version.routes.js';
import { registerWebSocketRoutes } from '@/main/websocket.js';
import { handleGitLabWebhook } from '@/interface-adapters/controllers/webhook/gitlab.controller.js';
import { handleGitHubWebhook } from '@/interface-adapters/controllers/webhook/github.controller.js';
import { cancelJob, getJobStatus } from '@/frameworks/queue/pQueueAdapter.js';
import { GitLabThreadFetchGateway, defaultGitLabExecutor } from '@/interface-adapters/gateways/threadFetch.gitlab.gateway.js';
import { GitLabDiffMetadataFetchGateway } from '@/interface-adapters/gateways/diffMetadataFetch.gitlab.gateway.js';
import { GitHubThreadFetchGateway, defaultGitHubExecutor } from '@/interface-adapters/gateways/threadFetch.github.gateway.js';
import { GitHubDiffMetadataFetchGateway } from '@/interface-adapters/gateways/diffMetadataFetch.github.gateway.js';
import { TrackAssignmentUseCase } from '@/usecases/tracking/trackAssignment.usecase.js';
import { RecordReviewCompletionUseCase } from '@/usecases/tracking/recordReviewCompletion.usecase.js';
import { RecordPushUseCase } from '@/usecases/tracking/recordPush.usecase.js';
import { TransitionStateUseCase } from '@/usecases/tracking/transitionState.usecase.js';
import { CheckFollowupNeededUseCase } from '@/usecases/tracking/checkFollowupNeeded.usecase.js';
import { SyncThreadsUseCase } from '@/usecases/tracking/syncThreads.usecase.js';
import { checkVersion } from '@/usecases/version/checkVersion.usecase.js';
import { triggerSelfUpdate } from '@/usecases/version/triggerSelfUpdate.usecase.js';
import { NpmPackageVersionGateway } from '@/interface-adapters/gateways/packageVersion.npm.gateway.js';
import { VersionCacheMemoryGateway } from '@/interface-adapters/gateways/versionCache.memory.gateway.js';
import { SelfUpdateCliGateway } from '@/interface-adapters/gateways/selfUpdate.cli.gateway.js';
import { GitLabDiffStatsFetchGateway } from '@/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.js';
import { GitHubDiffStatsFetchGateway } from '@/interface-adapters/gateways/diffStatsFetch.github.gateway.js';
import { broadcastBackfillProgress } from '@/main/websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readVersion(): string {
  const packageJsonPath = join(__dirname, '..', '..', 'package.json');
  const raw = readFileSync(packageJsonPath, 'utf-8');
  return JSON.parse(raw).version;
}

const currentVersion = readVersion();
const packageVersionGateway = new NpmPackageVersionGateway();
const versionCache = new VersionCacheMemoryGateway();
const selfUpdateCommand = new SelfUpdateCliGateway();

export async function registerRoutes(
  app: FastifyInstance,
  deps: Dependencies
): Promise<void> {
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'interface-adapters', 'views', 'dashboard'),
    prefix: '/dashboard/',
  });

  await app.register(healthRoutes, {
    getConfig: () => ({ version: currentVersion }),
    versionCache,
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
    diffStatsFetchGateways: {
      gitlab: new GitLabDiffStatsFetchGateway(defaultGitLabExecutor),
      github: new GitHubDiffStatsFetchGateway(defaultGitHubExecutor),
    },
    broadcastBackfillProgress,
    logger: deps.logger,
  });

  await app.register(mrTrackingRoutes, {
    reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
  });

  await app.register(mrTrackingAdvancedRoutes, {
    getRepositories: () => deps.config.repositories,
    reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
    logger: deps.logger,
  });

  await app.register(cleanupRoutes, {
    reviewFileGateway: deps.reviewFileGateway,
    reviewLogFileGateway: deps.reviewLogFileGateway,
    getRepositories: () => deps.config.repositories,
    logger: deps.logger,
  });

  await app.register(versionRoutes, {
    checkVersion,
    triggerSelfUpdate,
    currentVersion,
    packageVersionGateway,
    versionCache,
    selfUpdateCommand,
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

  const gitHubThreadFetchGw = new GitHubThreadFetchGateway(defaultGitHubExecutor);

  app.post('/webhooks/github', async (request, reply) => {
    await handleGitHubWebhook(request, reply, deps.logger, trackingGw, {
      reviewContextGateway: deps.reviewContextGateway,
      threadFetchGateway: gitHubThreadFetchGw,
      diffMetadataFetchGateway: new GitHubDiffMetadataFetchGateway(defaultGitHubExecutor),
      trackAssignment: new TrackAssignmentUseCase(trackingGw),
      recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
    });
  });

  app.get('/', async (_request, reply) => {
    reply.redirect('/dashboard/');
  });

  app.get('/api/repositories', async () => {
    return {
      repositories: deps.config.repositories.map((repository) => ({
        name: repository.name,
        localPath: repository.localPath,
        enabled: repository.enabled,
      })),
    };
  });

  app.get('/api', async () => {
    return {
      name: 'reviewflow',
      version: currentVersion,
      endpoints: {
        dashboard: '/dashboard/',
        health: '/health',
        status: '/api/status',
        gitlab: '/webhooks/gitlab',
        github: '/webhooks/github',
      },
    };
  });

  checkVersion(
    { currentVersion, forceRefresh: false },
    { packageVersionGateway, cache: versionCache },
  ).catch(() => {});
}
