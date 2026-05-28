import type { WorktreeEntry } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export interface OrphanLockSignal {
  present: boolean;
  path: string;
  ageMs: number;
}

export interface HealthSignals {
  mtime: Date;
  orphanLock: OrphanLockSignal | null;
  unresolvedConflict: boolean;
}

export interface WorktreeHealthProbeGateway {
  probe(entry: WorktreeEntry): Promise<HealthSignals>;
}
