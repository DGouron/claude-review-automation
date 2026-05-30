import type { TransportContext } from '@/modules/platform-integration/entities/transport/transportContext.js';

const TRUSTED_HOP = '127.0.0.1';

export class TransportContextFactory {
  static valid(overrides: Partial<TransportContext> = {}): TransportContext {
    return {
      directSocketAddress: TRUSTED_HOP,
      trustedHopAddress: TRUSTED_HOP,
      forwardedProto: 'https',
      resolvedClientIp: '10.20.30.40',
      allowedCidrRanges: ['10.20.30.0/24'],
      ...overrides,
    };
  }
}
