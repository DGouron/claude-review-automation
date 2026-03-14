import type { DiffStats } from '@/entities/diffStats/diffStats.js';

export interface DiffStatsFetchGateway {
  fetchDiffStats(projectPath: string, mergeRequestNumber: number): DiffStats | null;
}
