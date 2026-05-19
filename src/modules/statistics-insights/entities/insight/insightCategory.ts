import { z } from 'zod';

export const INSIGHT_CATEGORIES = ['quality', 'responsiveness', 'codeVolume', 'iteration'] as const;

export const insightCategorySchema = z.enum(INSIGHT_CATEGORIES);

export type InsightCategory = z.infer<typeof insightCategorySchema>;
