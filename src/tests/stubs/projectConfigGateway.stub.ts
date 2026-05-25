import type { ProjectConfig } from '@/config/projectConfig.js';
import type {
  ProjectConfigGateway,
  ProjectConfigReadResult,
  ProjectConfigWriteResult,
} from '@/modules/cli-configuration/entities/projectConfig/projectConfig.gateway.js';

export class StubProjectConfigGateway implements ProjectConfigGateway {
  private store = new Map<string, ProjectConfig>();
  private malformedPaths = new Set<string>();
  private ioErrorEnabled = false;
  private ioErrorReason = 'simulated write failure';

  set(path: string, config: ProjectConfig): void {
    this.store.set(path, { ...config });
  }

  get(path: string): ProjectConfig | undefined {
    const stored = this.store.get(path);
    return stored ? { ...stored } : undefined;
  }

  forceMalformed(path: string): void {
    this.malformedPaths.add(path);
  }

  forceIoError(reason?: string): void {
    this.ioErrorEnabled = true;
    if (reason !== undefined) {
      this.ioErrorReason = reason;
    }
  }

  read(path: string): ProjectConfigReadResult {
    if (this.malformedPaths.has(path)) {
      return { status: 'malformed' };
    }
    const stored = this.store.get(path);
    if (!stored) {
      return { status: 'not-found' };
    }
    return { status: 'ok', config: { ...stored } };
  }

  write(path: string, config: ProjectConfig): ProjectConfigWriteResult {
    if (this.ioErrorEnabled) {
      return { ok: false, reason: this.ioErrorReason };
    }
    this.store.set(path, { ...config });
    return { ok: true };
  }
}
