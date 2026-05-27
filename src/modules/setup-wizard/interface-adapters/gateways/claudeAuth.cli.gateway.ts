import { execSync, spawnSync } from 'node:child_process';
import type { ClaudeAuthGateway, ClaudeLoginResult } from '@/modules/setup-wizard/entities/claudeAuth/claudeAuth.gateway.js';

interface ClaudeAuthCliGatewayDependencies {
  executeCommand?: (command: string, options?: object) => Buffer | string;
  spawnInteractive?: (command: string, args: string[]) => { status: number | null; signal: NodeJS.Signals | null };
}

export class ClaudeAuthCliGateway implements ClaudeAuthGateway {
  private readonly executor: (command: string, options?: object) => Buffer | string;
  private readonly spawnInteractive: (command: string, args: string[]) => { status: number | null; signal: NodeJS.Signals | null };

  constructor(deps: ClaudeAuthCliGatewayDependencies = {}) {
    this.executor = deps.executeCommand ?? execSync;
    this.spawnInteractive =
      deps.spawnInteractive ??
      ((command, args) => {
        const result = spawnSync(command, args, { stdio: 'inherit' });
        return { status: result.status, signal: result.signal };
      });
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      this.executor('claude --version', { stdio: 'pipe' });
    } catch {
      return false;
    }
    try {
      const output = this.executor('claude /status', { stdio: 'pipe' });
      const text = output.toString().toLowerCase();
      return !text.includes('not logged in') && !text.includes('please login');
    } catch {
      return false;
    }
  }

  async triggerLogin(): Promise<ClaudeLoginResult> {
    const result = this.spawnInteractive('claude', ['/login']);
    if (result.status !== 0) {
      return { success: false, error: `claude /login exited with status ${result.status ?? 'null'}` };
    }
    return { success: true, error: null };
  }
}
