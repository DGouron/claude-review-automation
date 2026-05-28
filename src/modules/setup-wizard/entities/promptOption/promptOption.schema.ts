import { z } from 'zod';

export const promptKindSchema = z.enum(['text', 'confirm', 'choice', 'multiSelect']);

export const promptOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export type PromptKind = z.infer<typeof promptKindSchema>;
export type PromptOption = z.infer<typeof promptOptionSchema>;
