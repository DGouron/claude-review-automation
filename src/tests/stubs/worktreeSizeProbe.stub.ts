import type { WorktreeSizeProbeGateway } from '@/modules/worktree-management/entities/worktree/worktreeSizeProbe.gateway.js';

export class StubWorktreeSizeProbeGateway implements WorktreeSizeProbeGateway {
  private readonly sizesByPath: Map<string, number | null> = new Map();
  private defaultSize: number | null = 0;
  readonly calls: string[] = [];

  setSize(path: string, sizeBytes: number | null): void {
    this.sizesByPath.set(path, sizeBytes);
  }

  setDefault(sizeBytes: number | null): void {
    this.defaultSize = sizeBytes;
  }

  async probe(path: string): Promise<number | null> {
    this.calls.push(path);
    if (this.sizesByPath.has(path)) {
      return this.sizesByPath.get(path) ?? null;
    }
    return this.defaultSize;
  }

  clearCalls(): void {
    this.calls.length = 0;
  }
}
