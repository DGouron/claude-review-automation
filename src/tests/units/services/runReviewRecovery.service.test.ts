import { describe, expect, it, vi } from 'vitest'
import { runReviewRecovery } from '@/modules/review-execution/services/reviewRecovery.service.js'
import { StubReviewContextGateway } from '@/tests/stubs/reviewContextGateway.stub.js'
import { ReviewContextFactory } from '@/tests/factories/reviewContext.factory.js'

const NOW = new Date('2026-05-25T21:00:00Z').getTime()
const ONE_HOUR_AGO = new Date('2026-05-25T20:00:00Z').toISOString()
const ONE_MINUTE_AGO = new Date('2026-05-25T20:59:00Z').toISOString()

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

describe('runReviewRecovery', () => {
  it('returns zero counters when there are no contexts on disk', async () => {
    const gateway = new StubReviewContextGateway()

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions: vi.fn(),
      now: () => NOW,
      logger: silentLogger(),
    })

    expect(summary).toEqual({ scanned: 0, recovered: 0, backfilled: 0, skipped: 0, failed: 0 })
  })

  it('skips contexts that do not match the predicate (no actions queued)', async () => {
    const gateway = new StubReviewContextGateway()
    gateway.setContext(
      'github-owner/repo-1',
      ReviewContextFactory.create({
        mergeRequestId: 'github-owner/repo-1',
        createdAt: ONE_MINUTE_AGO,
        progress: { phase: 'completed', currentStep: null },
        actions: [],
      }),
    )
    const executeActions = vi.fn()

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions,
      now: () => NOW,
      logger: silentLogger(),
    })

    expect(summary.skipped).toBe(1)
    expect(summary.recovered).toBe(0)
    expect(executeActions).not.toHaveBeenCalled()
  })

  it('backfills (no post) stale contexts older than the grace window', async () => {
    const gateway = new StubReviewContextGateway()
    gateway.setContext(
      'github-owner/repo-1',
      ReviewContextFactory.create({
        mergeRequestId: 'github-owner/repo-1',
        createdAt: ONE_HOUR_AGO,
        progress: { phase: 'completed', currentStep: null },
        actions: [{ type: 'POST_COMMENT', body: 'historical' }],
      }),
    )
    const executeActions = vi.fn()

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions,
      now: () => NOW,
      logger: silentLogger(),
      graceWindowMs: 30 * 60 * 1000,
    })

    expect(summary.backfilled).toBe(1)
    expect(summary.recovered).toBe(0)
    expect(executeActions).not.toHaveBeenCalled()
    expect(gateway.read('/repo', 'github-owner/repo-1')?.result?.backfilledAt).toBeDefined()
  })

  it('recovers contexts inside the grace window by calling executeActions then setResult', async () => {
    const gateway = new StubReviewContextGateway()
    gateway.setContext(
      'github-owner/repo-2',
      ReviewContextFactory.create({
        mergeRequestId: 'github-owner/repo-2',
        createdAt: ONE_MINUTE_AGO,
        progress: { phase: 'completed', currentStep: null },
        actions: [{ type: 'POST_COMMENT', body: 'fresh' }],
      }),
    )
    const executeActions = vi.fn().mockResolvedValue({ success: true })

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions,
      now: () => NOW,
      logger: silentLogger(),
      graceWindowMs: 30 * 60 * 1000,
    })

    expect(summary.recovered).toBe(1)
    expect(summary.backfilled).toBe(0)
    expect(executeActions).toHaveBeenCalledTimes(1)
    expect(gateway.read('/repo', 'github-owner/repo-2')?.result?.backfilledAt).toBeDefined()
  })

  it('counts a failure when executeActions throws and leaves result unset', async () => {
    const gateway = new StubReviewContextGateway()
    gateway.setContext(
      'github-owner/repo-3',
      ReviewContextFactory.create({
        mergeRequestId: 'github-owner/repo-3',
        createdAt: ONE_MINUTE_AGO,
        progress: { phase: 'completed', currentStep: null },
        actions: [{ type: 'POST_COMMENT', body: 'flaky' }],
      }),
    )
    const executeActions = vi.fn().mockRejectedValue(new Error('gh api down'))

    const summary = await runReviewRecovery({
      repositories: [{ localPath: '/repo' }],
      reviewContextGateway: gateway,
      executeActions,
      now: () => NOW,
      logger: silentLogger(),
      graceWindowMs: 30 * 60 * 1000,
    })

    expect(summary.failed).toBe(1)
    expect(summary.recovered).toBe(0)
    expect(gateway.read('/repo', 'github-owner/repo-3')?.result).toBeUndefined()
  })
})
