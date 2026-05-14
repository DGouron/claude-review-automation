import { z } from 'zod';

export const claudeModelNameSchema = z.enum(['haiku', 'sonnet', 'opus']);

export const routingPolicySchema = z.object({
  haikuMaxLines: z.number().int().positive(),
  sonnetMaxLines: z.number().int().positive(),
});

export type ClaudeModelName = z.infer<typeof claudeModelNameSchema>;
export type RoutingPolicy = z.infer<typeof routingPolicySchema>;
