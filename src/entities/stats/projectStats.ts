import type { DiffStats } from '@/entities/diffStats/diffStats.js';

/**
 * Statistics for a single code review, including score, issue counts,
 * and optional diff-level metrics (additions/deletions).
 */
export interface ReviewStats {
  id: string;
  timestamp: string;
  mrNumber: number;
  duration: number;
  score: number | null;
  blocking: number;
  warnings: number;
  suggestions?: number;
  assignedBy?: string;
  diffStats?: DiffStats | null;
}

/**
 * Aggregated statistics for all reviews in a project, including
 * totals, averages, trends data, and diff-level aggregates.
 */
export interface ProjectStats {
  totalReviews: number;
  totalDuration: number;
  averageScore: number | null;
  averageDuration: number;
  totalBlocking: number;
  totalWarnings: number;
  reviews: ReviewStats[];
  lastUpdated: string;
  totalAdditions?: number;
  totalDeletions?: number;
  averageAdditions?: number;
  averageDeletions?: number;
}
