import type { RoutingPolicy } from '@/modules/review-execution/entities/modelRouting/modelRouting.schema.js';

export interface RoutingPolicyGateway {
  load(localPath: string): Promise<RoutingPolicy | null>;
}
