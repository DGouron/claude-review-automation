import type { DiffStats } from '@/entities/diffStats/diffStats.js';
import type { DiffStatsFetchGateway } from '@/entities/diffStats/diffStatsFetch.gateway.js';

export class StubDiffStatsFetchGateway implements DiffStatsFetchGateway {
  private readonly result: DiffStats | null;

  constructor(result: DiffStats | null = null) {
    this.result = result;
  }

  fetchDiffStats(): DiffStats | null {
    return this.result;
  }
}
