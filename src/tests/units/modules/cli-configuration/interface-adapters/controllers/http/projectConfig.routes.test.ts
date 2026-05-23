import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { statSync, type Stats } from 'node:fs';
import { tmpdir } from 'node:os';
import * as fsPromises from 'node:fs/promises';
import { projectConfigRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.js';
import { ProjectConfigFactory } from '@/tests/factories/projectConfig.factory.js';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
    stat: vi.fn(),
  };
});

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(projectConfigRoutes);
  return app;
}

function jsonResponse(body: unknown): string {
  return JSON.stringify(body);
}

function fakeStats(): Stats {
  const stats = statSync(tmpdir());
  if (!stats) {
    throw new Error('statSync(tmpdir()) returned undefined — test environment is broken');
  }
  return stats;
}

describe('projectConfigRoutes — GET /api/project-config', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the config payload including reviewFocus when present', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse(
        ProjectConfigFactory.create({
          reviewFocus: 'back',
          reviewSkill: undefined,
        }),
      ),
    );
    vi.mocked(fsPromises.stat).mockResolvedValue(fakeStats());

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(true);
    expect(payload.config.reviewFocus).toBe('back');
    await app.close();
  });

  it('accepts a config without reviewSkill when reviewFocus is set', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse(
        ProjectConfigFactory.create({
          reviewFocus: 'doc',
          reviewSkill: undefined,
        }),
      ),
    );
    vi.mocked(fsPromises.stat).mockResolvedValue(fakeStats());

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(true);
    await app.close();
  });

  it('rejects an invalid reviewFocus value', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse(
        ProjectConfigFactory.create({
          reviewFocus: 'mobile',
        }),
      ),
    );

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/Invalid reviewFocus/);
    await app.close();
  });

  it('still requires reviewSkill when reviewFocus is absent', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewFollowupSkill: 'review-followup',
      }),
    );

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/reviewSkill/);
    await app.close();
  });

  it('checks the SKILL.md derived from reviewFocus when reviewSkill is absent', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse(
        ProjectConfigFactory.create({
          reviewFocus: 'back',
          reviewSkill: undefined,
        }),
      ),
    );
    const statMock = vi.mocked(fsPromises.stat);
    statMock.mockResolvedValue(fakeStats());

    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const checkedPaths = statMock.mock.calls.map((call) => String(call[0]));
    expect(checkedPaths.some((checkedPath) => checkedPath.includes('review-back/SKILL.md'))).toBe(
      true,
    );
    await app.close();
  });

  it('returns a clear error when the derived SKILL.md does not exist', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      jsonResponse(
        ProjectConfigFactory.create({
          reviewFocus: 'back',
          reviewSkill: undefined,
        }),
      ),
    );
    vi.mocked(fsPromises.stat).mockRejectedValue(new Error('ENOENT'));

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/project-config?path=/fake/project',
    });

    const payload = response.json();
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/review-back/);
    await app.close();
  });
});
