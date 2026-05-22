import type { BillingStateGateway } from '@/modules/claude-invocation/entities/billingState/billingState.gateway.js';
import type { EnvironmentGateway } from '@/modules/claude-invocation/entities/billingState/environment.gateway.js';
import type {
  ClaudeDispatchFlags,
  ClaudeSessionGateway,
} from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { ClaudeSessionJobType } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type { McpCompletionBridge } from '@/modules/claude-invocation/entities/sessionCompletion/mcpCompletion.gateway.js';
import type { ReviewReportGateway } from '@/modules/claude-invocation/entities/sessionCompletion/reviewReport.gateway.js';
import { planRetry } from '@/modules/claude-invocation/entities/retrySchedule/retrySchedule.valueObject.js';
import { dispatchClaudeSession } from '@/modules/claude-invocation/usecases/dispatchClaudeSession.usecase.js';
import { awaitSessionCompletion } from '@/modules/claude-invocation/usecases/awaitSessionCompletion.usecase.js';
import { retrieveReviewReport } from '@/modules/claude-invocation/usecases/retrieveReviewReport.usecase.js';
import { cleanupClaudeSession } from '@/modules/claude-invocation/usecases/cleanupClaudeSession.usecase.js';

export interface RunClaudeReviewJobInput {
  jobId: string;
  jobType: ClaudeSessionJobType;
  prompt: string;
  flags: ClaudeDispatchFlags;
  localPath: string;
  mergeRequestId: string;
  mergeRequestNumber: number;
  attempt: number;
}

export interface RunClaudeReviewJobDependencies {
  sessionGateway: ClaudeSessionGateway;
  completionBridge: McpCompletionBridge;
  reportGateway: ReviewReportGateway;
  billingState: BillingStateGateway;
  environment: EnvironmentGateway;
  now: () => Date;
  timeoutMs: number;
  pollIntervalMs: number;
}

export type RunClaudeReviewJobResult =
  | { status: 'completed'; reportPath: string; content: string }
  | { status: 'failed'; reason: string }
  | { status: 'retry'; delayMs: number; attempt: number };

export async function runClaudeReviewJob(
  input: RunClaudeReviewJobInput,
  deps: RunClaudeReviewJobDependencies,
): Promise<RunClaudeReviewJobResult> {
  const dispatchResult = await dispatchClaudeSession(
    {
      jobId: input.jobId,
      jobType: input.jobType,
      prompt: input.prompt,
      flags: input.flags,
      localPath: input.localPath,
      mergeRequestId: input.mergeRequestId,
    },
    {
      sessionGateway: deps.sessionGateway,
      environment: deps.environment,
      billingState: deps.billingState,
      now: deps.now,
    },
  );

  if (dispatchResult.status === 'billing-regression-prevented') {
    return { status: 'failed', reason: 'billing-regression-prevented' };
  }

  if (dispatchResult.status === 'paused') {
    return { status: 'failed', reason: 'dispatch-paused' };
  }

  if (dispatchResult.status === 'rate-limited') {
    const retry = planRetry(input.attempt);
    if (retry.status === 'give-up') {
      return { status: 'failed', reason: 'rate-limited-give-up' };
    }
    return { status: 'retry', delayMs: retry.delayMs, attempt: retry.nextAttempt };
  }

  if (dispatchResult.status === 'failed') {
    return { status: 'failed', reason: `dispatch-failed: ${dispatchResult.rawStderr}` };
  }

  const { session } = dispatchResult;

  const completion = await awaitSessionCompletion(
    {
      session,
      timeoutMs: deps.timeoutMs,
      pollIntervalMs: deps.pollIntervalMs,
    },
    {
      sessionGateway: deps.sessionGateway,
      completionBridge: deps.completionBridge,
      now: deps.now,
    },
  );

  await cleanupClaudeSession(
    { sessionId: session.sessionId },
    { sessionGateway: deps.sessionGateway },
  );

  if (completion.source === 'timeout') {
    return { status: 'failed', reason: 'timeout' };
  }

  if (completion.outcome !== 'completed') {
    const reasonSuffix = completion.reason !== null ? `: ${completion.reason}` : '';
    return { status: 'failed', reason: `outcome-${completion.outcome}${reasonSuffix}` };
  }

  const report = retrieveReviewReport(
    {
      session,
      today: deps.now(),
      mergeRequestNumber: input.mergeRequestNumber,
    },
    { reportGateway: deps.reportGateway },
  );

  if (report.status === 'missing') {
    return { status: 'failed', reason: 'report-missing' };
  }

  return { status: 'completed', reportPath: report.path, content: report.content };
}
