import { z } from 'zod';

export const emberMemoryTurnSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

export const emberRecurringInsightSchema = z.string().trim().min(1);

export const emberMemorySchema = z.object({
  turns: z.array(emberMemoryTurnSchema),
  insights: z.array(emberRecurringInsightSchema).default([]),
});

export type EmberMemoryTurn = z.infer<typeof emberMemoryTurnSchema>;
export type EmberRecurringInsight = z.infer<typeof emberRecurringInsightSchema>;
export type EmberMemory = z.infer<typeof emberMemorySchema>;
