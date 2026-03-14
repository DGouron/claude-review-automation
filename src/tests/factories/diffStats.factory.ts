import type { DiffStats } from '@/entities/diffStats/diffStats.js';

export class DiffStatsFactory {
  static create(overrides: Partial<DiffStats> = {}): DiffStats {
    return {
      commitsCount: 3,
      additions: 150,
      deletions: 30,
      ...overrides,
    };
  }
}
