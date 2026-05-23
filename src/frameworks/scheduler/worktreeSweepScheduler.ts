import type { Logger } from 'pino';
import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import type {
  SweepRepository,
  SweepTrackingGateway,
} from '@/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.js';
import { sweepStaleWorktrees } from '@/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.js';

const TWENTY_FOUR_HOURS_IN_MILLISECONDS = 86_400_000;

export interface WorktreeSweepSchedulerDependencies {
  worktreeGateway: WorktreeGateway;
  trackingGateway: SweepTrackingGateway;
  getRepositories: () => SweepRepository[];
  logger: Logger;
  now: () => Date;
}

export function startWorktreeSweepScheduler(
  dependencies: WorktreeSweepSchedulerDependencies,
): { stop: () => void } {
  const { worktreeGateway, trackingGateway, getRepositories, logger, now } = dependencies;

  async function runSweep(): Promise<void> {
    try {
      const summary = await sweepStaleWorktrees({
        listEntries: () => worktreeGateway.list(),
        removeWorktree: async identity => {
          const repositories = getRepositories();
          const firstEnabled = repositories.find(repository => repository.enabled);
          const sourceCheckoutPath = firstEnabled?.localPath ?? '';
          return worktreeGateway.remove({ identity, sourceCheckoutPath });
        },
        trackingGateway,
        getRepositories,
        now,
      });

      if (summary.removed > 0 || summary.failures > 0) {
        logger.info(
          { ...summary },
          'Worktree sweep completed',
        );
      }
    } catch (error) {
      logger.error({ error }, 'Worktree sweep failed');
    }
  }

  void runSweep();

  const intervalId = setInterval(() => {
    void runSweep();
  }, TWENTY_FOUR_HOURS_IN_MILLISECONDS);

  return {
    stop: () => clearInterval(intervalId),
  };
}
