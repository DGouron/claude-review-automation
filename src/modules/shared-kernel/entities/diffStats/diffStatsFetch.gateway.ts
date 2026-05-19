import type { DiffStats } from '@/modules/shared-kernel/entities/diffStats/diffStats.js';

export interface DiffStatsFetchGateway {
  fetchDiffStats(projectPath: string, mergeRequestNumber: number): DiffStats | null;
}
