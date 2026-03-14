import type { VersionCheckResult } from '@/entities/packageVersion/packageVersion.js'

export interface VersionCachePort {
  get(): VersionCheckResult | null
  set(result: VersionCheckResult): void
  isExpired(): boolean
}
