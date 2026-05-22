import type { ClaudeSessionJobType } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';

export interface ReviewReportLocation {
  localPath: string;
  isoDate: string;
  mergeRequestNumber: number;
  jobType: ClaudeSessionJobType;
}

export interface ReviewReportContent {
  content: string;
  path: string;
}

export interface ReviewReportGateway {
  read(location: ReviewReportLocation): ReviewReportContent | null;
  buildPath(location: ReviewReportLocation): string;
}
