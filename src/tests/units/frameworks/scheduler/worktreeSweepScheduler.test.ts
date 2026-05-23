import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startWorktreeSweepScheduler } from '@/frameworks/scheduler/worktreeSweepScheduler.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { deriveWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type {
  WorktreeEntry,
  WorktreeIdentity,
  RemoveResult,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/interface-adapters/gateways/reviewRequestTracking.gateway.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function buildEntry(identity: WorktreeIdentity, mtime: Date): WorktreeEntry {
  return {
    identity,
    path: deriveWorktreePath(identity),
    mtime,
  };
}

interface WorktreeGatewayStubHandle {
  gateway: WorktreeGateway;
  readonly listCalls: number;
  readonly removed: WorktreeIdentity[];
}

function createStubWorktreeGateway(initialEntries: WorktreeEntry[]): WorktreeGatewayStubHandle {
  let entries = [...initialEntries];
  const removed: WorktreeIdentity[] = [];
  let listCalls = 0;
  const gateway: WorktreeGateway = {
    list: async () => {
      listCalls += 1;
      return entries;
    },
    remove: async request => {
      removed.push(request.identity);
      entries = entries.filter(
        existing => deriveWorktreePath(existing.identity) !== deriveWorktreePath(request.identity),
      );
      return { status: 'removed' } satisfies RemoveResult;
    },
    ensure: async () => ({ status: 'failed', reason: 'not-implemented-in-stub' }),
    exists: async () => false,
  };
  return {
    gateway,
    get listCalls() {
      return listCalls;
    },
    get removed() {
      return removed;
    },
  };
}

function createStubTrackingGateway(): Pick<ReviewRequestTrackingGateway, 'getById'> {
  return {
    getById: (_projectPath: string, _mrId: string): TrackedMr | null => null,
  };
}

describe('worktreeSweepScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the sweep immediately on start and removes orphan worktrees', async () => {
    const identity: WorktreeIdentity = { platform: 'gitlab', projectPath: 'group-project', mrNumber: 11 };
    const entry = buildEntry(identity, new Date('2026-05-23T11:00:00Z'));
    const stub = createStubWorktreeGateway([entry]);

    const scheduler = startWorktreeSweepScheduler({
      worktreeGateway: stub.gateway,
      trackingGateway: createStubTrackingGateway(),
      getRepositories: () => [{ localPath: '/repos/group-project', enabled: true }],
      logger: createStubLogger(),
      now: () => new Date('2026-05-23T12:00:00Z'),
    });

    await vi.advanceTimersByTimeAsync(10);

    expect(stub.removed).toEqual([identity]);

    scheduler.stop();
  });

  it('re-runs the sweep after the 24h interval', async () => {
    const stub = createStubWorktreeGateway([]);

    const scheduler = startWorktreeSweepScheduler({
      worktreeGateway: stub.gateway,
      trackingGateway: createStubTrackingGateway(),
      getRepositories: () => [],
      logger: createStubLogger(),
      now: () => new Date('2026-05-23T12:00:00Z'),
    });

    await vi.advanceTimersByTimeAsync(10);
    const callsAfterBoot = stub.listCalls;

    await vi.advanceTimersByTimeAsync(TWENTY_FOUR_HOURS_MS);

    expect(stub.listCalls).toBe(callsAfterBoot + 1);

    scheduler.stop();
  });

  it('returns a stop function that clears the interval', async () => {
    const stub = createStubWorktreeGateway([]);

    const scheduler = startWorktreeSweepScheduler({
      worktreeGateway: stub.gateway,
      trackingGateway: createStubTrackingGateway(),
      getRepositories: () => [],
      logger: createStubLogger(),
      now: () => new Date('2026-05-23T12:00:00Z'),
    });

    await vi.advanceTimersByTimeAsync(10);
    const callsAfterBoot = stub.listCalls;

    scheduler.stop();

    await vi.advanceTimersByTimeAsync(TWENTY_FOUR_HOURS_MS * 2);

    expect(stub.listCalls).toBe(callsAfterBoot);
  });

  it('catches sweep errors and keeps the interval alive', async () => {
    const throwingGateway: WorktreeGateway = {
      list: async () => {
        throw new Error('filesystem unavailable');
      },
      remove: async () => ({ status: 'absent' }),
      ensure: async () => ({ status: 'failed', reason: 'not-implemented-in-stub' }),
      exists: async () => false,
    };

    const scheduler = startWorktreeSweepScheduler({
      worktreeGateway: throwingGateway,
      trackingGateway: createStubTrackingGateway(),
      getRepositories: () => [],
      logger: createStubLogger(),
      now: () => new Date('2026-05-23T12:00:00Z'),
    });

    await expect(vi.advanceTimersByTimeAsync(10)).resolves.not.toThrow();
    await expect(vi.advanceTimersByTimeAsync(TWENTY_FOUR_HOURS_MS)).resolves.not.toThrow();

    scheduler.stop();
  });
});
