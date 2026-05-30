import type { IdempotencyStore } from '@/modules/platform-integration/entities/idempotency/idempotencyStore.gateway.js';

export interface InMemoryIdempotencyStoreOptions {
  ttlMs: number;
  clock?: () => number;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly clock: () => number;

  constructor(options: InMemoryIdempotencyStoreOptions) {
    this.ttlMs = options.ttlMs;
    this.clock = options.clock ?? (() => Date.now());
  }

  async recordIfAbsent(eventKey: string): Promise<boolean> {
    const now = this.clock();
    this.purgeExpired(now);

    const existingExpiry = this.entries.get(eventKey);
    if (existingExpiry !== undefined && existingExpiry > now) {
      return false;
    }

    this.entries.set(eventKey, now + this.ttlMs);
    return true;
  }

  private purgeExpired(now: number): void {
    for (const [key, expiry] of this.entries) {
      if (expiry <= now) {
        this.entries.delete(key);
      }
    }
  }
}
