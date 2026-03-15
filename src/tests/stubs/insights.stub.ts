import type { InsightsGateway } from '@/entities/insight/insights.gateway.js';
import type { PersistedInsightsData } from '@/entities/insight/persistedInsightsData.js';

export class InMemoryInsightsGateway implements InsightsGateway {
  private storage = new Map<string, PersistedInsightsData>();

  loadPersistedInsights(projectPath: string): PersistedInsightsData | null {
    return this.storage.get(projectPath) ?? null;
  }

  savePersistedInsights(projectPath: string, data: PersistedInsightsData): void {
    this.storage.set(projectPath, data);
  }

  clear(): void {
    this.storage.clear();
  }
}
