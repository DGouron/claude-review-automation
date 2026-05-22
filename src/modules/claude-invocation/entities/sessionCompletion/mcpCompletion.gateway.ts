import type { SessionCompletion } from '@/modules/claude-invocation/entities/sessionCompletion/sessionCompletion.schema.js';

export type McpCompletionListener = (completion: SessionCompletion) => void;

export interface McpCompletionBridge {
  subscribe(jobId: string, listener: McpCompletionListener): void;
  unsubscribe(jobId: string): void;
  publish(jobId: string, completion: SessionCompletion): void;
}
