export interface TransportContext {
  directSocketAddress: string;
  trustedHopAddress: string;
  forwardedProto: string | null;
  resolvedClientIp: string | null;
  allowedCidrRanges: string[];
}

export type TransportRejectReason = 'untrusted-socket' | 'non-https' | 'off-allowlist';

export type TransportDecision =
  | { kind: 'accept' }
  | { kind: 'reject'; status: 403; reason: TransportRejectReason };
