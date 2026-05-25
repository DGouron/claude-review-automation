import type { FastifyPluginAsync } from 'fastify';
import type { RepositoryConfig } from '@/frameworks/config/configLoader.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import type { ReviewFileGateway, ReviewFileInfo } from '@/modules/review-execution/entities/review/reviewFile.gateway.js';
import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import {
  OverviewPresenter,
  type OverviewActiveJobInput,
  type OverviewProjectStatsEntry,
  type OverviewProjectStatsSummary,
} from '@/modules/statistics-insights/interface-adapters/presenters/overview.presenter.js';

interface OverviewRoutesOptions {
  getRepositories: () => RepositoryConfig[];
  getActiveJobs: () => OverviewActiveJobInput[];
  statsGateway: StatsGateway;
  reviewFileGateway: ReviewFileGateway;
}

function buildSummary(stats: ProjectStats): OverviewProjectStatsSummary {
  return {
    totalReviews: stats.totalReviews,
    averageScore: stats.averageScore,
    averageDuration: stats.averageDuration,
    totalBlocking: stats.totalBlocking,
    totalWarnings: stats.totalWarnings,
  };
}

export const overviewRoutes: FastifyPluginAsync<OverviewRoutesOptions> = async (
  fastify,
  options,
) => {
  const presenter = new OverviewPresenter();

  fastify.get('/api/overview', async () => {
    const repositories = options.getRepositories();
    const enabledRepositories = repositories.filter((repository) => repository.enabled);

    const projectStats: OverviewProjectStatsEntry[] = [];
    const recentReviews: ReviewFileInfo[] = [];

    for (const repository of enabledRepositories) {
      const stats = options.statsGateway.loadProjectStats(repository.localPath);
      if (stats) {
        projectStats.push({
          project: repository.name,
          path: repository.localPath,
          stats,
          summary: buildSummary(stats),
        });
      }
      const reviews = await options.reviewFileGateway.listReviews(repository.localPath);
      recentReviews.push(...reviews);
    }

    return presenter.present({
      repositories,
      activeJobs: options.getActiveJobs(),
      projectStats,
      recentReviews,
    });
  });
};
