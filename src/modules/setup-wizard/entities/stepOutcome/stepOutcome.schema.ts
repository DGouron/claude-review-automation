import { z } from 'zod';

export const stepOutcomeStatusSchema = z.enum(['skipped', 'succeeded', 'blocked', 'warning']);

export type StepOutcomeStatus = z.infer<typeof stepOutcomeStatusSchema>;

export const stepOutcomeSchema = z.object({
  status: stepOutcomeStatusSchema,
  message: z.string().nullable().optional(),
  remediation: z.string().nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type StepOutcome = z.infer<typeof stepOutcomeSchema>;
