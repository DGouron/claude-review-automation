import type { IdempotencyStore } from '@/modules/platform-integration/entities/idempotency/idempotencyStore.gateway.js';

export class StubIdempotencyStore implements IdempotencyStore {
  readonly recordedKeys: string[] = [];
  private readonly present = new Set<string>();

  async recordIfAbsent(eventKey: string): Promise<boolean> {
    this.recordedKeys.push(eventKey);
    if (this.present.has(eventKey)) {
      return false;
    }
    this.present.add(eventKey);
    return true;
  }

  get entryCount(): number {
    return this.present.size;
  }

  has(eventKey: string): boolean {
    return this.present.has(eventKey);
  }
}
