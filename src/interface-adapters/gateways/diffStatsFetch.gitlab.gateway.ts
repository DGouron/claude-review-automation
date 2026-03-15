import type { DiffStatsFetchGateway } from '@/entities/diffStats/diffStatsFetch.gateway.js';
import type { DiffStats } from '@/entities/diffStats/diffStats.js';

export type CommandExecutor = (command: string) => string;

interface GitLabChange {
  diff: string;
}

interface GitLabCommit {
  id: string;
}

function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return { additions, deletions };
}

export class GitLabDiffStatsFetchGateway implements DiffStatsFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  async fetchDiffStats(projectPath: string, mergeRequestNumber: number): Promise<DiffStats | null> {
    try {
      const encodedProject = projectPath.replace(/\//g, '%2F');

      const changesResponse = this.executor(
        `glab api projects/${encodedProject}/merge_requests/${mergeRequestNumber}/changes`,
      );
      const changes: GitLabChange[] = JSON.parse(changesResponse);

      let totalAdditions = 0;
      let totalDeletions = 0;
      for (const change of changes) {
        const { additions, deletions } = countDiffLines(change.diff);
        totalAdditions += additions;
        totalDeletions += deletions;
      }

      const commitsResponse = this.executor(
        `glab api projects/${encodedProject}/merge_requests/${mergeRequestNumber}/commits`,
      );
      const commits: GitLabCommit[] = JSON.parse(commitsResponse);

      return {
        commitsCount: commits.length,
        additions: totalAdditions,
        deletions: totalDeletions,
      };
    } catch {
      return null;
    }
  }
}
