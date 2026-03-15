import type { ProjectStats, ReviewStats } from '@/entities/stats/projectStats.js';
import type { DiffStats } from '@/entities/diffStats/diffStats.js';

export class ReviewStatsFactory {
  static create(overrides: Partial<ReviewStats> = {}): ReviewStats {
    return {
      id: `review-${Date.now()}`,
      timestamp: '2024-01-15T10:00:00Z',
      mrNumber: 42,
      duration: 60000,
      score: 8,
      blocking: 1,
      warnings: 2,
      suggestions: 3,
      assignedBy: 'developer',
      ...overrides,
    };
  }

  static withDiffStats(diffStats: DiffStats, overrides: Partial<ReviewStats> = {}): ReviewStats {
    return this.create({ diffStats, ...overrides });
  }
}

export class ProjectStatsFactory {
  static create(overrides: Partial<ProjectStats> = {}): ProjectStats {
    return {
      totalReviews: 0,
      totalDuration: 0,
      averageScore: null,
      averageDuration: 0,
      totalBlocking: 0,
      totalWarnings: 0,
      reviews: [],
      lastUpdated: '2024-01-15T10:00:00Z',
      totalAdditions: 0,
      totalDeletions: 0,
      averageAdditions: 0,
      averageDeletions: 0,
      ...overrides,
    };
  }

  static withReviews(reviews: ReviewStats[]): ProjectStats {
    const totalDuration = reviews.reduce((sum, r) => sum + r.duration, 0);
    const reviewsWithScore = reviews.filter((r) => r.score !== null);
    const averageScore = reviewsWithScore.length > 0
      ? reviewsWithScore.reduce((sum, r) => sum + (r.score ?? 0), 0) / reviewsWithScore.length
      : null;

    return this.create({
      totalReviews: reviews.length,
      totalDuration,
      averageScore,
      averageDuration: reviews.length > 0 ? totalDuration / reviews.length : 0,
      totalBlocking: reviews.reduce((sum, r) => sum + r.blocking, 0),
      totalWarnings: reviews.reduce((sum, r) => sum + r.warnings, 0),
      reviews,
    });
  }
}
