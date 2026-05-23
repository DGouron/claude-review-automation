import { createGuard } from '@/shared/foundation/guard.base.js';
import {
  pendingReviewRequestSchema,
  type PendingReviewRequest,
} from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';

export const pendingReviewRequestGuard = createGuard<PendingReviewRequest>(
  pendingReviewRequestSchema,
  'pendingReviewRequest',
);
