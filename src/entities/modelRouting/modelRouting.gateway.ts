import type { RoutingPolicy } from '@/entities/modelRouting/modelRouting.schema.js';

export interface RoutingPolicyGateway {
  load(localPath: string): Promise<RoutingPolicy | null>;
}
