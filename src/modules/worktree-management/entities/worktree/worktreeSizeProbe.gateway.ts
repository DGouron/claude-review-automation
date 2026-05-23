export interface WorktreeSizeProbeGateway {
  probe(path: string): Promise<number | null>;
}
