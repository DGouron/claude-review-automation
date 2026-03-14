export interface SelfUpdateCommandPort {
  runGlobalUpdate(): Promise<{ success: boolean; error: string | null }>
  restartDaemon(): Promise<void>
}
