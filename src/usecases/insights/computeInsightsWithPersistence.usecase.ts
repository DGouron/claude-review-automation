import type { ReviewStats } from '@/services/statsService.js';
import type { DeveloperInsight } from '@/entities/insight/developerInsight.js';
import type { TeamInsight } from '@/entities/insight/teamInsight.js';
import type { PersistedInsightsData, PersistedDeveloperMetrics } from '@/entities/insight/persistedInsightsData.js';
import { computeTeamInsights } from '@/usecases/insights/computeTeamInsights.usecase.js';
import type { DeveloperMetrics } from '@/usecases/insights/insightLevelComputation.service.js';
import {
  MINIMUM_REVIEWS_THRESHOLD,
  ABSOLUTE_BENCHMARKS,
  computeTeamMetrics,
  computeCategoryLevels,
  identifyStrengths,
  identifyWeaknesses,
  identifyTopPriority,
  computeTitle,
  computeOverallLevel,
} from '@/usecases/insights/insightLevelComputation.service.js';

const RECENT_REVIEWS_WINDOW = 20;

interface InsightsWithPersistenceResult {
  developerInsights: DeveloperInsight[];
  teamInsight: TeamInsight;
  persistedData: PersistedInsightsData;
}

export function computeInsightsWithPersistence(
  reviews: ReviewStats[],
  persistedData: PersistedInsightsData | null,
): InsightsWithPersistenceResult {
  const currentPersistedData = persistedData ?? createEmptyPersistedData();
  const processedIds = new Set(currentPersistedData.processedReviewIds);
  const newReviews = reviews.filter((review) => !processedIds.has(review.id));

  const updatedDevelopers = updateDeveloperMetrics(
    currentPersistedData.developers,
    newReviews,
  );

  const allProcessedIds = [
    ...currentPersistedData.processedReviewIds,
    ...newReviews.map((review) => review.id),
  ];

  const eligibleDevelopers = updatedDevelopers.filter(
    (developer) => developer.totalReviews >= MINIMUM_REVIEWS_THRESHOLD,
  );

  const developerInsights = computeInsightsFromPersistedMetrics(eligibleDevelopers);
  const teamInsight = computeTeamInsights(developerInsights);

  return {
    developerInsights,
    teamInsight,
    persistedData: {
      developers: updatedDevelopers,
      processedReviewIds: allProcessedIds,
      lastUpdated: new Date().toISOString(),
    },
  };
}

function createEmptyPersistedData(): PersistedInsightsData {
  return {
    developers: [],
    processedReviewIds: [],
    lastUpdated: new Date().toISOString(),
  };
}

function updateDeveloperMetrics(
  existingDevelopers: PersistedDeveloperMetrics[],
  newReviews: ReviewStats[],
): PersistedDeveloperMetrics[] {
  const developerMap = new Map<string, PersistedDeveloperMetrics>();

  for (const developer of existingDevelopers) {
    developerMap.set(developer.developerName, { ...developer, recentReviews: [...developer.recentReviews] });
  }

  for (const review of newReviews) {
    if (!review.assignedBy) continue;

    const developerName = review.assignedBy;
    const existing = developerMap.get(developerName);

    if (existing) {
      updateExistingDeveloper(existing, review);
    } else {
      developerMap.set(developerName, createDeveloperFromReview(review));
    }
  }

  return Array.from(developerMap.values());
}

function updateExistingDeveloper(
  developer: PersistedDeveloperMetrics,
  review: ReviewStats,
): void {
  developer.totalReviews += 1;
  developer.totalBlocking += review.blocking;
  developer.totalWarnings += review.warnings;
  developer.totalSuggestions += (review.suggestions ?? 0);
  developer.totalDuration += review.duration;

  if (review.score !== null) {
    developer.totalScore += review.score;
    developer.scoredReviewCount += 1;
  }

  if (review.diffStats !== null && review.diffStats !== undefined) {
    developer.totalAdditions += review.diffStats.additions;
    developer.totalDeletions += review.diffStats.deletions;
    developer.diffStatsReviewCount += 1;
  }

  developer.recentReviews.push(review);
  if (developer.recentReviews.length > RECENT_REVIEWS_WINDOW) {
    developer.recentReviews = developer.recentReviews.slice(-RECENT_REVIEWS_WINDOW);
  }
}

function createDeveloperFromReview(review: ReviewStats): PersistedDeveloperMetrics {
  return {
    developerName: review.assignedBy ?? '',
    totalReviews: 1,
    totalScore: review.score ?? 0,
    scoredReviewCount: review.score !== null ? 1 : 0,
    totalBlocking: review.blocking,
    totalWarnings: review.warnings,
    totalSuggestions: review.suggestions ?? 0,
    totalDuration: review.duration,
    totalAdditions: review.diffStats?.additions ?? 0,
    totalDeletions: review.diffStats?.deletions ?? 0,
    diffStatsReviewCount: (review.diffStats !== null && review.diffStats !== undefined) ? 1 : 0,
    recentReviews: [review],
  };
}

function computeInsightsFromPersistedMetrics(
  developers: PersistedDeveloperMetrics[],
): DeveloperInsight[] {
  if (developers.length === 0) {
    return [];
  }

  const reviewsByDeveloper = buildReviewsByDeveloperMap(developers);

  const isSingleDeveloper = developers.length === 1;
  const teamMetrics = isSingleDeveloper
    ? ABSOLUTE_BENCHMARKS
    : computeTeamMetrics(reviewsByDeveloper);

  const insights: DeveloperInsight[] = [];

  for (const developer of developers) {
    const metrics = buildDeveloperMetricsFromCumulative(developer);
    const trendReviews = developer.recentReviews;
    const categoryLevels = computeCategoryLevels(trendReviews, metrics, teamMetrics);
    const strengths = identifyStrengths(categoryLevels);
    const weaknesses = identifyWeaknesses(categoryLevels);
    const topPriority = identifyTopPriority(categoryLevels);
    const title = computeTitle(categoryLevels);
    const overallLevel = computeOverallLevel(categoryLevels);

    insights.push({
      developerName: developer.developerName,
      title,
      overallLevel,
      categoryLevels,
      strengths,
      weaknesses,
      topPriority,
      reviewCount: developer.totalReviews,
    });
  }

  return insights;
}

function buildReviewsByDeveloperMap(
  developers: PersistedDeveloperMetrics[],
): Map<string, ReviewStats[]> {
  const map = new Map<string, ReviewStats[]>();

  for (const developer of developers) {
    map.set(developer.developerName, developer.recentReviews);
  }

  return map;
}

function buildDeveloperMetricsFromCumulative(developer: PersistedDeveloperMetrics): DeveloperMetrics {
  const averageScore = developer.scoredReviewCount > 0
    ? developer.totalScore / developer.scoredReviewCount
    : 5;
  const averageBlocking = developer.totalReviews > 0
    ? developer.totalBlocking / developer.totalReviews
    : 0;
  const averageWarnings = developer.totalReviews > 0
    ? developer.totalWarnings / developer.totalReviews
    : 0;
  const averageDuration = developer.totalReviews > 0
    ? developer.totalDuration / developer.totalReviews
    : 0;
  const averageCodeVolume = developer.diffStatsReviewCount > 0
    ? (developer.totalAdditions + developer.totalDeletions) / developer.diffStatsReviewCount
    : 0;

  const correlation = computeVolumeScoreCorrelationFromRecent(developer.recentReviews);

  return {
    averageScore,
    averageBlocking,
    averageWarnings,
    averageDuration,
    averageCodeVolume,
    codeVolumeScoreCorrelation: correlation,
  };
}

function computeVolumeScoreCorrelationFromRecent(reviews: ReviewStats[]): number {
  const reviewsWithBoth = reviews.filter(
    (review) =>
      review.score !== null &&
      review.diffStats !== null &&
      review.diffStats !== undefined,
  );

  if (reviewsWithBoth.length < 3) return 0;

  const scores = reviewsWithBoth.map((review) => review.score ?? 0);
  const volumes = reviewsWithBoth.map(
    (review) => (review.diffStats?.additions ?? 0) + (review.diffStats?.deletions ?? 0),
  );

  const avgScore = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const avgVolume = volumes.reduce((sum, value) => sum + value, 0) / volumes.length;

  let numerator = 0;
  let denominatorScore = 0;
  let denominatorVolume = 0;

  for (let index = 0; index < reviewsWithBoth.length; index++) {
    const scoreDiff = scores[index] - avgScore;
    const volumeDiff = volumes[index] - avgVolume;
    numerator += scoreDiff * volumeDiff;
    denominatorScore += scoreDiff * scoreDiff;
    denominatorVolume += volumeDiff * volumeDiff;
  }

  const denominator = Math.sqrt(denominatorScore * denominatorVolume);
  if (denominator === 0) return 0;

  return numerator / denominator;
}
