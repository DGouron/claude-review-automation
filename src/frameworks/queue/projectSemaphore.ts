/**
 * Per-project FIFO semaphore. Pure data structure with zero infrastructure
 * knowledge. Used by pQueueAdapter to gate review entry into PQueue.add(),
 * preserving the existing MR-chain serialization that sits one level above.
 *
 * Behavioral contract:
 *   - acquire(key) resolves when running(key) < capacity(key); increments running.
 *   - release(key) decrements running and drains waiters in FIFO order.
 *   - setCapacity(key, n) updates capacity; raising it drains pending waiters
 *     up to the new limit, lowering it does NOT interrupt running acquisitions.
 *   - DEFAULT_CAPACITY (2) is applied when a key has no explicit cap.
 */

const DEFAULT_CAPACITY = 2;

type PendingResolver = () => void;

export class ProjectSemaphore {
  private readonly capacities = new Map<string, number>();
  private readonly running = new Map<string, number>();
  private readonly pending = new Map<string, PendingResolver[]>();

  setCapacity(key: string, capacity: number): void {
    this.capacities.set(key, capacity);
    this.drain(key);
  }

  capacityFor(key: string): number {
    return this.capacities.get(key) ?? DEFAULT_CAPACITY;
  }

  runningCount(key: string): number {
    return this.running.get(key) ?? 0;
  }

  pendingCount(key: string): number {
    return this.pending.get(key)?.length ?? 0;
  }

  totalRunning(): number {
    let total = 0;
    for (const value of this.running.values()) total += value;
    return total;
  }

  acquire(key: string): Promise<boolean> {
    const currentRunning = this.runningCount(key);
    const cap = this.capacityFor(key);
    if (currentRunning < cap) {
      this.running.set(key, currentRunning + 1);
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      const waiters = this.pending.get(key) ?? [];
      waiters.push(() => {
        this.running.set(key, (this.running.get(key) ?? 0) + 1);
        resolve(true);
      });
      this.pending.set(key, waiters);
    });
  }

  release(key: string): void {
    const currentRunning = this.runningCount(key);
    if (currentRunning > 0) {
      this.running.set(key, currentRunning - 1);
    }
    this.drain(key);
  }

  private drain(key: string): void {
    const waiters = this.pending.get(key);
    if (!waiters || waiters.length === 0) return;
    const cap = this.capacityFor(key);
    while (waiters.length > 0 && this.runningCount(key) < cap) {
      const next = waiters.shift();
      if (!next) break;
      next();
    }
    if (waiters.length === 0) {
      this.pending.delete(key);
    } else {
      this.pending.set(key, waiters);
    }
  }
}
