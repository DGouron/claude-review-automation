/**
 * Base class for test entity builders. Holds default props and exposes a
 * `build()` for one entity and `buildMany(count)` for a list. Subclasses
 * override `build()` and add chainable `withXxx(...)` methods.
 *
 * ```ts
 * class ReviewRequestBuilder extends EntityBuilder<ReviewRequestProps, ReviewRequest> {
 *   build(): ReviewRequest { return new ReviewRequest(this.props); }
 *   withScore(score: number): this { this.props.score = score; return this; }
 * }
 * ```
 *
 * Complements `src/tests/factories/` for cases where a fluent builder is more
 * ergonomic than a plain factory function.
 */
export abstract class EntityBuilder<Props, Entity> {
  protected props: Props;

  constructor(defaultProps: Props) {
    this.props = { ...defaultProps };
  }

  abstract build(): Entity;

  buildMany(count: number): Entity[] {
    return Array.from({ length: count }, () => this.build());
  }
}
