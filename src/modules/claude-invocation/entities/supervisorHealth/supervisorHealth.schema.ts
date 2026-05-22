import { z } from 'zod';

export const supervisorHealthStatusSchema = z.enum(['up', 'down']);

export const supervisorHealthSchema = z.object({
  status: supervisorHealthStatusSchema,
  lastCheckAt: z.string().nullable(),
  lastDownReason: z.string().nullable(),
});

export type SupervisorHealthStatus = z.infer<typeof supervisorHealthStatusSchema>;
export type SupervisorHealth = z.infer<typeof supervisorHealthSchema>;
