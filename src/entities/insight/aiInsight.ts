import type { z } from 'zod';
import type {
  aiDeveloperInsightSchema,
  aiTeamInsightSchema,
  aiInsightsResultSchema,
} from '@/entities/insight/aiInsight.schema.js';

export type AiDeveloperInsight = z.infer<typeof aiDeveloperInsightSchema>;

export type AiTeamInsight = z.infer<typeof aiTeamInsightSchema>;

export type AiInsightsResult = z.infer<typeof aiInsightsResultSchema>;
