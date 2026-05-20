/**
 * Base class for application-rule violations.
 *
 * Use when a use case enforces an application-layer constraint that is not a
 * pure business rule (orchestration, eligibility, idempotency, etc.). Extend
 * this class in each use case to name the violation concretely:
 *
 * ```ts
 * export class ReviewAlreadyRunning extends ApplicationRuleViolation {
 *   constructor(jobId: string) {
 *     super(`Review job ${jobId} is already running.`);
 *   }
 * }
 * ```
 */
export abstract class ApplicationRuleViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
