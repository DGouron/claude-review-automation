/**
 * @param {{ pendingReviews?: Array<unknown> | null }} input
 * @returns {boolean}
 */
export function shouldHidePendingReviewsSection(input) {
  const pendingReviews = input?.pendingReviews;
  if (!Array.isArray(pendingReviews)) return true;
  return pendingReviews.length === 0;
}

/**
 * @param {{ activeReviews?: ReadonlyArray<{ jobType?: string } & Record<string, unknown>> | null }} input
 * @returns {boolean}
 */
export function shouldHideActiveReviewsSection(input) {
  const activeReviews = input?.activeReviews;
  if (!Array.isArray(activeReviews)) return true;
  if (activeReviews.length === 0) return true;
  return activeReviews.every((review) => review?.jobType === 'followup');
}
