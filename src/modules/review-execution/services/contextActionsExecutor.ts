import type { ReviewContext } from '@/modules/review-execution/entities/reviewContext/reviewContext.js'
import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js'
import { GitLabReviewActionCliGateway } from '@/modules/review-execution/interface-adapters/gateways/cli/reviewAction.gitlab.cli.gateway.js'
import { GitHubReviewActionCliGateway } from '@/modules/review-execution/interface-adapters/gateways/cli/reviewAction.github.cli.gateway.js'
import type { ExecutionResult, CommandExecutor } from '@/modules/review-execution/entities/reviewAction/reviewAction.gateway.js'
import type { NoteCommentPostGateway } from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js'
import { executePublicOutput, isPublicOutputAction } from '@/modules/review-execution/services/publicOutputExecutor.js'
import { filterAutoExecutorActions } from '@/modules/platform-integration/services/autoExecutorActionFilter.js'

/**
 * @deprecated Use ReviewContextAction from reviewAction entity instead
 */
export type { ReviewAction as ReviewContextAction }

export type { ExecutionResult, CommandExecutor }

interface Logger {
  info: (obj: object, msg: string) => void
  warn: (obj: object, msg: string) => void
  error: (obj: object, msg: string) => void
  debug: (obj: object, msg: string) => void
}

/**
 * @deprecated Use GitLabReviewActionCliGateway or GitHubReviewActionCliGateway directly
 */
export async function executeActionsFromContext(
  context: ReviewContext,
  localPath: string,
  logger: Logger,
  executor: CommandExecutor,
  baseUrl: string | null = null,
  postGateway: NoteCommentPostGateway | null = null,
): Promise<ExecutionResult> {
  const gatewayContext = {
    projectPath: context.projectPath,
    mrNumber: context.mergeRequestNumber,
    localPath,
    diffMetadata: context.diffMetadata,
    baseUrl,
  }

  const { allowed, dropped } = filterAutoExecutorActions(context.actions as ReviewAction[])

  if (dropped.length > 0) {
    logger.warn(
      { droppedTypes: dropped.map(action => action.type) },
      'Auto executor dropped write-capable actions outside the read+postComment capability set',
    )
  }

  const gateway =
    context.platform === 'gitlab'
      ? new GitLabReviewActionCliGateway(executor)
      : new GitHubReviewActionCliGateway(executor)

  if (postGateway === null) {
    return gateway.execute(allowed, gatewayContext)
  }

  const publicOutputActions = allowed.filter(isPublicOutputAction)
  const remainingActions = allowed.filter(action => !isPublicOutputAction(action))

  await executePublicOutput(
    publicOutputActions,
    { projectPath: context.projectPath, mrNumber: context.mergeRequestNumber },
    postGateway,
  )

  const cliResult = await gateway.execute(remainingActions, gatewayContext)

  return {
    total: allowed.length,
    succeeded: cliResult.succeeded + publicOutputActions.length,
    failed: cliResult.failed,
    skipped: cliResult.skipped,
  }
}
