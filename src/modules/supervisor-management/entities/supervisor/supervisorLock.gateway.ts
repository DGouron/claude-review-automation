export interface SupervisorLockAcquireResult {
  acquired: boolean;
  reason: string | null;
}

export interface SupervisorLockGateway {
  acquire(): Promise<SupervisorLockAcquireResult>;
  release(): Promise<void>;
}
