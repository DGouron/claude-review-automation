import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';

export interface StatsGateway {
  loadProjectStats(projectPath: string): ProjectStats | null;
  saveProjectStats(projectPath: string, stats: ProjectStats): void;
  statsFileExists(projectPath: string): boolean;
}
