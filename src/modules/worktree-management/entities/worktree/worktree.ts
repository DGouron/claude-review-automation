import { join } from 'node:path';
import { WORKTREE_BASE_DIR } from '@/shared/services/daemonPaths.js';
import type {
  FetchRef,
  MrSource,
  WorktreeIdentity,
  WorktreePath,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export function deriveWorktreeSlug(projectPath: string): string {
  return projectPath.replace(/\//g, '-');
}

export function deriveWorktreeDirectoryName(identity: WorktreeIdentity): string {
  const slug = deriveWorktreeSlug(identity.projectPath);
  return `${identity.platform}-${slug}-${identity.mrNumber}`;
}

export function deriveWorktreePath(identity: WorktreeIdentity): WorktreePath {
  return join(WORKTREE_BASE_DIR, deriveWorktreeDirectoryName(identity)) as WorktreePath;
}

export function deriveFetchRef(source: MrSource, sourceBranch: string, mrNumber: number): FetchRef {
  if (source.kind === 'origin') {
    return {
      remote: 'origin',
      refspec: sourceBranch,
      worktreeRef: `origin/${sourceBranch}`,
    };
  }
  const worktreeRef = `refs/remotes/pr-${mrNumber}/head`;
  return {
    remote: source.cloneUrl,
    refspec: `${sourceBranch}:${worktreeRef}`,
    worktreeRef,
  };
}

export function parseWorktreeDirectoryName(
  directoryName: string,
): WorktreeIdentity | null {
  const match = directoryName.match(/^(gitlab|github)-(.+)-(\d+)$/);
  if (!match) return null;
  const platform = match[1] === 'github' ? 'github' : 'gitlab';
  const slug = match[2];
  const mrNumberRaw = match[3];
  if (slug === undefined || mrNumberRaw === undefined) return null;
  const mrNumber = Number.parseInt(mrNumberRaw, 10);
  if (!Number.isFinite(mrNumber) || mrNumber <= 0) return null;
  return {
    platform,
    projectPath: slug,
    mrNumber,
  };
}
