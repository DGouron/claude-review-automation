export interface QualityGateInput {
  latestScore: number | null;
  blockingIssues: number;
  threshold: number | null;
}

export type QualityGateRejectionReason = 'below-threshold' | 'blockers-present';

export type QualityGateResult =
  | { allowed: true }
  | { allowed: false; reason: QualityGateRejectionReason; message: string };

export function evaluateQualityGate(input: QualityGateInput): QualityGateResult {
  if (input.threshold === null) {
    return { allowed: true };
  }

  if (input.latestScore === null) {
    return { allowed: true };
  }

  if (input.blockingIssues > 0) {
    return {
      allowed: false,
      reason: 'blockers-present',
      message: 'Issues bloquantes non résolues',
    };
  }

  if (input.latestScore < input.threshold) {
    return {
      allowed: false,
      reason: 'below-threshold',
      message: `Seuil qualité non atteint (${input.latestScore}/10 < ${input.threshold}/10)`,
    };
  }

  return { allowed: true };
}
