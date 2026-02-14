const MINIMUM_NODE_VERSION = 20;
const CLAUDE_CLI_INSTALL_URL = 'https://docs.anthropic.com/en/docs/claude-code/overview';

export interface CheckInitPrerequisitesDependencies {
  executeCommand: (command: string, options?: object) => Buffer | string;
  getNodeMajorVersion: () => number;
}

export type PrerequisitesResult =
  | { status: 'ok' }
  | { status: 'node-version-too-low'; found: number; required: number }
  | { status: 'claude-not-installed'; installUrl: string };

export function checkInitPrerequisites(
  deps: CheckInitPrerequisitesDependencies,
): PrerequisitesResult {
  const nodeVersion = deps.getNodeMajorVersion();
  if (nodeVersion < MINIMUM_NODE_VERSION) {
    return {
      status: 'node-version-too-low',
      found: nodeVersion,
      required: MINIMUM_NODE_VERSION,
    };
  }

  try {
    deps.executeCommand('claude --version', { stdio: 'pipe' });
  } catch {
    return {
      status: 'claude-not-installed',
      installUrl: CLAUDE_CLI_INSTALL_URL,
    };
  }

  return { status: 'ok' };
}
