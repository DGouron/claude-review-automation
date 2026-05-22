import { z } from 'zod';

export const retryScheduleConfigSchema = z.object({
  initialDelayMs: z.number().int().positive(),
  maxDelayMs: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  multiplier: z.number().positive(),
});

export type RetryScheduleConfig = z.infer<typeof retryScheduleConfigSchema>;

export const DEFAULT_RETRY_SCHEDULE_CONFIG: RetryScheduleConfig = {
  initialDelayMs: 60_000,
  maxDelayMs: 15 * 60_000,
  maxAttempts: 5,
  multiplier: 2,
};
