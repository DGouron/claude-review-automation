/**
 * Base class for business-rule violations originating from the domain layer.
 *
 * Use when an entity or domain service refuses a state transition because a
 * domain invariant is violated. Extend this class to name each invariant
 * concretely:
 *
 * ```ts
 * export class InvalidReviewRequestStateTransition extends BusinessRuleViolation {
 *   constructor(from: ReviewRequestState, to: ReviewRequestState) {
 *     super(`Cannot transition from ${from} to ${to}.`);
 *   }
 * }
 * ```
 */
export abstract class BusinessRuleViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
