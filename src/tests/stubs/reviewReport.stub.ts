import type {
  ReviewReportContent,
  ReviewReportGateway,
  ReviewReportLocation,
} from '@/modules/claude-invocation/entities/sessionCompletion/reviewReport.gateway.js';
import type { ClaudeSessionJobType } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';

export class StubReviewReportGateway implements ReviewReportGateway {
  private report: ReviewReportContent | null = {
    content: '# Stub report',
    path: '/tmp/project/.claude/reviews/2026-05-22-MR-42-review.md',
  };

  lastReadJobType: ClaudeSessionJobType | null = null;
  readCallCount = 0;

  setReport(report: ReviewReportContent | null): void {
    this.report = report;
  }

  read(location: ReviewReportLocation): ReviewReportContent | null {
    this.lastReadJobType = location.jobType;
    this.readCallCount += 1;
    return this.report;
  }

  buildPath(location: ReviewReportLocation): string {
    const suffix = location.jobType === 'followup' ? 'followup' : 'review';
    return `${location.localPath}/.claude/reviews/${location.isoDate}-MR-${location.mergeRequestNumber}-${suffix}.md`;
  }
}
