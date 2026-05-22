import type { SessionCompletion } from '@/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.schema.js';

export class SessionCompletionFactory {
  static create(overrides?: Partial<SessionCompletion>): SessionCompletion {
    return {
      source: 'mcp',
      outcome: 'completed',
      reason: null,
      ...overrides,
    };
  }
}
