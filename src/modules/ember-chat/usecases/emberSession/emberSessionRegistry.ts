import type {
  EmberSessionHandle,
  EmberSessionTransportGateway,
} from '@/modules/ember-chat/entities/emberSession/emberSessionTransport.gateway.js';
import { createIdleEmberSessionState } from '@/modules/ember-chat/entities/emberSession/emberSessionState.js';
import type { EmberSessionState } from '@/modules/ember-chat/entities/emberSession/emberSessionState.js';

export type EmberStatus = 'working' | 'idle' | 'error';

export interface EmberStreamSubscriber {
  onStatus: (status: EmberStatus) => void;
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export type EmberAskResult =
  | { status: 'streaming'; subscribe: (subscriber: EmberStreamSubscriber) => void }
  | { status: 'unavailable'; reason: string };

export interface EmberAskRequest {
  question: string;
  systemPrompt: string;
  projectPath: string;
}

export interface EmberSessionRegistryDependencies {
  transport: EmberSessionTransportGateway;
  now: () => Date;
  idleTimeoutMs: number;
}

export class EmberSessionRegistry {
  private handle: EmberSessionHandle | null = null;
  private state: EmberSessionState = createIdleEmberSessionState();

  constructor(private readonly dependencies: EmberSessionRegistryDependencies) {}

  ask(request: EmberAskRequest): EmberAskResult {
    const handle = this.ensureLive(request.systemPrompt, request.projectPath);
    if (handle === null) {
      return { status: 'unavailable', reason: 'spawn-failed' };
    }

    this.state = this.state.onQuestion(this.dependencies.now());

    return {
      status: 'streaming',
      subscribe: (subscriber) => {
        subscriber.onStatus('working');
        handle.onChunk((text) => subscriber.onChunk(text));
        handle.onError((message) => {
          subscriber.onStatus('error');
          subscriber.onError(message);
        });
        handle.onDone(() => {
          this.state = this.state.onAnswerDone(this.dependencies.now());
          subscriber.onStatus('idle');
          subscriber.onDone();
        });
        handle.ask(request.question);
      },
    };
  }

  onIdle(now: Date): void {
    const next = this.state.onIdleTick(now, this.dependencies.idleTimeoutMs);
    if (next.phase === 'idle' && this.state.phase === 'live') {
      this.release();
    }
    this.state = next;
  }

  private ensureLive(systemPrompt: string, projectPath: string): EmberSessionHandle | null {
    if (this.handle?.isAlive() === true && !this.state.needsProcess()) {
      return this.handle;
    }

    const result = this.dependencies.transport.spawn({ systemPrompt, projectPath });
    if (result.status === 'failed') {
      this.handle = null;
      return null;
    }

    this.handle = result.handle;
    return this.handle;
  }

  private release(): void {
    if (this.handle !== null) {
      this.handle.kill();
      this.handle = null;
    }
  }
}
