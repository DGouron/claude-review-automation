import type { PendingReviewRequestGateway } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.gateway.js';
import type { PendingReviewRequest } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';

export class StubPendingReviewRequestGateway implements PendingReviewRequestGateway {
  private storage = new Map<string, PendingReviewRequest>();
  public saveCount = 0;
  public deleteCount = 0;

  async save(pending: PendingReviewRequest): Promise<void> {
    this.storage.set(pending.pendingReviewRequestId, { ...pending });
    this.saveCount += 1;
  }

  async load(pendingReviewRequestId: string): Promise<PendingReviewRequest | null> {
    const found = this.storage.get(pendingReviewRequestId);
    return found ? { ...found } : null;
  }

  async listAll(): Promise<PendingReviewRequest[]> {
    return Array.from(this.storage.values()).map((entry) => ({ ...entry }));
  }

  async delete(pendingReviewRequestId: string): Promise<boolean> {
    this.deleteCount += 1;
    return this.storage.delete(pendingReviewRequestId);
  }

  prepopulate(pending: PendingReviewRequest): void {
    this.storage.set(pending.pendingReviewRequestId, { ...pending });
  }

  clear(): void {
    this.storage.clear();
    this.saveCount = 0;
    this.deleteCount = 0;
  }
}
