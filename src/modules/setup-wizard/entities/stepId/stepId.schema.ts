import { z } from 'zod';

export const STEP_IDS = [
  'dependencies',
  'claude-login',
  'daemon',
  'secrets',
  'add-project',
  'pipeline',
  'generate-files',
  'register-project',
  'validate',
  'next-actions',
] as const;

export const stepIdSchema = z.enum(STEP_IDS);

export type StepId = z.infer<typeof stepIdSchema>;
