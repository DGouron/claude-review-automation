import type { LastSweepSummary } from '@/modules/worktree-management/entities/sweep/lastSweepSummary.schema.js';
import type { WorktreeSizeProbeGateway } from '@/modules/worktree-management/entities/worktree/worktreeSizeProbe.gateway.js';
import type {
  WorktreeEntry,
  WorktreePlatform,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

export type WorktreeRowStatus = 'active' | 'idle' | 'stale';

export interface WorktreeRowViewModel {
  mrNumber: number;
  path: string;
  mtime: string;
  ageSeconds: number;
  sizeBytes: number | null;
  status: WorktreeRowStatus;
}

export interface WorktreeGroupViewModel {
  platform: WorktreePlatform;
  projectPath: string;
  worktrees: WorktreeRowViewModel[];
}

export interface LastSweepViewModel {
  ranAt: string;
  removed: number;
  failures: number;
  scanned: number;
}

export interface WorktreePanelViewModel {
  totalCount: number;
  totalSizeBytes: number;
  activeCount: number;
  idleCount: number;
  staleCount: number;
  nextSweepAt: string;
  lastSweep: LastSweepViewModel | null;
  groups: WorktreeGroupViewModel[];
}

export interface WorktreePanelPresenterInput {
  worktrees: WorktreeEntry[];
  lastSweep: LastSweepSummary | null;
  nextSweepAt: Date;
}

export interface WorktreePanelPresenterDependencies {
  sizeProbe: WorktreeSizeProbeGateway;
  cacheTtlMs?: number;
  now?: () => Date;
}

interface SizeCacheEntry {
  sizeBytes: number | null;
  expiresAt: number;
}

function computeStatus(ageSeconds: number): WorktreeRowStatus {
  const ageMs = ageSeconds * 1000;
  if (ageMs < ONE_DAY_MS) return 'active';
  if (ageMs <= SEVEN_DAYS_MS) return 'idle';
  return 'stale';
}

function groupKey(platform: WorktreePlatform, projectPath: string): string {
  return `${platform}:${projectPath}`;
}

export class WorktreePanelPresenter {
  private readonly sizeProbe: WorktreeSizeProbeGateway;
  private readonly cacheTtlMs: number;
  private readonly now: () => Date;
  private readonly sizeCache: Map<string, SizeCacheEntry> = new Map();

  constructor(deps: WorktreePanelPresenterDependencies) {
    this.sizeProbe = deps.sizeProbe;
    this.cacheTtlMs = deps.cacheTtlMs ?? 30_000;
    this.now = deps.now ?? (() => new Date());
  }

  async present(input: WorktreePanelPresenterInput): Promise<WorktreePanelViewModel> {
    const nowMs = this.now().getTime();
    const groupsMap = new Map<string, WorktreeGroupViewModel>();
    let totalSizeBytes = 0;
    let activeCount = 0;
    let idleCount = 0;
    let staleCount = 0;

    for (const entry of input.worktrees) {
      const sizeBytes = await this.resolveSize(entry.path, nowMs);
      if (sizeBytes !== null) {
        totalSizeBytes += sizeBytes;
      }
      const ageSeconds = Math.max(0, Math.floor((nowMs - entry.mtime.getTime()) / 1000));
      const status = computeStatus(ageSeconds);
      if (status === 'active') activeCount += 1;
      else if (status === 'idle') idleCount += 1;
      else staleCount += 1;
      const row: WorktreeRowViewModel = {
        mrNumber: entry.identity.mrNumber,
        path: entry.path,
        mtime: entry.mtime.toISOString(),
        ageSeconds,
        sizeBytes,
        status,
      };
      const key = groupKey(entry.identity.platform, entry.identity.projectPath);
      const existing = groupsMap.get(key);
      if (existing) {
        existing.worktrees.push(row);
      } else {
        groupsMap.set(key, {
          platform: entry.identity.platform,
          projectPath: entry.identity.projectPath,
          worktrees: [row],
        });
      }
    }

    const groups = Array.from(groupsMap.values())
      .map(group => ({
        ...group,
        worktrees: [...group.worktrees].sort(
          (a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime(),
        ),
      }))
      .sort((a, b) =>
        groupKey(a.platform, a.projectPath).localeCompare(groupKey(b.platform, b.projectPath)),
      );

    return {
      totalCount: input.worktrees.length,
      totalSizeBytes,
      activeCount,
      idleCount,
      staleCount,
      nextSweepAt: input.nextSweepAt.toISOString(),
      lastSweep:
        input.lastSweep === null
          ? null
          : {
              ranAt: input.lastSweep.ranAt.toISOString(),
              removed: input.lastSweep.removed,
              failures: input.lastSweep.failures,
              scanned: input.lastSweep.scanned,
            },
      groups,
    };
  }

  private async resolveSize(path: string, nowMs: number): Promise<number | null> {
    const cached = this.sizeCache.get(path);
    if (cached !== undefined && cached.expiresAt > nowMs) {
      return cached.sizeBytes;
    }
    const sizeBytes = await this.sizeProbe.probe(path);
    this.sizeCache.set(path, {
      sizeBytes,
      expiresAt: nowMs + this.cacheTtlMs,
    });
    return sizeBytes;
  }
}
