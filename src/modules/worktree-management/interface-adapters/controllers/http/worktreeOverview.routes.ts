import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';
import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import type { WorktreePanelPresenter } from '@/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.js';
import type { LastSweepSummary } from '@/modules/worktree-management/entities/sweep/lastSweepSummary.schema.js';

export type RunSweepNowResult =
  | { status: 'ok'; summary: LastSweepSummary }
  | { status: 'conflict'; startedAt: Date };

export interface WorktreeSchedulerControls {
  getLastSweep: () => LastSweepSummary | null;
  getNextSweepEta: () => Date;
  runSweepNow: () => Promise<RunSweepNowResult>;
}

export interface WorktreeOverviewRoutesOptions {
  worktreeGateway: WorktreeGateway;
  presenter: WorktreePanelPresenter;
  schedulerControls: WorktreeSchedulerControls | null;
  logger: Logger;
}

export const worktreeOverviewRoutes: FastifyPluginAsync<WorktreeOverviewRoutesOptions> = async (
  fastify,
  opts,
) => {
  const { worktreeGateway, presenter, schedulerControls, logger } = opts;

  fastify.get('/api/worktrees', async (_request, reply) => {
    if (schedulerControls === null) {
      reply.code(503);
      return { error: 'scheduler-unavailable' };
    }

    const worktrees = await worktreeGateway.list();
    const viewModel = await presenter.present({
      worktrees,
      lastSweep: schedulerControls.getLastSweep(),
      nextSweepAt: schedulerControls.getNextSweepEta(),
    });
    return viewModel;
  });

  fastify.post('/api/worktrees/sweep', async (_request, reply) => {
    if (schedulerControls === null) {
      reply.code(503);
      return { error: 'scheduler-unavailable' };
    }

    try {
      const result = await schedulerControls.runSweepNow();
      if (result.status === 'conflict') {
        reply.code(409);
        return { error: 'sweep-in-progress', startedAt: result.startedAt.toISOString() };
      }
      return {
        ranAt: result.summary.ranAt.toISOString(),
        removed: result.summary.removed,
        failures: result.summary.failures,
        scanned: result.summary.scanned,
      };
    } catch (error) {
      logger.error({ error }, 'Manual worktree sweep failed');
      reply.code(500);
      return { error: 'sweep-failed' };
    }
  });
};
