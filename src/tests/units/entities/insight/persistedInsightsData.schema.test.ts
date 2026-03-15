import { describe, it, expect } from 'vitest';
import {
  persistedDeveloperMetricsSchema,
  persistedInsightsDataSchema,
} from '@/entities/insight/persistedInsightsData.schema.js';

describe('persistedDeveloperMetricsSchema', () => {
  it('should accept valid developer metrics', () => {
    const validMetrics = {
      developerName: 'alice',
      totalReviews: 10,
      totalScore: 75,
      scoredReviewCount: 9,
      totalBlocking: 5,
      totalWarnings: 12,
      totalSuggestions: 20,
      totalDuration: 600000,
      totalAdditions: 1500,
      totalDeletions: 300,
      diffStatsReviewCount: 8,
      recentReviews: [],
    };

    const result = persistedDeveloperMetricsSchema.safeParse(validMetrics);

    expect(result.success).toBe(true);
  });

  it('should reject metrics with missing developerName', () => {
    const invalidMetrics = {
      totalReviews: 10,
      totalScore: 75,
      scoredReviewCount: 9,
      totalBlocking: 5,
      totalWarnings: 12,
      totalSuggestions: 20,
      totalDuration: 600000,
      totalAdditions: 1500,
      totalDeletions: 300,
      diffStatsReviewCount: 8,
      recentReviews: [],
    };

    const result = persistedDeveloperMetricsSchema.safeParse(invalidMetrics);

    expect(result.success).toBe(false);
  });

  it('should reject metrics with negative totalReviews', () => {
    const invalidMetrics = {
      developerName: 'alice',
      totalReviews: -1,
      totalScore: 75,
      scoredReviewCount: 9,
      totalBlocking: 5,
      totalWarnings: 12,
      totalSuggestions: 20,
      totalDuration: 600000,
      totalAdditions: 1500,
      totalDeletions: 300,
      diffStatsReviewCount: 8,
      recentReviews: [],
    };

    const result = persistedDeveloperMetricsSchema.safeParse(invalidMetrics);

    expect(result.success).toBe(false);
  });
});

describe('persistedInsightsDataSchema', () => {
  it('should accept valid persisted insights data', () => {
    const validData = {
      developers: [],
      processedReviewIds: ['review-1', 'review-2'],
      lastUpdated: '2024-01-15T10:00:00Z',
    };

    const result = persistedInsightsDataSchema.safeParse(validData);

    expect(result.success).toBe(true);
  });

  it('should accept data with developer metrics', () => {
    const validData = {
      developers: [{
        developerName: 'alice',
        totalReviews: 10,
        totalScore: 75,
        scoredReviewCount: 9,
        totalBlocking: 5,
        totalWarnings: 12,
        totalSuggestions: 20,
        totalDuration: 600000,
        totalAdditions: 1500,
        totalDeletions: 300,
        diffStatsReviewCount: 8,
        recentReviews: [],
      }],
      processedReviewIds: ['review-1'],
      lastUpdated: '2024-01-15T10:00:00Z',
    };

    const result = persistedInsightsDataSchema.safeParse(validData);

    expect(result.success).toBe(true);
  });

  it('should reject data with missing lastUpdated', () => {
    const invalidData = {
      developers: [],
      processedReviewIds: [],
    };

    const result = persistedInsightsDataSchema.safeParse(invalidData);

    expect(result.success).toBe(false);
  });

  it('should reject non-string processedReviewIds', () => {
    const invalidData = {
      developers: [],
      processedReviewIds: [123],
      lastUpdated: '2024-01-15T10:00:00Z',
    };

    const result = persistedInsightsDataSchema.safeParse(invalidData);

    expect(result.success).toBe(false);
  });
});
