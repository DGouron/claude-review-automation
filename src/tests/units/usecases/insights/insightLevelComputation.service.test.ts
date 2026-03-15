import { describe, it, expect } from 'vitest';
import {
  normalizeHigherIsBetter,
  normalizeLowerIsBetter,
  computeDeveloperMetrics,
  computeTeamMetrics,
  computeCategoryLevels,
} from '@/usecases/insights/insightLevelComputation.service.js';
import { ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
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
      ...overrides,
    }),
  );
}

describe('normalizeHigherIsBetter', () => {
  it('should return 0.5 when value equals team average', () => {
    const result = normalizeHigherIsBetter(7, 7, 10);

    expect(result).toBe(0.5);
  });

  it('should return above 0.5 when value is above team average', () => {
    const result = normalizeHigherIsBetter(8.3, 7.5, 10);

    expect(result).toBeGreaterThan(0.5);
  });

  it('should return below 0.5 when value is below team average', () => {
    const result = normalizeHigherIsBetter(6.4, 7.5, 10);

    expect(result).toBeLessThan(0.5);
  });

  it('should clamp to 1 for very high values', () => {
    const result = normalizeHigherIsBetter(15, 5, 10);

    expect(result).toBe(1);
  });

  it('should clamp to 0 for very low values', () => {
    const result = normalizeHigherIsBetter(1, 10, 10);

    expect(result).toBe(0);
  });

  it('should use maxValue when team average is 0', () => {
    const result = normalizeHigherIsBetter(5, 0, 10);

    expect(result).toBe(0.5);
  });
});

describe('normalizeLowerIsBetter', () => {
  it('should return 0.5 when value equals team average', () => {
    const result = normalizeLowerIsBetter(0.5, 0.5);

    expect(result).toBe(0.5);
  });

  it('should return above 0.5 when value is below team average (fewer issues is better)', () => {
    const result = normalizeLowerIsBetter(0.1, 0.5);

    expect(result).toBeGreaterThan(0.5);
  });

  it('should return below 0.5 when value is above team average (more issues is worse)', () => {
    const result = normalizeLowerIsBetter(1.1, 0.5);

    expect(result).toBeLessThan(0.5);
  });

  it('should return 1 when value is 0 and team average is 0', () => {
    const result = normalizeLowerIsBetter(0, 0);

    expect(result).toBe(1);
  });

  it('should return 0 when value is non-zero and team average is 0', () => {
    const result = normalizeLowerIsBetter(5, 0);

    expect(result).toBe(0);
  });
});

describe('level calibration with real-world data', () => {
  it('should produce quality level 8-9 for developer with score 8.3 and 0.1 blocking', () => {
    const damienReviews = createReviewsForDeveloper('damien', 35, {
      score: 8.3,
      blocking: 0,
      warnings: 1,
      duration: 60000,
    });
    const augReviews = createReviewsForDeveloper('aug', 44, {
      score: 7.4,
      blocking: 0,
      warnings: 2,
      duration: 60000,
    });
    const dariusReviews = createReviewsForDeveloper('darius', 14, {
      score: 6.4,
      blocking: 1,
      warnings: 2,
      duration: 60000,
    });
    const mathysReviews = createReviewsForDeveloper('mathys', 6, {
      score: 6.7,
      blocking: 1,
      warnings: 2,
      duration: 60000,
    });

    const reviewsByDeveloper = new Map<string, ReviewStats[]>();
    reviewsByDeveloper.set('damien', damienReviews);
    reviewsByDeveloper.set('aug', augReviews);
    reviewsByDeveloper.set('darius', dariusReviews);
    reviewsByDeveloper.set('mathys', mathysReviews);

    const teamMetrics = computeTeamMetrics(reviewsByDeveloper);
    const damienMetrics = computeDeveloperMetrics(damienReviews);
    const dariusMetrics = computeDeveloperMetrics(dariusReviews);

    const damienLevels = computeCategoryLevels(damienReviews, damienMetrics, teamMetrics);
    const dariusLevels = computeCategoryLevels(dariusReviews, dariusMetrics, teamMetrics);

    expect(damienLevels.quality.level).toBeGreaterThanOrEqual(7);
    expect(dariusLevels.quality.level).toBeLessThanOrEqual(5);
    expect(damienLevels.quality.level - dariusLevels.quality.level).toBeGreaterThanOrEqual(2);
  });

  it('should spread levels across 3-9 range instead of clustering at 5-6', () => {
    const highPerformer = createReviewsForDeveloper('high', 10, {
      score: 9,
      blocking: 0,
      warnings: 0,
      duration: 30000,
    });
    const lowPerformer = createReviewsForDeveloper('low', 10, {
      score: 4,
      blocking: 3,
      warnings: 5,
      duration: 300000,
    });

    const reviewsByDeveloper = new Map<string, ReviewStats[]>();
    reviewsByDeveloper.set('high', highPerformer);
    reviewsByDeveloper.set('low', lowPerformer);

    const teamMetrics = computeTeamMetrics(reviewsByDeveloper);
    const highMetrics = computeDeveloperMetrics(highPerformer);
    const lowMetrics = computeDeveloperMetrics(lowPerformer);

    const highLevels = computeCategoryLevels(highPerformer, highMetrics, teamMetrics);
    const lowLevels = computeCategoryLevels(lowPerformer, lowMetrics, teamMetrics);

    expect(highLevels.quality.level).toBeGreaterThanOrEqual(8);
    expect(lowLevels.quality.level).toBeLessThanOrEqual(3);
  });
});
