import { describe, it, expect } from 'vitest';
import { buildMcpSystemPrompt } from '@/frameworks/claude/claudeInvoker.js';
import type { ReviewJob } from '@/frameworks/queue/pQueueAdapter.js';

function buildJob(overrides: Partial<ReviewJob>): ReviewJob {
  return {
    id: 'job-1',
    platform: 'gitlab',
    projectPath: 'group/project',
    localPath: '/tmp/project',
    mrNumber: 42,
    skill: 'review-followup',
    mrUrl: 'https://example.com/mr/42',
    sourceBranch: 'feat/x',
    targetBranch: 'main',
    jobType: 'followup',
    ...overrides,
  };
}

describe('buildMcpSystemPrompt', () => {
  describe('when platform is github', () => {
    it('references gh pr diff as the diff source of truth', () => {
      const job = buildJob({ platform: 'github', mrNumber: 100 });

      const prompt = buildMcpSystemPrompt(job);

      expect(prompt).toContain('gh pr diff 100');
    });

    it('references gh pr view as the metadata source of truth', () => {
      const job = buildJob({ platform: 'github', mrNumber: 100 });

      const prompt = buildMcpSystemPrompt(job);

      expect(prompt).toContain('gh pr view 100');
    });

    it('does not reference glab commands when platform is github', () => {
      const job = buildJob({ platform: 'github', mrNumber: 100 });

      const prompt = buildMcpSystemPrompt(job);

      expect(prompt).not.toContain('glab mr diff');
      expect(prompt).not.toContain('glab mr view');
    });
  });

  describe('when platform is gitlab', () => {
    it('references glab mr diff as the diff source of truth', () => {
      const job = buildJob({ platform: 'gitlab', mrNumber: 7 });

      const prompt = buildMcpSystemPrompt(job);

      expect(prompt).toContain('glab mr diff 7');
    });

    it('references glab mr view as the metadata source of truth', () => {
      const job = buildJob({ platform: 'gitlab', mrNumber: 7 });

      const prompt = buildMcpSystemPrompt(job);

      expect(prompt).toContain('glab mr view 7');
    });

    it('does not reference gh commands when platform is gitlab', () => {
      const job = buildJob({ platform: 'gitlab', mrNumber: 7 });

      const prompt = buildMcpSystemPrompt(job);

      expect(prompt).not.toContain('gh pr diff');
      expect(prompt).not.toContain('gh pr view');
    });
  });
});
