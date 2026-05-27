export type DaemonStatus =
  | { status: 'active' }
  | { status: 'inactive' }
  | { status: 'not-installed' }
  | { status: 'unsupported-platform'; platform: string };

export interface DaemonInstallResult {
  success: boolean;
  requiresSudo: boolean;
  error: string | null;
}

export interface DaemonServiceGateway {
  status(): Promise<DaemonStatus>;
  install(): Promise<DaemonInstallResult>;
  waitUntilHealthy(timeoutMs: number): Promise<boolean>;
}
