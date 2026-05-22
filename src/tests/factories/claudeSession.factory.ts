import {
  parseSessionId,
  type ClaudeSession,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';

export class ClaudeSessionFactory {
  static create(overrides?: Partial<ClaudeSession>): ClaudeSession {
    return {
      sessionId: parseSessionId('7c5dcf5d'),
      jobId: 'gitlab:owner/repo:42',
      jobType: 'review',
      localPath: '/tmp/project',
      mergeRequestId: 'gitlab-owner/repo-42',
      dispatchedAt: new Date('2026-05-22T10:00:00Z'),
      status: 'dispatched',
      failureReason: null,
      ...overrides,
    };
  }
}
