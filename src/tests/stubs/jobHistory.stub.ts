import type {
  JobHistoryGateway,
  PruneJobHistoryResult,
} from '@/modules/review-execution/entities/job/jobHistory.gateway.js';
import type { JobRecord } from '@/modules/review-execution/entities/job/jobRecord.schema.js';

function fileNameForRecord(record: JobRecord): string {
  return `${record.completedAt.slice(0, 10)}.jsonl`;
}

function fileNameToDate(filename: string): Date | null {
  const datePart = filename.replace(/\.jsonl$/, '');
  const parsed = new Date(`${datePart}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function thresholdFromRetention(retentionDays: number, now: Date): Date {
  const ms = retentionDays * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms);
}

export class StubJobHistoryGateway implements JobHistoryGateway {
  private readonly buckets = new Map<string, JobRecord[]>();
  public failOnAppend = false;
  public appendCount = 0;
  public lastAppended: JobRecord | null = null;

  async appendRecord(record: JobRecord): Promise<void> {
    this.appendCount += 1;
    if (this.failOnAppend) {
      throw new Error('stub append failure');
    }
    this.lastAppended = record;
    const filename = fileNameForRecord(record);
    const list = this.buckets.get(filename) ?? [];
    list.push(record);
    this.buckets.set(filename, list);
  }

  async loadRecordsWithinWindow(retentionDays: number, now: Date): Promise<JobRecord[]> {
    const threshold = thresholdFromRetention(retentionDays, now);
    const collected: JobRecord[] = [];
    for (const [filename, records] of this.buckets.entries()) {
      const fileDate = fileNameToDate(filename);
      if (!fileDate) continue;
      if (fileDate < threshold) continue;
      collected.push(...records);
    }
    return collected;
  }

  async deleteRecordsOutsideWindow(
    retentionDays: number,
    now: Date,
  ): Promise<PruneJobHistoryResult> {
    const threshold = thresholdFromRetention(retentionDays, now);
    const deletedFilenames: string[] = [];
    for (const filename of Array.from(this.buckets.keys())) {
      const fileDate = fileNameToDate(filename);
      if (!fileDate) continue;
      if (fileDate < threshold) {
        deletedFilenames.push(filename);
        this.buckets.delete(filename);
      }
    }
    return { deletedFilenames };
  }

  prepopulate(record: JobRecord): void {
    const filename = fileNameForRecord(record);
    const list = this.buckets.get(filename) ?? [];
    list.push(record);
    this.buckets.set(filename, list);
  }
}
