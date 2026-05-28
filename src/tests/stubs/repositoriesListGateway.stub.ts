import type {
  DeclaredRepository,
  RepositoriesListGateway,
} from '@/modules/cli-configuration/entities/repositoriesList/repositoriesList.gateway.js';

export class StubRepositoriesListGateway implements RepositoriesListGateway {
  private repositories: DeclaredRepository[] = [];

  set(repositories: DeclaredRepository[]): void {
    this.repositories = repositories.map((repository) => ({ ...repository }));
  }

  list(): DeclaredRepository[] {
    return this.repositories.map((repository) => ({ ...repository }));
  }
}
