import type { DiffStatsFetchGateway } from '@/entities/diffStats/diffStatsFetch.gateway.js';
import type { DiffStats } from '@/entities/diffStats/diffStats.js';

export type CommandExecutor = (command: string) => string;

interface GitHubPullRequestResponse {
  commits: number;
  additions: number;
  deletions: number;
}

export class GitHubDiffStatsFetchGateway implements DiffStatsFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  async fetchDiffStats(projectPath: string, mergeRequestNumber: number): Promise<DiffStats | null> {
    try {
      const response = this.executor(
        `gh api repos/${projectPath}/pulls/${mergeRequestNumber}`,
      );
      const pullRequest: GitHubPullRequestResponse = JSON.parse(response);

      return {
        commitsCount: pullRequest.commits,
        additions: pullRequest.additions,
        deletions: pullRequest.deletions,
      };
    } catch {
      return null;
    }
  }
}
