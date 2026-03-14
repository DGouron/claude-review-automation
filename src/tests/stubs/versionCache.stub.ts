import type { VersionCheckResult } from '@/entities/packageVersion/packageVersion.js'
import type { VersionCachePort } from '@/entities/packageVersion/versionCache.port.js'

export class StubVersionCache implements VersionCachePort {
  private cachedValue: VersionCheckResult | null
  private expired: boolean

  constructor(cachedValue: VersionCheckResult | null = null, expired = true) {
    this.cachedValue = cachedValue
    this.expired = expired
  }

  get(): VersionCheckResult | null {
    return this.cachedValue
  }

  set(result: VersionCheckResult): void {
    this.cachedValue = result
  }

  isExpired(): boolean {
    return this.expired
  }
}
