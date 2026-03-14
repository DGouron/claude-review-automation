import type { PackageVersionGateway } from '@/entities/packageVersion/packageVersion.gateway.js'

export class StubPackageVersionGateway implements PackageVersionGateway {
  private readonly latestVersion: string | null

  constructor(latestVersion: string | null = null) {
    this.latestVersion = latestVersion
  }

  async fetchLatestVersion(): Promise<string | null> {
    return this.latestVersion
  }
}
