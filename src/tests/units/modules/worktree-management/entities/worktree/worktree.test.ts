import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  deriveWorktreeSlug,
  deriveWorktreePath,
  deriveFetchRef,
} from '@/modules/worktree-management/entities/worktree/worktree.js';

describe('worktree entity helpers', () => {
  describe('deriveWorktreeSlug', () => {
    it('replaces slashes with dashes', () => {
      expect(deriveWorktreeSlug('group/project')).toBe('group-project');
    });

    it('keeps single-segment paths intact', () => {
      expect(deriveWorktreeSlug('project')).toBe('project');
    });

    it('handles nested groups', () => {
      expect(deriveWorktreeSlug('group/subgroup/project')).toBe('group-subgroup-project');
    });
  });

  describe('deriveWorktreePath', () => {
    it('builds the canonical path under WORKTREE_BASE_DIR', () => {
      const path = deriveWorktreePath({
        platform: 'gitlab',
        projectPath: 'group/project',
        mrNumber: 4242,
      });
      expect(path).toBe(join(homedir(), '.reviewflow', 'worktrees', 'gitlab-group-project-4242'));
    });

    it('supports github platform', () => {
      const path = deriveWorktreePath({
        platform: 'github',
        projectPath: 'owner/repo',
        mrNumber: 17,
      });
      expect(path).toBe(join(homedir(), '.reviewflow', 'worktrees', 'github-owner-repo-17'));
    });
  });

  describe('deriveFetchRef', () => {
    it('returns origin refspec for same-repo MR (kind=origin)', () => {
      const ref = deriveFetchRef({ kind: 'origin' }, 'feat/new-thing', 99);
      expect(ref).toEqual({
        remote: 'origin',
        refspec: 'feat/new-thing',
        worktreeRef: 'origin/feat/new-thing',
      });
    });

    it('returns fork URL refspec for cross-fork PR (kind=fork)', () => {
      const ref = deriveFetchRef(
        { kind: 'fork', cloneUrl: 'https://github.com/contributor/fork.git' },
        'patch-1',
        99,
      );
      expect(ref).toEqual({
        remote: 'https://github.com/contributor/fork.git',
        refspec: 'patch-1:refs/remotes/pr-99/head',
        worktreeRef: 'refs/remotes/pr-99/head',
      });
    });
  });
});
