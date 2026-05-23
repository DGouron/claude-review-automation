import type { LastSweepSummary } from '@/modules/worktree-management/entities/sweep/lastSweepSummary.schema.js';

export class LastSweepSummaryFactory {
  static create(overrides?: Partial<LastSweepSummary>): LastSweepSummary {
    return {
      ranAt: new Date('2026-05-23T03:00:00.000Z'),
      removed: 0,
      failures: 0,
      scanned: 0,
      ...overrides,
    };
  }
}
