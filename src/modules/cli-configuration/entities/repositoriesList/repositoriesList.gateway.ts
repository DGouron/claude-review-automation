export interface DeclaredRepository {
  name: string;
  localPath: string;
  enabled: boolean;
}

export interface RepositoriesListGateway {
  list(): DeclaredRepository[];
}
