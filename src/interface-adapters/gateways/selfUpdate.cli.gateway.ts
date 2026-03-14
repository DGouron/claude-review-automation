import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { SelfUpdateCommandPort } from '@/entities/packageVersion/selfUpdateCommand.port.js'
import { readPidFile, removePidFile } from '@/shared/services/pidFileManager.js'
import { spawnDaemon } from '@/shared/services/daemonSpawner.js'
import { PID_FILE_PATH } from '@/shared/services/daemonPaths.js'

const defaultExecFileAsync = promisify(execFile)

export interface SelfUpdateCliDependencies {
  execFileAsync: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>
  killProcess: (pid: number, signal: string) => void
  spawnDaemon: (port: number | undefined) => number
}

function createDefaultDependencies(): SelfUpdateCliDependencies {
  return {
    execFileAsync: defaultExecFileAsync,
    killProcess: (pid, signal) => process.kill(pid, signal),
    spawnDaemon,
  }
}

export class SelfUpdateCliGateway implements SelfUpdateCommandPort {
  private readonly dependencies: SelfUpdateCliDependencies

  constructor(dependencies?: SelfUpdateCliDependencies) {
    this.dependencies = dependencies ?? createDefaultDependencies()
  }

  async runGlobalUpdate(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.dependencies.execFileAsync('npm', ['update', '-g', 'reviewflow'])
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  }

  async restartDaemon(): Promise<void> {
    const pidFileContent = readPidFile(PID_FILE_PATH)

    if (pidFileContent !== null) {
      try {
        this.dependencies.killProcess(pidFileContent.pid, 'SIGTERM')
      } catch {
        // Process may already be dead
      }
      removePidFile(PID_FILE_PATH)
    }

    const port = pidFileContent?.port
    this.dependencies.spawnDaemon(port)
  }
}
