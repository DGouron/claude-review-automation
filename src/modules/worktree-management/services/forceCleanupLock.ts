export interface ForceCleanupLockService {
  tryAcquire(identityKey: string): boolean;
  release(identityKey: string): void;
}

export class InMemoryForceCleanupLockService implements ForceCleanupLockService {
  private readonly locked: Set<string> = new Set();

  tryAcquire(identityKey: string): boolean {
    if (this.locked.has(identityKey)) {
      return false;
    }
    this.locked.add(identityKey);
    return true;
  }

  release(identityKey: string): void {
    this.locked.delete(identityKey);
  }
}
