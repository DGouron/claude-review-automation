import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { verifyGitHubSignature, getGitHubEventType } from '@/security/verifier.js';
import { filterGitHubEvent, filterGitHubLabelEvent, filterGitHubPrClose, filterGitHubPrUpdate } from '@/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.js';
import { gitHubPullRequestEventGuard } from '@/modules/platform-integration/entities/github/githubPullRequestEvent.guard.js';
import { findRepositoryByRemoteUrl, type RepositoryConfig } from '@/config/loader.js';
import {
  enqueueReview,
  createJobId,
  updateJobProgress,
  cancelJob,
  type ReviewJob,
} from '@/frameworks/queue/pQueueAdapter.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/interface-adapters/gateways/reviewRequestTracking.gateway.js';
import type { TrackAssignmentUseCase } from '@/modules/tracking/usecases/tracking/trackAssignment.usecase.js';
import type { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import type { RecordPushUseCase } from '@/modules/tracking/usecases/tracking/recordPush.usecase.js';
import type { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import type { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';
import type { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import { parseReviewOutput } from '@/modules/statistics-insights/services/statsService.js';
import { parseThreadActions } from '@/modules/review-execution/services/threadActionsParser.js';
import { executeThreadActions, defaultCommandExecutor } from '@/modules/review-execution/services/threadActionsExecutor.js';
import { executeActionsFromContext } from '@/modules/review-execution/services/contextActionsExecutor.js';
import { invokeClaudeReview, sendNotification } from '@/claude/invoker.js';
import type { ClaudeInvokerDependencies } from '@/frameworks/claude/claudeInvoker.js';
import { startWatchingReviewContext, stopWatchingReviewContext } from '@/main/websocket.js';
import { loadProjectConfig, getProjectAgents, getFollowupAgents, getProjectLanguage } from '@/config/projectConfig.js';
import { DEFAULT_AGENTS, DEFAULT_FOLLOWUP_AGENTS } from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import type { DiffMetadataFetchGateway } from '@/modules/platform-integration/entities/diffMetadata/diffMetadata.gateway.js';
import type { DiffStatsFetchGateway } from '@/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.js';
import type { EnforceBudgetUseCase } from '@/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.js';
import type { BudgetExceededPayload } from '@/main/websocket.js';
import type { RemoveResult, WorktreeIdentity } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export type RemoveWorktreeAction = (input: {
  identity: WorktreeIdentity;
  sourceCheckoutPath: string;
}) => Promise<RemoveResult>;

export interface GitHubWebhookDependencies {
  reviewContextGateway: ReviewContextGateway;
  threadFetchGateway: ThreadFetchGateway;
  diffMetadataFetchGateway: DiffMetadataFetchGateway;
  diffStatsFetchGateway: DiffStatsFetchGateway;
  trackAssignment: TrackAssignmentUseCase;
  recordCompletion: RecordReviewCompletionUseCase;
  recordPush: RecordPushUseCase;
  transitionState: TransitionStateUseCase;
  checkFollowupNeeded: CheckFollowupNeededUseCase;
  syncThreads: SyncThreadsUseCase;
  enforceBudget: Pick<EnforceBudgetUseCase, 'execute'>;
  broadcastBudgetExceeded: (payload: BudgetExceededPayload) => void;
  getRepositories: () => RepositoryConfig[];
  claudeInvokerDeps?: ClaudeInvokerDependencies;
  removeWorktree: RemoveWorktreeAction;
}

function listEnabledLocalPaths(getRepositories: () => RepositoryConfig[]): string[] {
  return getRepositories()
    .filter((repository) => repository.enabled)
    .map((repository) => repository.localPath);
}

export async function handleGitHubWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  logger: Logger,
  trackingGateway: ReviewRequestTrackingGateway,
  deps: GitHubWebhookDependencies
): Promise<void> {
  const { trackAssignment, recordCompletion, recordPush, checkFollowupNeeded, syncThreads } = deps;
  // 1. Verify signature
  const verification = verifyGitHubSignature(request);
  if (!verification.valid) {
    logger.warn({ error: verification.error }, 'GitHub signature verification failed');
    reply.status(401).send({ error: verification.error });
    return;
  }

  // 2. Check event type
  const eventType = getGitHubEventType(request);
  if (eventType !== 'pull_request') {
    logger.debug({ eventType }, 'Ignoring non-PR event');
    reply.status(200).send({ status: 'ignored', reason: 'Not a PR event' });
    return;
  }

  // 3. Parse and validate event payload
  const parseResult = gitHubPullRequestEventGuard.safeParse(request.body);
  if (!parseResult.success) {
    logger.warn({ errors: parseResult.error }, 'Invalid GitHub webhook payload');
    reply.status(400).send({ error: 'Invalid webhook payload' });
    return;
  }
  const event = parseResult.data;

  // 3a. Check if PR was closed - clean up tracking and cancel any running job
  const closeResult = filterGitHubPrClose(event);
  if (closeResult.shouldProcess) {
    const projectPath = closeResult.projectPath;
    const prNumber = closeResult.mergeRequestNumber;
    const mrId = `github-${projectPath}-${prNumber}`;

    // Find repo config
    const repoConfig = findRepositoryByRemoteUrl(event.repository.clone_url);
    if (repoConfig) {
      // Cancel any running job for this PR
      const jobId = createJobId('github', projectPath, prNumber);
      const cancelled = cancelJob(jobId);

      // Archive the PR from tracking
      const archived = trackingGateway.archive(repoConfig.localPath, mrId);

      // Delete review context file
      const contextDeleted = deps.reviewContextGateway.delete(repoConfig.localPath, mrId);

      try {
        const worktreeRemoval = await deps.removeWorktree({
          identity: { platform: 'github', projectPath, mrNumber: prNumber },
          sourceCheckoutPath: repoConfig.localPath,
        });
        if (worktreeRemoval.status === 'failed') {
          logger.warn(
            { prNumber, repo: projectPath, warning: worktreeRemoval.warning },
            'removeWorktree failed on close'
          );
        }
      } catch (error) {
        logger.warn(
          {
            prNumber,
            repo: projectPath,
            error: error instanceof Error ? error.message : String(error),
          },
          'removeWorktree threw on close'
        );
      }

      logger.info(
        {
          prNumber,
          repo: projectPath,
          jobCancelled: cancelled,
          trackingArchived: archived,
          contextDeleted: contextDeleted.deleted,
        },
        'PR closed - cleaned up tracking, cancelled job, deleted context'
      );

      reply.status(200).send({
        status: 'cleaned',
        prNumber,
        jobCancelled: cancelled,
        trackingArchived: archived,
      });
      return;
    }

    // No repo config, just acknowledge
    logger.info({ prNumber, repo: projectPath }, 'PR closed but repo not configured');
    reply.status(200).send({ status: 'ignored', reason: 'PR closed, repo not configured' });
    return;
  }

  // 3b. Filter for review request OR label trigger
  let filterResult = filterGitHubEvent(event);

  // If not a review request, check for label trigger
  if (!filterResult.shouldProcess) {
    filterResult = filterGitHubLabelEvent(event);
  }

  logger.info(
    {
      repo: event.repository?.full_name,
      prNumber: event.pull_request?.number,
      action: event.action,
      shouldProcess: filterResult.shouldProcess,
      reason: filterResult.reason,
    },
    'GitHub PR event received'
  );

  if (!filterResult.shouldProcess) {
    const updateResult = filterGitHubPrUpdate(event);
    logger.debug(
      { updateResult, action: event.action },
      'Checking for followup review'
    );

    if (updateResult.shouldProcess && updateResult.isFollowup) {
      const updateRepoConfig = findRepositoryByRemoteUrl(event.repository.clone_url);
      if (updateRepoConfig) {
        const mr = recordPush.execute({
          projectPath: updateRepoConfig.localPath,
          mrNumber: updateResult.mergeRequestNumber,
          platform: 'github',
        });
        logger.info(
          {
            prNumber: updateResult.mergeRequestNumber,
            mrFound: !!mr,
            mrState: mr?.state,
            lastPushAt: mr?.lastPushAt,
            lastReviewAt: mr?.lastReviewAt,
          },
          'Push event recorded'
        );

        const needsFollowup = mr && checkFollowupNeeded.execute({
          projectPath: updateRepoConfig.localPath,
          mrNumber: updateResult.mergeRequestNumber,
          platform: 'github',
        });
        logger.info({ needsFollowup, mrState: mr?.state }, 'Followup check result');

        if (needsFollowup) {
          if (mr.autoFollowup === false) {
            logger.info(
              { prNumber: updateResult.mergeRequestNumber, project: updateResult.projectPath },
              'Auto-followup disabled for this PR, skipping'
            );
            reply.status(200).send({ status: 'ignored', reason: 'Auto-followup disabled' });
            return;
          }

          logger.info(
            { prNumber: updateResult.mergeRequestNumber, project: updateResult.projectPath },
            'Auto-triggering followup review after push'
          );

          const projectConfig = loadProjectConfig(updateRepoConfig.localPath);
          const skill = projectConfig?.reviewFollowupSkill || 'review-followup';

          const followupJobId = createJobId('github-followup', updateResult.projectPath, updateResult.mergeRequestNumber);
          const followupJob: ReviewJob = {
            id: followupJobId,
            platform: 'github',
            projectPath: updateResult.projectPath,
            localPath: updateRepoConfig.localPath,
            mrNumber: updateResult.mergeRequestNumber,
            skill,
            mrUrl: updateResult.mergeRequestUrl,
            sourceBranch: updateResult.sourceBranch,
            targetBranch: updateResult.targetBranch,
            jobType: 'followup',
          };

          const followupBudgetDecision = await deps.enforceBudget.execute({
            localPaths: listEnabledLocalPaths(deps.getRepositories),
          });
          if (!followupBudgetDecision.accepted) {
            logger.warn(
              {
                prNumber: followupJob.mrNumber,
                limitUsd: followupBudgetDecision.status.limitUsd,
                consumedUsd: followupBudgetDecision.status.consumedUsd,
              },
              'Budget exceeded, followup not enqueued'
            );
            deps.broadcastBudgetExceeded({
              mrNumber: followupJob.mrNumber,
              platform: 'github',
              projectPath: followupJob.projectPath,
              limitUsd: followupBudgetDecision.status.limitUsd,
              consumedUsd: followupBudgetDecision.status.consumedUsd,
            });
            reply.status(200).send({ status: 'rejected', reason: 'budget-exceeded' });
            return;
          }

          await enqueueReview(followupJob, async (j, signal) => {
            sendNotification('Review followup démarrée', `PR #${j.mrNumber} - ${j.projectPath}`, logger);

            const mergeRequestId = `github-${j.projectPath}-${j.mrNumber}`;
            const contextGateway = deps.reviewContextGateway;
            const threadFetchGw = deps.threadFetchGateway;
            const diffMetadataFetchGw = deps.diffMetadataFetchGateway;

            try {
              const threads = threadFetchGw.fetchThreads(j.projectPath, j.mrNumber);
              let diffMetadata: import('@/modules/review-execution/entities/reviewContext/reviewContext.js').DiffMetadata | undefined;
              try {
                diffMetadata = diffMetadataFetchGw.fetchDiffMetadata(j.projectPath, j.mrNumber);
              } catch (error) {
                logger.warn(
                  { prNumber: j.mrNumber, error: error instanceof Error ? error.message : String(error) },
                  'Failed to fetch diff metadata for followup, inline comments will be skipped'
                );
              }
              const followupAgentsList = getFollowupAgents(j.localPath) ?? DEFAULT_FOLLOWUP_AGENTS;
              contextGateway.create({
                localPath: j.localPath,
                mergeRequestId,
                platform: 'github',
                projectPath: j.projectPath,
                mergeRequestNumber: j.mrNumber,
                threads,
                agents: followupAgentsList,
                diffMetadata,
              });
              logger.info(
                { prNumber: j.mrNumber, threadsCount: threads.length, hasDiffMetadata: !!diffMetadata },
                'Review context file created with threads for followup'
              );

              startWatchingReviewContext(j.id, j.localPath, mergeRequestId);
              logger.info({ prNumber: j.mrNumber }, 'Started watching review context for live progress');
            } catch (error) {
              logger.warn(
                { prNumber: j.mrNumber, error: error instanceof Error ? error.message : String(error) },
                'Failed to create review context file for followup, continuing without it'
              );
            }

            const result = await invokeClaudeReview(j, logger, (progress, progressEvent) => {
              updateJobProgress(j.id, progress, progressEvent);

              const runningAgent = progress.agents.find(a => a.status === 'running');
              const completedAgents = progress.agents
                .filter(a => a.status === 'completed')
                .map(a => a.name);

              contextGateway.updateProgress(j.localPath, mergeRequestId, {
                phase: progress.currentPhase,
                currentStep: runningAgent?.name ?? null,
                stepsCompleted: completedAgents,
              });
            }, signal, deps.claudeInvokerDeps);

            stopWatchingReviewContext(mergeRequestId);

            if (result.success) {
              const parsed = parseReviewOutput(result.stdout);

              let threadResolveCount = 0;

              const reviewContext = contextGateway.read(j.localPath, mergeRequestId);
              if (reviewContext && reviewContext.actions.length > 0) {
                threadResolveCount = reviewContext.actions.filter(a => a.type === 'THREAD_RESOLVE').length;
                const contextActionResult = await executeActionsFromContext(
                  reviewContext,
                  j.localPath,
                  logger,
                  defaultCommandExecutor,
                );
                logger.info(
                  { ...contextActionResult, threadResolveCount, prNumber: j.mrNumber },
                  'Actions executed from context file for followup'
                );
              } else {
                const threadActions = parseThreadActions(result.stdout);
                if (threadActions.length > 0) {
                  threadResolveCount = threadActions.filter(a => a.type === 'THREAD_RESOLVE').length;
                  const actionResult = await executeThreadActions(
                    threadActions,
                    {
                      platform: 'github',
                      projectPath: j.projectPath,
                      mrNumber: j.mrNumber,
                      localPath: j.localPath,
                    },
                    logger,
                    defaultCommandExecutor
                  );
                  logger.info(
                    { ...actionResult, threadResolveCount, prNumber: j.mrNumber },
                    'Thread actions executed from stdout markers for followup (fallback)'
                  );
                }
              }

              const mrId = `github-${j.projectPath}-${j.mrNumber}`;
              const updatedMr = syncThreads.execute({ projectPath: j.localPath, mrId });

              let followupDiffStats = null;
              try {
                followupDiffStats = deps.diffStatsFetchGateway.fetchDiffStats(j.projectPath, j.mrNumber);
              } catch {
                logger.warn({ prNumber: j.mrNumber }, 'Failed to fetch diff stats for followup');
              }

              recordCompletion.execute({
                projectPath: j.localPath,
                mrId,
                reviewData: {
                  type: 'followup',
                  durationMs: result.durationMs,
                  score: parsed.score,
                  blocking: parsed.blocking,
                  warnings: parsed.warnings,
                  suggestions: parsed.suggestions,
                  threadsOpened: 0,
                  threadsClosed: threadResolveCount,
                  diffStats: followupDiffStats,
                },
              });
              logger.info(
                {
                  prNumber: j.mrNumber,
                  score: parsed.score,
                  blocking: parsed.blocking,
                  warnings: parsed.warnings,
                  suggestions: parsed.suggestions,
                  durationMs: result.durationMs,
                  openThreads: updatedMr?.openThreads,
                  state: updatedMr?.state,
                },
                'Followup stats recorded and threads synced'
              );

              sendNotification('Review followup terminée', `PR #${j.mrNumber} - ${j.projectPath}`, logger);
            } else if (!result.cancelled) {
              sendNotification('Review followup échouée', `PR #${j.mrNumber} - Code ${result.exitCode}`, logger);
              throw new Error(`Followup review failed with exit code ${result.exitCode}`);
            }
          });

          reply.status(202).send({
            status: 'followup-queued',
            jobId: followupJobId,
            prNumber: updateResult.mergeRequestNumber,
          });
          return;
        }
      }
    }

    reply.status(200).send({ status: 'ignored', reason: filterResult.reason });
    return;
  }

  // 4. Find repository configuration
  const repoConfig = findRepositoryByRemoteUrl(event.repository.clone_url);
  if (!repoConfig) {
    logger.warn(
      { cloneUrl: event.repository.clone_url },
      'Projet non configuré'
    );
    reply.status(200).send({
      status: 'ignored',
      reason: 'Repository not configured',
    });
    return;
  }

  // 5. Track PR assignment with user info
  // Use PR assignee (actual owner), not webhook sender (who requested the review)
  const prTitle = event.pull_request?.title || `PR #${filterResult.mergeRequestNumber}`;
  const prAssignee = event.pull_request?.assignees?.[0];
  const assignedBy = {
    username: prAssignee?.login || event.sender?.login || 'unknown',
    displayName: prAssignee?.login || event.sender?.login,
  };

  trackAssignment.execute({
    projectPath: repoConfig.localPath,
    mrInfo: {
      mrNumber: filterResult.mergeRequestNumber,
      title: prTitle,
      url: filterResult.mergeRequestUrl,
      project: filterResult.projectPath,
      platform: 'github',
      sourceBranch: filterResult.sourceBranch,
      targetBranch: filterResult.targetBranch,
    },
    assignedBy,
  });

  logger.info(
    { prNumber: filterResult.mergeRequestNumber, assignedBy: assignedBy.username },
    'PR tracked for review'
  );

  // 6. Create and enqueue job
  const jobId = createJobId('github', filterResult.projectPath, filterResult.mergeRequestNumber);
  const job: ReviewJob = {
    id: jobId,
    platform: 'github',
    projectPath: filterResult.projectPath,
    localPath: repoConfig.localPath,
    mrNumber: filterResult.mergeRequestNumber,
    skill: repoConfig.skill,
    mrUrl: filterResult.mergeRequestUrl,
    sourceBranch: filterResult.sourceBranch,
    targetBranch: filterResult.targetBranch,
    jobType: 'review',
    language: getProjectLanguage(repoConfig.localPath),
    title: prTitle,
    description: event.pull_request?.body,
    assignedBy,
  };

  const budgetDecision = await deps.enforceBudget.execute({
    localPaths: listEnabledLocalPaths(deps.getRepositories),
  });
  if (!budgetDecision.accepted) {
    logger.warn(
      {
        mrNumber: job.mrNumber,
        limitUsd: budgetDecision.status.limitUsd,
        consumedUsd: budgetDecision.status.consumedUsd,
      },
      'Budget exceeded, review not enqueued'
    );
    deps.broadcastBudgetExceeded({
      mrNumber: job.mrNumber,
      platform: 'github',
      projectPath: job.projectPath,
      limitUsd: budgetDecision.status.limitUsd,
      consumedUsd: budgetDecision.status.consumedUsd,
    });
    reply.status(200).send({ status: 'rejected', reason: 'budget-exceeded' });
    return;
  }

  const enqueued = await enqueueReview(job, async (j, signal) => {
    // Send start notification
    sendNotification(
      'Review démarrée',
      `PR #${j.mrNumber} - ${j.projectPath}`,
      logger
    );

    // Create review context file with pre-fetched threads and diff metadata
    const mergeRequestId = `github-${j.projectPath}-${j.mrNumber}`;
    const { reviewContextGateway: contextGateway, threadFetchGateway, diffMetadataFetchGateway } = deps;

    try {
      const threads = threadFetchGateway.fetchThreads(j.projectPath, j.mrNumber);
      let diffMetadata: import('@/modules/review-execution/entities/reviewContext/reviewContext.js').DiffMetadata | undefined;
      try {
        diffMetadata = diffMetadataFetchGateway.fetchDiffMetadata(j.projectPath, j.mrNumber);
      } catch (error) {
        logger.warn(
          { prNumber: j.mrNumber, error: error instanceof Error ? error.message : String(error) },
          'Failed to fetch diff metadata, inline comments will be skipped'
        );
      }
      const reviewAgentsList = getProjectAgents(j.localPath) ?? DEFAULT_AGENTS;
      contextGateway.create({
        localPath: j.localPath,
        mergeRequestId,
        platform: 'github',
        projectPath: j.projectPath,
        mergeRequestNumber: j.mrNumber,
        threads,
        agents: reviewAgentsList,
        diffMetadata,
      });
      logger.info(
        { prNumber: j.mrNumber, threadsCount: threads.length, hasDiffMetadata: !!diffMetadata },
        'Review context file created with threads'
      );

      startWatchingReviewContext(j.id, j.localPath, mergeRequestId);
      logger.info({ prNumber: j.mrNumber }, 'Started watching review context for live progress');
    } catch (error) {
      logger.warn(
        { prNumber: j.mrNumber, error: error instanceof Error ? error.message : String(error) },
        'Failed to create review context file, continuing without it'
      );
    }

    // Invoke Claude with progress tracking and cancellation support
    const result = await invokeClaudeReview(j, logger, (progress, event) => {
      updateJobProgress(j.id, progress, event);

      // Also update the review context file for file-based progress tracking
      const runningAgent = progress.agents.find(a => a.status === 'running');
      const completedAgents = progress.agents
        .filter(a => a.status === 'completed')
        .map(a => a.name);

      contextGateway.updateProgress(j.localPath, mergeRequestId, {
        phase: progress.currentPhase,
        currentStep: runningAgent?.name ?? null,
        stepsCompleted: completedAgents,
      });
    }, signal, deps.claudeInvokerDeps);

    // Stop watching context file (auto-stops on completion, but explicit stop for error cases)
    stopWatchingReviewContext(mergeRequestId);

    // Send completion notification and record stats
    if (result.cancelled) {
      sendNotification(
        'Review annulée',
        `PR #${j.mrNumber} - ${j.projectPath}`,
        logger
      );
    } else if (result.success) {
      // Parse review output for stats
      const parsed = parseReviewOutput(result.stdout);

      // Execute thread actions from stdout markers (backward compatibility)
      const threadActions = parseThreadActions(result.stdout);
      if (threadActions.length > 0) {
        const actionResult = await executeThreadActions(
          threadActions,
          {
            platform: 'github',
            projectPath: j.projectPath,
            mrNumber: j.mrNumber,
            localPath: j.localPath,
          },
          logger,
          defaultCommandExecutor
        );
        logger.info(
          { ...actionResult, prNumber: j.mrNumber },
          'Thread actions executed from stdout markers'
        );
      }

      // Execute actions from context file (new mechanism)
      const reviewContext = contextGateway.read(j.localPath, mergeRequestId);
      if (reviewContext && reviewContext.actions.length > 0) {
        const contextActionResult = await executeActionsFromContext(
          reviewContext,
          j.localPath,
          logger,
          defaultCommandExecutor
        );
        logger.info(
          { ...contextActionResult, prNumber: j.mrNumber },
          'Actions executed from context file'
        );
      }

      let reviewDiffStats = null;
      try {
        reviewDiffStats = deps.diffStatsFetchGateway.fetchDiffStats(j.projectPath, j.mrNumber);
      } catch {
        logger.warn({ prNumber: j.mrNumber }, 'Failed to fetch diff stats for review');
      }

      recordCompletion.execute({
        projectPath: j.localPath,
        mrId: `github-${j.projectPath}-${j.mrNumber}`,
        reviewData: {
          type: 'review',
          durationMs: result.durationMs,
          score: parsed.score,
          blocking: parsed.blocking,
          warnings: parsed.warnings,
          suggestions: parsed.suggestions,
          threadsOpened: parsed.blocking,
          diffStats: reviewDiffStats,
        },
      });

      logger.info(
        {
          prNumber: j.mrNumber,
          score: parsed.score,
          blocking: parsed.blocking,
          warnings: parsed.warnings,
          suggestions: parsed.suggestions,
          durationMs: result.durationMs,
        },
        'Review stats recorded'
      );

      sendNotification(
        'Review terminée',
        `PR #${j.mrNumber} - ${j.projectPath}`,
        logger
      );
    } else {
      sendNotification(
        'Review échouée',
        `PR #${j.mrNumber} - Code ${result.exitCode}`,
        logger
      );
    }
  });

  if (enqueued) {
    reply.status(202).send({
      status: 'queued',
      jobId,
      prNumber: filterResult.mergeRequestNumber,
    });
  } else {
    reply.status(200).send({
      status: 'deduplicated',
      jobId,
      reason: 'Review already in progress or recently completed',
    });
  }
}
