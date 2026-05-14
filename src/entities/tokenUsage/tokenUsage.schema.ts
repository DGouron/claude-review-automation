import { z } from 'zod';

export const tokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
  cacheReadInputTokens: z.number(),
  costUsd: z.number(),
});

export const tokenUsageRecordSchema = z.object({
  jobId: z.string(),
  mrNumber: z.number(),
  platform: z.enum(['gitlab', 'github']),
  projectPath: z.string(),
  model: z.string(),
  recordedAt: z.string(),
  localPath: z.string(),
  usage: tokenUsageSchema,
});

export type TokenUsage = z.infer<typeof tokenUsageSchema>;
export type TokenUsageRecord = z.infer<typeof tokenUsageRecordSchema>;
