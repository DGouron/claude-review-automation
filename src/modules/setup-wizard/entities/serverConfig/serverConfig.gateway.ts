export interface ServerConfigEntry {
  name: string;
  localPath: string;
  enabled: boolean;
}

export interface ServerConfigGateway {
  hasProject(localPath: string): boolean;
  addProject(entry: ServerConfigEntry): void;
}
