export type BackfillProgress = {
  total: number;
  completed: number;
  failed: number;
  status: 'idle' | 'running' | 'completed';
};
