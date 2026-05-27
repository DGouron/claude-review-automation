import type { RepositoryConfig } from '@/frameworks/config/configLoader.js';
import type {
  DeclaredRepository,
  RepositoriesListGateway,
} from '@/modules/cli-configuration/entities/repositoriesList/repositoriesList.gateway.js';

export class RepositoriesListRuntimeConfigGateway implements RepositoriesListGateway {
  constructor(private readonly getRepositories: () => RepositoryConfig[]) {}

  list(): DeclaredRepository[] {
    return this.getRepositories().map((repository) => ({
      name: repository.name,
      localPath: repository.localPath,
      enabled: repository.enabled,
    }));
  }
}
