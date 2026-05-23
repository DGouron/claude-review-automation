import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Dependencies } from '@/main/dependencies.js';
import { healthRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/health.routes.js';
import { settingsRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/settings.routes.js';
import { reviewRoutes } from '@/modules/review-execution/interface-adapters/controllers/http/reviews.routes.js';
import { statsRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.js';
import { mrTrackingRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.js';
import { mrTrackingAdvancedRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.js';
import { logsRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/logs.routes.js';
import { cliStatusRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/cliStatus.routes.js';
import { projectConfigRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.js';
import { cleanupRoutes } from '@/modules/data-lifecycle/interface-adapters/controllers/http/cleanup.routes.js';
import { versionRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/version.routes.js';
import { insightsRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/insights.routes.js';
import { registerWebSocketRoutes } from '@/main/websocket.js';
import { handleGitLabWebhook } from '@/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.js';
import { handleGitHubWebhook } from '@/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.js';
import { cancelJob, getJobStatus } from '@/frameworks/queue/pQueueAdapter.js';
import { GitLabThreadFetchGateway, defaultGitLabExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';
import { GitLabDiffMetadataFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/diffMetadataFetch.gitlab.gateway.js';
import { GitHubThreadFetchGateway, defaultGitHubExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.js';
import { GitHubDiffMetadataFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/diffMetadataFetch.github.gateway.js';
import { GitLabDiffStatsFetchGateway } from '@/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.js';
import { GitHubDiffStatsFetchGateway } from '@/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.github.gateway.js';
import { TrackAssignmentUseCase } from '@/modules/tracking/usecases/tracking/trackAssignment.usecase.js';
import { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import { RecordPushUseCase } from '@/modules/tracking/usecases/tracking/recordPush.usecase.js';
import { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';
import { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import { ReviewContextFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/reviewContext.fileSystem.gateway.js';
import { tokenUsageRoutes } from '@/modules/token-accounting/interface-adapters/controllers/http/tokenUsage.routes.js';
import { SummarizeTokenUsageUseCase } from '@/modules/token-accounting/usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.js';
import { TokenUsageSummaryPresenter } from '@/modules/token-accounting/interface-adapters/presenters/tokenUsageSummary.presenter.js';
import { FilesystemTokenUsageGateway } from '@/modules/token-accounting/interface-adapters/gateways/tokenUsage/tokenUsage.filesystem.gateway.js';
import { budgetRoutes } from '@/modules/token-accounting/interface-adapters/controllers/http/budget.routes.js';
import { FilesystemBudgetGateway } from '@/modules/token-accounting/interface-adapters/gateways/budget/budget.filesystem.gateway.js';
import { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js';
import { UpdateBudgetUseCase } from '@/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.js';
import { EnforceBudgetUseCase } from '@/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.js';
import { BudgetStatusPresenter } from '@/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.js';
import { BUDGET_DEFAULT_USD } from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';
import { broadcastBudgetExceeded, broadcastBudgetStatus } from '@/main/websocket.js';
import {
  createDefaultClaudeInvokerDependencies,
  type ClaudeInvokerDependencies,
} from '@/frameworks/claude/claudeInvoker.js';
import { checkVersion } from '@/modules/cli-configuration/usecases/version/checkVersion.usecase.js';
import { triggerSelfUpdate } from '@/modules/cli-configuration/usecases/version/triggerSelfUpdate.usecase.js';
import { NpmPackageVersionGateway } from '@/modules/cli-configuration/interface-adapters/gateways/packageVersion.npm.gateway.js';
import { VersionCacheMemoryGateway } from '@/modules/cli-configuration/interface-adapters/gateways/versionCache.memory.gateway.js';
import { SelfUpdateCliGateway } from '@/modules/cli-configuration/interface-adapters/gateways/selfUpdate.cli.gateway.js';
import { InstallTypeDetectorFsGateway } from '@/modules/cli-configuration/interface-adapters/gateways/installTypeDetector.fs.gateway.js';
import { broadcastBackfillProgress } from '@/main/websocket.js';
import { createClaudeInsightsInvoker } from '@/frameworks/claude/claudeInsightsInvoker.js';
import { getDefaultLanguage } from '@/frameworks/settings/runtimeSettings.js';

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
const installTypeDetector = new InstallTypeDetectorFsGateway();

export async function registerRoutes(
  app: FastifyInstance,
  deps: Dependencies
): Promise<void> {
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'dashboard'),
    prefix: '/dashboard/',
  });

  await app.register(healthRoutes, {
    getConfig: () => ({ version: currentVersion }),
    versionCache,
    supervisorStatusStore: deps.supervisorStatusStore,
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

  const tokenUsageGateway = new FilesystemTokenUsageGateway();
  await app.register(tokenUsageRoutes, {
    summarizeTokenUsage: new SummarizeTokenUsageUseCase(tokenUsageGateway),
    presenter: new TokenUsageSummaryPresenter(),
  });

  const budgetGateway = new FilesystemBudgetGateway();
  const existingBudget = await budgetGateway.load();
  if (existingBudget === null) {
    await budgetGateway.save({ limitUsd: BUDGET_DEFAULT_USD });
  }
  const getBudgetStatus = new GetBudgetStatusUseCase({ budgetGateway, tokenUsageGateway });
  const updateBudget = new UpdateBudgetUseCase({ budgetGateway });
  const enforceBudget = new EnforceBudgetUseCase({ getBudgetStatus });
  const budgetStatusPresenter = new BudgetStatusPresenter();
  await app.register(budgetRoutes, {
    getBudgetStatus,
    updateBudget,
    budgetGateway,
    presenter: budgetStatusPresenter,
    getRepositories: () => deps.config.repositories,
  });

  const claudeInvokerDeps: ClaudeInvokerDependencies = {
    ...createDefaultClaudeInvokerDependencies(),
    getBudgetStatus,
    budgetStatusPresenter,
    broadcastBudgetStatus,
    getEnabledLocalPaths: () =>
      deps.config.repositories.filter((repository) => repository.enabled).map((repository) => repository.localPath),
    // Reuse the shared invocation deps so timers (server.ts) and review jobs
    // see the same BillingState / SupervisorHealth / completion bridge.
    invocation: deps.claudeInvocationDeps,
  };

  const threadFetchGatewayFactory = (platform: 'gitlab' | 'github') =>
    platform === 'github'
      ? new GitHubThreadFetchGateway(defaultGitHubExecutor)
      : new GitLabThreadFetchGateway(defaultGitLabExecutor);
  await app.register(mrTrackingAdvancedRoutes, {
    getRepositories: () => deps.config.repositories,
    reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
    reviewContextGateway: new ReviewContextFileSystemGateway(),
    threadFetchGatewayFactory,
    diffMetadataFetchGatewayFactory: (platform) =>
      platform === 'github'
        ? new GitHubDiffMetadataFetchGateway(defaultGitHubExecutor)
        : new GitLabDiffMetadataFetchGateway(defaultGitLabExecutor),
    diffStatsFetchGatewayFactory: (platform) =>
      platform === 'github'
        ? new GitHubDiffStatsFetchGateway(defaultGitHubExecutor)
        : new GitLabDiffStatsFetchGateway(defaultGitLabExecutor),
    createSyncThreadsUseCase: (platform) =>
      new SyncThreadsUseCase(deps.reviewRequestTrackingGateway, threadFetchGatewayFactory(platform)),
    recordReviewCompletion: new RecordReviewCompletionUseCase(deps.reviewRequestTrackingGateway),
    enforceBudget,
    broadcastBudgetExceeded,
    claudeInvokerDeps,
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
    installTypeDetector,
    serverPort: deps.config.server.port,
  });

  await app.register(insightsRoutes, {
    statsGateway: deps.statsGateway,
    insightsGateway: deps.insightsGateway,
    reviewFileGateway: deps.reviewFileGateway,
    reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
    logger: deps.logger,
    claudeInvoker: createClaudeInsightsInvoker(),
    language: getDefaultLanguage(),
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
      diffStatsFetchGateway: new GitLabDiffStatsFetchGateway(defaultGitLabExecutor),
      trackAssignment: new TrackAssignmentUseCase(trackingGw),
      recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
      recordPush: new RecordPushUseCase(trackingGw),
      transitionState: new TransitionStateUseCase(trackingGw),
      checkFollowupNeeded: new CheckFollowupNeededUseCase(trackingGw),
      syncThreads: new SyncThreadsUseCase(trackingGw, threadFetchGw),
      enforceBudget,
      broadcastBudgetExceeded,
      getRepositories: () => deps.config.repositories,
      claudeInvokerDeps,
    });
  });

  const gitHubThreadFetchGw = new GitHubThreadFetchGateway(defaultGitHubExecutor);

  app.post('/webhooks/github', async (request, reply) => {
    await handleGitHubWebhook(request, reply, deps.logger, trackingGw, {
      reviewContextGateway: deps.reviewContextGateway,
      threadFetchGateway: gitHubThreadFetchGw,
      diffMetadataFetchGateway: new GitHubDiffMetadataFetchGateway(defaultGitHubExecutor),
      diffStatsFetchGateway: new GitHubDiffStatsFetchGateway(defaultGitHubExecutor),
      trackAssignment: new TrackAssignmentUseCase(trackingGw),
      recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
      recordPush: new RecordPushUseCase(trackingGw),
      transitionState: new TransitionStateUseCase(trackingGw),
      checkFollowupNeeded: new CheckFollowupNeededUseCase(trackingGw),
      syncThreads: new SyncThreadsUseCase(trackingGw, gitHubThreadFetchGw),
      enforceBudget,
      broadcastBudgetExceeded,
      getRepositories: () => deps.config.repositories,
      claudeInvokerDeps,
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
    { packageVersionGateway, cache: versionCache, installTypeDetector },
  ).catch(() => {});
}
