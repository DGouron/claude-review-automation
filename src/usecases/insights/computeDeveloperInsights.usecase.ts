import type { ReviewStats } from '@/services/statsService.js';
import type { DeveloperInsight } from '@/entities/insight/developerInsight.js';
import {
  MINIMUM_REVIEWS_THRESHOLD,
  ABSOLUTE_BENCHMARKS,
  computeTeamMetrics,
  computeDeveloperMetrics,
  computeCategoryLevels,
  identifyStrengths,
  identifyWeaknesses,
  identifyTopPriority,
  computeTitle,
  computeOverallLevel,
} from '@/usecases/insights/insightLevelComputation.service.js';

export function computeDeveloperInsights(reviews: ReviewStats[]): DeveloperInsight[] {
  const reviewsByDeveloper = groupReviewsByDeveloper(reviews);
  const eligibleDevelopers = filterEligibleDevelopers(reviewsByDeveloper);

  if (eligibleDevelopers.size === 0) {
    return [];
  }

  const isSingleDeveloper = eligibleDevelopers.size === 1;
  const teamMetrics = isSingleDeveloper
    ? ABSOLUTE_BENCHMARKS
    : computeTeamMetrics(eligibleDevelopers);

  const insights: DeveloperInsight[] = [];

  for (const [developerName, developerReviews] of eligibleDevelopers) {
    const insight = computeInsightForDeveloper(
      developerName,
      developerReviews,
      teamMetrics,
    );
    insights.push(insight);
  }

  return insights;
}

function groupReviewsByDeveloper(reviews: ReviewStats[]): Map<string, ReviewStats[]> {
  const grouped = new Map<string, ReviewStats[]>();

  for (const review of reviews) {
    if (!review.assignedBy) continue;

    const existing = grouped.get(review.assignedBy);
    if (existing) {
      existing.push(review);
    } else {
      grouped.set(review.assignedBy, [review]);
    }
  }

  return grouped;
}

function filterEligibleDevelopers(
  reviewsByDeveloper: Map<string, ReviewStats[]>,
): Map<string, ReviewStats[]> {
  const eligible = new Map<string, ReviewStats[]>();

  for (const [name, reviews] of reviewsByDeveloper) {
    if (reviews.length >= MINIMUM_REVIEWS_THRESHOLD) {
      eligible.set(name, reviews);
    }
  }

  return eligible;
}

function computeInsightForDeveloper(
  developerName: string,
  reviews: ReviewStats[],
  teamMetrics: { averageScore: number; averageBlocking: number; averageWarnings: number; averageDuration: number; averageCodeVolume: number },
): DeveloperInsight {
  const metrics = computeDeveloperMetrics(reviews);
  const categoryLevels = computeCategoryLevels(reviews, metrics, teamMetrics);
  const strengths = identifyStrengths(categoryLevels);
  const weaknesses = identifyWeaknesses(categoryLevels);
  const topPriority = identifyTopPriority(categoryLevels);
  const title = computeTitle(categoryLevels);
  const overallLevel = computeOverallLevel(categoryLevels);

  return {
    developerName,
    title,
    overallLevel,
    categoryLevels,
    strengths,
    weaknesses,
    topPriority,
    reviewCount: reviews.length,
  };
}
