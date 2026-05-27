import { z } from 'zod';

export const jobRecordStatusSchema = z.enum(['success', 'failed', 'killed', 'timeout']);

export const jobRecordSchema = z.object({
  jobId: z.string().min(1),
  platform: z.enum(['gitlab', 'github']),
  projectPath: z.string().min(1),
  mergeRequestId: z.number().int().nonnegative(),
  jobType: z.enum(['review', 'followup']),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  status: jobRecordStatusSchema,
  exitReason: z.string().nullable(),
});

export type JobRecordStatus = z.infer<typeof jobRecordStatusSchema>;
export type JobRecord = z.infer<typeof jobRecordSchema>;
