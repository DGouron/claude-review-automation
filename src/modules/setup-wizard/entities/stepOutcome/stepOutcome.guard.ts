import { createGuard } from '@/shared/foundation/guard.base.js';
import { stepOutcomeSchema } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';

export const stepOutcomeGuard = createGuard(stepOutcomeSchema, 'stepOutcome');
