import { describe, it, expect } from 'vitest';
import { computeInsightsWithPersistence } from '@/usecases/insights/computeInsightsWithPersistence.usecase.js';
import { computeDeveloperInsights } from '@/usecases/insights/computeDeveloperInsights.usecase.js';
import { computeTeamInsights } from '@/usecases/insights/computeTeamInsights.usecase.js';
import { ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { PersistedInsightsDataFactory, PersistedDeveloperMetricsFactory } from '@/tests/factories/persistedInsightsData.factory.js';
import type { ReviewStats } from '@/services/statsService.js';

function createReviewsForDeveloper(
  developerName: string,
  count: number,
  overrides: Partial<ReviewStats> = {},
): ReviewStats[] {
  return Array.from({ length: count }, (_, index) =>
    ReviewStatsFactory.create({
      id: `${developerName}-${index}`,
      assignedBy: developerName,
      mrNumber: index + 1,
      timestamp: new Date(2024, 0, index + 1).toISOString(),
      ...overrides,
    }),
  );
}

describe('computeInsightsWithPersistence', () => {
  describe('first run (no persisted data)', () => {
    it('should return same developer insights as computeDeveloperInsights when persistedData is null', () => {
      const reviews = createReviewsForDeveloper('alice', 6, { score: 8, blocking: 0, warnings: 1 });

      const result = computeInsightsWithPersistence(reviews, null);
      const expectedInsights = computeDeveloperInsights(reviews);
      const expectedTeam = computeTeamInsights(expectedInsights);

      expect(result.developerInsights).toEqual(expectedInsights);
      expect(result.teamInsight).toEqual(expectedTeam);
    });

    it('should return persistedData with all review IDs marked as processed', () => {
      const reviews = createReviewsForDeveloper('alice', 6, { score: 8 });

      const result = computeInsightsWithPersistence(reviews, null);

      const reviewIds = reviews.map((review) => review.id);
      for (const id of reviewIds) {
        expect(result.persistedData.processedReviewIds).toContain(id);
      }
    });

    it('should return empty insights for reviews without assignedBy', () => {
      const reviews = [
        ReviewStatsFactory.create({ id: 'r1', assignedBy: undefined }),
        ReviewStatsFactory.create({ id: 'r2', assignedBy: undefined }),
      ];

      const result = computeInsightsWithPersistence(reviews, null);

      expect(result.developerInsights).toEqual([]);
    });
  });

  describe('identifying new reviews', () => {
    it('should only process reviews not in processedReviewIds', () => {
      const reviews = [
        ...createReviewsForDeveloper('alice', 3, { score: 8 }),
        ReviewStatsFactory.create({
          id: 'alice-new-1',
          assignedBy: 'alice',
          mrNumber: 100,
          score: 9,
        }),
      ];
      const existingIds = reviews.slice(0, 3).map((review) => review.id);

      const persistedData = PersistedInsightsDataFactory.create({
        developers: [PersistedDeveloperMetricsFactory.create({
          developerName: 'alice',
          totalReviews: 3,
          totalScore: 24,
          scoredReviewCount: 3,
          totalBlocking: 3,
          totalWarnings: 6,
          totalSuggestions: 9,
          totalDuration: 180000,
          totalAdditions: 0,
          totalDeletions: 0,
          diffStatsReviewCount: 0,
          recentReviews: reviews.slice(0, 3),
        })],
        processedReviewIds: existingIds,
      });

      const result = computeInsightsWithPersistence(reviews, persistedData);

      expect(result.persistedData.processedReviewIds).toContain('alice-new-1');
      expect(result.persistedData.processedReviewIds).toHaveLength(4);
    });
  });

  describe('cumulative metrics update', () => {
    it('should update cumulative metrics when new reviews arrive', () => {
      const existingReviews = createReviewsForDeveloper('alice', 5, {
        score: 7,
        blocking: 1,
        warnings: 2,
        suggestions: 3,
        duration: 60000,
      });
      const newReview = ReviewStatsFactory.create({
        id: 'alice-new',
        assignedBy: 'alice',
        mrNumber: 100,
        score: 9,
        blocking: 0,
        warnings: 0,
        suggestions: 1,
        duration: 30000,
      });

      const persistedData = PersistedInsightsDataFactory.create({
        developers: [PersistedDeveloperMetricsFactory.create({
          developerName: 'alice',
          totalReviews: 5,
          totalScore: 35,
          scoredReviewCount: 5,
          totalBlocking: 5,
          totalWarnings: 10,
          totalSuggestions: 15,
          totalDuration: 300000,
          totalAdditions: 0,
          totalDeletions: 0,
          diffStatsReviewCount: 0,
          recentReviews: existingReviews,
        })],
        processedReviewIds: existingReviews.map((review) => review.id),
      });

      const allReviews = [...existingReviews, newReview];
      const result = computeInsightsWithPersistence(allReviews, persistedData);

      const aliceMetrics = result.persistedData.developers.find(
        (developer) => developer.developerName === 'alice',
      );
      expect(aliceMetrics).toBeDefined();
      expect(aliceMetrics?.totalReviews).toBe(6);
      expect(aliceMetrics?.totalScore).toBe(44);
      expect(aliceMetrics?.scoredReviewCount).toBe(6);
      expect(aliceMetrics?.totalBlocking).toBe(5);
      expect(aliceMetrics?.totalWarnings).toBe(10);
      expect(aliceMetrics?.totalSuggestions).toBe(16);
      expect(aliceMetrics?.totalDuration).toBe(330000);
    });

    it('should handle reviews with null scores in cumulative update', () => {
      const existingReviews = createReviewsForDeveloper('alice', 5, { score: 7 });
      const newReview = ReviewStatsFactory.create({
        id: 'alice-null-score',
        assignedBy: 'alice',
        mrNumber: 100,
        score: null,
      });

      const persistedData = PersistedInsightsDataFactory.create({
        developers: [PersistedDeveloperMetricsFactory.create({
          developerName: 'alice',
          totalReviews: 5,
          totalScore: 35,
          scoredReviewCount: 5,
          recentReviews: existingReviews,
        })],
        processedReviewIds: existingReviews.map((review) => review.id),
      });

      const allReviews = [...existingReviews, newReview];
      const result = computeInsightsWithPersistence(allReviews, persistedData);

      const aliceMetrics = result.persistedData.developers.find(
        (developer) => developer.developerName === 'alice',
      );
      expect(aliceMetrics?.totalReviews).toBe(6);
      expect(aliceMetrics?.scoredReviewCount).toBe(5);
      expect(aliceMetrics?.totalScore).toBe(35);
    });
  });

  describe('recent reviews window', () => {
    it('should keep only last 20 recent reviews per developer', () => {
      const existingReviews = Array.from({ length: 19 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-${index}`,
          assignedBy: 'alice',
          mrNumber: index + 1,
          score: 7,
          timestamp: new Date(2024, 0, index + 1).toISOString(),
        }),
      );
      const newReviews = Array.from({ length: 3 }, (_, index) =>
        ReviewStatsFactory.create({
          id: `alice-new-${index}`,
          assignedBy: 'alice',
          mrNumber: 100 + index,
          score: 8,
          timestamp: new Date(2024, 6, index + 1).toISOString(),
        }),
      );

      const persistedData = PersistedInsightsDataFactory.create({
        developers: [PersistedDeveloperMetricsFactory.create({
          developerName: 'alice',
          totalReviews: 19,
          totalScore: 133,
          scoredReviewCount: 19,
          recentReviews: existingReviews,
        })],
        processedReviewIds: existingReviews.map((review) => review.id),
      });

      const allReviews = [...existingReviews, ...newReviews];
      const result = computeInsightsWithPersistence(allReviews, persistedData);

      const aliceMetrics = result.persistedData.developers.find(
        (developer) => developer.developerName === 'alice',
      );
      expect(aliceMetrics?.recentReviews).toHaveLength(20);
      expect(aliceMetrics?.recentReviews.some(
        (review) => review.id === 'alice-new-2',
      )).toBe(true);
    });
  });

  describe('developer crossing threshold', () => {
    it('should include developer in insights once they cross 5-review threshold', () => {
      const existingReviews = createReviewsForDeveloper('alice', 4, { score: 7 });
      const newReview = ReviewStatsFactory.create({
        id: 'alice-5th',
        assignedBy: 'alice',
        mrNumber: 100,
        score: 8,
      });

      const persistedData = PersistedInsightsDataFactory.create({
        developers: [PersistedDeveloperMetricsFactory.create({
          developerName: 'alice',
          totalReviews: 4,
          totalScore: 28,
          scoredReviewCount: 4,
          totalBlocking: 4,
          totalWarnings: 8,
          totalSuggestions: 12,
          totalDuration: 240000,
          totalAdditions: 0,
          totalDeletions: 0,
          diffStatsReviewCount: 0,
          recentReviews: existingReviews,
        })],
        processedReviewIds: existingReviews.map((review) => review.id),
      });

      const allReviews = [...existingReviews, newReview];
      const result = computeInsightsWithPersistence(allReviews, persistedData);

      expect(result.developerInsights).toHaveLength(1);
      expect(result.developerInsights[0].developerName).toBe('alice');
      expect(result.persistedData.developers[0].totalReviews).toBe(5);
    });
  });

  describe('preserving historical data', () => {
    it('should preserve cumulative data even when current reviews are empty', () => {
      const persistedData = PersistedInsightsDataFactory.create({
        developers: [PersistedDeveloperMetricsFactory.create({
          developerName: 'alice',
          totalReviews: 20,
          totalScore: 160,
          scoredReviewCount: 20,
          totalBlocking: 10,
          totalWarnings: 20,
          totalSuggestions: 30,
          totalDuration: 1200000,
          totalAdditions: 5000,
          totalDeletions: 1000,
          diffStatsReviewCount: 15,
          recentReviews: createReviewsForDeveloper('alice', 15, { score: 8 }),
        })],
        processedReviewIds: Array.from({ length: 20 }, (_, index) => `old-${index}`),
      });

      const result = computeInsightsWithPersistence([], persistedData);

      const aliceMetrics = result.persistedData.developers.find(
        (developer) => developer.developerName === 'alice',
      );
      expect(aliceMetrics?.totalReviews).toBe(20);
      expect(aliceMetrics?.totalScore).toBe(160);
      expect(result.developerInsights).toHaveLength(1);
      expect(result.developerInsights[0].developerName).toBe('alice');
    });
  });

  describe('correct averages from cumulative data', () => {
    it('should compute averages from totalScore/scoredReviewCount', () => {
      const recentReviews = createReviewsForDeveloper('alice', 10, { score: 8 });

      const persistedData = PersistedInsightsDataFactory.create({
        developers: [PersistedDeveloperMetricsFactory.create({
          developerName: 'alice',
          totalReviews: 50,
          totalScore: 400,
          scoredReviewCount: 50,
          totalBlocking: 25,
          totalWarnings: 50,
          totalSuggestions: 75,
          totalDuration: 3000000,
          totalAdditions: 10000,
          totalDeletions: 2000,
          diffStatsReviewCount: 40,
          recentReviews,
        })],
        processedReviewIds: Array.from({ length: 50 }, (_, index) => `old-${index}`),
      });

      const result = computeInsightsWithPersistence([], persistedData);

      expect(result.developerInsights).toHaveLength(1);
      const alice = result.developerInsights[0];
      expect(alice.overallLevel).toBeGreaterThanOrEqual(1);
      expect(alice.overallLevel).toBeLessThanOrEqual(10);
    });
  });

  describe('new developer appearing', () => {
    it('should add new developer to persisted data', () => {
      const persistedData = PersistedInsightsDataFactory.create({
        developers: [PersistedDeveloperMetricsFactory.create({
          developerName: 'alice',
          totalReviews: 10,
          recentReviews: createReviewsForDeveloper('alice', 10, { score: 7 }),
        })],
        processedReviewIds: Array.from({ length: 10 }, (_, index) => `alice-${index}`),
      });

      const bobReviews = createReviewsForDeveloper('bob', 3, { score: 8 });
      const result = computeInsightsWithPersistence(bobReviews, persistedData);

      const bobMetrics = result.persistedData.developers.find(
        (developer) => developer.developerName === 'bob',
      );
      expect(bobMetrics).toBeDefined();
      expect(bobMetrics?.totalReviews).toBe(3);
    });
  });

  describe('reviews without assignedBy', () => {
    it('should skip reviews without assignedBy when updating metrics', () => {
      const review = ReviewStatsFactory.create({
        id: 'no-author',
        assignedBy: undefined,
        score: 7,
      });

      const result = computeInsightsWithPersistence([review], null);

      expect(result.persistedData.developers).toHaveLength(0);
      expect(result.persistedData.processedReviewIds).toContain('no-author');
    });
  });

  describe('valid persisted data for saving', () => {
    it('should return valid PersistedInsightsData structure', () => {
      const reviews = createReviewsForDeveloper('alice', 6, { score: 8 });

      const result = computeInsightsWithPersistence(reviews, null);

      expect(result.persistedData.developers).toBeDefined();
      expect(Array.isArray(result.persistedData.developers)).toBe(true);
      expect(result.persistedData.processedReviewIds).toBeDefined();
      expect(Array.isArray(result.persistedData.processedReviewIds)).toBe(true);
      expect(result.persistedData.lastUpdated).toBeDefined();
      expect(typeof result.persistedData.lastUpdated).toBe('string');
    });
  });

  describe('diffStats tracking', () => {
    it('should track diffStats in cumulative metrics', () => {
      const reviews = createReviewsForDeveloper('alice', 5, {
        score: 8,
        diffStats: { commitsCount: 3, additions: 200, deletions: 50 },
      });

      const result = computeInsightsWithPersistence(reviews, null);

      const aliceMetrics = result.persistedData.developers.find(
        (developer) => developer.developerName === 'alice',
      );
      expect(aliceMetrics?.totalAdditions).toBe(1000);
      expect(aliceMetrics?.totalDeletions).toBe(250);
      expect(aliceMetrics?.diffStatsReviewCount).toBe(5);
    });
  });
});
