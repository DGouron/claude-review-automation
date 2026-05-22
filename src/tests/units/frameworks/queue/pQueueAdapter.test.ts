import { vi } from 'vitest';

vi.mock('@/frameworks/config/configLoader.js', () => ({
  loadConfig: vi.fn(() => ({
    queue: {
      maxConcurrent: 4,
      deduplicationWindowMs: 60000,
    },
  })),
}));

import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueReview,
  initQueue,
  type ReviewJob,
} from '@/frameworks/queue/pQueueAdapter.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

function createJob(overrides: Partial<ReviewJob>): ReviewJob {
  return {
    id: 'gitlab:test-org/test-project:42',
    platform: 'gitlab',
    projectPath: 'test-org/test-project',
    localPath: '/home/user/projects/test-project',
    mrNumber: 42,
    skill: 'review-front',
    mrUrl: 'https://gitlab.com/test-org/test-project/-/merge_requests/42',
    sourceBranch: 'feature/test',
    targetBranch: 'main',
    jobType: 'review',
    ...overrides,
  };
}

function nextTick(): Promise<void> {
  return new Promise<void>(resolve => setImmediate(resolve));
}

describe('pQueueAdapter - MR-scoped concurrency chain', () => {
  beforeEach(() => {
    initQueue(createStubLogger());
  });

  it('serializes two enqueues with the same MR key (different job ids)', async () => {
    const events: string[] = [];
    let releaseFirst: (() => void) | null = null;
    const firstStarted = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });

    const freshJob = createJob({ id: 'gitlab:test-org/test-project:42', jobType: 'review' });
    const followupJob = createJob({ id: 'gitlab-followup:test-org/test-project:42', jobType: 'followup' });

    const freshEnqueued = await enqueueReview(freshJob, async () => {
      events.push('fresh:start');
      await new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (releaseFirst) {
            clearInterval(interval);
            resolve();
          }
        }, 5);
      });
      await firstStarted;
      events.push('fresh:end');
    });

    expect(freshEnqueued).toBe(true);

    const followupEnqueued = await enqueueReview(followupJob, async () => {
      events.push('followup:start');
      events.push('followup:end');
    });

    expect(followupEnqueued).toBe(true);

    await nextTick();
    await nextTick();
    expect(events).toEqual(['fresh:start']);

    releaseFirst!();

    await new Promise<void>(resolve => setTimeout(resolve, 50));

    expect(events).toEqual(['fresh:start', 'fresh:end', 'followup:start', 'followup:end']);
  });

  it('runs two enqueues with different MR keys in parallel (within queue concurrency)', async () => {
    const events: string[] = [];
    const releases: Array<() => void> = [];
    const waitForRelease = (index: number): Promise<void> =>
      new Promise<void>(resolve => {
        releases[index] = resolve;
      });

    const jobA = createJob({
      id: 'gitlab:test-org/test-project:1',
      projectPath: 'test-org/test-project',
      mrNumber: 1,
    });
    const jobB = createJob({
      id: 'gitlab:test-org/other-project:2',
      projectPath: 'test-org/other-project',
      mrNumber: 2,
    });

    await enqueueReview(jobA, async () => {
      events.push('A:start');
      await waitForRelease(0);
      events.push('A:end');
    });

    await enqueueReview(jobB, async () => {
      events.push('B:start');
      await waitForRelease(1);
      events.push('B:end');
    });

    await new Promise<void>(resolve => setTimeout(resolve, 20));

    expect(events).toContain('A:start');
    expect(events).toContain('B:start');

    releases[0]?.();
    releases[1]?.();
    await new Promise<void>(resolve => setTimeout(resolve, 20));

    expect(events).toContain('A:end');
    expect(events).toContain('B:end');
  });

  it('cleans up the MR chain map after the tail completes (no leak)', async () => {
    const { __getMrChainsSize } = await import('@/frameworks/queue/pQueueAdapter.js');

    const job = createJob({
      id: 'gitlab:test-org/leak-check:99',
      projectPath: 'test-org/leak-check',
      mrNumber: 99,
    });

    await enqueueReview(job, async () => {});

    await new Promise<void>(resolve => setTimeout(resolve, 20));

    expect(__getMrChainsSize()).toBe(0);
  });
});
