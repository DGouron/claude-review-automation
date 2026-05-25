import type { FastifyPluginAsync } from 'fastify';
import type { RepositoryConfig } from '@/frameworks/config/configLoader.js';

export interface RepositoriesRoutesOptions {
  getRepositories: () => RepositoryConfig[];
}

export const repositoriesRoutes: FastifyPluginAsync<RepositoriesRoutesOptions> = async (
  fastify,
  options,
) => {
  fastify.get('/api/repositories', async () => {
    return {
      repositories: options.getRepositories().map((repository) => ({
        name: repository.name,
        localPath: repository.localPath,
        platform: repository.platform,
        enabled: repository.enabled,
      })),
    };
  });
};
