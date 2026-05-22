import { z } from 'zod';
import type {
  AgentStatusEntry,
  AgentStatusValue,
  ClaudeSessionGateway,
  CleanupResult,
  DaemonStatus,
  DispatchInput,
  DispatchResult,
  UsageReport,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import {
  parseSessionId,
  type SessionId,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';

export interface ClaudeProcessRunArgs {
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface ClaudeProcessRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ClaudeProcessRunner = (
  request: ClaudeProcessRunArgs,
) => Promise<ClaudeProcessRunResult>;

export const RATE_LIMIT_DETECTION_REGEX = /\b(rate[\s-]?limit|429|throttl)/i;
const SESSION_ID_REGEX = /\b([0-9a-f]{6,12})\b/;

const agentEntrySchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
});
const agentArraySchema = z.array(agentEntrySchema);

function classifyAgentStatus(raw: string | undefined): AgentStatusValue {
  if (raw === 'running' || raw === 'completed' || raw === 'failed' || raw === 'stopped') {
    return raw;
  }
  return 'unknown';
}

export class ClaudeSessionCliGateway implements ClaudeSessionGateway {
  constructor(private readonly runner: ClaudeProcessRunner) {}

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const args = [
      '--bg',
      '--model',
      input.flags.model,
      '--permission-mode',
      input.flags.permissionMode,
      '--append-system-prompt',
      input.flags.systemPrompt,
      '--mcp-config',
      input.flags.mcpConfigJson,
      '--strict-mcp-config',
      '--allowedTools',
      input.flags.allowedTools,
      '--disallowedTools',
      input.flags.disallowedTools,
      '--dangerously-skip-permissions',
      input.prompt,
    ];

    const result = await this.runner({ args, cwd: input.localPath });

    if (result.exitCode !== 0) {
      if (RATE_LIMIT_DETECTION_REGEX.test(result.stderr)) {
        return { status: 'rate-limited', rawStderr: result.stderr };
      }
      return { status: 'failed', rawStderr: result.stderr };
    }

    const match = result.stdout.match(SESSION_ID_REGEX);
    if (!match) {
      return { status: 'failed', rawStderr: `unable to parse session id from stdout: ${result.stdout}` };
    }
    return { status: 'dispatched', sessionId: parseSessionId(match[1]) };
  }

  async stop(sessionId: SessionId): Promise<CleanupResult> {
    const result = await this.runner({ args: ['stop', sessionId] });
    if (result.exitCode === 0) {
      return { success: true, warning: null };
    }
    return { success: false, warning: result.stderr || `claude stop exited ${result.exitCode}` };
  }

  async remove(sessionId: SessionId): Promise<CleanupResult> {
    const result = await this.runner({ args: ['rm', sessionId] });
    if (result.exitCode === 0) {
      return { success: true, warning: null };
    }
    return { success: false, warning: result.stderr || `claude rm exited ${result.exitCode}` };
  }

  async listAgents(): Promise<AgentStatusEntry[]> {
    const result = await this.runner({ args: ['agents', '--json'] });
    if (result.exitCode !== 0) return [];
    try {
      const parsed: unknown = JSON.parse(result.stdout);
      const safe = agentArraySchema.safeParse(parsed);
      if (!safe.success) return [];
      return safe.data.map(entry => ({
        sessionId: parseSessionId(entry.id),
        status: classifyAgentStatus(entry.status),
      }));
    } catch {
      return [];
    }
  }

  async daemonStatus(): Promise<DaemonStatus> {
    const result = await this.runner({ args: ['daemon', 'status'] });
    if (result.exitCode === 0) {
      return { reachable: true, reason: null };
    }
    return { reachable: false, reason: result.stderr || `daemon status exited ${result.exitCode}` };
  }

  async usage(): Promise<UsageReport> {
    const result = await this.runner({ args: ['/usage'] });
    const raw = result.stdout || result.stderr;
    const usesApiPool = /\bAPI\b/i.test(raw) && /(token|cost|charge|pool)/i.test(raw);
    return { usesApiPool, raw };
  }
}
