import { describe, it, expect } from 'vitest';
import type { DiffStats } from '@/entities/diffStats/diffStats.js';

describe('DiffStats', () => {
  it('should represent diff statistics with commits, additions, and deletions', () => {
    const diffStats: DiffStats = {
      commitsCount: 3,
      additions: 150,
      deletions: 30,
    };

    expect(diffStats.commitsCount).toBe(3);
    expect(diffStats.additions).toBe(150);
    expect(diffStats.deletions).toBe(30);
  });

  it('should support zero values for empty diffs', () => {
    const diffStats: DiffStats = {
      commitsCount: 1,
      additions: 0,
      deletions: 0,
    };

    expect(diffStats.commitsCount).toBe(1);
    expect(diffStats.additions).toBe(0);
    expect(diffStats.deletions).toBe(0);
  });
});
