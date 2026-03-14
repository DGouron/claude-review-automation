import type { SelfUpdateCommandPort } from '@/entities/packageVersion/selfUpdateCommand.gateway.js'

export class StubSelfUpdateCommand implements SelfUpdateCommandPort {
  private readonly shouldSucceed: boolean
  private readonly errorMessage: string | null

  constructor(shouldSucceed = true, errorMessage: string | null = null) {
    this.shouldSucceed = shouldSucceed
    this.errorMessage = errorMessage
  }

  async runGlobalUpdate(): Promise<{ success: boolean; error: string | null }> {
    if (this.shouldSucceed) {
      return { success: true, error: null }
    }
    return { success: false, error: this.errorMessage }
  }

  async restartDaemon(): Promise<void> {
    return
  }
}
