import type { EnvironmentGateway } from '@/modules/claude-invocation/entities/billingState/environment.gateway.js';
import type { EmberMessage } from '@/modules/ember-chat/entities/emberMessage/emberMessage.schema.js';
import type { EmberReadDataGateway } from '@/modules/ember-chat/entities/emberTool/emberTool.gateway.js';
import type {
  EmberAnswerSubscriber,
  EmberAnswerTransportGateway,
} from '@/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.js';
import type { EmberStreamSubscriber } from '@/modules/ember-chat/usecases/askEmber/emberStream.js';
import { buildEmberSystemPrompt } from '@/modules/ember-chat/services/emberSystemPrompt.js';

export type { EmberStatus, EmberStreamSubscriber } from '@/modules/ember-chat/usecases/askEmber/emberStream.js';

export interface AskEmberDependencies {
  transport: EmberAnswerTransportGateway;
  environment: EnvironmentGateway;
  readData: EmberReadDataGateway;
  projectPath: string;
}

export type AskEmberResult =
  | {
      status: 'streaming';
      subscribe: (subscriber: EmberStreamSubscriber) => void;
      cancel: () => void;
    }
  | { status: 'unavailable'; reason: string }
  | { status: 'billing-regression-prevented' };

class AnswerRelay implements EmberAnswerSubscriber {
  private target: EmberStreamSubscriber | null = null;
  private readonly bufferedChunks: string[] = [];
  private terminal: { kind: 'done' } | { kind: 'error'; message: string } | null = null;

  attach(subscriber: EmberStreamSubscriber): void {
    this.target = subscriber;
    subscriber.onStatus('working');
    for (const chunk of this.bufferedChunks) {
      subscriber.onChunk(chunk);
    }
    this.bufferedChunks.length = 0;
    if (this.terminal !== null) {
      this.flushTerminal(this.terminal);
    }
  }

  onChunk(text: string): void {
    if (this.target === null) {
      this.bufferedChunks.push(text);
      return;
    }
    this.target.onChunk(text);
  }

  onDone(): void {
    const terminal = { kind: 'done' } as const;
    if (this.target === null) {
      this.terminal = terminal;
      return;
    }
    this.flushTerminal(terminal);
  }

  onError(message: string): void {
    const terminal = { kind: 'error', message } as const;
    if (this.target === null) {
      this.terminal = terminal;
      return;
    }
    this.flushTerminal(terminal);
  }

  private flushTerminal(terminal: { kind: 'done' } | { kind: 'error'; message: string }): void {
    if (this.target === null) {
      return;
    }
    if (terminal.kind === 'done') {
      this.target.onStatus('idle');
      this.target.onDone();
      return;
    }
    this.target.onStatus('error');
    this.target.onError(terminal.message);
  }
}

export async function askEmber(
  message: EmberMessage,
  dependencies: AskEmberDependencies,
): Promise<AskEmberResult> {
  if (dependencies.environment.hasAnthropicApiKey()) {
    return { status: 'billing-regression-prevented' };
  }

  const { readData, projectPath, transport } = dependencies;
  const systemPrompt = buildEmberSystemPrompt({
    reviewScores: await readData.reviewScores(projectPath),
    insights: await readData.insights(projectPath),
    jobHistory: await readData.jobHistory(projectPath),
    worktrees: await readData.worktrees(),
  });

  const relay = new AnswerRelay();
  const started = transport.start(
    { question: message.question, systemPrompt, projectPath },
    relay,
  );

  if (started.status === 'failed') {
    return { status: 'unavailable', reason: started.reason };
  }

  return {
    status: 'streaming',
    subscribe: (subscriber) => relay.attach(subscriber),
    cancel: () => started.run.cancel(),
  };
}
