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
import { startClaudeInvocationTimers } from '@/frameworks/claude/timers/claudeInvocationTimers.js';
import { InMemoryBillingStateGateway } from '@/modules/claude-invocation/interface-adapters/gateways/billingState.memory.gateway.js';
import { InMemorySupervisorHealthGateway } from '@/modules/claude-invocation/interface-adapters/gateways/supervisorHealth.memory.gateway.js';
import { ClaudeSessionCliGateway, type ClaudeProcessRunner } from '@/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.js';
import { spawn } from 'node:child_process';
import { resolveClaudePath } from '@/shared/services/claudePathResolver.js';

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

function createProcessRunner(): ClaudeProcessRunner {
  return async ({ args, cwd, env }) => {
    return await new Promise((resolve, reject) => {
      const child = spawn(resolveClaudePath(), args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', code => {
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });
    });
  };
}

function createClaudeInvocationDependencies(): {
  sessionGateway: ClaudeSessionCliGateway;
  billingStateGateway: InMemoryBillingStateGateway;
  supervisorHealthGateway: InMemorySupervisorHealthGateway;
} {
  return {
    sessionGateway: new ClaudeSessionCliGateway(createProcessRunner()),
    billingStateGateway: new InMemoryBillingStateGateway(),
    supervisorHealthGateway: new InMemorySupervisorHealthGateway(),
  };
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

  const app = await buildServer(deps);
  const port = options.portOverride ?? config.server.port;

  const cleanupScheduler = startCleanupScheduler({
    reviewFileGateway: deps.reviewFileGateway,
    reviewLogFileGateway: deps.reviewLogFileGateway,
    getRepositories: () => config.repositories,
    logger: deps.logger,
  });

  const claudeInvocationDeps = createClaudeInvocationDependencies();
  const stopClaudeInvocationTimers = startClaudeInvocationTimers({
    sessionGateway: claudeInvocationDeps.sessionGateway,
    supervisorHealthGateway: claudeInvocationDeps.supervisorHealthGateway,
    billingStateGateway: claudeInvocationDeps.billingStateGateway,
    now: () => new Date(),
    supervisorIntervalMs: 5 * 60 * 1000,
    billingIntervalMs: 60 * 60 * 1000,
  });

  await app.listen({
    port,
    host: '0.0.0.0',
  });

  const shutdown = async () => {
    deps.logger.info('Shutting down...');
    cleanupScheduler.stop();
    stopClaudeInvocationTimers();
    removePidFile(PID_FILE_PATH);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return app;
}
