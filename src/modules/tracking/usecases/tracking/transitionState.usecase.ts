import type { UseCase } from '@/shared/foundation/usecase.base.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/interface-adapters/gateways/reviewRequestTracking.gateway.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { QualityGateResult } from '@/modules/tracking/entities/qualityGate/qualityGate.js';
import type { ReviewRequestStateValue } from '@/modules/review-execution/entities/reviewRequest/reviewRequestState.valueObject.js';

interface TransitionStateInput {
  projectPath: string;
  mrId: string;
  targetState: 'approved' | 'merged' | 'closed';
  qualityCheck?: (mr: TrackedMr) => QualityGateResult;
  requireCurrentState?: ReviewRequestStateValue;
  invalidCurrentStateMessage?: string;
}

export type TransitionStateResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'quality-gate'; message: string }
  | { ok: false; reason: 'invalid-current-state'; message: string };

const TIMESTAMP_BY_STATE: Partial<Record<TransitionStateInput['targetState'], keyof TrackedMr>> = {
  approved: 'approvedAt',
  merged: 'mergedAt',
};

export class TransitionStateUseCase implements UseCase<TransitionStateInput, TransitionStateResult> {
  constructor(private readonly trackingGateway: ReviewRequestTrackingGateway) {}

  execute(input: TransitionStateInput): TransitionStateResult {
    const mr = this.trackingGateway.getById(input.projectPath, input.mrId);
    if (!mr) return { ok: false, reason: 'not-found' };

    if (input.requireCurrentState && mr.state !== input.requireCurrentState) {
      return {
        ok: false,
        reason: 'invalid-current-state',
        message: input.invalidCurrentStateMessage ?? '',
      };
    }

    if (input.targetState === 'approved' && input.qualityCheck && mr.bypass === null) {
      const gateResult = input.qualityCheck(mr);
      if (!gateResult.allowed) {
        return { ok: false, reason: 'quality-gate', message: gateResult.message };
      }
    }

    const timestampField = TIMESTAMP_BY_STATE[input.targetState];

    this.trackingGateway.update(input.projectPath, input.mrId, {
      state: input.targetState,
      ...(timestampField ? { [timestampField]: new Date().toISOString() } : {}),
    });

    return { ok: true };
  }
}
