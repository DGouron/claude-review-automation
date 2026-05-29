export interface EmberAnswerSubscriber {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export interface EmberAnswerStartOptions {
  question: string;
  systemPrompt: string;
  projectPath: string;
}

export interface EmberAnswerRun {
  cancel(): void;
}

export type EmberAnswerStartResult =
  | { status: 'started'; run: EmberAnswerRun }
  | { status: 'failed'; reason: string };

export interface EmberAnswerTransportGateway {
  start(
    options: EmberAnswerStartOptions,
    subscriber: EmberAnswerSubscriber,
  ): EmberAnswerStartResult;
}
