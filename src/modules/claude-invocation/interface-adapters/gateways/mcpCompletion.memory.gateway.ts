import type {
  McpCompletionBridge,
  McpCompletionListener,
} from '@/modules/claude-invocation/entities/sessionCompletion/mcpCompletion.gateway.js';
import type { SessionCompletion } from '@/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.schema.js';

export class InMemoryMcpCompletionBridge implements McpCompletionBridge {
  private readonly listeners = new Map<string, McpCompletionListener>();
  private readonly pending = new Map<string, SessionCompletion>();

  subscribe(jobId: string, listener: McpCompletionListener): void {
    this.listeners.set(jobId, listener);
    const buffered = this.pending.get(jobId);
    if (buffered) {
      this.pending.delete(jobId);
      listener(buffered);
    }
  }

  unsubscribe(jobId: string): void {
    this.listeners.delete(jobId);
  }

  publish(jobId: string, completion: SessionCompletion): void {
    const listener = this.listeners.get(jobId);
    if (listener) {
      listener(completion);
      return;
    }
    this.pending.set(jobId, completion);
  }
}
