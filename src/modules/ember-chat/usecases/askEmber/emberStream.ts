export type EmberStatus = 'working' | 'idle' | 'error';

export interface EmberStreamSubscriber {
  onStatus: (status: EmberStatus) => void;
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}
