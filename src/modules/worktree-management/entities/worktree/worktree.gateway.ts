import type {
  EnsureResult,
  MrSource,
  RemoveResult,
  WorktreeEntry,
  WorktreeIdentity,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export interface EnsureWorktreeRequest {
  identity: WorktreeIdentity;
  sourceBranch: string;
  source: MrSource;
  sourceCheckoutPath: string;
}

export interface RemoveWorktreeRequest {
  identity: WorktreeIdentity;
  sourceCheckoutPath: string;
}

export interface WorktreeGateway {
  ensure(request: EnsureWorktreeRequest): Promise<EnsureResult>;
  remove(request: RemoveWorktreeRequest): Promise<RemoveResult>;
  list(): Promise<WorktreeEntry[]>;
  exists(identity: WorktreeIdentity): Promise<boolean>;
}
