import { z } from 'zod';

export const emberSessionPhaseSchema = z.enum(['idle', 'live']);

export type EmberSessionPhase = z.infer<typeof emberSessionPhaseSchema>;
