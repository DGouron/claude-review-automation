import type { PersistedInsightsData } from '@/entities/insight/persistedInsightsData.js';

export interface InsightsGateway {
  loadPersistedInsights(projectPath: string): PersistedInsightsData | null;
  savePersistedInsights(projectPath: string, data: PersistedInsightsData): void;
}
