export interface SupervisorProbeResult {
  state: 'up' | 'down';
  reason: string | null;
}

export interface SupervisorSpawnResult {
  state: 'spawned' | 'failed';
  pid: number | null;
  reason: string | null;
}

export interface SupervisorGateway {
  probe(): Promise<SupervisorProbeResult>;
  spawnDetached(): Promise<SupervisorSpawnResult>;
}
