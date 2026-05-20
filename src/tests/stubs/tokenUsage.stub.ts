import type { TokenUsageGateway } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.gateway.js';
import type { TokenUsageRecord } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';

export class StubTokenUsageGateway implements TokenUsageGateway {
  records: TokenUsageRecord[] = [];
  private storedRecords: TokenUsageRecord[] = [];
  private recordsByPath: Map<string, TokenUsageRecord[]> = new Map();

  async record(record: TokenUsageRecord): Promise<void> {
    this.records.push(record);
    this.storedRecords.push(record);
  }

  async loadAll(localPath: string): Promise<TokenUsageRecord[]> {
    const perPath = this.recordsByPath.get(localPath);
    if (perPath) {
      return [...perPath];
    }
    return [...this.storedRecords];
  }

  setRecords(records: TokenUsageRecord[]): void {
    this.storedRecords = [...records];
  }

  setRecordsForPath(localPath: string, records: TokenUsageRecord[]): void {
    this.recordsByPath.set(localPath, [...records]);
  }

  clear(): void {
    this.records = [];
    this.storedRecords = [];
    this.recordsByPath.clear();
  }
}
