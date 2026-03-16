import type { Logger } from 'pino';
import type { StatsGateway } from '@/entities/stats/stats.gateway.js';
import type { InsightsGateway } from '@/entities/insight/insights.gateway.js';
import type { ReviewFileGateway } from '@/entities/review/reviewFile.gateway.js';
import type { ReviewRequestTrackingGateway } from '@/entities/tracking/reviewRequestTracking.gateway.js';
import type { AiInsightsResult } from '@/entities/insight/aiInsight.js';
import type { Language } from '@/entities/language/language.schema.js';
import { aiInsightsRawResponseSchema } from '@/entities/insight/aiInsight.schema.js';
import { buildAiInsightsPrompt } from '@/usecases/insights/buildAiInsightsPrompt.js';
import { computeInsightsWithPersistence } from '@/usecases/insights/computeInsightsWithPersistence.usecase.js';

export type ClaudeInvoker = (prompt: string) => Promise<string>;

interface GenerateAiInsightsInput {
  projectPath: string;
  statsGateway: StatsGateway;
  reviewFileGateway: ReviewFileGateway;
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  logger: Logger;
  claudeInvoker: ClaudeInvoker;
  language: Language;
}

function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3).trim();
  }
  return cleaned;
}

function parseClaudeResponse(rawOutput: string): Omit<AiInsightsResult, 'generatedAt'> {
  const cleaned = stripMarkdownFences(rawOutput);
  const parsed: unknown = JSON.parse(cleaned);
  return aiInsightsRawResponseSchema.parse(parsed);
}

export async function generateAiInsights(
  input: GenerateAiInsightsInput,
): Promise<AiInsightsResult> {
  const {
    projectPath,
    statsGateway,
    reviewFileGateway,
    reviewRequestTrackingGateway,
    logger,
    claudeInvoker,
    language,
  } = input;

  const stats = statsGateway.loadProjectStats(projectPath);
  if (!stats || stats.reviews.length === 0) {
    throw new Error('No review statistics available for this project');
  }

  const reviewFiles = await reviewFileGateway.listReviews(projectPath);
  const reviewContents = new Map<string, string>();

  for (const reviewFile of reviewFiles) {
    const content = await reviewFileGateway.readReview(projectPath, reviewFile.filename);
    if (content) {
      reviewContents.set(reviewFile.mrNumber, content);
    }
  }

  const trackingData = reviewRequestTrackingGateway.loadTracking(projectPath);
  const trackedMrs = trackingData?.mrs ?? [];

  const prompt = buildAiInsightsPrompt({
    reviews: stats.reviews,
    reviewContents,
    trackedMrs,
    language,
  });

  logger.info({ promptLength: prompt.length }, 'Sending prompt to Claude for AI insights');

  const rawOutput = await claudeInvoker(prompt);

  logger.info({ outputLength: rawOutput.length }, 'Received Claude response for AI insights');

  const result = parseClaudeResponse(rawOutput);

  return {
    ...result,
    generatedAt: new Date().toISOString(),
  };
}

interface PersistAiInsightsInput {
  projectPath: string;
  aiInsights: AiInsightsResult;
  statsGateway: StatsGateway;
  insightsGateway: InsightsGateway;
}

export function persistAiInsightsResult(input: PersistAiInsightsInput): void {
  const { projectPath, aiInsights, statsGateway, insightsGateway } = input;

  const existingData = insightsGateway.loadPersistedInsights(projectPath);
  const stats = statsGateway.loadProjectStats(projectPath);
  const currentReviews = stats?.reviews ?? [];
  const upToDateResult = computeInsightsWithPersistence(currentReviews, existingData);

  insightsGateway.savePersistedInsights(projectPath, {
    ...upToDateResult.persistedData,
    aiInsights,
    reviewCountAtAiGeneration: upToDateResult.persistedData.processedReviewIds.length,
  });
}
