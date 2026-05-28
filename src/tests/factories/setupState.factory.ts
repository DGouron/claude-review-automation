import type { SetupState } from '@/modules/setup-wizard/entities/setupState/setupState.schema.js';
import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';

interface SetupStateOverrides {
  startedAt?: string;
  updatedAt?: string;
  steps?: Partial<Record<StepId, StepOutcome>>;
}

export const SetupStateFactory = {
  create(overrides: SetupStateOverrides = {}): SetupState {
    return {
      version: 1,
      startedAt: overrides.startedAt ?? '2026-05-28T09:00:00.000Z',
      updatedAt: overrides.updatedAt ?? '2026-05-28T09:00:00.000Z',
      steps: overrides.steps ?? {},
    };
  },
};
