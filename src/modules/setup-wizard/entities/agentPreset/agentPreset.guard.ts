import { createGuard } from '@/shared/foundation/guard.base.js';
import { agentPresetSchema } from '@/modules/setup-wizard/entities/agentPreset/agentPreset.schema.js';

export const agentPresetGuard = createGuard(agentPresetSchema, 'agentPreset');
