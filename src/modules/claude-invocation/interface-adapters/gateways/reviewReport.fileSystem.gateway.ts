import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ReviewReportContent,
  ReviewReportGateway,
  ReviewReportLocation,
} from '@/modules/claude-invocation/entities/sessionCompletion/reviewReport.gateway.js';

export interface ReviewReportFileSystem {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string) => string;
}

const defaultFs: ReviewReportFileSystem = {
  existsSync,
  readFileSync: (path: string) => readFileSync(path, 'utf-8'),
};

export class ReviewReportFileSystemGateway implements ReviewReportGateway {
  constructor(private readonly fs: ReviewReportFileSystem = defaultFs) {}

  buildPath(location: ReviewReportLocation): string {
    const suffix = location.jobType === 'followup' ? 'followup' : 'review';
    const fileName = `${location.isoDate}-MR-${location.mergeRequestNumber}-${suffix}.md`;
    return join(location.localPath, '.claude', 'reviews', fileName);
  }

  read(location: ReviewReportLocation): ReviewReportContent | null {
    const path = this.buildPath(location);
    if (!this.fs.existsSync(path)) {
      return null;
    }
    return { content: this.fs.readFileSync(path), path };
  }
}
