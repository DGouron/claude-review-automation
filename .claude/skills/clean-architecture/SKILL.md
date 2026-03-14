---
name: architecture
description: Clean Architecture (Uncle Bob) guide for this project. Use when creating modules, entities, use cases, presenters, controllers, gateways, guards, services. Contains tactical patterns and structure conventions.
---

# Clean Architecture - Tactical Guide

## Persona

Read `.claude/roles/architect.md` — adopt this profile and follow all its rules.

## Activation

This skill activates for any creation or modification of architectural components:
- Entities, Use Cases, Presenters
- Controllers, Gateways, Guards
- Services
- Module structure

## Core Principle

> "The architecture should scream the intent of the system." — Uncle Bob

```
┌─────────────────────────────────────┐
│       Interface Adapters            │  ← Controllers, Presenters, Gateways
├─────────────────────────────────────┤
│           Use Cases                 │  ← Application Business Rules
├─────────────────────────────────────┤
│            Entities                 │  ← Enterprise Business Rules
└─────────────────────────────────────┘
```

**Dependency Rule**: Dependencies point inward. The domain knows nothing about infrastructure.

---

## Module Structure

```
src/
├── entities/
│   └── <entity>/
│       ├── <entity>.ts              # Entity + business logic
│       ├── <entity>.schema.ts       # Zod schema
│       ├── <entity>.guard.ts        # Boundary validation
│       └── <entity>.gateway.ts      # Interface (port)
├── usecases/
│   └── <action><Entity>.usecase.ts
├── interface-adapters/
│   ├── controllers/
│   │   ├── webhook/
│   │   │   └── <platform>.controller.ts
│   │   ├── http/
│   │   │   └── <feature>.routes.ts
│   │   └── mcp/
│   │       └── <action>.handler.ts
│   ├── presenters/
│   │   └── <feature>.presenter.ts
│   ├── gateways/
│   │   └── <entity>.<source>.gateway.ts
│   └── adapters/
│       └── <platform>.adapter.ts
├── shared/
│   └── foundation/
│       ├── usecase.base.ts
│       ├── guard.base.ts
│       ├── gateway.base.ts
│       └── presenter.base.ts
└── tests/
    ├── units/
    ├── factories/
    ├── stubs/
    └── mocks/
```

---

## Components

### Entity

Pure business logic, independent of any framework.

```typescript
// entities/review/reviewScore.valueObject.ts
export class ReviewScore {
  private constructor(private readonly props: ReviewScoreProps) {}

  static create(props: ReviewScoreProps): ReviewScore {
    const validated = ReviewScoreSchema.parse(props);
    return new ReviewScore(validated);
  }

  get blocking(): number {
    return this.props.blocking;
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
}
```

### Use Case

Orchestrates a business action. One use case = one user intention.

```typescript
// usecases/triggerReview.usecase.ts
export function triggerReview(
  params: TriggerReviewParams,
  deps: TriggerReviewDependencies
): TriggerReviewResult {
  const { queuePort, reviewRequestTrackingGateway, logger } = deps;

  const jobId = queuePort.createJobId(params.platform, params.projectPath, params.reviewRequestNumber);

  if (queuePort.hasActiveJob(jobId)) {
    return { status: 'deduplicated', reason: 'Review already in progress' };
  }

  const enqueued = queuePort.enqueue(job);
  if (!enqueued) {
    return { status: 'failed', reason: 'Queue full or job rejected' };
  }

  reviewRequestTrackingGateway.recordPush(params.localPath, params.reviewRequestNumber, params.platform);
  return { status: 'success', jobId };
}
```

### Presenter

Transforms business data into a ViewModel. Contains ALL presentation logic.

```typescript
// interface-adapters/presenters/reviewList.presenter.ts
export class ReviewListPresenter {
  constructor(private jobPresenter: JobStatusPresenter) {}

  present(active: JobStatus[], recent: JobStatus[]): ReviewListViewModel {
    const activeJobs = active.map(job => this.jobPresenter.present(job));
    const recentJobs = recent.map(job => this.jobPresenter.present(job));
    const totalCount = activeJobs.length + recentJobs.length;

    return {
      activeJobs,
      recentJobs,
      totalCount,
      isEmpty: totalCount === 0,
      emptyMessage: 'No active reviews',
    };
  }
}
```

### ViewModel

Simple data structure. Formatted strings, UI booleans. Defined with a TypeScript interface.

```typescript
// interface-adapters/presenters/reviewList.presenter.ts
export interface ReviewListViewModel {
  activeJobs: JobStatusViewModel[];
  recentJobs: JobStatusViewModel[];
  activeCount: number;
  recentCount: number;
  totalCount: number;
  isEmpty: boolean;
  emptyMessage: string;
}
```

### Controller

Orchestrates Use Case + Presenter. Entry point for an action.

```typescript
// interface-adapters/controllers/webhook/github.controller.ts
export async function handleGitHubWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  logger: Logger,
  trackingGateway: ReviewRequestTrackingGateway,
  deps: GitHubWebhookDependencies
): Promise<void> {
  const { trackAssignment, recordCompletion } = deps;

  const verification = verifyGitHubSignature(request);
  if (!verification.valid) {
    reply.status(401).send({ error: verification.error });
    return;
  }

  // Orchestrate use cases...
}
```

### Gateway

Interface (port) in entities, implementation in interface-adapters.

```typescript
// entities/reviewContext/reviewContext.gateway.ts (CONTRACT)
export interface ReviewContextGateway {
  create(input: CreateReviewContextInput): CreateReviewContextResult;
  read(localPath: string, mergeRequestId: string): ReviewContext | null;
  exists(localPath: string, mergeRequestId: string): boolean;
  appendAction(localPath: string, mergeRequestId: string, action: ReviewContextAction): UpdateResult;
}

// interface-adapters/gateways/reviewContext.fileSystem.gateway.ts (IMPLEMENTATION)
export class ReviewContextFileSystemGateway implements ReviewContextGateway {
  read(localPath: string, mergeRequestId: string): ReviewContext | null {
    const filePath = this.getFilePath(localPath, mergeRequestId);
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ReviewContext;
  }
}
```

### Guard

Boundary validation with Zod.

```typescript
// entities/reviewContext/reviewContextAction.guard.ts
export const reviewContextActionGuard = createGuard(reviewContextActionSchema);

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

### Service

Utilities injected via Dependencies.

| Scope | Location |
|-------|----------|
| Cross-context | `shared/services/` |
| Specific to bounded context | `interface-adapters/gateways/` or `services/` |

---

## Dependency Injection

Via composition root in `src/main/routes.ts`. See [references.md](references.md) for details.

```typescript
// main/routes.ts — the "dirty" component (Uncle Bob Ch. 26)
app.post('/webhooks/github', async (request, reply) => {
  await handleGitHubWebhook(request, reply, deps.logger, trackingGw, {
    reviewContextGateway: deps.reviewContextGateway,
    threadFetchGateway: new GitHubThreadFetchGateway(defaultGitHubExecutor),
    trackAssignment: new TrackAssignmentUseCase(trackingGw),
    recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
  });
});
```

---

## Test Doubles

```
tests/
├── stubs/
│   └── reviewContextGateway.stub.ts    # Happy path
├── factories/
│   └── reviewContext.factory.ts         # Test data creation
└── mocks/
```

See [examples.md](examples.md) for concrete examples.

---

## Anti-patterns to Avoid

- No business logic in Controllers
- No presentation logic in Use Cases
- No infrastructure awareness in Entities
- No outward-pointing dependencies
- No `as Type` assertions — use guards with Zod
