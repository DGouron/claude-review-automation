import type { FastifyPluginAsync } from 'fastify';
import type { RepositoryConfig } from '@/frameworks/config/configLoader.js';

export type AddRepositoryRouteResult =
  | { status: 'ok'; repositories: RepositoryConfig[] }
  | { status: 'not-a-directory' }
  | { status: 'duplicate' }
  | { status: 'write-failed' };

export type RemoveRepositoryRouteResult =
  | { status: 'ok'; repositories: RepositoryConfig[] }
  | { status: 'not-found' }
  | { status: 'write-failed' };

export type PatchRepositoryRouteResult =
  | { status: 'ok'; repositories: RepositoryConfig[] }
  | { status: 'not-found' }
  | { status: 'write-failed' };

export interface RepositoriesRoutesOptions {
  getRepositories: () => RepositoryConfig[];
  mutateRepositories: (mutator: (repositories: RepositoryConfig[]) => void) => void;
  addRepository: (input: { localPath: string }) => AddRepositoryRouteResult;
  removeRepository: (input: { localPath: string }) => RemoveRepositoryRouteResult;
  patchRepository: (input: { localPath: string; enabled: boolean }) => PatchRepositoryRouteResult;
}

function projectRepositories(repositories: RepositoryConfig[]) {
  return repositories.map((repository) => ({
    name: repository.name,
    localPath: repository.localPath,
    platform: repository.platform,
    enabled: repository.enabled,
  }));
}

const WRITE_FAILED_MESSAGE = "Échec de l'écriture de la configuration";

export const repositoriesRoutes: FastifyPluginAsync<RepositoriesRoutesOptions> = async (
  fastify,
  options,
) => {
  fastify.get('/api/repositories', async () => {
    return { repositories: projectRepositories(options.getRepositories()) };
  });

  fastify.post('/api/repositories', async (request, reply) => {
    const body = request.body as Record<string, unknown> | null;
    const rawLocalPath = body && typeof body.localPath === 'string' ? body.localPath : '';
    const localPath = rawLocalPath.trim();

    if (localPath.length === 0) {
      return reply.code(400).send({ error: 'Chemin du projet requis' });
    }
    if (!localPath.startsWith('/')) {
      return reply.code(400).send({ error: 'Le chemin doit être absolu' });
    }

    const result = options.addRepository({ localPath });
    if (result.status === 'not-a-directory') {
      return reply.code(400).send({ error: 'Dossier introuvable' });
    }
    if (result.status === 'duplicate') {
      return reply.code(409).send({ error: 'Projet déjà ajouté' });
    }
    if (result.status === 'write-failed') {
      return reply.code(500).send({ error: WRITE_FAILED_MESSAGE });
    }
    return reply.code(200).send({ repositories: projectRepositories(result.repositories) });
  });

  fastify.delete('/api/repositories', async (request, reply) => {
    const query = request.query as Record<string, unknown> | null;
    const localPath = query && typeof query.localPath === 'string' ? query.localPath : '';
    if (localPath.length === 0) {
      return reply.code(400).send({ error: 'Chemin du projet requis' });
    }
    const result = options.removeRepository({ localPath });
    if (result.status === 'not-found') {
      return reply.code(404).send({ error: 'Projet introuvable' });
    }
    if (result.status === 'write-failed') {
      return reply.code(500).send({ error: WRITE_FAILED_MESSAGE });
    }
    return reply.code(200).send({ repositories: projectRepositories(result.repositories) });
  });

  fastify.patch('/api/repositories', async (request, reply) => {
    const query = request.query as Record<string, unknown> | null;
    const localPath = query && typeof query.localPath === 'string' ? query.localPath : '';
    if (localPath.length === 0) {
      return reply.code(400).send({ error: 'Chemin du projet requis' });
    }
    const body = request.body as Record<string, unknown> | null;
    if (!body || typeof body.enabled !== 'boolean') {
      return reply.code(400).send({ error: 'Le champ "enabled" doit être un booléen' });
    }
    const result = options.patchRepository({ localPath, enabled: body.enabled });
    if (result.status === 'not-found') {
      return reply.code(404).send({ error: 'Projet introuvable' });
    }
    if (result.status === 'write-failed') {
      return reply.code(500).send({ error: WRITE_FAILED_MESSAGE });
    }
    return reply.code(200).send({ repositories: projectRepositories(result.repositories) });
  });
};
