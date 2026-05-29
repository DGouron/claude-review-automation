import { createGuard } from '@/shared/foundation/guard.base.js';
import { emberMemorySchema } from '@/modules/ember-chat/entities/emberMemory/emberMemory.schema.js';

export const emberMemoryGuard = createGuard(emberMemorySchema, 'emberMemory');
