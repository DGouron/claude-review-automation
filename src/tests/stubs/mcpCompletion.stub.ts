import type {
  McpCompletionBridge,
  McpCompletionListener,
} from '@/modules/claude-invocation/entities/sessionCompletion/mcpCompletion.gateway.js';
import type { SessionCompletion } from '@/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.schema.js';

export class StubMcpCompletionBridge implements McpCompletionBridge {
  private readonly listeners = new Map<string, McpCompletionListener>();
  private readonly scheduled = new Map<string, SessionCompletion>();

  subscribeCalls: string[] = [];
  unsubscribeCalls: string[] = [];

  scheduleCompletion(jobId: string, completion: SessionCompletion): void {
    this.scheduled.set(jobId, completion);
  }

  subscribe(jobId: string, listener: McpCompletionListener): void {
    this.subscribeCalls.push(jobId);
    this.listeners.set(jobId, listener);
    const scheduled = this.scheduled.get(jobId);
    if (scheduled) {
      this.scheduled.delete(jobId);
      setImmediate(() => listener(scheduled));
    }
  }

  unsubscribe(jobId: string): void {
    this.unsubscribeCalls.push(jobId);
    this.listeners.delete(jobId);
  }

  publish(jobId: string, completion: SessionCompletion): void {
    const listener = this.listeners.get(jobId);
    if (listener) {
      listener(completion);
    }
  }
}
