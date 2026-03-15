import { describe, it, expect, vi } from 'vitest';
import { GitLabDiffStatsFetchGateway } from '@/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.js';

describe('GitLabDiffStatsFetchGateway', () => {
  it('should fetch diff stats from GitLab API', async () => {
    const changesResponse = JSON.stringify([
      { diff: '@@ -1,10 +1,15 @@\n+added1\n+added2\n-removed1' },
      { diff: '@@ -1,5 +1,8 @@\n+added3\n+added4\n+added5\n-removed2\n-removed3' },
    ]);
    const commitsResponse = JSON.stringify([
      { id: 'abc123' },
      { id: 'def456' },
      { id: 'ghi789' },
    ]);

    const executor = vi.fn()
      .mockReturnValueOnce(changesResponse)
      .mockReturnValueOnce(commitsResponse);

    const gateway = new GitLabDiffStatsFetchGateway(executor);
    const result = await gateway.fetchDiffStats('my-group/my-project', 42);

    expect(result).not.toBeNull();
    expect(result?.commitsCount).toBe(3);
    expect(result?.additions).toBe(5);
    expect(result?.deletions).toBe(3);
  });

  it('should return null when executor throws', async () => {
    const executor = vi.fn().mockImplementation(() => {
      throw new Error('API error');
    });

    const gateway = new GitLabDiffStatsFetchGateway(executor);
    const result = await gateway.fetchDiffStats('my-group/my-project', 42);

    expect(result).toBeNull();
  });
});
