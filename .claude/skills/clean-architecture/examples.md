# Clean Architecture Examples

Concrete examples drawn from the ReviewFlow project.

---

## Entity (Value Object)

```typescript
// entities/review/reviewScore.valueObject.ts
import { z } from 'zod';

export const ReviewScoreSchema = z.object({
  blocking: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  suggestions: z.number().int().nonnegative(),
});

export type ReviewScoreProps = z.infer<typeof ReviewScoreSchema>;

export type Severity = 'critical' | 'warning' | 'info' | 'clean';

export class ReviewScore {
  private constructor(private readonly props: ReviewScoreProps) {}

  static create(props: ReviewScoreProps): ReviewScore {
    const validated = ReviewScoreSchema.parse(props);
    return new ReviewScore(validated);
  }

  static zero(): ReviewScore {
    return new ReviewScore({ blocking: 0, warnings: 0, suggestions: 0 });
  }

  get severity(): Severity {
    if (this.blocking > 0) return 'critical';
    if (this.warnings > 0) return 'warning';
    if (this.suggestions > 0) return 'info';
    return 'clean';
  }

  get hasBlockingIssues(): boolean {
    return this.blocking > 0;
  }

  add(other: ReviewScore): ReviewScore {
    return new ReviewScore({
      blocking: this.blocking + other.blocking,
      warnings: this.warnings + other.warnings,
      suggestions: this.suggestions + other.suggestions,
    });
  }
}
```

---

## Use Case

```typescript
// usecases/triggerReview.usecase.ts
import type { Logger } from 'pino';
import type { ReviewJob } from '@/frameworks/queue/pQueueAdapter.js';
import type { ReviewRequestTrackingGateway } from '@/interface-adapters/gateways/reviewRequestTracking.gateway.js';

export interface TriggerReviewParams {
  platform: Platform;
  projectPath: string;
  localPath: string;
  reviewRequestNumber: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  mrUrl: string;
  skill: string;
  jobType?: 'review' | 'followup';
}

export type TriggerReviewResult =
  | { status: 'success'; jobId: string }
  | { status: 'deduplicated'; reason: string }
  | { status: 'failed'; reason: string };

export interface ReviewQueuePort {
  hasActiveJob(jobId: string): boolean;
  enqueue(job: ReviewJob): boolean;
  createJobId(platform: string, projectPath: string, mrNumber: number): string;
}

export interface TriggerReviewDependencies {
  queuePort: ReviewQueuePort;
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  logger: Logger;
}

export function triggerReview(
  params: TriggerReviewParams,
  deps: TriggerReviewDependencies
): TriggerReviewResult {
  const { queuePort, reviewRequestTrackingGateway, logger } = deps;

  const jobId = queuePort.createJobId(params.platform, params.projectPath, params.reviewRequestNumber);

  if (queuePort.hasActiveJob(jobId)) {
    logger.info({ jobId }, 'Review already in progress, deduplicating');
    return { status: 'deduplicated', reason: 'Review already in progress' };
  }

  const enqueued = queuePort.enqueue({ id: jobId, ...params } as ReviewJob);
  if (!enqueued) {
    return { status: 'failed', reason: 'Queue full or job rejected' };
  }

  reviewRequestTrackingGateway.recordPush(params.localPath, params.reviewRequestNumber, params.platform);
  return { status: 'success', jobId };
}
```

---

## Port (Interface / Gateway)

```typescript
// entities/reviewContext/reviewContext.gateway.ts
import type { ReviewContext, CreateReviewContextInput, CreateReviewContextResult, ReviewContextProgress } from './reviewContext.js';
import type { ReviewContextAction, ReviewContextResult } from './reviewContextAction.schema.js';

export interface UpdateResult {
  success: boolean;
}

export interface ReviewContextGateway {
  create(input: CreateReviewContextInput): CreateReviewContextResult;
  read(localPath: string, mergeRequestId: string): ReviewContext | null;
  exists(localPath: string, mergeRequestId: string): boolean;
  appendAction(localPath: string, mergeRequestId: string, action: ReviewContextAction): UpdateResult;
  updateProgress(localPath: string, mergeRequestId: string, progress: ReviewContextProgress): UpdateResult;
  setResult(localPath: string, mergeRequestId: string, result: ReviewContextResult): UpdateResult;
}
```

---

## Gateway Implementation (Infrastructure)

```typescript
// interface-adapters/gateways/reviewContext.fileSystem.gateway.ts
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { ReviewContextGateway, UpdateResult } from '@/entities/reviewContext/reviewContext.gateway.js';
import type { ReviewContext, CreateReviewContextInput, CreateReviewContextResult } from '@/entities/reviewContext/reviewContext.js';

export class ReviewContextFileSystemGateway implements ReviewContextGateway {
  getFilePath(localPath: string, mergeRequestId: string): string {
    return join(localPath, '.claude', 'reviews', 'logs', `${mergeRequestId}.json`);
  }

  create(input: CreateReviewContextInput): CreateReviewContextResult {
    const filePath = this.getFilePath(input.localPath, input.mergeRequestId);
    mkdirSync(dirname(filePath), { recursive: true });

    const content: ReviewContext = {
      version: '1.0',
      mergeRequestId: input.mergeRequestId,
      platform: input.platform,
      projectPath: input.projectPath,
      mergeRequestNumber: input.mergeRequestNumber,
      createdAt: new Date().toISOString(),
      threads: input.threads ?? [],
      actions: [],
      progress: { phase: 'pending', currentStep: null },
    };

    writeFileSync(filePath, JSON.stringify(content, null, 2));
    return { success: true, filePath };
  }

  read(localPath: string, mergeRequestId: string): ReviewContext | null {
    const filePath = this.getFilePath(localPath, mergeRequestId);
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ReviewContext;
  }
}
```

---

## Presenter

```typescript
// interface-adapters/presenters/reviewList.presenter.ts
import type { JobStatus } from '@/frameworks/queue/pQueueAdapter.js';
import type { JobStatusPresenter, JobStatusViewModel } from './jobStatus.presenter.js';

export interface ReviewListViewModel {
  activeJobs: JobStatusViewModel[];
  recentJobs: JobStatusViewModel[];
  activeCount: number;
  recentCount: number;
  totalCount: number;
  isEmpty: boolean;
  emptyMessage: string;
  showActive: boolean;
  showRecent: boolean;
}

export class ReviewListPresenter {
  constructor(private jobPresenter: JobStatusPresenter) {}

  present(active: JobStatus[], recent: JobStatus[]): ReviewListViewModel {
    const activeJobs = active.map(job => this.jobPresenter.present(job));
    const recentJobs = recent.map(job => this.jobPresenter.present(job));
    const activeCount = activeJobs.length;
    const recentCount = recentJobs.length;
    const totalCount = activeCount + recentCount;

    return {
      activeJobs,
      recentJobs,
      activeCount,
      recentCount,
      totalCount,
      isEmpty: totalCount === 0,
      emptyMessage: 'No active reviews',
      showActive: activeCount > 0,
      showRecent: recentCount > 0,
    };
  }
}
```

---

## Guard (Boundary Validation)

```typescript
// entities/reviewContext/reviewContextAction.guard.ts
import { z } from 'zod';
import { createGuard } from '@/shared/foundation/guard.base.js';
import { reviewContextActionSchema, type ReviewContextAction } from './reviewContextAction.schema.js';

export const reviewContextActionGuard = createGuard(reviewContextActionSchema);
export const reviewContextActionsGuard = createGuard(z.array(reviewContextActionSchema));

export function parseReviewContextAction(data: unknown): ReviewContextAction {
  return reviewContextActionGuard.parse(data);
}

export function isValidReviewContextAction(data: unknown): data is ReviewContextAction {
  return reviewContextActionGuard.safeParse(data).success;
}

export function parseReviewContextActions(data: unknown): ReviewContextAction[] {
  return reviewContextActionsGuard.parse(data);
}
```

---

## Test (Detroit School)

```typescript
// tests/units/usecases/triggerReview.usecase.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { triggerReview, type TriggerReviewParams } from '@/usecases/triggerReview.usecase.js';
import { StubReviewQueuePort } from '@/tests/stubs/reviewQueue.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';

describe('triggerReview usecase', () => {
  let queuePort: StubReviewQueuePort;
  let trackingGateway: InMemoryReviewRequestTrackingGateway;

  const defaultParams: TriggerReviewParams = {
    platform: 'gitlab',
    projectPath: 'my-org/my-project',
    localPath: '/home/user/projects/my-project',
    reviewRequestNumber: 42,
    title: 'feat: add new feature',
    sourceBranch: 'feature/new-feature',
    targetBranch: 'main',
    mrUrl: 'https://gitlab.com/my-org/my-project/-/merge_requests/42',
    skill: 'review',
  };

  beforeEach(() => {
    queuePort = new StubReviewQueuePort();
    trackingGateway = new InMemoryReviewRequestTrackingGateway();
  });

  it('should enqueue job when no active review exists', () => {
    const result = triggerReview(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    expect(result.status).toBe('success');
    expect(result).toHaveProperty('jobId');
    expect(queuePort.enqueuedJobs).toHaveLength(1);
  });

  it('should deduplicate when review is already in progress', () => {
    const jobId = queuePort.createJobId('gitlab', 'my-org/my-project', 42);
    queuePort.addActiveJob(jobId);

    const result = triggerReview(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    expect(result.status).toBe('deduplicated');
    expect(result).toHaveProperty('reason', 'Review already in progress');
    expect(queuePort.enqueuedJobs).toHaveLength(0);
  });

  it('should return failed when queue rejects job', () => {
    queuePort.shouldRejectEnqueue = true;

    const result = triggerReview(defaultParams, {
      queuePort,
      reviewRequestTrackingGateway: trackingGateway,
      logger: createStubLogger(),
    });

    expect(result.status).toBe('failed');
    expect(result).toHaveProperty('reason', 'Queue full or job rejected');
  });
});
```

---

## Test Stub (Double)

```typescript
// tests/stubs/reviewContextGateway.stub.ts
import type { ReviewContextGateway, UpdateResult } from '@/entities/reviewContext/reviewContext.gateway.js';
import type { ReviewContext, CreateReviewContextInput, CreateReviewContextResult, ReviewContextProgress } from '@/entities/reviewContext/reviewContext.js';
import type { ReviewContextAction, ReviewContextResult } from '@/entities/reviewContext/reviewContextAction.schema.js';
import { ReviewContextFactory } from '@/tests/factories/reviewContext.factory.js';

export class StubReviewContextGateway implements ReviewContextGateway {
  private contexts = new Map<string, ReviewContext>();

  create(input: CreateReviewContextInput): CreateReviewContextResult {
    const context = ReviewContextFactory.create({
      mergeRequestId: input.mergeRequestId,
      platform: input.platform,
      projectPath: input.projectPath,
      mergeRequestNumber: input.mergeRequestNumber,
      threads: input.threads ?? [],
    });
    this.contexts.set(input.mergeRequestId, context);
    return {
      success: true,
      filePath: this.getFilePath(input.localPath, input.mergeRequestId),
    };
  }

  read(_localPath: string, mergeRequestId: string): ReviewContext | null {
    return this.contexts.get(mergeRequestId) ?? null;
  }

  exists(_localPath: string, mergeRequestId: string): boolean {
    return this.contexts.has(mergeRequestId);
  }
}
```

---

## ReviewFlow Project Structure

```
src/
├── entities/
│   ├── review/
│   │   └── reviewScore.valueObject.ts       # Scoring value object
│   ├── reviewContext/
│   │   ├── reviewContext.ts                  # Types and interfaces
│   │   ├── reviewContext.schema.ts           # Zod schema
│   │   ├── reviewContext.gateway.ts          # Gateway contract
│   │   ├── reviewContextAction.guard.ts      # Boundary validation
│   │   └── reviewContextAction.schema.ts     # Action schema
│   ├── reviewRequest/
│   │   ├── reviewRequest.entity.ts           # Review request entity
│   │   ├── reviewRequest.guard.ts            # Boundary validation
│   │   └── reviewRequestState.valueObject.ts # State machine
│   ├── threadFetch/
│   │   └── threadFetch.gateway.ts            # Thread fetch contract
│   ├── progress/
│   │   ├── progress.type.ts                  # Progress types
│   │   ├── progress.factory.ts               # Progress creation
│   │   └── progress.gateway.ts               # Progress contract
│   └── tracking/
│       ├── trackedMr.ts                      # Tracked merge request
│       ├── assignmentInfo.ts                 # Assignment data
│       └── reviewEvent.ts                    # Review event types
│
├── usecases/
│   ├── triggerReview.usecase.ts              # Enqueue a review job
│   ├── cancelReview.usecase.ts               # Cancel an active review
│   ├── tracking/
│   │   ├── trackAssignment.usecase.ts        # Record MR assignment
│   │   ├── recordPush.usecase.ts             # Record push event
│   │   ├── syncThreads.usecase.ts            # Sync MR threads
│   │   └── transitionState.usecase.ts        # State machine transitions
│   └── mcp/
│       ├── startAgent.usecase.ts             # Start review agent
│       ├── completeAgent.usecase.ts          # Complete review agent
│       ├── addAction.usecase.ts              # Queue review action
│       └── getWorkflow.usecase.ts            # Get workflow status
│
├── interface-adapters/
│   ├── controllers/
│   │   ├── webhook/
│   │   │   ├── gitlab.controller.ts          # GitLab webhook handler
│   │   │   └── github.controller.ts          # GitHub webhook handler
│   │   ├── http/
│   │   │   └── reviews.routes.ts             # Fastify HTTP routes
│   │   └── mcp/
│   │       └── startAgent.handler.ts         # MCP tool handlers
│   ├── presenters/
│   │   ├── reviewList.presenter.ts           # Review list formatting
│   │   └── jobStatus.presenter.ts            # Job status formatting
│   └── gateways/
│       ├── reviewContext.fileSystem.gateway.ts    # File system impl
│       ├── threadFetch.gitlab.gateway.ts          # GitLab thread fetch
│       └── threadFetch.github.gateway.ts          # GitHub thread fetch
│
├── shared/
│   └── foundation/
│       ├── usecase.base.ts                   # UseCase<TInput, TOutput>
│       ├── guard.base.ts                     # createGuard(schema)
│       └── gateway.base.ts                   # Base gateway
│
└── tests/
    ├── units/                                # Mirror of src/
    ├── factories/                            # Test data factories
    ├── stubs/                                # Stub gateways
    └── mocks/                                # Mock data
```
