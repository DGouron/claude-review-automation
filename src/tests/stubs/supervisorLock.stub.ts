import type {
  SupervisorLockAcquireResult,
  SupervisorLockGateway,
} from '@/modules/supervisor-management/entities/supervisor/supervisorLock.gateway.js';

export class StubSupervisorLockGateway implements SupervisorLockGateway {
  acquireCallCount = 0;
  releaseCallCount = 0;

  private acquireResult: SupervisorLockAcquireResult = {
    acquired: true,
    reason: null,
  };

  setAcquireResult(result: SupervisorLockAcquireResult): void {
    this.acquireResult = result;
  }

  async acquire(): Promise<SupervisorLockAcquireResult> {
    this.acquireCallCount += 1;
    return this.acquireResult;
  }

  async release(): Promise<void> {
    this.releaseCallCount += 1;
  }
}
