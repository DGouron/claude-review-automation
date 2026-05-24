import type { PendingReviewRequestGateway } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.gateway.js';
import type { PendingReviewRequest } from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';

export interface ListPendingReviewsDependencies {
  pendingReviewRequestGateway: PendingReviewRequestGateway;
}

export class ListPendingReviewsUseCase {
  constructor(private readonly deps: ListPendingReviewsDependencies) {}

  async execute(): Promise<PendingReviewRequest[]> {
    return this.deps.pendingReviewRequestGateway.listAll();
  }
}
