import type { FastifyPluginAsync } from 'fastify';
import type { VersionCachePort } from '@/entities/packageVersion/versionCache.port.js';
import { getQueueStats, getJobsStatus } from '@/frameworks/queue/pQueueAdapter.js';

interface HealthRoutesOptions {
  getConfig: () => { version: string };
  versionCache?: VersionCachePort;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (
  fastify,
  opts
) => {
  const { getConfig } = opts;

  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });

  fastify.get('/api/status', async () => {
    const queueStats = getQueueStats();
    const jobs = getJobsStatus();
    const config = getConfig();
    const versionCheck = opts.versionCache?.get() ?? null;

    return {
      status: 'running',
      version: config.version,
      queue: queueStats,
      jobs,
      timestamp: new Date().toISOString(),
      latestVersion: versionCheck?.latestVersion ?? null,
      updateAvailable: versionCheck?.updateAvailable ?? false,
      versionCheckedAt: versionCheck?.checkedAt ?? null,
    };
  });
};
