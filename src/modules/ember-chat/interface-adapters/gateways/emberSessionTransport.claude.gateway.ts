import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { splitLines } from '@/modules/setup-wizard/interface-adapters/gateways/setupProcess.childProcess.gateway.js';
import type {
  EmberChunkHandler,
  EmberDoneHandler,
  EmberErrorHandler,
  EmberSessionHandle,
  EmberSessionSpawnOptions,
  EmberSessionSpawnResult,
  EmberSessionTransportGateway,
} from '@/modules/ember-chat/entities/emberSession/emberSessionTransport.gateway.js';

/**
 * HUMBLE GLUE — NOT unit-tested. The conversational transport over the `claude`
 * CLI is the one unverified mechanism in SPEC-189 (plan §12.1). Every layer above
 * it (state machine, registry, usecase, presenter, routes, client) is unit-tested
 * against the stub; this file is the swappable real implementation, validated by
 * acceptance/manual only.
 *
 * Most plausible CLI shape: ONE long-lived child running claude in interactive
 * streaming-JSON mode (`--input-format stream-json --output-format stream-json`),
 * so consecutive questions are written on stdin as user messages and the answer
 * is streamed back as assistant text deltas on stdout — keeping one resumable
 * conversational thread per process. The four read tools are exposed via the
 * existing MCP server (`--mcp-config`). No API key: relies on the operator's
 * Claude login (subscription OAuth), exactly like the bg dispatch path.
 *
 * MANUAL VERIFICATION REQUIRED: confirm the exact streaming-JSON event framing
 * (assistant text delta vs. message_stop) and that interactive stream-json input
 * keeps the thread alive across turns. Adjust extractText / isTurnComplete below
 * once verified against a live `claude` build.
 */

interface StreamJsonEvent {
  type?: string;
  subtype?: string;
  text?: string;
  delta?: { text?: string };
  message?: { content?: Array<{ type?: string; text?: string }> };
}

function parseStreamJsonEvent(line: string): StreamJsonEvent | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed !== null && typeof parsed === 'object') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function extractText(event: StreamJsonEvent): string | null {
  if (typeof event.text === 'string') {
    return event.text;
  }
  if (event.delta !== undefined && typeof event.delta.text === 'string') {
    return event.delta.text;
  }
  const content = event.message?.content;
  if (content !== undefined) {
    const text = content
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text ?? '')
      .join('');
    return text.length > 0 ? text : null;
  }
  return null;
}

function isTurnComplete(event: StreamJsonEvent): boolean {
  return event.type === 'result' || event.type === 'message_stop';
}

class ClaudeEmberSessionHandle implements EmberSessionHandle {
  private chunkHandler: EmberChunkHandler | null = null;
  private doneHandler: EmberDoneHandler | null = null;
  private errorHandler: EmberErrorHandler | null = null;
  private buffer = '';
  private alive = true;

  constructor(private readonly child: ChildProcessByStdio<Writable, Readable, Readable>) {
    this.child.stdout.setEncoding('utf-8');
    this.child.stdout.on('data', (chunk: string) => {
      this.consume(chunk);
    });
    this.child.on('close', () => {
      this.alive = false;
      this.errorHandler?.('ember-session-closed');
    });
    this.child.on('error', () => {
      this.alive = false;
      this.errorHandler?.('ember-session-error');
    });
  }

  ask(question: string): void {
    if (!this.child.stdin.writable) {
      this.errorHandler?.('ember-session-not-writable');
      return;
    }
    const userMessage = {
      type: 'user',
      message: { role: 'user', content: question },
    };
    this.child.stdin.write(`${JSON.stringify(userMessage)}\n`);
  }

  onChunk(handler: EmberChunkHandler): void {
    this.chunkHandler = handler;
  }

  onDone(handler: EmberDoneHandler): void {
    this.doneHandler = handler;
  }

  onError(handler: EmberErrorHandler): void {
    this.errorHandler = handler;
  }

  isAlive(): boolean {
    return this.alive;
  }

  kill(): void {
    this.alive = false;
    this.child.kill();
  }

  private consume(chunk: string): void {
    const { lines, rest } = splitLines(this.buffer, chunk);
    this.buffer = rest;
    for (const line of lines) {
      const event = parseStreamJsonEvent(line);
      if (event === null) {
        continue;
      }
      const text = extractText(event);
      if (text !== null) {
        this.chunkHandler?.(text);
      }
      if (isTurnComplete(event)) {
        this.doneHandler?.();
      }
    }
  }
}

export interface EmberSessionTransportClaudeGatewayOptions {
  claudePath: string;
  mcpConfigJson: string;
  allowedTools: string;
  model: string;
}

export class EmberSessionTransportClaudeGateway implements EmberSessionTransportGateway {
  constructor(private readonly options: EmberSessionTransportClaudeGatewayOptions) {}

  spawn(options: EmberSessionSpawnOptions): EmberSessionSpawnResult {
    const args = [
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--model',
      this.options.model,
      '--permission-mode',
      'default',
      '--append-system-prompt',
      options.systemPrompt,
      '--mcp-config',
      this.options.mcpConfigJson,
      '--strict-mcp-config',
      '--allowedTools',
      this.options.allowedTools,
    ];

    try {
      const child = spawn(this.options.claudePath, args, {
        cwd: options.projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      return { status: 'spawned', handle: new ClaudeEmberSessionHandle(child) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'spawn-failed';
      return { status: 'failed', reason };
    }
  }
}
