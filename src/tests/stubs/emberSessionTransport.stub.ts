import type {
  EmberChunkHandler,
  EmberDoneHandler,
  EmberErrorHandler,
  EmberSessionHandle,
  EmberSessionSpawnOptions,
  EmberSessionSpawnResult,
  EmberSessionTransportGateway,
} from '@/modules/ember-chat/entities/emberSession/emberSessionTransport.gateway.js';

type AnswerBuilder = (question: string, systemPrompt: string) => Promise<string>;

class StubEmberSessionHandle implements EmberSessionHandle {
  private chunkHandler: EmberChunkHandler | null = null;
  private doneHandler: EmberDoneHandler | null = null;
  private errorHandler: EmberErrorHandler | null = null;
  private alive = true;

  constructor(
    private readonly answerBuilder: AnswerBuilder,
    private readonly systemPrompt: string,
  ) {}

  ask(question: string): void {
    void this.deliver(question);
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
  }

  private async deliver(question: string): Promise<void> {
    try {
      const answer = await this.answerBuilder(question, this.systemPrompt);
      const words = answer.split(' ');
      for (let index = 0; index < words.length; index += 1) {
        const fragment = index === 0 ? words[index] : ` ${words[index]}`;
        this.chunkHandler?.(fragment);
      }
      this.doneHandler?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'stub-answer-failed';
      this.errorHandler?.(message);
    }
  }
}

export class StubEmberSessionTransportGateway implements EmberSessionTransportGateway {
  spawnCount = 0;
  private shouldFail = false;
  private answerBuilder: AnswerBuilder = async (question) => `Réponse à : ${question}`;

  failSpawn(): void {
    this.shouldFail = true;
  }

  respondWith(builder: AnswerBuilder): void {
    this.answerBuilder = builder;
  }

  /**
   * Makes the stub answer with the system prompt it was spawned with. The grounding
   * data lives in that prompt, so this proves the real path: readData → askEmber →
   * prompt → session, rather than the stub fabricating an answer of its own.
   */
  answerFromSystemPrompt(): void {
    this.answerBuilder = async (_question, systemPrompt) => systemPrompt;
  }

  spawn(options: EmberSessionSpawnOptions): EmberSessionSpawnResult {
    if (this.shouldFail) {
      return { status: 'failed', reason: 'stub-spawn-failed' };
    }
    this.spawnCount += 1;
    return {
      status: 'spawned',
      handle: new StubEmberSessionHandle(this.answerBuilder, options.systemPrompt),
    };
  }
}
