import { describe, it, expect, beforeEach } from 'vitest';
import { sweepStaleWorktrees } from '@/modules/worktree-management/usecases/sweepStaleWorktrees.usecase.js';
import { deriveWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type {
  WorktreeEntry,
  WorktreeIdentity,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';

interface RepositoryConfig {
  localPath: string;
  enabled: boolean;
}

interface FakeTrackingGateway {
  trackedMrs: Map<string, TrackedMr>;
  getById: (projectPath: string, mrId: string) => TrackedMr | null;
}

function buildTrackedMr(overrides: Partial<TrackedMr>): TrackedMr {
  return {
    id: overrides.id ?? 'gitlab-group-project-1',
    mrNumber: overrides.mrNumber ?? 1,
    title: 'title',
    url: 'http://example.com',
    project: overrides.project ?? 'group/project',
    platform: overrides.platform ?? 'gitlab',
    sourceBranch: 'feat/x',
    targetBranch: 'master',
    assignment: {
      username: 'user',
      assignedAt: '2026-05-01T00:00:00Z',
    },
    state: overrides.state ?? 'pending-review',
    openThreads: 0,
    totalThreads: 0,
    createdAt: '2026-05-01T00:00:00Z',
    lastReviewAt: null,
    lastPushAt: null,
    approvedAt: null,
    mergedAt: overrides.mergedAt ?? null,
    reviews: [],
    totalReviews: 0,
    totalFollowups: 0,
    totalBlocking: 0,
    totalWarnings: 0,
    totalSuggestions: 0,
    totalDurationMs: 0,
    latestScore: null,
    autoFollowup: true,
    bypass: null,
  };
}

function buildEntry(identity: WorktreeIdentity, mtime: Date): WorktreeEntry {
  return {
    identity,
    path: deriveWorktreePath(identity),
    mtime,
  };
}

describe('sweepStaleWorktrees use case', () => {
  let removed: WorktreeIdentity[];
  let fakeTracking: FakeTrackingGateway;

  beforeEach(() => {
    removed = [];
    fakeTracking = {
      trackedMrs: new Map(),
      getById(projectPath: string, mrId: string) {
        const stored = this.trackedMrs.get(`${projectPath}::${mrId}`) ?? null;
        return stored;
      },
    };
  });

  const repository: RepositoryConfig = { localPath: '/repos/group-project', enabled: true };
  const now = new Date('2026-05-23T12:00:00Z');

  function trackingFor(identity: WorktreeIdentity, tracked: TrackedMr): void {
    const mrId = `${identity.platform}-${identity.projectPath}-${identity.mrNumber}`;
    fakeTracking.trackedMrs.set(`${repository.localPath}::${mrId}`, tracked);
  }

  async function runSweep(entries: WorktreeEntry[]): Promise<void> {
    await sweepStaleWorktrees(
      {
        listEntries: async () => entries,
        removeWorktree: async identity => {
          removed.push(identity);
          return { status: 'removed' };
        },
        trackingGateway: {
          getById: (projectPath, mrId) => fakeTracking.getById(projectPath, mrId),
        },
        getRepositories: () => [repository],
        now: () => now,
      },
    );
  }

  it('removes worktree when matching MR is merged more than 24h ago', async () => {
    const identity: WorktreeIdentity = { platform: 'gitlab', projectPath: 'group-project', mrNumber: 1 };
    const entry = buildEntry(identity, new Date('2026-05-21T00:00:00Z'));
    trackingFor(identity, buildTrackedMr({
      id: 'gitlab-group-project-1',
      state: 'merged',
      mergedAt: '2026-05-21T00:00:00Z',
    }));

    await runSweep([entry]);

    expect(removed).toEqual([identity]);
  });

  it('keeps worktree when MR was merged less than 24h ago', async () => {
    const identity: WorktreeIdentity = { platform: 'gitlab', projectPath: 'group-project', mrNumber: 2 };
    const entry = buildEntry(identity, new Date('2026-05-23T00:00:00Z'));
    trackingFor(identity, buildTrackedMr({
      id: 'gitlab-group-project-2',
      mrNumber: 2,
      state: 'merged',
      mergedAt: '2026-05-23T06:00:00Z',
    }));

    await runSweep([entry]);

    expect(removed).toEqual([]);
  });

  it('removes orphan worktree when no tracked MR exists', async () => {
    const identity: WorktreeIdentity = { platform: 'gitlab', projectPath: 'group-project', mrNumber: 3 };
    const entry = buildEntry(identity, new Date('2026-05-23T11:00:00Z'));

    await runSweep([entry]);

    expect(removed).toEqual([identity]);
  });

  it('removes stale worktree with mtime older than 7 days regardless of MR state', async () => {
    const identity: WorktreeIdentity = { platform: 'gitlab', projectPath: 'group-project', mrNumber: 4 };
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const entry = buildEntry(identity, eightDaysAgo);
    trackingFor(identity, buildTrackedMr({
      id: 'gitlab-group-project-4',
      mrNumber: 4,
      state: 'pending-review',
    }));

    await runSweep([entry]);

    expect(removed).toEqual([identity]);
  });

  it('keeps active worktree with fresh mtime', async () => {
    const identity: WorktreeIdentity = { platform: 'gitlab', projectPath: 'group-project', mrNumber: 5 };
    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const entry = buildEntry(identity, sixDaysAgo);
    trackingFor(identity, buildTrackedMr({
      id: 'gitlab-group-project-5',
      mrNumber: 5,
      state: 'pending-review',
    }));

    await runSweep([entry]);

    expect(removed).toEqual([]);
  });
});
