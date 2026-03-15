import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';
import type { StatsGateway } from '@/interface-adapters/gateways/stats.gateway.js';
import type { InsightsGateway } from '@/entities/insight/insights.gateway.js';
import type { ReviewFileGateway } from '@/interface-adapters/gateways/reviewFile.gateway.js';
import type { ReviewRequestTrackingGateway } from '@/interface-adapters/gateways/reviewRequestTracking.gateway.js';
import type { Language } from '@/entities/language/language.schema.js';
import { computeInsightsWithPersistence } from '@/usecases/insights/computeInsightsWithPersistence.usecase.js';
import { generateAiInsights, type ClaudeInvoker } from '@/usecases/insights/generateAiInsights.usecase.js';
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

function computeHasNewReviewsSinceAiGeneration(
  currentReviewCount: number,
  reviewCountAtAiGeneration: number,
  aiGeneratedAt: string | null,
): boolean {
  if (!aiGeneratedAt) return false;
  return currentReviewCount > reviewCountAtAiGeneration;
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

    const stats = statsGateway.loadProjectStats(projectPath);

    if (!stats || stats.reviews.length === 0) {
      const persistedData = insightsGateway.loadPersistedInsights(projectPath);

      if (persistedData) {
        const result = computeInsightsWithPersistence([], persistedData);
        insightsGateway.savePersistedInsights(projectPath, {
          ...result.persistedData,
          aiInsights: persistedData.aiInsights ?? null,
          reviewCountAtAiGeneration: persistedData.reviewCountAtAiGeneration ?? 0,
        });
        const viewModel = presenter.present({
          developerInsights: result.developerInsights,
          teamInsight: result.teamInsight,
        });
        const hasNewReviewsSinceAiGeneration = computeHasNewReviewsSinceAiGeneration(
          result.persistedData.processedReviewIds.length,
          persistedData.reviewCountAtAiGeneration ?? 0,
          persistedData.aiInsights?.generatedAt ?? null,
        );
        return { ...viewModel, aiInsights: persistedData.aiInsights ?? null, hasNewReviewsSinceAiGeneration };
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
      return { ...emptyViewModel, aiInsights: null, hasNewReviewsSinceAiGeneration: false };
    }

    const persistedData = insightsGateway.loadPersistedInsights(projectPath);
    const result = computeInsightsWithPersistence(stats.reviews, persistedData);
    insightsGateway.savePersistedInsights(projectPath, {
      ...result.persistedData,
      aiInsights: persistedData?.aiInsights ?? null,
      reviewCountAtAiGeneration: persistedData?.reviewCountAtAiGeneration ?? 0,
    });
    const viewModel = presenter.present({
      developerInsights: result.developerInsights,
      teamInsight: result.teamInsight,
    });
    const hasNewReviewsSinceAiGeneration = computeHasNewReviewsSinceAiGeneration(
      result.persistedData.processedReviewIds.length,
      persistedData?.reviewCountAtAiGeneration ?? 0,
      persistedData?.aiInsights?.generatedAt ?? null,
    );

    return { ...viewModel, aiInsights: persistedData?.aiInsights ?? null, hasNewReviewsSinceAiGeneration };
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
