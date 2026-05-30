import type { EgressScanTrace } from '@/modules/platform-integration/entities/egressScan/egressScan.gateway.js';

export interface EgressTraceGateway {
  record(trace: EgressScanTrace): void;
}
