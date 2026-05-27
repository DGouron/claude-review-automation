import type { QueueCapacityPort } from '@/modules/cli-configuration/usecases/projectConfig/recomputeGlobalConcurrency.usecase.js';

export class StubQueueCapacityPort implements QueueCapacityPort {
  globalConcurrency: number | null = null;
  projectCaps: Map<string, number> = new Map();

  setGlobalConcurrency(value: number): void {
    this.globalConcurrency = value;
  }

  setProjectConcurrencyCap(projectPath: string, cap: number): void {
    this.projectCaps.set(projectPath, cap);
  }
}
