import { describe, it, expect } from 'vitest';
import {
  ClaudeSessionCliGateway,
  type ClaudeProcessRunner,
  type ClaudeProcessRunResult,
} from '@/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.js';

function createRunner(scripted: ClaudeProcessRunResult[]): {
  runner: ClaudeProcessRunner;
  calls: Array<{ args: string[]; localPath: string | null }>;
} {
  const calls: Array<{ args: string[]; localPath: string | null }> = [];
  let index = 0;
  const runner: ClaudeProcessRunner = async ({ args, cwd }) => {
    calls.push({ args, localPath: cwd ?? null });
    const next = scripted[index] ?? { stdout: '', stderr: '', exitCode: 0 };
    index += 1;
    return next;
  };
  return { runner, calls };
}

const baseDispatchInput = {
  prompt: '/review-front 42',
  flags: {
    model: 'claude-opus-4-7',
    mcpConfigJson: '{"x":1}',
    systemPrompt: 'system',
    allowedTools: 'Read,Bash',
    disallowedTools: 'EnterPlanMode',
    permissionMode: 'bypassPermissions' as const,
  },
  localPath: '/tmp/project',
  jobId: 'gitlab:owner/repo:42',
  jobType: 'review' as const,
};

describe('ClaudeSessionCliGateway.dispatch', () => {
  it('extracts the session id from claude --bg stdout', async () => {
    const { runner, calls } = createRunner([
      { stdout: 'Started session 7c5dcf5d\nLogs: ~/.claude/logs/...', stderr: '', exitCode: 0 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.dispatch(baseDispatchInput);

    expect(result.status).toBe('dispatched');
    if (result.status === 'dispatched') {
      expect(result.sessionId).toBe('7c5dcf5d');
    }
    expect(calls[0]?.args).toContain('--bg');
    expect(calls[0]?.args).not.toContain('-p');
    expect(calls[0]?.args).not.toContain('--print');
  });

  it('returns "rate-limited" when stderr matches a rate-limit pattern', async () => {
    const { runner } = createRunner([
      { stdout: '', stderr: 'HTTP 429 Too Many Requests', exitCode: 1 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.dispatch(baseDispatchInput);

    expect(result.status).toBe('rate-limited');
  });

  it('returns "failed" when the process exits non-zero without a rate-limit hint', async () => {
    const { runner } = createRunner([
      { stdout: '', stderr: 'boom', exitCode: 2 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.dispatch(baseDispatchInput);

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.rawStderr).toBe('boom');
    }
  });

  it('returns "failed" when stdout has no parseable session id', async () => {
    const { runner } = createRunner([
      { stdout: 'no session here', stderr: '', exitCode: 0 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.dispatch(baseDispatchInput);

    expect(result.status).toBe('failed');
  });
});

describe('ClaudeSessionCliGateway.stop and remove', () => {
  it('returns success when stop exits zero', async () => {
    const { runner, calls } = createRunner([
      { stdout: 'stopped', stderr: '', exitCode: 0 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.stop('abc123' as never);

    expect(result.success).toBe(true);
    expect(calls[0]?.args).toEqual(['stop', 'abc123']);
  });

  it('returns success false with warning when stop exits non-zero', async () => {
    const { runner } = createRunner([
      { stdout: '', stderr: 'unknown session', exitCode: 1 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.stop('abc123' as never);

    expect(result.success).toBe(false);
    expect(result.warning).toContain('unknown session');
  });

  it('runs claude rm for remove', async () => {
    const { runner, calls } = createRunner([
      { stdout: 'removed', stderr: '', exitCode: 0 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    await gateway.remove('abc123' as never);

    expect(calls[0]?.args).toEqual(['rm', 'abc123']);
  });
});

describe('ClaudeSessionCliGateway.listAgents', () => {
  it('parses the agents JSON array', async () => {
    const json = JSON.stringify([
      { id: 'abc', status: 'completed' },
      { id: 'def', status: 'running' },
    ]);
    const { runner } = createRunner([{ stdout: json, stderr: '', exitCode: 0 }]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const entries = await gateway.listAgents();

    expect(entries).toHaveLength(2);
    expect(entries[0]?.status).toBe('completed');
  });

  it('returns an empty array on unparseable JSON', async () => {
    const { runner } = createRunner([{ stdout: 'not json', stderr: '', exitCode: 0 }]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const entries = await gateway.listAgents();

    expect(entries).toEqual([]);
  });
});

describe('ClaudeSessionCliGateway.daemonStatus and usage', () => {
  it('reports unreachable when daemon status exits non-zero', async () => {
    const { runner } = createRunner([
      { stdout: '', stderr: 'connection refused', exitCode: 1 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const status = await gateway.daemonStatus();

    expect(status.reachable).toBe(false);
  });

  it('reports usesApiPool true when usage output mentions API tokens', async () => {
    const { runner } = createRunner([
      { stdout: 'Subscription plan: Pro\nAPI tokens used: 12345', stderr: '', exitCode: 0 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const usage = await gateway.usage();

    expect(usage.usesApiPool).toBe(true);
  });

  it('reports usesApiPool false when usage output is purely subscription-based', async () => {
    const { runner } = createRunner([
      { stdout: 'Subscription plan: Pro', stderr: '', exitCode: 0 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const usage = await gateway.usage();

    expect(usage.usesApiPool).toBe(false);
  });
});
