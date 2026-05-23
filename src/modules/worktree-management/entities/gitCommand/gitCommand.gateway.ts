export type GitCommandKind =
  | 'fetch'
  | 'worktree-add'
  | 'worktree-remove'
  | 'worktree-prune'
  | 'reset-hard';

export interface GitCommand {
  kind: GitCommandKind;
  args: readonly string[];
  cwd: string;
}

export interface GitCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GitCommandExecutor {
  execute(command: GitCommand): Promise<GitCommandResult>;
}
