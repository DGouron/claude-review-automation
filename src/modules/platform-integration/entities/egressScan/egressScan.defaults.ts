import type { EgressScanConfig } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';

export const defaultEgressScanConfig: EgressScanConfig = {
  secretShapeMode: 'redact',
  lengthMode: 'redact',
  outOfScopeMode: 'allow',
  maxBodyLength: 65536,
  redactionMarker: '[redacted]',
  truncationMarker: '\n\n…[truncated]',
};
