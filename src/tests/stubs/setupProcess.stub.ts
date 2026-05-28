import type {
  SetupProcessExitHandler,
  SetupProcessGateway,
  SetupProcessHandle,
  SetupProcessLineHandler,
  SetupProcessSpawnOptions,
} from '@/modules/setup-wizard/entities/setupProcess/setupProcess.gateway.js';

class StubSetupProcessHandle implements SetupProcessHandle {
  private lineHandler: SetupProcessLineHandler | null = null;
  private exitHandler: SetupProcessExitHandler | null = null;
  killed = false;

  readonly pid: number | null = 4242;

  onLine(handler: SetupProcessLineHandler): void {
    this.lineHandler = handler;
  }

  onExit(handler: SetupProcessExitHandler): void {
    this.exitHandler = handler;
  }

  kill(): void {
    this.killed = true;
  }

  pushLine(line: string): void {
    this.lineHandler?.(line);
  }

  pushExit(code: number | null): void {
    this.exitHandler?.(code);
  }
}

export class StubSetupProcessGateway implements SetupProcessGateway {
  private handle: StubSetupProcessHandle | null = null;
  spawnCount = 0;
  lastSpawnOptions: SetupProcessSpawnOptions | null = null;

  spawn(options?: SetupProcessSpawnOptions): SetupProcessHandle {
    this.spawnCount += 1;
    this.lastSpawnOptions = options ?? null;
    this.handle = new StubSetupProcessHandle();
    return this.handle;
  }

  emitLine(line: string): void {
    this.handle?.pushLine(line);
  }

  exit(code: number | null): void {
    this.handle?.pushExit(code);
  }

  get killed(): boolean {
    return this.handle?.killed ?? false;
  }
}
