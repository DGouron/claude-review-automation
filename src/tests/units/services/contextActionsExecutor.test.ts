import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeActionsFromContext } from '@/modules/review-execution/services/contextActionsExecutor.js'
import type { ReviewContext } from '@/modules/review-execution/entities/reviewContext/reviewContext.js'

// AC6/AC7: the context auto-path executor is bounded to read + postComment.
// THREAD_RESOLVE / ADD_LABEL are dropped (no-op, logged), POST_COMMENT executes.
describe('executeActionsFromContext (auto path, capability-bounded)', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }

  const mockExecutor = vi.fn()

  const baseContext: ReviewContext = {
    version: '1.0',
    mergeRequestId: 'github-owner/repo-42',
    platform: 'github',
    projectPath: 'owner/repo',
    mergeRequestNumber: 42,
    createdAt: '2026-02-02T10:00:00Z',
    threads: [],
    actions: [],
    progress: { phase: 'completed', currentStep: null },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an empty result when no actions are present', async () => {
    const context = { ...baseContext, actions: [] }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.total).toBe(0)
    expect(result.succeeded).toBe(0)
    expect(mockExecutor).not.toHaveBeenCalled()
  })

  it('drops THREAD_RESOLVE without invoking the executor', async () => {
    const context: ReviewContext = {
      ...baseContext,
      actions: [{ type: 'THREAD_RESOLVE', threadId: 'PRRT_kwDONxxx' }],
    }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.total).toBe(0)
    expect(mockExecutor).not.toHaveBeenCalled()
  })

  it('executes POST_COMMENT action', async () => {
    const context: ReviewContext = {
      ...baseContext,
      actions: [{ type: 'POST_COMMENT', body: '## Follow-up Review\n\nAll fixed.' }],
    }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.total).toBe(1)
    expect(result.succeeded).toBe(1)
    expect(mockExecutor).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['repos/owner/repo/issues/42/comments']),
      '/tmp/repo'
    )
  })

  it('drops ADD_LABEL without invoking the executor', async () => {
    const context: ReviewContext = {
      ...baseContext,
      actions: [{ type: 'ADD_LABEL', label: 'needs_approve' }],
    }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.total).toBe(0)
    expect(mockExecutor).not.toHaveBeenCalled()
  })

  it('keeps only allowed verbs in a mixed stream', async () => {
    const context: ReviewContext = {
      ...baseContext,
      actions: [
        { type: 'THREAD_RESOLVE', threadId: 'thread-1' },
        { type: 'THREAD_RESOLVE', threadId: 'thread-2' },
        { type: 'POST_COMMENT', body: 'Done' },
        { type: 'ADD_LABEL', label: 'approved' },
      ],
    }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    // Only the single POST_COMMENT survives the capability filter.
    expect(result.total).toBe(1)
    expect(result.succeeded).toBe(1)
    expect(mockExecutor).toHaveBeenCalledTimes(1)
  })

  it('handles GitLab platform postComment', async () => {
    const context: ReviewContext = {
      ...baseContext,
      platform: 'gitlab',
      actions: [{ type: 'POST_COMMENT', body: 'note' }],
    }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.succeeded).toBe(1)
    expect(mockExecutor).toHaveBeenCalledWith(
      'glab',
      expect.arrayContaining(['api']),
      '/tmp/repo'
    )
  })

  it('continues executing when one allowed action fails', async () => {
    mockExecutor.mockImplementationOnce(() => {
      throw new Error('API error')
    })

    const context: ReviewContext = {
      ...baseContext,
      actions: [
        { type: 'POST_COMMENT', body: 'first' },
        { type: 'POST_COMMENT', body: 'second' },
      ],
    }

    const result = await executeActionsFromContext(context, '/tmp/repo', mockLogger, mockExecutor)

    expect(result.total).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.succeeded).toBe(1)
  })
})
