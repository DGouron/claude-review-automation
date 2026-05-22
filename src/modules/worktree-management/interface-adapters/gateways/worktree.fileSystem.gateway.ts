import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { WORKTREE_BASE_DIR } from '@/shared/services/daemonPaths.js';
import {
  deriveWorktreePath,
  parseWorktreeDirectoryName,
} from '@/modules/worktree-management/entities/worktree/worktree.js';
// deriveWorktreePath is re-exported for callers; eslint-disable-next-line is unnecessary.
import type {
  EnsureWorktreeRequest,
  RemoveWorktreeRequest,
  WorktreeGateway,
} from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import type {
  EnsureResult,
  RemoveResult,
  WorktreeEntry,
  WorktreeIdentity,
  WorktreePath,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { ensureWorktree } from '@/modules/worktree-management/usecases/ensureWorktree.usecase.js';
import { removeWorktree } from '@/modules/worktree-management/usecases/removeWorktree.usecase.js';
import { writeWorktreeSettings } from '@/modules/worktree-management/services/worktreeSettingsWriter.js';
import type { GitCommandExecutor } from '@/modules/worktree-management/entities/gitCommand/gitCommand.gateway.js';

export interface WorktreeFileSystemGatewayDependencies {
  executor: GitCommandExecutor;
  baseDirectory?: string;
}

export class WorktreeFileSystemGateway implements WorktreeGateway {
  private readonly executor: GitCommandExecutor;
  private readonly baseDirectory: string;

  constructor(deps: WorktreeFileSystemGatewayDependencies) {
    this.executor = deps.executor;
    this.baseDirectory = deps.baseDirectory ?? WORKTREE_BASE_DIR;
  }

  async ensure(request: EnsureWorktreeRequest): Promise<EnsureResult> {
    mkdirSync(this.baseDirectory, { recursive: true });
    return ensureWorktree(
      {
        identity: request.identity,
        sourceBranch: request.sourceBranch,
        source: request.source,
        sourceCheckoutPath: request.sourceCheckoutPath,
      },
      {
        executor: this.executor,
        worktreeExists: async path => existsSync(path),
        writeWorktreeSettings,
      },
    );
  }

  async remove(request: RemoveWorktreeRequest): Promise<RemoveResult> {
    try {
      return await removeWorktree(
        { identity: request.identity, sourceCheckoutPath: request.sourceCheckoutPath },
        {
          executor: this.executor,
          worktreeExists: async path => existsSync(path),
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 'failed', warning: message };
    }
  }

  async exists(identity: WorktreeIdentity): Promise<boolean> {
    return existsSync(deriveWorktreePath(identity));
  }

  async list(): Promise<WorktreeEntry[]> {
    if (!existsSync(this.baseDirectory)) {
      return [];
    }
    const directories = readdirSync(this.baseDirectory, { withFileTypes: true });
    const entries: WorktreeEntry[] = [];
    for (const dirent of directories) {
      if (!dirent.isDirectory()) continue;
      const identity = parseWorktreeDirectoryName(dirent.name);
      if (identity === null) continue;
      const path = join(this.baseDirectory, dirent.name) as WorktreePath;
      try {
        const stats = statSync(path);
        entries.push({ identity, path, mtime: stats.mtime });
      } catch {
        continue;
      }
    }
    return entries;
  }
}
