import type { z } from 'zod';
import type { developerInsightSchema, categoryLevelSchema, categoryLevelsSchema } from '@/entities/insight/developerInsight.schema.js';

export type CategoryLevel = z.infer<typeof categoryLevelSchema>;

export type CategoryLevels = z.infer<typeof categoryLevelsSchema>;

export type DeveloperInsight = z.infer<typeof developerInsightSchema>;
