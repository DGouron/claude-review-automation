import type { LastSweepSummary } from '@/modules/worktree-management/entities/sweep/lastSweepSummary.schema.js';

export type RunSweepNowResult =
  | { status: 'ok'; summary: LastSweepSummary }
  | { status: 'conflict'; startedAt: Date }
  | { status: 'error'; reason: string };
