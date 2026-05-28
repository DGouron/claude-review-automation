import type { SetupState } from '@/modules/setup-wizard/entities/setupState/setupState.schema.js';

export interface SetupStateLoadResult {
  state: SetupState | null;
  corrupted: boolean;
}

export interface SetupStateGateway {
  load(): SetupStateLoadResult;
  save(state: SetupState): void;
  reset(): void;
}
