import type { FastifyPluginAsync } from 'fastify'
import type { VersionCheckResult, SelfUpdateResult } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.js'
import type { PackageVersionGateway } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.gateway.js'
import type { VersionCachePort } from '@/modules/cli-configuration/entities/packageVersion/versionCache.gateway.js'
import type { SelfUpdateCommandPort } from '@/modules/cli-configuration/entities/packageVersion/selfUpdateCommand.gateway.js'
import type { CheckVersionInput, CheckVersionDependencies } from '@/modules/cli-configuration/usecases/version/checkVersion.usecase.js'
import type { TriggerSelfUpdateDependencies } from '@/modules/cli-configuration/usecases/version/triggerSelfUpdate.usecase.js'

interface VersionRoutesOptions {
  checkVersion: (input: CheckVersionInput, dependencies: CheckVersionDependencies) => Promise<VersionCheckResult>
  triggerSelfUpdate: (dependencies: TriggerSelfUpdateDependencies) => Promise<SelfUpdateResult>
  currentVersion: string
  packageVersionGateway: PackageVersionGateway
  versionCache: VersionCachePort
  selfUpdateCommand: SelfUpdateCommandPort
  serverPort: number
}

export const versionRoutes: FastifyPluginAsync<VersionRoutesOptions> = async (fastify, options) => {
  fastify.get('/api/version/check', async () => {
    return options.checkVersion(
      { currentVersion: options.currentVersion, forceRefresh: true },
      { packageVersionGateway: options.packageVersionGateway, cache: options.versionCache },
    )
  })

  fastify.post('/api/version/update', async (_request, reply) => {
    const result = await options.triggerSelfUpdate({ selfUpdateCommand: options.selfUpdateCommand })

    if (result.status === 'failed') {
      reply.code(500)
    }

    if (result.status === 'permission-denied') {
      reply.code(403)
    }

    if (result.status === 'started') {
      setTimeout(() => {
        options.selfUpdateCommand.restartDaemon(options.serverPort).catch(() => {})
      }, 1000)
    }

    return result
  })
}
