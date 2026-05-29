export type EgressScanMode = 'allow' | 'redact' | 'block';

export type EgressChannel = 'postComment' | 'THREAD_REPLY' | 'POST_COMMENT';

export type EgressMatchCategory = 'secret-shape' | 'length-cap' | 'out-of-scope';

export interface EgressScanInput {
  body: string;
  channel: EgressChannel;
  projectPath: string;
}

export interface EgressScanTrace {
  channel: EgressChannel;
  mode: EgressScanMode;
  matchCategoryCounts: Record<EgressMatchCategory, number>;
}

export type EgressScanResult =
  | { decision: 'pass'; body: string }
  | { decision: 'redact'; body: string; trace: EgressScanTrace }
  | { decision: 'block'; trace: EgressScanTrace };

export interface EgressScanGateway {
  scan(input: EgressScanInput): EgressScanResult;
}
