import { describe, it, expect } from 'vitest';
import { cleanupClaudeSession } from '@/modules/claude-invocation/usecases/cleanupClaudeSession.usecase.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';

describe('cleanupClaudeSession use case', () => {
  it('stops and removes the session on the happy path', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    const sessionId = parseSessionId('clean001');

    const result = await cleanupClaudeSession({ sessionId }, { sessionGateway });

    expect(result.stopped).toBe(true);
    expect(result.removed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(sessionGateway.stopCalls).toContain(sessionId);
    expect(sessionGateway.removeCalls).toContain(sessionId);
  });
});
