import type { RepositoryConfig } from '@/frameworks/config/configLoader.js';

export class RepositoryConfigFactory {
  static create(overrides: Partial<RepositoryConfig> = {}): RepositoryConfig {
    return {
      name: 'sample-project',
      platform: 'gitlab',
      remoteUrl: 'https://gitlab.com/org/sample-project',
      localPath: '/repos/sample-project',
      skill: 'review-code',
      enabled: true,
      ...overrides,
    };
  }
}
