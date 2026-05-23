import type {
  SupervisorGateway,
  SupervisorProbeResult,
  SupervisorSpawnResult,
} from '@/modules/supervisor-management/entities/supervisor/supervisor.gateway.js';

export class StubSupervisorGateway implements SupervisorGateway {
  probeCallCount = 0;
  spawnCallCount = 0;

  private probeResult: SupervisorProbeResult = { state: 'up', reason: null };
  private spawnResult: SupervisorSpawnResult = {
    state: 'spawned',
    pid: 1,
    reason: null,
  };

  setProbeResult(result: SupervisorProbeResult): void {
    this.probeResult = result;
  }

  setSpawnResult(result: SupervisorSpawnResult): void {
    this.spawnResult = result;
  }

  async probe(): Promise<SupervisorProbeResult> {
    this.probeCallCount += 1;
    return this.probeResult;
  }

  async spawnDetached(): Promise<SupervisorSpawnResult> {
    this.spawnCallCount += 1;
    return this.spawnResult;
  }
}
