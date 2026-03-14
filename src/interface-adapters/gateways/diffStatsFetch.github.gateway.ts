import type { DiffStats } from '@/entities/diffStats/diffStats.js';
import type { DiffStatsFetchGateway } from '@/entities/diffStats/diffStatsFetch.gateway.js';

export type CommandExecutor = (command: string) => string;

interface GitHubPullRequestStatsResponse {
  additions: number;
  deletions: number;
  commits: number;
}

export class GitHubDiffStatsFetchGateway implements DiffStatsFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  fetchDiffStats(projectPath: string, mergeRequestNumber: number): DiffStats | null {
    try {
      const response = this.executor(
        `gh api repos/${projectPath}/pulls/${mergeRequestNumber}`
      );
      const pullRequest: GitHubPullRequestStatsResponse = JSON.parse(response);

      if (
        typeof pullRequest.additions !== 'number' ||
        typeof pullRequest.deletions !== 'number' ||
        typeof pullRequest.commits !== 'number'
      ) {
        return null;
      }

      return {
        additions: pullRequest.additions,
        deletions: pullRequest.deletions,
        commitsCount: pullRequest.commits,
      };
    } catch {
      return null;
    }
  }
}
