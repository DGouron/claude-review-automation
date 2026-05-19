import type { TokenUsageGateway } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.gateway.js';
import type { TokenUsageRecord } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';

export class TrackTokenUsageUseCase {
  constructor(private readonly gateway: TokenUsageGateway) {}

  async execute(record: TokenUsageRecord): Promise<void> {
    await this.gateway.record(record);
  }
}
