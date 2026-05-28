import type { StepId } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';

export interface WizardEventEmitter {
  emitStepStarted(stepId: StepId, title: string): void;
  emitStepCompleted(stepId: StepId, outcome: StepOutcome): void;
  emitAwaitingInput(stepId: StepId, prompt: string): void;
  emitInstructions(lines: string[]): void;
  emitWarning(message: string): void;
  emitResumeBanner(stepId: StepId, position: number, total: number): void;
  emitDone(summary: Record<string, unknown>): void;
}
