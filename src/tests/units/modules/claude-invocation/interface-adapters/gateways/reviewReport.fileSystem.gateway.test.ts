import { describe, it, expect, vi } from 'vitest';
import { ReviewReportFileSystemGateway } from '@/modules/claude-invocation/interface-adapters/gateways/reviewReport.fileSystem.gateway.js';

describe('ReviewReportFileSystemGateway.buildPath', () => {
  it('uses the review suffix for review job type', () => {
    const gateway = new ReviewReportFileSystemGateway({
      existsSync: () => false,
      readFileSync: () => '',
    });

    const path = gateway.buildPath({
      localPath: '/tmp/project',
      isoDate: '2026-05-22',
      mergeRequestNumber: 42,
      jobType: 'review',
    });

    expect(path).toBe('/tmp/project/.claude/reviews/2026-05-22-MR-42-review.md');
  });

  it('uses the followup suffix for followup job type', () => {
    const gateway = new ReviewReportFileSystemGateway({
      existsSync: () => false,
      readFileSync: () => '',
    });

    const path = gateway.buildPath({
      localPath: '/tmp/project',
      isoDate: '2026-05-22',
      mergeRequestNumber: 42,
      jobType: 'followup',
    });

    expect(path).toBe('/tmp/project/.claude/reviews/2026-05-22-MR-42-followup.md');
  });
});

describe('ReviewReportFileSystemGateway.read', () => {
  it('returns null when the file does not exist', () => {
    const gateway = new ReviewReportFileSystemGateway({
      existsSync: () => false,
      readFileSync: () => '',
    });

    const result = gateway.read({
      localPath: '/tmp/project',
      isoDate: '2026-05-22',
      mergeRequestNumber: 42,
      jobType: 'review',
    });

    expect(result).toBe(null);
  });

  it('returns the file content when the file exists', () => {
    const readSpy = vi.fn(() => '# Hello');
    const gateway = new ReviewReportFileSystemGateway({
      existsSync: () => true,
      readFileSync: readSpy,
    });

    const result = gateway.read({
      localPath: '/tmp/project',
      isoDate: '2026-05-22',
      mergeRequestNumber: 42,
      jobType: 'review',
    });

    expect(result).toEqual({
      content: '# Hello',
      path: '/tmp/project/.claude/reviews/2026-05-22-MR-42-review.md',
    });
    expect(readSpy).toHaveBeenCalledOnce();
  });
});
