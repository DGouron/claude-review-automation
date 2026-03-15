import { describe, it, expect } from 'vitest';
import type { ReviewStats, ProjectStats } from '@/entities/stats/projectStats.js';
import type { DiffStats } from '@/entities/diffStats/diffStats.js';

describe('ReviewStats with diffStats extension', () => {
  it('should support a diffStats field on ReviewStats', () => {
    const diffStats: DiffStats = {
      commitsCount: 3,
      additions: 150,
      deletions: 30,
    };

    const review: ReviewStats = {
      id: 'test-1',
      timestamp: '2024-01-15T10:00:00Z',
      mrNumber: 42,
      duration: 60000,
      score: 8,
      blocking: 1,
      warnings: 2,
      diffStats,
    };

    expect(review.diffStats).toEqual(diffStats);
  });

  it('should support null diffStats on ReviewStats', () => {
    const review: ReviewStats = {
      id: 'test-2',
      timestamp: '2024-01-15T10:00:00Z',
      mrNumber: 42,
      duration: 60000,
      score: 8,
      blocking: 1,
      warnings: 2,
      diffStats: null,
    };

    expect(review.diffStats).toBeNull();
  });
});

describe('ProjectStats with diff aggregates', () => {
  it('should support diff aggregate fields on ProjectStats', () => {
    const stats: ProjectStats = {
      totalReviews: 5,
      totalDuration: 300000,
      averageScore: 7.5,
      averageDuration: 60000,
      totalBlocking: 3,
      totalWarnings: 5,
      reviews: [],
      lastUpdated: '2024-01-15T10:00:00Z',
      totalAdditions: 500,
      totalDeletions: 100,
      averageAdditions: 100,
      averageDeletions: 20,
    };

    expect(stats.totalAdditions).toBe(500);
    expect(stats.totalDeletions).toBe(100);
    expect(stats.averageAdditions).toBe(100);
    expect(stats.averageDeletions).toBe(20);
  });
});
