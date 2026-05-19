import type { PersistedInsightsData } from '@/modules/statistics-insights/entities/insight/persistedInsightsData.js';

export interface InsightsGateway {
  loadPersistedInsights(projectPath: string): PersistedInsightsData | null;
  savePersistedInsights(projectPath: string, data: PersistedInsightsData): void;
}
