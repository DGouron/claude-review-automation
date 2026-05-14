import type { TokenUsageRecord } from '@/entities/tokenUsage/tokenUsage.schema.js';

export interface TokenUsageGateway {
  record(record: TokenUsageRecord): Promise<void>;
  loadAll(localPath: string): Promise<TokenUsageRecord[]>;
}
