import type { ClaudeSession } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type {
  ReviewReportGateway,
  ReviewReportLocation,
} from '@/modules/claude-invocation/entities/sessionCompletion/reviewReport.gateway.js';

export interface RetrieveReviewReportInput {
  session: ClaudeSession;
  today: Date;
  mergeRequestNumber: number;
  fallbackLocalPath?: string;
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
  const primary: ReviewReportLocation = {
    localPath: input.session.localPath,
    isoDate: formatIsoDate(input.today),
    mergeRequestNumber: input.mergeRequestNumber,
    jobType: input.session.jobType,
  };

  const primaryHit = deps.reportGateway.read(primary);
  if (primaryHit) {
    return { status: 'found', content: primaryHit.content, path: primaryHit.path };
  }

  if (
    input.fallbackLocalPath !== undefined &&
    input.fallbackLocalPath !== input.session.localPath
  ) {
    const fallback: ReviewReportLocation = { ...primary, localPath: input.fallbackLocalPath };
    const fallbackHit = deps.reportGateway.read(fallback);
    if (fallbackHit) {
      return { status: 'found', content: fallbackHit.content, path: fallbackHit.path };
    }
  }

  return { status: 'missing', expectedPath: deps.reportGateway.buildPath(primary) };
}
