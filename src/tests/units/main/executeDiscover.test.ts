import { describe, it, expect, vi } from 'vitest';
import {
  executeDiscover,
  type DiscoverDependencies,
} from '@/main/cli.js';
import type { DiscoveredRepository } from '@/usecases/cli/discoverRepositories.usecase.js';

function createFakeDiscoverDeps(
  overrides?: Partial<DiscoverDependencies>,
): DiscoverDependencies {
  return {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => JSON.stringify({
      server: { port: 3847 },
      user: { gitlabUsername: '', githubUsername: '' },
      queue: { maxConcurrent: 2, deduplicationWindowMs: 300000 },
      repositories: [],
    })),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    getGitRemoteUrl: vi.fn(() => null),
    getConfigPath: vi.fn(() => '/home/user/.config/reviewflow/config.json'),
    log: vi.fn(),
    selectRepositories: vi.fn(async (repos: DiscoveredRepository[]) => repos),
    ...overrides,
  };
}

describe('executeDiscover', () => {
  it('should throw when config does not exist', async () => {
    const deps = createFakeDiscoverDeps({
      existsSync: vi.fn(() => false),
    });

    await expect(executeDiscover([], 3, deps)).rejects.toThrow();
  });

  it('should discover repos and add selected ones to config', async () => {
    const writeFileSync = vi.fn();
    const deps = createFakeDiscoverDeps({
      readdirSync: vi.fn((path: string) => {
        if (path === '/home/user/projects') {
          return [{ name: 'new-app', isDirectory: () => true }];
        }
        return [];
      }),
      existsSync: vi.fn((path: string) => {
        if (path === '/home/user/.config/reviewflow/config.json') return true;
        if (path === '/home/user/projects') return true;
        if (path === '/home/user/projects/new-app/.git') return true;
        return false;
      }),
      getGitRemoteUrl: vi.fn(() => 'https://github.com/user/new-app'),
      writeFileSync,
    });

    await executeDiscover(['/home/user/projects'], 3, deps);

    expect(writeFileSync).toHaveBeenCalled();
    const writtenConfig = JSON.parse(writeFileSync.mock.calls[0][1]);
    expect(writtenConfig.repositories).toHaveLength(1);
    expect(writtenConfig.repositories[0].name).toBe('new-app');
  });
});
