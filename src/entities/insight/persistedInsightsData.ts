import type { z } from 'zod';
import type { persistedDeveloperMetricsSchema, persistedInsightsDataSchema } from '@/entities/insight/persistedInsightsData.schema.js';

export type PersistedDeveloperMetrics = z.infer<typeof persistedDeveloperMetricsSchema>;

export type PersistedInsightsData = z.infer<typeof persistedInsightsDataSchema>;
