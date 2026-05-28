import { z } from 'zod';

export const emberMessageSchema = z.object({
  question: z.string().trim().min(1),
});

export type EmberMessage = z.infer<typeof emberMessageSchema>;
