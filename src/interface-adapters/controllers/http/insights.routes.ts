import type { FastifyPluginAsync } from 'fastify';
import type { StatsGateway } from '@/interface-adapters/gateways/stats.gateway.js';
import type { InsightsGateway } from '@/entities/insight/insights.gateway.js';
import { computeInsightsWithPersistence } from '@/usecases/insights/computeInsightsWithPersistence.usecase.js';
import { InsightsPresenter } from '@/interface-adapters/presenters/insights.presenter.js';

interface InsightsRoutesOptions {
  statsGateway: StatsGateway;
  insightsGateway: InsightsGateway;
}

export const insightsRoutes: FastifyPluginAsync<InsightsRoutesOptions> = async (
  fastify,
  options,
) => {
  const { statsGateway, insightsGateway } = options;
  const presenter = new InsightsPresenter();

  fastify.get<{ Querystring: { path?: string } }>('/api/insights', async (request, reply) => {
    const projectPath = request.query.path?.trim();

    if (!projectPath) {
      reply.status(400).send({ error: 'Chemin du projet requis' });
      return;
    }

    if (!projectPath.startsWith('/') || projectPath.includes('..')) {
      reply.status(400).send({ error: 'Chemin invalide' });
      return;
    }

    const stats = statsGateway.loadProjectStats(projectPath);

    if (!stats || stats.reviews.length === 0) {
      const persistedData = insightsGateway.loadPersistedInsights(projectPath);

      if (persistedData) {
        const result = computeInsightsWithPersistence([], persistedData);
        insightsGateway.savePersistedInsights(projectPath, result.persistedData);
        const viewModel = presenter.present({
          developerInsights: result.developerInsights,
          teamInsight: result.teamInsight,
        });
        return viewModel;
      }

      const emptyViewModel = presenter.present({
        developerInsights: [],
        teamInsight: {
          developerCount: 0,
          totalReviewCount: 0,
          averageLevels: { quality: 5, responsiveness: 5, codeVolume: 5, iteration: 5 },
          strengths: [],
          weaknesses: [],
          tips: [],
        },
      });
      return emptyViewModel;
    }

    const persistedData = insightsGateway.loadPersistedInsights(projectPath);
    const result = computeInsightsWithPersistence(stats.reviews, persistedData);
    insightsGateway.savePersistedInsights(projectPath, result.persistedData);
    const viewModel = presenter.present({
      developerInsights: result.developerInsights,
      teamInsight: result.teamInsight,
    });

    return viewModel;
  });
};
