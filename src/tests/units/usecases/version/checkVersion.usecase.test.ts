import { describe, it, expect } from 'vitest'
import { checkVersion } from '@/usecases/version/checkVersion.usecase.js'
import { StubPackageVersionGateway } from '@/tests/stubs/packageVersion.stub.js'
import { StubVersionCache } from '@/tests/stubs/versionCache.stub.js'
import { PackageVersionFactory } from '@/tests/factories/packageVersion.factory.js'

describe('checkVersion usecase', () => {
  it('should return cached result when cache is valid and not force refresh', async () => {
    const cachedResult = PackageVersionFactory.createVersionCheckResult()
    const cache = new StubVersionCache(cachedResult, false)
    const gateway = new StubPackageVersionGateway('2.0.0')

    const result = await checkVersion(
      { currentVersion: '1.0.0', forceRefresh: false },
      { packageVersionGateway: gateway, cache },
    )

    expect(result).toEqual(cachedResult)
  })

  it('should fetch from gateway when cache is expired', async () => {
    const cache = new StubVersionCache(null, true)
    const gateway = new StubPackageVersionGateway('2.0.0')

    const result = await checkVersion(
      { currentVersion: '1.0.0', forceRefresh: false },
      { packageVersionGateway: gateway, cache },
    )

    expect(result.currentVersion).toBe('1.0.0')
    expect(result.latestVersion).toBe('2.0.0')
    expect(result.updateAvailable).toBe(true)
  })

  it('should fetch from gateway when forceRefresh is true', async () => {
    const cachedResult = PackageVersionFactory.createVersionCheckResult({
      latestVersion: '1.5.0',
      updateAvailable: true,
    })
    const cache = new StubVersionCache(cachedResult, false)
    const gateway = new StubPackageVersionGateway('3.0.0')

    const result = await checkVersion(
      { currentVersion: '1.0.0', forceRefresh: true },
      { packageVersionGateway: gateway, cache },
    )

    expect(result.latestVersion).toBe('3.0.0')
    expect(result.updateAvailable).toBe(true)
  })

  it('should set updateAvailable to true when versions differ', async () => {
    const cache = new StubVersionCache(null, true)
    const gateway = new StubPackageVersionGateway('2.0.0')

    const result = await checkVersion(
      { currentVersion: '1.0.0', forceRefresh: false },
      { packageVersionGateway: gateway, cache },
    )

    expect(result.updateAvailable).toBe(true)
  })

  it('should set updateAvailable to false when versions match', async () => {
    const cache = new StubVersionCache(null, true)
    const gateway = new StubPackageVersionGateway('1.0.0')

    const result = await checkVersion(
      { currentVersion: '1.0.0', forceRefresh: false },
      { packageVersionGateway: gateway, cache },
    )

    expect(result.updateAvailable).toBe(false)
  })

  it('should set updateAvailable to false when latestVersion is null', async () => {
    const cache = new StubVersionCache(null, true)
    const gateway = new StubPackageVersionGateway(null)

    const result = await checkVersion(
      { currentVersion: '1.0.0', forceRefresh: false },
      { packageVersionGateway: gateway, cache },
    )

    expect(result.latestVersion).toBeNull()
    expect(result.updateAvailable).toBe(false)
  })

  it('should store result in cache after fetch', async () => {
    const cache = new StubVersionCache(null, true)
    const gateway = new StubPackageVersionGateway('2.0.0')

    await checkVersion(
      { currentVersion: '1.0.0', forceRefresh: false },
      { packageVersionGateway: gateway, cache },
    )

    const cached = cache.get()
    expect(cached).not.toBeNull()
    expect(cached?.currentVersion).toBe('1.0.0')
    expect(cached?.latestVersion).toBe('2.0.0')
    expect(cached?.updateAvailable).toBe(true)
  })
})
