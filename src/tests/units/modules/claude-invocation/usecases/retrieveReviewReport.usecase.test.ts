import { describe, it, expect } from 'vitest';
import { retrieveReviewReport } from '@/modules/claude-invocation/usecases/retrieveReviewReport.usecase.js';
import { StubReviewReportGateway } from '@/tests/stubs/reviewReport.stub.js';
import { ClaudeSessionFactory } from '@/tests/factories/claudeSession.factory.js';

describe('retrieveReviewReport use case', () => {
  it('returns the report content when the file exists', () => {
    const reportGateway = new StubReviewReportGateway();
    reportGateway.setReport({
      content: '# Review',
      path: '/tmp/project/.claude/reviews/2026-05-22-MR-42-review.md',
    });

    const result = retrieveReviewReport(
      {
        session: ClaudeSessionFactory.create(),
        today: new Date('2026-05-22T10:00:00Z'),
        mergeRequestNumber: 42,
      },
      { reportGateway },
    );

    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.content).toBe('# Review');
    }
  });

  it('returns "missing" with the expected path when the file is absent', () => {
    const reportGateway = new StubReviewReportGateway();
    reportGateway.setReport(null);

    const result = retrieveReviewReport(
      {
        session: ClaudeSessionFactory.create(),
        today: new Date('2026-05-22T10:00:00Z'),
        mergeRequestNumber: 42,
      },
      { reportGateway },
    );

    expect(result.status).toBe('missing');
    if (result.status === 'missing') {
      expect(result.expectedPath).toContain('2026-05-22-MR-42-review.md');
    }
  });

  it('uses the followup suffix for followup job type', () => {
    const reportGateway = new StubReviewReportGateway();
    reportGateway.setReport(null);

    const result = retrieveReviewReport(
      {
        session: ClaudeSessionFactory.create({ jobType: 'followup' }),
        today: new Date('2026-05-22T10:00:00Z'),
        mergeRequestNumber: 42,
      },
      { reportGateway },
    );

    expect(result.status).toBe('missing');
    if (result.status === 'missing') {
      expect(result.expectedPath).toContain('followup');
    }
  });
});
