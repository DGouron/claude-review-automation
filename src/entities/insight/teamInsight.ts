import type { z } from 'zod';
import type { teamInsightSchema, averageLevelsSchema } from '@/entities/insight/teamInsight.schema.js';

export type AverageLevels = z.infer<typeof averageLevelsSchema>;

export type TeamInsight = z.infer<typeof teamInsightSchema>;
