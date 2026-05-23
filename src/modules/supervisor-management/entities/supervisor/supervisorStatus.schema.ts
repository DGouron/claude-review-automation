import { z } from 'zod';

export const supervisorStateSchema = z.enum(['up', 'down', 'unknown']);

export const supervisorStatusSchema = z.object({
  state: supervisorStateSchema,
  reason: z.string().nullable(),
  lastCheckedAt: z.date(),
});

export type SupervisorState = z.infer<typeof supervisorStateSchema>;
export type SupervisorStatus = z.infer<typeof supervisorStatusSchema>;

export function createSupervisorStatus(
  state: SupervisorState,
  reason: string | null,
  lastCheckedAt: Date,
): SupervisorStatus {
  return supervisorStatusSchema.parse({ state, reason, lastCheckedAt });
}
