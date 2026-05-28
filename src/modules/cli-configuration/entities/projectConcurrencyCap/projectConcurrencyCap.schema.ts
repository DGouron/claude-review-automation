import { z } from 'zod';

export const MIN_PROJECT_CONCURRENCY_CAP = 1;
export const MAX_PROJECT_CONCURRENCY_CAP = 10;
export const DEFAULT_PROJECT_CONCURRENCY_CAP = 2;

export const projectConcurrencyCapSchema = z
  .number()
  .int()
  .min(MIN_PROJECT_CONCURRENCY_CAP)
  .max(MAX_PROJECT_CONCURRENCY_CAP);

export type ProjectConcurrencyCap = z.infer<typeof projectConcurrencyCapSchema>;
