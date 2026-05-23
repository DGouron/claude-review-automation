import { z } from 'zod';

export const lastSweepSummarySchema = z.object({
  ranAt: z.date(),
  removed: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  scanned: z.number().int().nonnegative(),
});

export type LastSweepSummary = z.infer<typeof lastSweepSummarySchema>;
