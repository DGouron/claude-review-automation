import { describe, it, expect, vi, beforeEach } from 'vitest';
import { awaitSessionCompletion } from '@/modules/claude-invocation/usecases/awaitSessionCompletion.usecase.js';
import { StubMcpCompletionBridge } from '@/tests/stubs/mcpCompletion.stub.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { ClaudeSessionFactory } from '@/tests/factories/claudeSession.factory.js';
import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';

describe('awaitSessionCompletion use case', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T10:00:00Z'));
  });

  it('returns the MCP completion when it arrives first', async () => {
    const session = ClaudeSessionFactory.create({ sessionId: parseSessionId('mcp00001') });
    const bridge = new StubMcpCompletionBridge();
    const sessionGateway = new StubClaudeSessionGateway();
    bridge.scheduleCompletion(session.jobId, {
      source: 'mcp',
      outcome: 'completed',
      reason: null,
    });

    const promise = awaitSessionCompletion(
      { session, timeoutMs: 60_000, pollIntervalMs: 30_000 },
      { sessionGateway, completionBridge: bridge, now: () => new Date('2026-05-22T10:00:00Z') },
    );
    await vi.runAllTimersAsync();
    const completion = await promise;

    expect(completion.source).toBe('mcp');
    expect(completion.outcome).toBe('completed');
  });

  it('returns the polling completion when MCP stays silent', async () => {
    const session = ClaudeSessionFactory.create({ sessionId: parseSessionId('poll0002') });
    const bridge = new StubMcpCompletionBridge();
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.scheduleAgentCompletion('poll0002', 'completed', 1);

    const promise = awaitSessionCompletion(
      { session, timeoutMs: 60_000, pollIntervalMs: 30_000 },
      { sessionGateway, completionBridge: bridge, now: () => new Date('2026-05-22T10:00:00Z') },
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const completion = await promise;

    expect(completion.source).toBe('polling');
    expect(completion.outcome).toBe('completed');
  });

  it('returns timeout when no signal arrives within the timeout window', async () => {
    const session = ClaudeSessionFactory.create({ sessionId: parseSessionId('time0002') });
    const bridge = new StubMcpCompletionBridge();
    const sessionGateway = new StubClaudeSessionGateway();
    let nowMs = new Date('2026-05-22T10:00:00Z').getTime();
    const now = (): Date => new Date(nowMs);

    const promise = awaitSessionCompletion(
      { session, timeoutMs: 15 * 60_000, pollIntervalMs: 30_000 },
      { sessionGateway, completionBridge: bridge, now },
    );
    nowMs += 16 * 60_000;
    await vi.advanceTimersByTimeAsync(16 * 60_000);
    const completion = await promise;

    expect(completion.source).toBe('timeout');
    expect(completion.outcome).toBe('failed');
    expect(completion.reason).toBe('timeout');
  });
});
