import type {
  EmberChunkHandler,
  EmberDoneHandler,
  EmberErrorHandler,
  EmberSessionHandle,
  EmberSessionSpawnOptions,
  EmberSessionSpawnResult,
  EmberSessionTransportGateway,
} from '@/modules/ember-chat/entities/emberSession/emberSessionTransport.gateway.js';
import type { EmberReadDataGateway } from '@/modules/ember-chat/entities/emberTool/emberTool.gateway.js';

type AnswerBuilder = (question: string) => Promise<string>;

class StubEmberSessionHandle implements EmberSessionHandle {
  private chunkHandler: EmberChunkHandler | null = null;
  private doneHandler: EmberDoneHandler | null = null;
  private errorHandler: EmberErrorHandler | null = null;
  private alive = true;

  constructor(private readonly answerBuilder: AnswerBuilder) {}

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
      const answer = await this.answerBuilder(question);
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

  respondFromReviewScores(readData: EmberReadDataGateway, projectPath: string): void {
    this.answerBuilder = async () => {
      const scores = await readData.reviewScores(projectPath);
      if (scores === null) {
        return "Je ne dispose d'aucune donnée de review pour ce projet.";
      }
      const worst = scores.reviews.reduce<number | null>((lowest, review) => {
        if (review.score === null) {
          return lowest;
        }
        if (lowest === null) {
          return review.mrNumber;
        }
        return review.score < (scores.reviews.find((r) => r.mrNumber === lowest)?.score ?? 0)
          ? review.mrNumber
          : lowest;
      }, null);
      return `Le pire score concerne la MR ${worst ?? 'inconnue'}.`;
    };
  }

  spawn(_options: EmberSessionSpawnOptions): EmberSessionSpawnResult {
    if (this.shouldFail) {
      return { status: 'failed', reason: 'stub-spawn-failed' };
    }
    this.spawnCount += 1;
    return { status: 'spawned', handle: new StubEmberSessionHandle(this.answerBuilder) };
  }
}
