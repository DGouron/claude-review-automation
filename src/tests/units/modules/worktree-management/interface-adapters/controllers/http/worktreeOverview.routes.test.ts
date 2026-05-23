import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { worktreeOverviewRoutes } from '@/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.js';
import { WorktreePanelPresenter } from '@/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.js';
import { StubWorktreeSizeProbeGateway } from '@/tests/stubs/worktreeSizeProbe.stub.js';
import { LastSweepSummaryFactory } from '@/tests/factories/lastSweepSummary.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { createWorktreePath } from '@/modules/worktree-management/entities/worktree/worktree.js';
import type {
  EnsureResult,
  RemoveResult,
  WorktreeEntry,
  WorktreeIdentity,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import type { WorktreeGateway } from '@/modules/worktree-management/entities/worktree/worktree.gateway.js';
import type { LastSweepSummary } from '@/modules/worktree-management/entities/sweep/lastSweepSummary.schema.js';

const NOW = new Date('2026-05-23T12:00:00.000Z');

function buildEntry(identity: WorktreeIdentity, mtime: Date, path: string): WorktreeEntry {
  return {
    identity,
    path: createWorktreePath(path),
    mtime,
  };
}

class StubWorktreeGateway implements WorktreeGateway {
  constructor(private readonly entries: WorktreeEntry[]) {}
  async list(): Promise<WorktreeEntry[]> {
    return this.entries;
  }
  async ensure(): Promise<EnsureResult> {
    return { status: 'failed', reason: 'not-implemented' };
  }
  async remove(): Promise<RemoveResult> {
    return { status: 'absent' };
  }
  async exists(): Promise<boolean> {
    return false;
  }
}

interface BuildAppOptions {
  worktrees?: WorktreeEntry[];
  lastSweep?: LastSweepSummary | null;
  nextSweepAt?: Date;
  runSweepNow?: () => Promise<
    | { status: 'ok'; summary: LastSweepSummary }
    | { status: 'conflict'; startedAt: Date }
    | { status: 'error'; reason: string }
  >;
  controlsAbsent?: boolean;
  sizeProbeMap?: Record<string, number | null>;
}

async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify();
  const worktrees = options.worktrees ?? [];
  const sizeProbe = new StubWorktreeSizeProbeGateway();
  if (options.sizeProbeMap) {
    for (const [path, size] of Object.entries(options.sizeProbeMap)) {
      sizeProbe.setSize(path, size);
    }
  } else {
    sizeProbe.setDefault(100);
  }
  const presenter = new WorktreePanelPresenter({
    sizeProbe,
    cacheTtlMs: 30_000,
    now: () => NOW,
  });
  const lastSweep = options.lastSweep ?? null;
  const nextSweepAt = options.nextSweepAt ?? NOW;
  const runSweepNow =
    options.runSweepNow ??
    (async () => ({ status: 'ok' as const, summary: LastSweepSummaryFactory.create() }));

  await app.register(worktreeOverviewRoutes, {
    worktreeGateway: new StubWorktreeGateway(worktrees),
    presenter,
    schedulerControls: options.controlsAbsent
      ? null
      : {
          getLastSweep: () => lastSweep,
          getNextSweepEta: () => nextSweepAt,
          runSweepNow,
        },
    logger: createStubLogger(),
  });

  return app;
}

describe('worktreeOverviewRoutes', () => {
  describe('GET /api/worktrees', () => {
    it('returns the presented view model with empty pool', async () => {
      const app = await buildApp();

      const response = await app.inject({ method: 'GET', url: '/api/worktrees' });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        totalCount: number;
        totalSizeBytes: number;
        nextSweepAt: string;
        lastSweep: LastSweepSummary | null;
        groups: unknown[];
      };
      expect(body.totalCount).toBe(0);
      expect(body.totalSizeBytes).toBe(0);
      expect(body.groups).toEqual([]);
      expect(body.lastSweep).toBeNull();

      await app.close();
    });

    it('returns the populated pool with one group + one row', async () => {
      const identity: WorktreeIdentity = { platform: 'gitlab', projectPath: 'group/project', mrNumber: 1 };
      const path = '/tmp/worktrees/gitlab-group-project-1';
      const entry = buildEntry(identity, new Date(NOW.getTime() - 60 * 60 * 1000), path);
      const app = await buildApp({
        worktrees: [entry],
        sizeProbeMap: { [path]: 200 },
        lastSweep: LastSweepSummaryFactory.create({ removed: 3, failures: 1, scanned: 5 }),
        nextSweepAt: new Date('2026-05-24T03:00:00.000Z'),
      });

      const response = await app.inject({ method: 'GET', url: '/api/worktrees' });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        totalCount: number;
        totalSizeBytes: number;
        lastSweep: { removed: number; failures: number };
        groups: Array<{ worktrees: Array<{ mrNumber: number; status: string }> }>;
      };
      expect(body.totalCount).toBe(1);
      expect(body.totalSizeBytes).toBe(200);
      expect(body.lastSweep.removed).toBe(3);
      expect(body.groups[0]?.worktrees[0]?.mrNumber).toBe(1);
      expect(body.groups[0]?.worktrees[0]?.status).toBe('active');

      await app.close();
    });

    it('returns 503 when scheduler controls are absent', async () => {
      const app = await buildApp({ controlsAbsent: true });

      const response = await app.inject({ method: 'GET', url: '/api/worktrees' });

      expect(response.statusCode).toBe(503);

      await app.close();
    });
  });

  describe('POST /api/worktrees/sweep', () => {
    it('returns 200 with the new sweep summary on success', async () => {
      const summary = LastSweepSummaryFactory.create({
        ranAt: new Date('2026-05-23T11:55:00.000Z'),
        removed: 2,
        failures: 0,
        scanned: 4,
      });
      const app = await buildApp({
        runSweepNow: async () => ({ status: 'ok', summary }),
      });

      const response = await app.inject({ method: 'POST', url: '/api/worktrees/sweep' });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { ranAt: string; removed: number; failures: number; scanned: number };
      expect(body.ranAt).toBe('2026-05-23T11:55:00.000Z');
      expect(body.removed).toBe(2);
      expect(body.failures).toBe(0);
      expect(body.scanned).toBe(4);

      await app.close();
    });

    it('returns 409 with startedAt when a sweep is already running', async () => {
      const startedAt = new Date('2026-05-23T11:59:57.000Z');
      const app = await buildApp({
        runSweepNow: async () => ({ status: 'conflict', startedAt }),
      });

      const response = await app.inject({ method: 'POST', url: '/api/worktrees/sweep' });

      expect(response.statusCode).toBe(409);
      const body = response.json() as { error: string; startedAt: string };
      expect(body.error).toBe('sweep-in-progress');
      expect(body.startedAt).toBe('2026-05-23T11:59:57.000Z');

      await app.close();
    });

    it('returns 500 with a generic message when runSweepNow returns an error result', async () => {
      const app = await buildApp({
        runSweepNow: async () => ({ status: 'error', reason: 'disk full' }),
      });

      const response = await app.inject({ method: 'POST', url: '/api/worktrees/sweep' });

      expect(response.statusCode).toBe(500);
      const body = response.json() as { error: string };
      expect(body.error).toBe('sweep-failed');

      await app.close();
    });

    it('returns 503 when scheduler controls are absent', async () => {
      const app = await buildApp({ controlsAbsent: true });

      const response = await app.inject({ method: 'POST', url: '/api/worktrees/sweep' });

      expect(response.statusCode).toBe(503);

      await app.close();
    });
  });
});
