import { createGuard } from '@/shared/foundation/guard.base.js';
import { emberMessageSchema } from '@/modules/ember-chat/entities/emberMessage/emberMessage.schema.js';

export const emberMessageGuard = createGuard(emberMessageSchema, 'emberMessage');
