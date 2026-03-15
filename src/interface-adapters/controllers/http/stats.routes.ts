import type { FastifyPluginAsync } from 'fastify';
import type { StatsGateway } from '@/interface-adapters/gateways/stats.gateway.js';
import type { DiffStatsFetchGateway } from '@/entities/diffStats/diffStatsFetch.gateway.js';
import type { BackfillProgress } from '@/entities/backfill/backfillProgress.js';
import { getStatsSummary } from '@/services/statsService.js';
import { recalculateProjectStats } from '@/usecases/stats/recalculateProjectStats.usecase.js';
import { backfillDiffStats } from '@/usecases/stats/backfillDiffStats.usecase.js';

interface RepositoryInfo {
  localPath: string;
  name: string;
  enabled: boolean;
  platform?: string;
}

interface StatsRoutesOptions {
  statsGateway: StatsGateway;
  getRepositories: () => RepositoryInfo[];
  diffStatsFetchGateways?: { gitlab: DiffStatsFetchGateway; github: DiffStatsFetchGateway };
  broadcastBackfillProgress?: (progress: BackfillProgress) => void;
  logger?: { warn: (message: string, data?: unknown) => void; info: (message: string, data?: unknown) => void; error: (message: string, data?: unknown) => void };
}

export const statsRoutes: FastifyPluginAsync<StatsRoutesOptions> = async (
  fastify,
  options,
) => {
  const { statsGateway, getRepositories } = options;

  fastify.get('/api/stats', async (request) => {
    const query = request.query as { path?: string };
    const projectPath = query.path?.trim();

    if (projectPath) {
      if (!projectPath.startsWith('/') || projectPath.includes('..')) {
        return { error: 'Invalid path' };
      }

      const stats = statsGateway.loadProjectStats(projectPath);
      if (!stats) {
        return { stats: null, summary: null };
      }

      return {
        stats,
        summary: getStatsSummary(stats),
      };
    }

    const allStats = [];
    for (const repo of getRepositories()) {
      if (!repo.enabled) continue;
      const stats = statsGateway.loadProjectStats(repo.localPath);
      if (stats) {
        allStats.push({
          project: repo.name,
          path: repo.localPath,
          stats,
          summary: getStatsSummary(stats),
        });
      }
    }

    return { projects: allStats };
  });

  fastify.post('/api/stats/recalculate', async (request, reply) => {
    const body = request.body as { path?: string; backfill?: boolean } | null;
    const projectPath = typeof body?.path === 'string' ? body.path.trim() : '';
    const shouldBackfill = body?.backfill === true;

    if (!projectPath) {
      reply.status(400).send({ error: 'Chemin du projet requis' });
      return;
    }

    const repositories = getRepositories();
    const repository = repositories.find(
      (repo) => repo.enabled && repo.localPath === projectPath,
    );

    if (!repository) {
      reply.status(404).send({ error: 'Projet non trouvé dans la configuration' });
      return;
    }

    const { diffStatsFetchGateways, broadcastBackfillProgress, logger } = options;

    const executeRecalculation = async () => {
      try {
        if (shouldBackfill && diffStatsFetchGateways && repository.platform) {
          const platform = repository.platform === 'github' ? 'github' : 'gitlab';
          const gateway = diffStatsFetchGateways[platform];

          await backfillDiffStats(
            {
              projectPath,
              onProgress: (progress) => {
                broadcastBackfillProgress?.(progress);
              },
            },
            {
              statsGateway,
              diffStatsFetchGateway: gateway,
              logger: logger ?? { warn: () => {} },
            },
          );
        }

        recalculateProjectStats(projectPath, { statsGateway });

        broadcastBackfillProgress?.({
          total: 0,
          completed: 0,
          failed: 0,
          status: 'completed',
        });
      } catch (error) {
        logger?.error('Recalculation failed', { projectPath, error });
      }
    };

    executeRecalculation();

    return { status: 'started' };
  });
};
