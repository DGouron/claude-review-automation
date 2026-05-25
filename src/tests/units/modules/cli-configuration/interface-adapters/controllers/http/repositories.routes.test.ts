import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { repositoriesRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.js';
import { RepositoryConfigFactory } from '@/tests/factories/repositoryConfig.factory.js';

async function buildApp(repositories: ReturnType<typeof RepositoryConfigFactory.create>[]): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(repositoriesRoutes, { getRepositories: () => repositories });
  return app;
}

describe('repositoriesRoutes — GET /api/repositories', () => {
  it('returns the projected list of repositories', async () => {
    const app = await buildApp([
      RepositoryConfigFactory.create({
        name: 'frontend',
        localPath: '/repos/frontend',
        platform: 'gitlab',
        enabled: true,
      }),
    ]);

    const response = await app.inject({ method: 'GET', url: '/api/repositories' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      repositories: Array<{ name: string; localPath: string; platform: string; enabled: boolean }>;
    };
    expect(body.repositories).toEqual([
      { name: 'frontend', localPath: '/repos/frontend', platform: 'gitlab', enabled: true },
    ]);

    await app.close();
  });

  it('returns disabled repositories alongside enabled ones', async () => {
    const app = await buildApp([
      RepositoryConfigFactory.create({ name: 'enabled-repo', localPath: '/repos/enabled', enabled: true }),
      RepositoryConfigFactory.create({ name: 'disabled-repo', localPath: '/repos/disabled', enabled: false }),
    ]);

    const response = await app.inject({ method: 'GET', url: '/api/repositories' });

    const body = response.json() as { repositories: Array<{ name: string; enabled: boolean }> };
    expect(body.repositories.map((repository) => repository.enabled)).toEqual([true, false]);

    await app.close();
  });

  it('returns an empty array when no repository is configured', async () => {
    const app = await buildApp([]);

    const response = await app.inject({ method: 'GET', url: '/api/repositories' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ repositories: [] });

    await app.close();
  });

  it('exposes the repository platform so the dashboard can label tabs', async () => {
    const app = await buildApp([
      RepositoryConfigFactory.create({ name: 'gh-repo', platform: 'github' }),
      RepositoryConfigFactory.create({ name: 'gl-repo', platform: 'gitlab' }),
    ]);

    const response = await app.inject({ method: 'GET', url: '/api/repositories' });

    const body = response.json() as { repositories: Array<{ name: string; platform: string }> };
    expect(body.repositories.find((repository) => repository.name === 'gh-repo')?.platform).toBe('github');
    expect(body.repositories.find((repository) => repository.name === 'gl-repo')?.platform).toBe('gitlab');

    await app.close();
  });
});
