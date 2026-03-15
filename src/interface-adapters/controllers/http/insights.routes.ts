import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';
import type { StatsGateway } from '@/entities/stats/stats.gateway.js';
import type { InsightsGateway } from '@/entities/insight/insights.gateway.js';
import type { ReviewFileGateway } from '@/entities/review/reviewFile.gateway.js';
import type { ReviewRequestTrackingGateway } from '@/entities/tracking/reviewRequestTracking.gateway.js';
import type { Language } from '@/entities/language/language.schema.js';
import { generateAiInsights, type ClaudeInvoker } from '@/usecases/insights/generateAiInsights.usecase.js';
import { computeInsightsWithPersistence } from '@/usecases/insights/computeInsightsWithPersistence.usecase.js';
import { getInsightsWithAiStatus } from '@/usecases/insights/getInsightsWithAiStatus.usecase.js';
import { InsightsPresenter } from '@/interface-adapters/presenters/insights.presenter.js';

interface InsightsRoutesOptions {
  statsGateway: StatsGateway;
  insightsGateway: InsightsGateway;
  reviewFileGateway: ReviewFileGateway;
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  logger: Logger;
  claudeInvoker: ClaudeInvoker;
  language: Language;
}

function isValidProjectPath(path: string | null): path is string {
  if (!path) return false;
  const trimmed = path.trim();
  return trimmed.startsWith('/') && !trimmed.includes('..');
}

export const insightsRoutes: FastifyPluginAsync<InsightsRoutesOptions> = async (
  fastify,
  options,
) => {
  const {
    statsGateway,
    insightsGateway,
    reviewFileGateway,
    reviewRequestTrackingGateway,
    logger,
    claudeInvoker,
    language,
  } = options;
  const presenter = new InsightsPresenter();

  fastify.get<{ Querystring: { path?: string } }>('/api/insights', async (request, reply) => {
    const projectPath = request.query.path?.trim() ?? null;

    if (!isValidProjectPath(projectPath)) {
      reply.status(400).send({ error: 'Chemin du projet requis' });
      return;
    }

    const result = getInsightsWithAiStatus({
      projectPath,
      statsGateway,
      insightsGateway,
    });

    const viewModel = presenter.present({
      developerInsights: result.developerInsights,
      teamInsight: result.teamInsight,
    });

    return {
      ...viewModel,
      aiInsights: result.aiInsights,
      hasNewReviewsSinceAiGeneration: result.hasNewReviewsSinceAiGeneration,
    };
  });

  fastify.post<{ Body: { path?: string; language?: string } }>('/api/insights/generate', async (request, reply) => {
    const body = request.body;
    const projectPath = typeof body === 'object' && body !== null && 'path' in body
      ? (body).path
      : null;

    if (typeof projectPath !== 'string' || !isValidProjectPath(projectPath)) {
      reply.status(400).send({ error: 'Chemin du projet requis' });
      return;
    }

    const requestLanguage = typeof body === 'object' && body !== null && 'language' in body
      && (body.language === 'fr' || body.language === 'en')
      ? body.language
      : language;

    try {
      const aiInsights = await generateAiInsights({
        projectPath,
        statsGateway,
        reviewFileGateway,
        reviewRequestTrackingGateway,
        logger,
        claudeInvoker,
        language: requestLanguage,
      });

      const existingData = insightsGateway.loadPersistedInsights(projectPath);
      const stats = statsGateway.loadProjectStats(projectPath);
      const currentReviews = stats?.reviews ?? [];
      const upToDateResult = computeInsightsWithPersistence(currentReviews, existingData);
      insightsGateway.savePersistedInsights(projectPath, {
        ...upToDateResult.persistedData,
        aiInsights,
        reviewCountAtAiGeneration: upToDateResult.persistedData.processedReviewIds.length,
      });

      return aiInsights;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      logger.error({ error: message }, 'AI insights generation failed');
      reply.status(500).send({ error: message });
      return;
    }
  });
};
