export interface EnvFileContents {
  gitlabSecret: string | null;
  githubSecret: string | null;
}

export interface EnvFileGateway {
  read(projectPath: string): EnvFileContents;
  write(projectPath: string, contents: EnvFileContents): void;
  ensureGitignored(projectPath: string): void;
}
