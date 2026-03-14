import type { Logger } from 'pino';
import type { ReviewFileGateway } from '@/interface-adapters/gateways/reviewFile.gateway.js';
import type { ReviewLogFileGateway } from '@/interface-adapters/gateways/reviewLogFile.gateway.js';
import { cleanupExpiredReviews } from '@/usecases/cleanup/cleanupExpiredReviews.usecase.js';
import { getProjectRetentionDays } from '@/config/projectConfig.js';

const TWENTY_FOUR_HOURS_IN_MILLISECONDS = 86_400_000;

export interface CleanupSchedulerDependencies {
  reviewFileGateway: ReviewFileGateway;
  reviewLogFileGateway: ReviewLogFileGateway;
  getRepositories: () => Array<{ localPath: string; enabled: boolean }>;
  logger: Logger;
}

export function startCleanupScheduler(
  dependencies: CleanupSchedulerDependencies
): { stop: () => void } {
  const { reviewFileGateway, reviewLogFileGateway, getRepositories, logger } = dependencies;

  async function runCleanup(): Promise<void> {
    const repositories = getRepositories();

    for (const repository of repositories) {
      if (!repository.enabled) continue;

      try {
        const retentionDays = getProjectRetentionDays(repository.localPath);
        const result = await cleanupExpiredReviews(repository.localPath, retentionDays, {
          reviewFileGateway,
          reviewLogFileGateway,
        });

        if (result.totalDeletedCount > 0) {
          logger.info(
            {
              projectPath: repository.localPath,
              deletedCount: result.totalDeletedCount,
            },
            'Cleanup completed'
          );
        }
      } catch (error) {
        logger.error(
          { error, projectPath: repository.localPath },
          'Cleanup failed for repository'
        );
      }
    }
  }

  runCleanup();

  const intervalId = setInterval(runCleanup, TWENTY_FOUR_HOURS_IN_MILLISECONDS);

  return {
    stop: () => clearInterval(intervalId),
  };
}
