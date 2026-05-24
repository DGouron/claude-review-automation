import { StopDaemonUseCase, type StopDaemonDependencies } from '@/modules/cli-configuration/usecases/cli/stopDaemon.usecase.js';
import type { PidFileContent } from '@/shared/services/pidFileManager.js';
import { green, red, yellow } from '@/shared/services/ansiColors.js';

export interface StopDeps {
  stopDaemonDeps: StopDaemonDependencies;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => void;
}

export function executeStop(force: boolean, deps: StopDeps): void {
  const usecase = new StopDaemonUseCase(deps.stopDaemonDeps);
  const result = usecase.execute({ force });

  switch (result.status) {
    case 'stopped':
      deps.log(green(`Server stopped (PID: ${result.pid})`));
      break;
    case 'not-running':
      deps.log(yellow('Server is not running'));
      break;
    case 'failed':
      deps.error(red(`Failed to stop server: ${result.reason}`));
      deps.exit(1);
      break;
  }
}

interface PidFileDeps {
  readPidFile: () => PidFileContent | null;
  writePidFile: (content: PidFileContent) => void;
  removePidFile: () => void;
  isProcessRunning: (pid: number) => boolean;
}

export function createStopDependencies(pidDeps: PidFileDeps): StopDeps {
  return {
    stopDaemonDeps: {
      ...pidDeps,
      killProcess: (pid, signal) => process.kill(pid, signal as NodeJS.Signals),
    },
    log: console.log,
    error: console.error,
    exit: process.exit,
  };
}
