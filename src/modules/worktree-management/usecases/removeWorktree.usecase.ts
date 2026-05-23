import { deriveWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type {
  RemoveResult,
  WorktreeIdentity,
  WorktreePath,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type { GitCommandExecutor } from '@/modules/worktree-management/entities/gitCommand/gitCommand.gateway.js';

export interface RemoveWorktreeInput {
  identity: WorktreeIdentity;
  sourceCheckoutPath: string;
}

export interface RemoveWorktreeDependencies {
  executor: GitCommandExecutor;
  worktreeExists: (path: WorktreePath) => Promise<boolean>;
}

export async function removeWorktree(
  input: RemoveWorktreeInput,
  deps: RemoveWorktreeDependencies,
): Promise<RemoveResult> {
  const targetPath = deriveWorktreePath(input.identity);

  await deps.executor.execute({
    kind: 'worktree-prune',
    args: ['worktree', 'prune'],
    cwd: input.sourceCheckoutPath,
  });

  const exists = await deps.worktreeExists(targetPath);
  if (!exists) {
    return { status: 'absent' };
  }

  const removeResult = await deps.executor.execute({
    kind: 'worktree-remove',
    args: ['worktree', 'remove', '--force', targetPath],
    cwd: input.sourceCheckoutPath,
  });

  if (removeResult.exitCode !== 0) {
    return {
      status: 'failed',
      warning: removeResult.stderr || 'git worktree remove failed',
    };
  }

  return { status: 'removed' };
}
