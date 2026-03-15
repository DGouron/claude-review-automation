import { describe, it, expect, vi } from 'vitest';
import { GitHubDiffStatsFetchGateway } from '@/interface-adapters/gateways/diffStatsFetch.github.gateway.js';

describe('GitHubDiffStatsFetchGateway', () => {
  it('should fetch diff stats from GitHub API', async () => {
    const response = JSON.stringify({
      commits: 3,
      additions: 150,
      deletions: 30,
      changed_files: 5,
    });

    const executor = vi.fn().mockReturnValue(response);

    const gateway = new GitHubDiffStatsFetchGateway(executor);
    const result = await gateway.fetchDiffStats('owner/repo', 42);

    expect(result).not.toBeNull();
    expect(result?.commitsCount).toBe(3);
    expect(result?.additions).toBe(150);
    expect(result?.deletions).toBe(30);
  });

  it('should return null when executor throws', async () => {
    const executor = vi.fn().mockImplementation(() => {
      throw new Error('API error');
    });

    const gateway = new GitHubDiffStatsFetchGateway(executor);
    const result = await gateway.fetchDiffStats('owner/repo', 42);

    expect(result).toBeNull();
  });

  it('should call gh api with correct path', async () => {
    const response = JSON.stringify({
      commits: 1,
      additions: 10,
      deletions: 5,
    });
    const executor = vi.fn().mockReturnValue(response);

    const gateway = new GitHubDiffStatsFetchGateway(executor);
    await gateway.fetchDiffStats('owner/repo', 99);

    expect(executor).toHaveBeenCalledWith('gh api repos/owner/repo/pulls/99');
  });
});
