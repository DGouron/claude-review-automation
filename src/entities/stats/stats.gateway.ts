import type { ProjectStats } from '@/entities/stats/projectStats.js';

export interface StatsGateway {
  loadProjectStats(projectPath: string): ProjectStats | null;
  saveProjectStats(projectPath: string, stats: ProjectStats): void;
  statsFileExists(projectPath: string): boolean;
}
