export interface SelfUpdateCommandPort {
  runGlobalUpdate(): Promise<{ success: boolean; error?: string }>
  restartDaemon(): Promise<void>
}
