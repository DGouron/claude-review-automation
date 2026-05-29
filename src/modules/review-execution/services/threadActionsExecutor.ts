import { execSync } from 'node:child_process'
import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js'
import { GitLabReviewActionCliGateway } from '@/modules/review-execution/interface-adapters/gateways/cli/reviewAction.gitlab.cli.gateway.js'
import { GitHubReviewActionCliGateway } from '@/modules/review-execution/interface-adapters/gateways/cli/reviewAction.github.cli.gateway.js'
import type { ExecutionResult, CommandExecutor, ExecutionContext as GatewayExecutionContext } from '@/modules/review-execution/entities/reviewAction/reviewAction.gateway.js'
import type { NoteCommentPostGateway } from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js'
import { executePublicOutput, isPublicOutputAction } from '@/modules/review-execution/services/publicOutputExecutor.js'

const COMMAND_TIMEOUT_MS = 30000

/**
 * @deprecated Use ReviewAction instead
 */
export type ThreadAction = ReviewAction

export interface ExecutionContext {
  platform: 'gitlab' | 'github'
  projectPath: string
  mrNumber: number
  localPath: string
  diffMetadata?: import('@/modules/review-execution/entities/reviewContext/reviewContext.js').DiffMetadata
}

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
export async function executeThreadActions(
  actions: ThreadAction[],
  context: ExecutionContext,
  _logger: Logger,
  executor: CommandExecutor,
  postGateway: NoteCommentPostGateway | null = null
): Promise<ExecutionResult> {
  const gatewayContext: GatewayExecutionContext = {
    projectPath: context.projectPath,
    mrNumber: context.mrNumber,
    localPath: context.localPath,
    diffMetadata: context.diffMetadata,
    baseUrl: null,
  }

  const gateway =
    context.platform === 'gitlab'
      ? new GitLabReviewActionCliGateway(executor)
      : new GitHubReviewActionCliGateway(executor)

  if (postGateway === null) {
    return gateway.execute(actions, gatewayContext)
  }

  const publicOutputActions = actions.filter(isPublicOutputAction)
  const remainingActions = actions.filter(action => !isPublicOutputAction(action))

  await executePublicOutput(
    publicOutputActions,
    { projectPath: context.projectPath, mrNumber: context.mrNumber },
    postGateway
  )

  const cliResult = await gateway.execute(remainingActions, gatewayContext)

  return {
    total: actions.length,
    succeeded: cliResult.succeeded + publicOutputActions.length,
    failed: cliResult.failed,
    skipped: cliResult.skipped,
  }
}

export const defaultCommandExecutor: CommandExecutor = (
  command: string,
  args: string[],
  cwd: string
): void => {
  execSync(`${command} ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
    cwd,
    encoding: 'utf-8',
    timeout: COMMAND_TIMEOUT_MS,
  })
}
