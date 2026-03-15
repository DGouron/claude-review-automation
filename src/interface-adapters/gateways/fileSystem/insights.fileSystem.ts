import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { InsightsGateway } from '@/entities/insight/insights.gateway.js';
import type { PersistedInsightsData } from '@/entities/insight/persistedInsightsData.js';
import { safeParsePersistedInsightsData } from '@/entities/insight/persistedInsightsData.guard.js';

function getInsightsPath(projectPath: string): string {
  return join(projectPath, '.claude', 'reviews', 'insights.json');
}

export class FileSystemInsightsGateway implements InsightsGateway {
  loadPersistedInsights(projectPath: string): PersistedInsightsData | null {
    const insightsPath = getInsightsPath(projectPath);

    if (!existsSync(insightsPath)) {
      return null;
    }

    try {
      const content = readFileSync(insightsPath, 'utf-8');
      const parsed = safeParsePersistedInsightsData(JSON.parse(content));
      if (!parsed.success) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  savePersistedInsights(projectPath: string, data: PersistedInsightsData): void {
    const insightsPath = getInsightsPath(projectPath);
    const directory = dirname(insightsPath);

    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }

    writeFileSync(insightsPath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
