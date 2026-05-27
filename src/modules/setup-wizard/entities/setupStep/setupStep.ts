import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';

export interface SetupStep {
  readonly id: StepId;
  readonly title: string;
  detect(context: WizardContext): Promise<StepOutcome | null>;
  execute(context: WizardContext): Promise<StepOutcome>;
}
