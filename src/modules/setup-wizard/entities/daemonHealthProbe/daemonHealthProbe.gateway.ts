export interface DaemonHealthPingResult {
  healthy: boolean;
  latencyMs: number | null;
}

export interface DaemonHealthProbeGateway {
  ping(port: number, timeoutMs: number): Promise<DaemonHealthPingResult>;
}
