import type { Platform } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

export interface GitRemoteGateway {
  isRepo(path: string): boolean;
  getOriginRemote(path: string): string | null;
  detectPlatform(remoteUrl: string): Platform;
}
