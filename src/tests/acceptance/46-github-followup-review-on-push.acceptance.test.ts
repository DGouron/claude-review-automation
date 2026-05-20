import { vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RepositoryConfig } from '@/config/loader.js';

const mockConfig = {
  server: { port: 3000 },
  user: {
    gitlabUsername: 'claude-bot',
    githubUsername: 'claude-bot',
  },
  queue: { maxConcurrent: 1, deduplicationWindowMs: 60000 },
  repositories: [],
};

const mockRepoConfig: RepositoryConfig = {
  name: 'test-repo',
  platform: 'github',
  localPath: '/home/user/projects/test-repo',
  remoteUrl: 'https://github.com/test-owner/test-repo.git',
  skill: 'review-front',
  enabled: true,
};

vi.mock('@/config/loader.js', () => ({
  loadConfig: vi.fn(() => mockConfig),
  findRepositoryByRemoteUrl: vi.fn(() => mockRepoConfig),
}));

vi.mock('@/security/verifier.js', () => ({
  verifyGitHubSignature: vi.fn(() => ({ valid: true })),
  getGitHubEventType: vi.fn(() => 'pull_request'),
}));

vi.mock('@/frameworks/queue/pQueueAdapter.js', () => ({
  createJobId: vi.fn((prefix: string, projectPath: string, mrNumber: number) => `${prefix}-${projectPath}-${mrNumber}`),
  enqueueReview: vi.fn(() => Promise.resolve(true)),
  updateJobProgress: vi.fn(),
  cancelJob: vi.fn(),
}));

vi.mock('@/claude/invoker.js', () => ({
  invokeClaudeReview: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('@/main/websocket.js', () => ({
  startWatchingReviewContext: vi.fn(),
  stopWatchingReviewContext: vi.fn(),
}));

vi.mock('@/config/projectConfig.js', () => ({
  loadProjectConfig: vi.fn(() => null),
  getProjectAgents: vi.fn(() => null),
  getFollowupAgents: vi.fn(() => null),
  getProjectLanguage: vi.fn(() => 'en'),
}));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleGitHubWebhook } from '@/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.js';
import type { GitHubWebhookDependencies } from '@/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.js';
import { enqueueReview } from '@/frameworks/queue/pQueueAdapter.js';
import { GitHubEventFactory } from '@/tests/factories/gitHubEvent.factory.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import { buildMcpSystemPrompt } from '@/frameworks/claude/claudeInvoker.js';
import type { ReviewJob } from '@/frameworks/queue/pQueueAdapter.js';

function createSynchronizePr() {
  return GitHubEventFactory.createPullRequestEvent({
    action: 'synchronize',
    pull_request: {
      state: 'open',
      draft: false,
    },
  });
}

const NO_TRACKED_MR = Symbol('NO_TRACKED_MR');

function createMockTrackingGateway(mrOverride: Partial<TrackedMr> | typeof NO_TRACKED_MR = {}) {
  const trackedMr = mrOverride === NO_TRACKED_MR
    ? null
    : TrackedMrFactory.create({
        id: 'github-test-owner/test-repo-123',
        mrNumber: 123,
        platform: 'github',
        project: 'test-owner/test-repo',
        state: 'pending-fix',
        openThreads: 3,
        totalThreads: 3,
        lastPushAt: '2026-05-20T12:00:00Z',
        lastReviewAt: '2026-05-20T10:00:00Z',
        autoFollowup: true,
        ...mrOverride,
      });

  return {
    getById: vi.fn((): TrackedMr | null => trackedMr),
    getByNumber: vi.fn((): TrackedMr | null => trackedMr),
    create: vi.fn(),
    update: vi.fn(),
    getByState: vi.fn(() => []),
    getActiveMrs: vi.fn(() => []),
    remove: vi.fn(() => true),
    archive: vi.fn(() => true),
    recordReviewEvent: vi.fn(),
    recordPush: vi.fn((): TrackedMr | null => trackedMr),
    loadTracking: vi.fn(() => null),
    saveTracking: vi.fn(),
  };
}

function createDefaultDeps(trackingGateway: ReturnType<typeof createMockTrackingGateway>): GitHubWebhookDependencies {
  const threadFetchGateway = { fetchThreads: vi.fn(() => []) };
  const recordPushExecute = vi.fn();
  recordPushExecute.mockImplementation(() => trackingGateway.recordPush());
  const checkFollowupNeededExecute = vi.fn();
  checkFollowupNeededExecute.mockReturnValue(true);
  const enforceBudgetExecute = vi.fn();
  enforceBudgetExecute.mockResolvedValue({
    accepted: true,
    status: {
      limitUsd: 200,
      consumedUsd: 0,
      remainingUsd: 200,
      percentUsed: 0,
      exceeded: false,
      periodStart: '2026-05-01T00:00:00.000Z',
    },
  });
  return {
    reviewContextGateway: {
      create: vi.fn(() => ({ success: true, filePath: '' })),
      read: vi.fn(() => null),
      delete: vi.fn(() => ({ success: true, deleted: true })),
      exists: vi.fn(() => false),
      getFilePath: vi.fn(() => ''),
      appendAction: vi.fn(() => ({ success: true })),
      updateProgress: vi.fn(() => ({ success: true })),
      setResult: vi.fn(() => ({ success: true })),
    },
    threadFetchGateway,
    diffMetadataFetchGateway: { fetchDiffMetadata: vi.fn(() => ({ baseSha: 'abc', headSha: 'def', startSha: 'ghi' })) },
    diffStatsFetchGateway: { fetchDiffStats: vi.fn(() => null) },
    trackAssignment: { execute: vi.fn() },
    recordCompletion: { execute: vi.fn() },
    recordPush: { execute: recordPushExecute },
    transitionState: { execute: vi.fn() },
    checkFollowupNeeded: { execute: checkFollowupNeededExecute },
    syncThreads: { execute: vi.fn(() => null) },
    enforceBudget: { execute: enforceBudgetExecute },
    broadcastBudgetExceeded: vi.fn(),
    getRepositories: vi.fn(() => []),
  } as unknown as GitHubWebhookDependencies;
}

describe('Acceptance — Spec #46: GitHub Followup Review on Push', () => {
  let mockReply: FastifyReply;
  let mockGateway: ReturnType<typeof createMockTrackingGateway>;
  let defaultDeps: GitHubWebhookDependencies;
  const logger = createStubLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
    mockGateway = createMockTrackingGateway();
    defaultDeps = createDefaultDeps(mockGateway);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Feature: Push-Triggered Followup on GitHub PR', () => {
    it('Push triggers followup on PR with open blocking threads', async () => {
      const event = createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(defaultDeps.recordPush.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/home/user/projects/test-repo',
          mrNumber: 123,
          platform: 'github',
        })
      );
      expect(enqueueReview).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'followup',
          platform: 'github',
          mrNumber: 123,
        }),
        expect.any(Function),
      );
      expect(mockReply.status).toHaveBeenCalledWith(202);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'followup-queued', prNumber: 123 }),
      );
    });

    it('No followup when autoFollowup is disabled', async () => {
      mockGateway = createMockTrackingGateway({ autoFollowup: false });
      defaultDeps = createDefaultDeps(mockGateway);

      const event = createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored', reason: 'Auto-followup disabled' }),
      );
    });

    it('No followup when PR has no open threads (checkFollowupNeeded returns false)', async () => {
      const noFollowupDeps = createDefaultDeps(mockGateway);
      (noFollowupDeps.checkFollowupNeeded.execute as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const event = createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway, noFollowupDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored' }),
      );
    });

    it('No followup when PR is not tracked (no MR found)', async () => {
      mockGateway = createMockTrackingGateway(NO_TRACKED_MR);
      defaultDeps = createDefaultDeps(mockGateway);
      (defaultDeps.recordPush.execute as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const event = createSynchronizePr();
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ignored' }),
      );
    });

    it('Push on draft PR is ignored', async () => {
      const event = GitHubEventFactory.createPullRequestEvent({
        action: 'synchronize',
        pull_request: {
          state: 'open',
          draft: true,
        },
      });
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(defaultDeps.recordPush.execute).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('Push on closed PR is ignored', async () => {
      const event = GitHubEventFactory.createPullRequestEvent({
        action: 'synchronize',
        pull_request: {
          state: 'closed',
          draft: false,
        },
      });
      const request = { body: event, headers: {} } as unknown as FastifyRequest;

      await handleGitHubWebhook(request, mockReply, logger, mockGateway, defaultDeps);

      expect(enqueueReview).not.toHaveBeenCalled();
      expect(defaultDeps.recordPush.execute).not.toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Feature: Platform-aware MCP system prompt', () => {
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

    it('Platform-specific CLI commands in system prompt: GitHub uses gh pr diff and gh pr view', () => {
      const job = buildJob({ platform: 'github', mrNumber: 42 });

      const prompt = buildMcpSystemPrompt(job);

      expect(prompt).toContain('gh pr diff 42');
      expect(prompt).toContain('gh pr view 42');
      expect(prompt).not.toContain('glab mr diff');
      expect(prompt).not.toContain('glab mr view');
    });

    it('Manual followup on GitLab MR still works: GitLab uses glab mr diff and glab mr view', () => {
      const job = buildJob({ platform: 'gitlab', mrNumber: 99 });

      const prompt = buildMcpSystemPrompt(job);

      expect(prompt).toContain('glab mr diff 99');
      expect(prompt).toContain('glab mr view 99');
      expect(prompt).not.toContain('gh pr diff');
      expect(prompt).not.toContain('gh pr view');
    });
  });
});
