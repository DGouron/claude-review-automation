import type { TokenUsageGateway } from '@/entities/tokenUsage/tokenUsage.gateway.js';
import type { TokenUsageRecord } from '@/entities/tokenUsage/tokenUsage.schema.js';

export class StubTokenUsageGateway implements TokenUsageGateway {
  records: TokenUsageRecord[] = [];
  private storedRecords: TokenUsageRecord[] = [];

  async record(record: TokenUsageRecord): Promise<void> {
    this.records.push(record);
    this.storedRecords.push(record);
  }

  async loadAll(_localPath: string): Promise<TokenUsageRecord[]> {
    return [...this.storedRecords];
  }

  setRecords(records: TokenUsageRecord[]): void {
    this.storedRecords = [...records];
  }

  clear(): void {
    this.records = [];
    this.storedRecords = [];
  }
}
