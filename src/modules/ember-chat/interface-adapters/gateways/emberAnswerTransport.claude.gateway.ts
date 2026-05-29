import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { SessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import {
  parseStreamJsonEvent,
  extractText,
  isTurnComplete,
} from '@/modules/ember-chat/interface-adapters/gateways/emberStreamJson.parser.js';
import type {
  EmberAnswerStartOptions,
  EmberAnswerStartResult,
  EmberAnswerSubscriber,
  EmberAnswerTransportGateway,
} from '@/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.js';

/**
 * HUMBLE GLUE — NOT unit-tested. This is the single unverified mechanism in
 * SPEC-190 (plan §OPEN RISKS 1-2). Every layer above it (askEmber usecase,
 * relay, presenter, routes, client) is unit-tested against
 * StubEmberAnswerTransportGateway; this file is the swappable real
 * implementation, validated by acceptance/manual only.
 *
 * Transport: ONE one-shot `claude --bg` dispatch per question (subscription /
 * OAuth billing, the same path reviews use — NEVER `--print`/headless, which
 * switches to API billing on 2026-06-15). After dispatch, tail the session
 * transcript JSONL at ~/.claude/projects/<slug>/<sessionId>.jsonl, emitting
 * onChunk per new assistant text segment and onDone on the terminal line.
 *
 * Read-only is enforced structurally: `--permission-mode plan`, no write tools
 * in allowedTools, and Edit/Write/Bash/Task in disallowedTools. No MCP servers.
 *
 * MANUAL VERIFICATION REQUIRED:
 *  1. Whether a one-shot `--bg` transcript actually writes a terminal `result`
 *     line. Belt-and-suspenders: a listAgents() poll detects terminal status as
 *     a fallback (pattern proven in awaitSessionCompletion.usecase).
 *  2. That `--bg` transcript `assistant` lines carry text under
 *     message.content[].text (what extractText reads). Chunks are whole-message
 *     granularity (coarse progressive), not deltas.
 */

export interface EmberAnswerTransportClaudeGatewayOptions {
  homeDir: string;
  pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 750;

export class EmberAnswerTransportClaudeGateway implements EmberAnswerTransportGateway {
  constructor(
    private readonly sessionGateway: ClaudeSessionGateway,
    private readonly options: EmberAnswerTransportClaudeGatewayOptions,
  ) {}

  start(
    options: EmberAnswerStartOptions,
    subscriber: EmberAnswerSubscriber,
  ): EmberAnswerStartResult {
    const run = new EmberAnswerRunner(
      this.sessionGateway,
      this.options.homeDir,
      this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      options,
      subscriber,
    );
    run.begin();
    return { status: 'started', run };
  }
}

class EmberAnswerRunner {
  private cancelled = false;
  private timer: NodeJS.Timeout | null = null;
  private byteOffset = 0;
  private pendingLine = '';
  private transcriptPath: string | null = null;

  constructor(
    private readonly sessionGateway: ClaudeSessionGateway,
    private readonly homeDir: string,
    private readonly pollIntervalMs: number,
    private readonly options: EmberAnswerStartOptions,
    private readonly subscriber: EmberAnswerSubscriber,
  ) {}

  begin(): void {
    void this.dispatchThenTail();
  }

  cancel(): void {
    this.cancelled = true;
    this.stopTimer();
  }

  private async dispatchThenTail(): Promise<void> {
    const dispatch = await this.sessionGateway.dispatch({
      prompt: this.options.question,
      flags: {
        model: 'sonnet',
        permissionMode: 'plan',
        systemPrompt: this.options.systemPrompt,
        mcpConfigJson: '{"mcpServers":{}}',
        allowedTools: 'Read,Glob,Grep',
        disallowedTools: 'Edit,Write,Bash,Task',
      },
      localPath: this.options.projectPath,
      jobId: `ember-${Date.now()}`,
      jobType: 'ember-chat',
    });

    if (dispatch.status !== 'dispatched') {
      this.fail('ember-answer-dispatch-failed');
      return;
    }

    const slug = this.options.projectPath.replace(/\//g, '-');
    this.transcriptPath = join(this.homeDir, '.claude', 'projects', slug, `${dispatch.sessionId}.jsonl`);
    this.scheduleTail(dispatch.sessionId);
  }

  private scheduleTail(sessionId: SessionId): void {
    if (this.cancelled) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.tailOnce(sessionId);
    }, this.pollIntervalMs);
  }

  private async tailOnce(sessionId: SessionId): Promise<void> {
    if (this.cancelled || this.transcriptPath === null) {
      return;
    }

    const completed = this.readNewLines();
    if (completed) {
      this.finish();
      return;
    }

    if (await this.agentTerminated(sessionId)) {
      this.finish();
      return;
    }

    this.scheduleTail(sessionId);
  }

  private readNewLines(): boolean {
    if (this.transcriptPath === null || !existsSync(this.transcriptPath)) {
      return false;
    }

    let raw: string;
    try {
      raw = readFileSync(this.transcriptPath, 'utf-8');
    } catch {
      this.fail('ember-answer-transcript-unreadable');
      return false;
    }

    const fresh = raw.slice(this.byteOffset);
    this.byteOffset = raw.length;
    this.pendingLine += fresh;
    const lines = this.pendingLine.split('\n');
    this.pendingLine = lines.pop() ?? '';

    let terminal = false;
    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }
      const event = parseStreamJsonEvent(line);
      if (event === null) {
        continue;
      }
      const text = extractText(event);
      if (text !== null) {
        this.subscriber.onChunk(text);
      }
      if (isTurnComplete(event)) {
        terminal = true;
      }
    }
    return terminal;
  }

  private async agentTerminated(sessionId: SessionId): Promise<boolean> {
    const agents = await this.sessionGateway.listAgents();
    const entry = agents.find((agent) => agent.sessionId === sessionId);
    if (entry === undefined) {
      return false;
    }
    return entry.status === 'completed' || entry.status === 'failed' || entry.status === 'stopped';
  }

  private finish(): void {
    if (this.cancelled) {
      return;
    }
    this.readNewLines();
    this.stopTimer();
    this.subscriber.onDone();
  }

  private fail(message: string): void {
    if (this.cancelled) {
      return;
    }
    this.cancel();
    this.subscriber.onError(message);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
