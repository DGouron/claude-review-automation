import type { ReviewContext } from '@/modules/review-execution/entities/reviewContext/reviewContext.js'
import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js'

const DEFAULT_GRACE_WINDOW_MS = 30 * 60 * 1000

export function shouldRecover(context: ReviewContext): boolean {
  return context.progress.phase === 'completed' && context.actions.length > 0 && !context.result
}

export interface RecoveryLogger {
  info: (obj: object, msg: string) => void
  warn: (obj: object, msg: string) => void
  error: (obj: object, msg: string) => void
}

export interface RecoveryRepository {
  localPath: string
}

export interface RecoverySummary {
  scanned: number
  recovered: number
  backfilled: number
  skipped: number
  failed: number
}

export interface RecoveryDeps {
  repositories: RecoveryRepository[]
  reviewContextGateway: ReviewContextGateway
  executeActions: (context: ReviewContext, localPath: string) => Promise<{ success: boolean }>
  now: () => number
  logger: RecoveryLogger
  graceWindowMs?: number
}

export async function runReviewRecovery(deps: RecoveryDeps): Promise<RecoverySummary> {
  const graceWindowMs = deps.graceWindowMs ?? DEFAULT_GRACE_WINDOW_MS
  const summary: RecoverySummary = {
    scanned: 0,
    recovered: 0,
    backfilled: 0,
    skipped: 0,
    failed: 0,
  }

  for (const repository of deps.repositories) {
    for (const context of deps.reviewContextGateway.listAll(repository.localPath)) {
      summary.scanned += 1

      if (!shouldRecover(context)) {
        summary.skipped += 1
        continue
      }

      const ageMs = deps.now() - new Date(context.createdAt).getTime()
      const isStale = ageMs > graceWindowMs

      if (isStale) {
        finalize(deps.reviewContextGateway, repository.localPath, context, deps.now)
        deps.logger.info(
          { mergeRequestId: context.mergeRequestId, ageMs },
          'Review context backfilled (older than grace window, not replayed)',
        )
        summary.backfilled += 1
        continue
      }

      try {
        const result = await deps.executeActions(context, repository.localPath)
        if (!result.success) {
          summary.failed += 1
          deps.logger.warn(
            { mergeRequestId: context.mergeRequestId },
            'Recovery execution returned non-success',
          )
          continue
        }
        finalize(deps.reviewContextGateway, repository.localPath, context, deps.now)
        deps.logger.info(
          { mergeRequestId: context.mergeRequestId, actionCount: context.actions.length },
          'Review context recovered after restart',
        )
        summary.recovered += 1
      } catch (error) {
        summary.failed += 1
        deps.logger.error(
          {
            mergeRequestId: context.mergeRequestId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Recovery execution failed',
        )
      }
    }
  }

  return summary
}

function finalize(
  gateway: ReviewContextGateway,
  localPath: string,
  context: ReviewContext,
  now: () => number,
): void {
  gateway.setResult(localPath, context.mergeRequestId, {
    blocking: 0,
    warnings: 0,
    suggestions: 0,
    score: 0,
    verdict: 'needs_discussion',
    backfilledAt: new Date(now()).toISOString(),
  })
}
