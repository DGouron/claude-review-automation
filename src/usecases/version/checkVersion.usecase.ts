import type { VersionCheckResult } from '@/entities/packageVersion/packageVersion.js'
import type { PackageVersionGateway } from '@/entities/packageVersion/packageVersion.gateway.js'
import type { VersionCachePort } from '@/entities/packageVersion/versionCache.gateway.js'

export interface CheckVersionDependencies {
  packageVersionGateway: PackageVersionGateway
  cache: VersionCachePort
}

export interface CheckVersionInput {
  currentVersion: string
  forceRefresh: boolean
}

export async function checkVersion(
  input: CheckVersionInput,
  dependencies: CheckVersionDependencies,
): Promise<VersionCheckResult> {
  const { cache } = dependencies

  if (!input.forceRefresh && !cache.isExpired()) {
    const cached = cache.get()
    if (cached !== null) {
      return cached
    }
  }

  const latestVersion = await dependencies.packageVersionGateway.fetchLatestVersion()
  const updateAvailable = latestVersion !== null && latestVersion !== input.currentVersion

  const result: VersionCheckResult = {
    currentVersion: input.currentVersion,
    latestVersion,
    updateAvailable,
    checkedAt: new Date().toISOString(),
  }

  cache.set(result)

  return result
}
