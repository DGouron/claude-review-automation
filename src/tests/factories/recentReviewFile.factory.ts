import type { ReviewFileInfo } from '@/modules/review-execution/entities/review/reviewFile.gateway.js';

export class RecentReviewFileFactory {
  static create(overrides: Partial<ReviewFileInfo> = {}): ReviewFileInfo {
    return {
      filename: '2026-05-25-MR-100.md',
      path: '/repos/sample-project/.claude/reviews/2026-05-25-MR-100.md',
      date: '2026-05-25',
      mrNumber: '100',
      type: 'MR',
      size: 4096,
      mtime: '2026-05-25T12:00:00.000Z',
      title: 'feat: sample review',
      ...overrides,
    };
  }
}
