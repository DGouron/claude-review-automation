export type SetupProcessLineHandler = (line: string) => void;
export type SetupProcessExitHandler = (code: number | null) => void;

export interface SetupProcessHandle {
  onLine(handler: SetupProcessLineHandler): void;
  onExit(handler: SetupProcessExitHandler): void;
  writeLine(line: string): void;
  kill(): void;
  readonly pid: number | null;
}

export interface SetupProcessSpawnOptions {
  projectPath: string | null;
}

export interface SetupProcessGateway {
  spawn(options?: SetupProcessSpawnOptions): SetupProcessHandle;
}
