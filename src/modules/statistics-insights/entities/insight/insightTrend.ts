import { z } from 'zod';

export const INSIGHT_TRENDS = ['improving', 'declining', 'stable'] as const;

export const insightTrendSchema = z.enum(INSIGHT_TRENDS);

export type InsightTrend = z.infer<typeof insightTrendSchema>;
