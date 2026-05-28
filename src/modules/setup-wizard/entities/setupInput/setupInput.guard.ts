import { createGuard } from '@/shared/foundation/guard.base.js';
import { setupInputSchema } from '@/modules/setup-wizard/entities/setupInput/setupInput.schema.js';

export const setupInputGuard = createGuard(setupInputSchema, 'setupInput');
