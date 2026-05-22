import { z } from 'zod';

export const sessionCompletionSourceSchema = z.enum(['mcp', 'polling', 'timeout']);
export const sessionCompletionOutcomeSchema = z.enum(['completed', 'failed', 'stopped']);

export const sessionCompletionSchema = z.object({
  source: sessionCompletionSourceSchema,
  outcome: sessionCompletionOutcomeSchema,
  reason: z.string().nullable(),
});

export type SessionCompletionSource = z.infer<typeof sessionCompletionSourceSchema>;
export type SessionCompletionOutcome = z.infer<typeof sessionCompletionOutcomeSchema>;
export type SessionCompletion = z.infer<typeof sessionCompletionSchema>;
