import type { PendingReviewRequest } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';

export interface PendingReviewRequestGateway {
  save(pending: PendingReviewRequest): Promise<void>;
  load(pendingReviewRequestId: string): Promise<PendingReviewRequest | null>;
  listAll(): Promise<PendingReviewRequest[]>;
  delete(pendingReviewRequestId: string): Promise<boolean>;
}
