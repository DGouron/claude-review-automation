import type { PendingReviewRequest } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';

export const PendingReviewRequestFactory = {
  create(overrides: Partial<PendingReviewRequest> = {}): PendingReviewRequest {
    return {
      pendingReviewRequestId: 'pending-gitlab-group-project-42',
      job: {
        id: 'gitlab:group/project:42',
        platform: 'gitlab',
        projectPath: 'group/project',
        localPath: '/home/user/projects/test',
        mrNumber: 42,
        skill: 'review-code',
        mrUrl: 'https://gitlab.example.com/group/project/-/merge_requests/42',
        sourceBranch: 'feature/x',
        targetBranch: 'main',
        jobType: 'review',
      },
      jobType: 'review',
      platform: 'gitlab',
      triggerSource: 'webhook-initial',
      createdAt: '2026-05-23T10:00:00.000Z',
      ...overrides,
    };
  },
};
