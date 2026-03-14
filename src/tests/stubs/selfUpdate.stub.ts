import type { SelfUpdateCommandPort } from '@/entities/packageVersion/selfUpdateCommand.port.js'

export class StubSelfUpdateCommand implements SelfUpdateCommandPort {
  private readonly shouldSucceed: boolean
  private readonly errorMessage: string | undefined

  constructor(shouldSucceed = true, errorMessage?: string) {
    this.shouldSucceed = shouldSucceed
    this.errorMessage = errorMessage
  }

  async runGlobalUpdate(): Promise<{ success: boolean; error?: string }> {
    if (this.shouldSucceed) {
      return { success: true }
    }
    return { success: false, error: this.errorMessage }
  }

  async restartDaemon(): Promise<void> {
    return
  }
}
