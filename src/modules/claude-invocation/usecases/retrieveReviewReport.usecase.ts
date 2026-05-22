import type { ClaudeSession } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type {
  ReviewReportGateway,
  ReviewReportLocation,
} from '@/modules/claude-invocation/entities/sessionCompletion/reviewReport.gateway.js';

export interface RetrieveReviewReportInput {
  session: ClaudeSession;
  today: Date;
  mergeRequestNumber: number;
}

export interface RetrieveReviewReportDependencies {
  reportGateway: ReviewReportGateway;
}

export type RetrieveReviewReportResult =
  | { status: 'found'; content: string; path: string }
  | { status: 'missing'; expectedPath: string };

function formatIsoDate(today: Date): string {
  return today.toISOString().slice(0, 10);
}

export function retrieveReviewReport(
  input: RetrieveReviewReportInput,
  deps: RetrieveReviewReportDependencies,
): RetrieveReviewReportResult {
  const location: ReviewReportLocation = {
    localPath: input.session.localPath,
    isoDate: formatIsoDate(input.today),
    mergeRequestNumber: input.mergeRequestNumber,
    jobType: input.session.jobType,
  };

  const found = deps.reportGateway.read(location);
  if (found) {
    return { status: 'found', content: found.content, path: found.path };
  }
  return { status: 'missing', expectedPath: deps.reportGateway.buildPath(location) };
}
