import { createGuard } from '@/shared/foundation/guard.base.js';
import { setupStateSchema } from '@/modules/setup-wizard/entities/setupState/setupState.schema.js';

export const setupStateGuard = createGuard(setupStateSchema, 'setupState');
