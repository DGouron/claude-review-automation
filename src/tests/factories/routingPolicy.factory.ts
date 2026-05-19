import type { RoutingPolicy } from '@/modules/review-execution/entities/modelRouting/modelRouting.schema.js';

export class RoutingPolicyFactory {
  static create(overrides?: Partial<RoutingPolicy>): RoutingPolicy {
    return {
      haikuMaxLines: 50,
      sonnetMaxLines: 500,
      ...overrides,
    };
  }
}
