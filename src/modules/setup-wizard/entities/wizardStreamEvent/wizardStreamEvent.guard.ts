import { createGuard } from '@/shared/foundation/guard.base.js';
import { wizardStreamEventSchema } from '@/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.schema.js';

export const wizardStreamEventGuard = createGuard(wizardStreamEventSchema, 'wizardStreamEvent');
