import type { JobRecord } from '@/modules/review-execution/entities/job/jobRecord.schema.js';

export interface PruneJobHistoryResult {
  deletedFilenames: string[];
}

export interface JobHistoryGateway {
  appendRecord(record: JobRecord): Promise<void>;
  loadRecordsWithinWindow(retentionDays: number, now: Date): Promise<JobRecord[]>;
  deleteRecordsOutsideWindow(retentionDays: number, now: Date): Promise<PruneJobHistoryResult>;
}
