import { createGuard } from '@/shared/foundation/guard.base.js';
import { projectContextSchema } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

export const projectContextGuard = createGuard(projectContextSchema, 'projectContext');
