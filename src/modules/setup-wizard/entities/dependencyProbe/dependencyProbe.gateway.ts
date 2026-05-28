export interface DependencyProbeResult {
  present: boolean;
  version: string | null;
}

export interface DependencyProbeReport {
  node: DependencyProbeResult;
  yarn: DependencyProbeResult;
  claude: DependencyProbeResult;
  git: DependencyProbeResult;
  gh: DependencyProbeResult;
  glab: DependencyProbeResult;
}

export interface DependencyProbeGateway {
  probeAll(): DependencyProbeReport;
}
