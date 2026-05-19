# Event Storming — Review Execution

*Date: 2026-03-22*
*Scope: Core review lifecycle — from request to action execution, including MCP progress tracking*

## Domain Events (🟧)

| Event | Trigger | Source file |
|-------|---------|-------------|
| ReviewRequested | Webhook assignment or push followup | `usecases/triggerReview.usecase.ts` |
| ReviewDeduplicated | TriggerReview detects active job | `usecases/triggerReview.usecase.ts` |
| ReviewStarted | Queue picks up job | `frameworks/queue/` |
| ReviewCancelled | User cancels via API | `usecases/cancelReview.usecase.ts` |
| ReviewCompleted | Claude finishes review | `interface-adapters/controllers/webhook/gitlab.controller.ts` |
| ReviewFailed | Claude invocation fails | `interface-adapters/controllers/webhook/gitlab.controller.ts` |
| FollowupRequested | Push on tracked MR with open threads | `usecases/handleReviewRequestPush.usecase.ts` |
| FollowupSkipped | MR not tracked or no followup needed | `usecases/handleReviewRequestPush.usecase.ts` |
| ActionQueued | Claude calls add_action MCP tool | `usecases/mcp/addAction.usecase.ts` |
| AgentStarted | Review agent begins audit | `usecases/mcp/startAgent.usecase.ts` |
| AgentCompleted | Review agent finishes audit | `usecases/mcp/completeAgent.usecase.ts` |
| PhaseChanged | Review workflow transitions phase | `usecases/mcp/setPhase.usecase.ts` |
| ReviewContextCreated | Context file written before Claude invocation | `entities/reviewContext/reviewContext.gateway.ts` |
| ReviewContextDeleted | Cleanup after MR close | `entities/reviewContext/reviewContext.gateway.ts` |

## Commands / Use Cases (🟦)

| Command | Actor | Event produced | Source file |
|---------|-------|----------------|-------------|
| TriggerReview | Webhook / System | ReviewRequested, ReviewDeduplicated | `usecases/triggerReview.usecase.ts` |
| CancelReview | User (API) | ReviewCancelled | `usecases/cancelReview.usecase.ts` |
| HandleReviewRequestPush | Webhook (push) | FollowupRequested, FollowupSkipped | `usecases/handleReviewRequestPush.usecase.ts` |
| GetWorkflow | MCP (Claude) | — (query) | `usecases/mcp/getWorkflow.usecase.ts` |
| StartAgent | MCP (Claude) | AgentStarted | `usecases/mcp/startAgent.usecase.ts` |
| CompleteAgent | MCP (Claude) | AgentCompleted | `usecases/mcp/completeAgent.usecase.ts` |
| SetPhase | MCP (Claude) | PhaseChanged | `usecases/mcp/setPhase.usecase.ts` |
| GetThreads | MCP (Claude) | — (query) | `usecases/mcp/getThreads.usecase.ts` |
| AddAction | MCP (Claude) | ActionQueued | `usecases/mcp/addAction.usecase.ts` |

## Entities (🟨)

| Entity | Responsibility | Files |
|--------|----------------|-------|
| ReviewRequest | State machine for MR/PR lifecycle (`pending-review` → `merged`/`closed`) | `entities/reviewRequest/reviewRequest.entity.ts`, `reviewRequestState.valueObject.ts`, `reviewRequest.guard.ts` |
| ReviewContext | Session data for a single review: threads, actions, agent instructions, diff metadata | `entities/reviewContext/reviewContext.ts`, `reviewContext.schema.ts`, `reviewContext.gateway.ts` |
| ReviewAction | Discriminated union of executable actions (THREAD_RESOLVE, POST_COMMENT, THREAD_REPLY, ADD_LABEL, POST_INLINE_COMMENT, FETCH_THREADS) | `entities/reviewAction/reviewAction.schema.ts`, `reviewAction.ts`, `reviewAction.guard.ts`, `reviewAction.gateway.ts` |
| ReviewScore | Value object: blocking + warnings + suggestions → severity (critical/warning/info/clean) | `entities/review/reviewScore.valueObject.ts` |
| ReviewProgress | Review job progress: agents, phases, overall percentage | `entities/progress/progress.type.ts`, `progress.factory.ts`, `progress.calculator.ts`, `progress.gateway.ts` |
| AgentDefinition | Predefined agent lists for initial and followup reviews | `entities/progress/agentDefinition.type.ts` |
| JobContext | In-memory MCP job context (projectPath, mrNumber) | `entities/job/jobContext.gateway.ts` |

## Policies and Business Rules (🟪)

| Rule | Description | Source file |
|------|-------------|-------------|
| Deduplication | A review is not triggered if an active job already exists for the same MR | `usecases/triggerReview.usecase.ts` |
| Followup eligibility | Push triggers followup only if MR is `pending-fix` OR (`pending-approval` with warnings), and `lastPushAt > lastReviewAt` | `usecases/tracking/checkFollowupNeeded.usecase.ts` |
| ReviewRequest state transitions | Only valid transitions allowed (e.g., `pending-review` → `pending-fix`, never `merged` → anything) | `entities/reviewRequest/reviewRequestState.valueObject.ts` |
| ReviewAction validation | Each action type requires specific fields (e.g., THREAD_RESOLVE needs threadId, POST_INLINE_COMMENT needs filePath+line) | `usecases/mcp/addAction.usecase.ts` |
| ReviewPhase ordering | Phases progress: `initializing` → `agents-running` → `synthesizing` → `publishing` → `completed` | `entities/progress/progress.type.ts` |
| Webhook signature verification | GitLab HMAC-256 / GitHub HMAC-SHA256 signature must be valid | `security/verifier.ts` |
| ReviewRequest guard | Webhook payload validated with Zod schema before processing | `entities/gitlab/gitlabMergeRequestEvent.guard.ts`, `entities/github/githubPullRequestEvent.guard.ts` |

## Presenters (🟩)

| Presenter | Data exposed | File |
|-----------|-------------|------|
| JobStatusPresenter | statusLabel, statusColor, progressPercent, elapsedTime, jobTypeLabel | `interface-adapters/presenters/jobStatus.presenter.ts` |
| ReviewContextProgressPresenter | Review context progress for dashboard UI | `interface-adapters/presenters/reviewContextProgress.presenter.ts` |
| ReviewListPresenter | Review list for dashboard display | `interface-adapters/presenters/reviewList.presenter.ts` |

## Gateways and External Systems (⬜)

| System | Interaction | Gateway contract | Implementation |
|--------|-------------|-----------------|----------------|
| File System | Review context JSON persistence | `entities/reviewContext/reviewContext.gateway.ts` | `interface-adapters/gateways/reviewContext.fileSystem.gateway.ts` |
| File System | Review file storage | `entities/review/reviewFile.gateway.ts` | `interface-adapters/gateways/reviewFile.gateway.ts` |
| GitLab CLI | Execute review actions (resolve, comment, label) | `entities/reviewAction/reviewAction.gateway.ts` | `interface-adapters/gateways/cli/reviewAction.gitlab.cli.gateway.ts` |
| GitHub CLI | Execute review actions | `entities/reviewAction/reviewAction.gateway.ts` | `interface-adapters/gateways/cli/reviewAction.github.cli.gateway.ts` |
| In-memory | MCP job context | `entities/job/jobContext.gateway.ts` | `interface-adapters/gateways/jobContext.memory.gateway.ts` |
| In-memory | Review progress tracking | `entities/progress/progress.gateway.ts` | (in-memory implementation) |
| p-queue | Job queuing with concurrency control | `ReviewQueuePort` (in triggerReview) | `frameworks/queue/` |
| Claude | AI review invocation | (callback in controller) | `frameworks/claude/claudeInvoker.ts` |

## Relations with other Bounded Contexts

| Related BC | Pattern (Vaughn Vernon) | Direction | Detail |
|-----------|------------------------|-----------|--------|
| Platform Integration | Anti-Corruption Layer | Platform → Review | Webhook controllers transform GitLab/GitHub events into ReviewRequest domain concepts |
| Tracking | Customer-Supplier | Review → Tracking | Review Execution supplies review completion data; Tracking consumes it for lifecycle state |
| Statistics & Insights | Published Language | Review → Stats | ReviewScore and review files are consumed by Stats for aggregation |
| Data Lifecycle | Conformist | Cleanup → Review | Cleanup uses ReviewFileGateway contract defined by Review domain |

## Ubiquitous Language

| Term | Definition in this BC | Equivalent term in other BCs |
|------|----------------------|------------------------------|
| ReviewRequest | A code review request with state machine | TrackedMr in Tracking BC |
| ReviewAction | Atomic executable action on a platform | — |
| ReviewContext | Session state file for one review run | — |
| ReviewJob | Queued unit of work for one review | — |
| Agent | Specialized Claude audit (clean-architecture, ddd, solid, testing, code-quality) | — |
| FollowupReview | Subsequent review after author fixes | — |

## Hot Spots (🩷)

| Problem | Severity | Detail |
|---------|----------|--------|
| Fat webhook controllers | 🟠 | `gitlab.controller.ts` and `github.controller.ts` orchestrate 6+ use cases, handle context creation, action execution, stats parsing — too many responsibilities for a controller |
| Strangler Fig in progress | 🟡 | `reviewContextAction.schema.ts` re-exports from `reviewAction.schema.ts` with "will be removed" comment — migration incomplete |
| Claude invocation not abstracted | 🟡 | Claude is invoked via callback in controllers, not through a dedicated gateway contract — makes testing harder |
| ReviewContext as shared mutable state | 🟠 | The context JSON file serves as coordination between Claude invocation and post-review action execution — implicit contract |
