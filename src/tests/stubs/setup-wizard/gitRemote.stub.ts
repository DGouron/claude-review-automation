import type { GitRemoteGateway } from '@/modules/setup-wizard/entities/gitRemote/gitRemote.gateway.js';
import type { Platform } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

interface StubOptions {
  projectPath: string;
  isRepo?: boolean;
  remoteUrl?: string | null;
  platform?: Platform;
}

export class StubGitRemoteGateway implements GitRemoteGateway {
  private readonly projectPath: string;
  private readonly _isRepo: boolean;
  private readonly remoteUrl: string | null;
  private readonly platform: Platform;

  constructor(options: StubOptions) {
    this.projectPath = options.projectPath;
    this._isRepo = options.isRepo ?? true;
    if (Object.prototype.hasOwnProperty.call(options, 'remoteUrl')) {
      this.remoteUrl = options.remoteUrl ?? null;
    } else {
      this.remoteUrl = 'git@github.com:org/repo.git';
    }
    this.platform = options.platform ?? 'github';
  }

  isRepo(path: string): boolean {
    return path === this.projectPath ? this._isRepo : false;
  }

  getOriginRemote(path: string): string | null {
    return path === this.projectPath ? this.remoteUrl : null;
  }

  detectPlatform(_remoteUrl: string): Platform {
    return this.platform;
  }
}
