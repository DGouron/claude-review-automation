import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { loadConfig, type Config } from '../config/loader.js';
import { createDependencies, type Dependencies } from './dependencies.js';
import { registerRoutes } from './routes.js';
import { setupWebSocketCallbacks } from './websocket.js';
import { initQueue } from '../frameworks/queue/pQueueAdapter.js';
import { removePidFile } from '../shared/services/pidFileManager.js';
import { PID_FILE_PATH } from '../shared/services/daemonPaths.js';
import { startCleanupScheduler } from '../frameworks/scheduler/cleanupScheduler.js';
import { startWorktreeSweepScheduler } from '../frameworks/scheduler/worktreeSweepScheduler.js';
import { startClaudeInvocationTimers } from '@/frameworks/claude/timers/claudeInvocationTimers.js';
import { InMemorySupervisorHealthGateway } from '@/modules/claude-invocation/interface-adapters/gateways/supervisorHealth.memory.gateway.js';
import { startSupervisorScheduler } from '@/frameworks/scheduler/supervisorScheduler.js';
import { SupervisorCliGateway, createDefaultSupervisorProbe, createDefaultSupervisorSpawner } from '@/modules/supervisor-management/interface-adapters/gateways/supervisor.cli.gateway.js';
import { SupervisorLockFileSystemGateway, createDefaultSupervisorLockFileSystem, getDefaultSupervisorLockFilePath } from '@/modules/supervisor-management/interface-adapters/gateways/supervisorLock.fileSystem.gateway.js';
import { runReviewRecovery } from '@/modules/review-execution/services/reviewRecovery.service.js';
import { executeActionsFromContext } from '@/modules/review-execution/services/contextActionsExecutor.js';
import { defaultCommandExecutor } from '@/modules/review-execution/services/threadActionsExecutor.js';

export interface ServerOptions {
  config?: Config;
  portOverride?: number;
}

function addRawBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body: Buffer, done) => {
      (req as typeof req & { rawBody: Buffer }).rawBody = body;
      try {
        const json = JSON.parse(body.toString());
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );
}

async function buildServer(deps: Dependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  addRawBodyParser(app);
  await app.register(fastifyWebsocket);
  await registerRoutes(app, deps);

  return app;
}

export async function createServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const deps = createDependencies(config);

  return buildServer(deps);
}

export async function startServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const deps = createDependencies(config);

  initQueue(deps.logger);
  setupWebSocketCallbacks({
    reviewContextWatcher: deps.reviewContextWatcher,
    progressPresenter: deps.progressPresenter,
  });

  const cleanupScheduler = startCleanupScheduler({
    reviewFileGateway: deps.reviewFileGateway,
    reviewLogFileGateway: deps.reviewLogFileGateway,
    getRepositories: () => config.repositories,
    logger: deps.logger,
  });

  const worktreeSweepScheduler = startWorktreeSweepScheduler({
    worktreeGateway: deps.worktreeGateway,
    trackingGateway: deps.reviewRequestTrackingGateway,
    getRepositories: () => config.repositories,
    logger: deps.logger,
    now: () => new Date(),
  });

  deps.sweepSchedulerControls = {
    getLastSweep: () => worktreeSweepScheduler.getLastSweep(),
    getNextSweepEta: () => worktreeSweepScheduler.getNextSweepEta(),
    runSweepNow: () => worktreeSweepScheduler.runSweepNow(),
  };

  const app = await buildServer(deps);
  const port = options.portOverride ?? config.server.port;

  const supervisorGateway = new SupervisorCliGateway({
    probe: createDefaultSupervisorProbe(),
    spawn: createDefaultSupervisorSpawner(),
  });
  const supervisorLockGateway = new SupervisorLockFileSystemGateway({
    lockFilePath: getDefaultSupervisorLockFilePath(),
    currentPid: process.pid,
    fileSystem: createDefaultSupervisorLockFileSystem(),
  });
  const supervisorScheduler = startSupervisorScheduler({
    supervisorGateway,
    lockGateway: supervisorLockGateway,
    statusStore: deps.supervisorStatusStore,
    logger: deps.logger,
    now: () => new Date(),
    intervalMs: 60_000,
  });

  // Supervisor health has its own gateway because it is not consumed by the
  // review dispatch path (only by the dashboard). Billing state and session
  // gateway, in contrast, must be shared so a paused billing state pauses
  // dispatch, and so timers and reviews talk to the same Claude CLI.
  const supervisorHealthGateway = new InMemorySupervisorHealthGateway();
  const stopClaudeInvocationTimers = startClaudeInvocationTimers({
    sessionGateway: deps.claudeInvocationDeps.sessionGateway,
    supervisorHealthGateway,
    billingStateGateway: deps.claudeInvocationDeps.billingState,
    now: () => new Date(),
    supervisorIntervalMs: 5 * 60 * 1000,
    billingIntervalMs: 60 * 60 * 1000,
  });

  await app.listen({
    port,
    host: '0.0.0.0',
  });

  // Recovery runs as a non-blocking background task so the HTTP listener is
  // available immediately at boot. A long replay backlog can't delay health
  // checks or webhook reception.
  void runReviewRecovery({
    repositories: config.repositories.filter((repo) => repo.enabled),
    reviewContextGateway: deps.reviewContextGateway,
    executeActions: async (context, localPath) => {
      const result = await executeActionsFromContext(
        context,
        localPath,
        deps.logger,
        defaultCommandExecutor,
      );
      return { success: result.failed === 0 };
    },
    now: () => Date.now(),
    logger: deps.logger,
  })
    .then((summary) => {
      deps.logger.info(summary, 'Review recovery completed in background');
    })
    .catch((error) => {
      deps.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Review recovery threw unexpectedly',
      );
    });

  const shutdown = async () => {
    deps.logger.info('Shutting down...');
    cleanupScheduler.stop();
    worktreeSweepScheduler.stop();
    stopClaudeInvocationTimers();
    supervisorScheduler.stop();
    removePidFile(PID_FILE_PATH);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return app;
}
