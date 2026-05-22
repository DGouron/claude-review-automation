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

interface ScheduledAgentStatus {
  sessionId: SessionId;
  status: AgentStatusValue;
  afterPollCount: number;
}

export class StubClaudeSessionGateway implements ClaudeSessionGateway {
  dispatchCalls: DispatchInput[] = [];
  stopCalls: string[] = [];
  removeCalls: string[] = [];
  listAgentsCallCount = 0;

  private dispatchResult: DispatchResult = {
    status: 'dispatched',
    sessionId: parseSessionId('stub-session'),
  };
  private daemonStatusValue: DaemonStatus = { reachable: true, reason: null };
  private usageValue: UsageReport = { usesApiPool: false, raw: 'subscription pool' };
  private scheduledAgentStatuses: ScheduledAgentStatus[] = [];

  setDispatchResult(result: DispatchResult): void {
    this.dispatchResult = result;
  }

  setDaemonStatus(status: DaemonStatus): void {
    this.daemonStatusValue = status;
  }

  setUsage(report: UsageReport): void {
    this.usageValue = report;
  }

  scheduleAgentCompletion(
    sessionIdValue: string,
    status: AgentStatusValue,
    afterPollCount: number,
  ): void {
    this.scheduledAgentStatuses.push({
      sessionId: parseSessionId(sessionIdValue),
      status,
      afterPollCount,
    });
  }

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    this.dispatchCalls.push(input);
    return this.dispatchResult;
  }

  async stop(sessionId: SessionId): Promise<CleanupResult> {
    this.stopCalls.push(sessionId);
    return { success: true, warning: null };
  }

  async remove(sessionId: SessionId): Promise<CleanupResult> {
    this.removeCalls.push(sessionId);
    return { success: true, warning: null };
  }

  async listAgents(): Promise<AgentStatusEntry[]> {
    this.listAgentsCallCount += 1;
    return this.scheduledAgentStatuses
      .filter(entry => entry.afterPollCount <= this.listAgentsCallCount)
      .map(entry => ({ sessionId: entry.sessionId, status: entry.status }));
  }

  async daemonStatus(): Promise<DaemonStatus> {
    return this.daemonStatusValue;
  }

  async usage(): Promise<UsageReport> {
    return this.usageValue;
  }
}
