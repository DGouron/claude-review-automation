import { createGuard } from '@/shared/foundation/guard.base.js';
import {
  jobRecordSchema,
  type JobRecord,
} from '@/modules/review-execution/entities/job/jobRecord.schema.js';

export const jobRecordGuard = createGuard<JobRecord>(jobRecordSchema, 'jobRecord');
