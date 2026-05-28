export type EmberChunkHandler = (text: string) => void;
export type EmberDoneHandler = () => void;
export type EmberErrorHandler = (message: string) => void;

export interface EmberSessionHandle {
  ask(question: string): void;
  onChunk(handler: EmberChunkHandler): void;
  onDone(handler: EmberDoneHandler): void;
  onError(handler: EmberErrorHandler): void;
  isAlive(): boolean;
  kill(): void;
}

export interface EmberSessionSpawnOptions {
  systemPrompt: string;
  projectPath: string;
}

export type EmberSessionSpawnResult =
  | { status: 'spawned'; handle: EmberSessionHandle }
  | { status: 'failed'; reason: string };

export interface EmberSessionTransportGateway {
  spawn(options: EmberSessionSpawnOptions): EmberSessionSpawnResult;
}
