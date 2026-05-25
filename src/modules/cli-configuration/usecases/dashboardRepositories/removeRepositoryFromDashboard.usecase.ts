import type { RepositoryConfig } from '@/frameworks/config/configLoader.js';
import type { RemoveRepositoryRouteResult } from '@/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.js';
import type { RemoveRepositoryFromConfigUseCase } from '@/modules/cli-configuration/usecases/cli/removeRepositoryFromConfig.usecase.js';

export interface RemoveRepositoryFromDashboardDependencies {
  removeRepositoryFromConfig: RemoveRepositoryFromConfigUseCase;
  repositories: RepositoryConfig[];
  configPath: string;
}

export class RemoveRepositoryFromDashboardUseCase {
  constructor(private readonly deps: RemoveRepositoryFromDashboardDependencies) {}

  execute(input: { localPath: string }): RemoveRepositoryRouteResult {
    let result: ReturnType<RemoveRepositoryFromConfigUseCase['execute']>;
    try {
      result = this.deps.removeRepositoryFromConfig.execute({
        configPath: this.deps.configPath,
        localPath: input.localPath,
      });
    } catch {
      return { status: 'write-failed' };
    }
    if (!result.removed) {
      return { status: 'not-found' };
    }
    const index = this.deps.repositories.findIndex(
      (repository) => repository.localPath === input.localPath,
    );
    if (index >= 0) {
      this.deps.repositories.splice(index, 1);
    }
    return { status: 'ok', repositories: this.deps.repositories };
  }
}
