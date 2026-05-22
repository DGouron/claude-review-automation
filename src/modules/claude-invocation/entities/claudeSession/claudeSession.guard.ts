import { createGuard } from '@/shared/foundation/guard.base.js';
import {
  claudeSessionSchema,
  type ClaudeSession,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';

export const claudeSessionGuard = createGuard<ClaudeSession>(
  claudeSessionSchema,
  'claudeSession',
);
