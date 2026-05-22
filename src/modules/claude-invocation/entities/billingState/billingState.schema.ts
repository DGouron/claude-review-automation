import { z } from 'zod';

export const billingStateSchema = z.object({
  dispatchPaused: z.boolean(),
  lastAuditAt: z.string().nullable(),
  lastRegressionReason: z.string().nullable(),
});

export type BillingState = z.infer<typeof billingStateSchema>;
