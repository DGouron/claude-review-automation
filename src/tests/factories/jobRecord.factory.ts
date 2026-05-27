import type { JobRecord } from '@/modules/review-execution/entities/job/jobRecord.schema.js';

export const JobRecordFactory = {
  create(overrides: Partial<JobRecord> = {}): JobRecord {
    return {
      jobId: 'gitlab:test-org/test-project:42',
      platform: 'gitlab',
      projectPath: 'test-org/test-project',
      mergeRequestId: 42,
      jobType: 'review',
      startedAt: '2026-05-25T10:00:00.000Z',
      completedAt: '2026-05-25T10:05:00.000Z',
      durationMs: 300000,
      status: 'success',
      exitReason: null,
      ...overrides,
    };
  },
};
