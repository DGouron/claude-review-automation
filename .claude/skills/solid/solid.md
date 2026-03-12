# Skill: SOLID Principles in ReviewFlow

> Reference for applying SOLID principles in the ReviewFlow TypeScript/Clean Architecture codebase.

---

## 1. Single Responsibility Principle (SRP)

**One module/class = one reason to change**

### In ReviewFlow

- Each use case handles a single business action
- Gateways handle only external communication
- Controllers handle only request translation
- Entities hold only domain data and invariants

### Example

```typescript
// GOOD: Separated responsibilities
// src/usecases/triggerReview.usecase.ts
export class TriggerReviewUseCase implements UseCase<TriggerReviewInput, void> {
  constructor(private reviewGateway: ReviewGateway) {}

  async execute(input: TriggerReviewInput): Promise<void> {
    // Only handles triggering a review
  }
}

// src/interface-adapters/gateways/gitlabThread.gateway.ts
export class GitLabThreadFetchGateway implements ThreadFetchGateway {
  // Only handles fetching threads from GitLab API
}

// BAD: God class doing everything
export class ReviewService {
  // Fetches threads, triggers reviews, tracks assignments, posts comments...
}
```

### ReviewFlow modules

| Module | Single responsibility |
|--------|---------------------|
| `entities/reviewContext/` | Review context data shape and validation |
| `usecases/triggerReview.usecase.ts` | Triggering a code review |
| `usecases/tracking/` | MR assignment tracking |
| `gateways/claudeInvoker.ts` | Invoking Claude CLI |
| `controllers/webhook/` | Translating webhook payloads to use case calls |

---

## 2. Open/Closed Principle (OCP)

**Open for extension, closed for modification**

### In ReviewFlow

- **Interfaces** for extension points (gateway contracts)
- Use case inputs/outputs are typed but the pipeline is extensible
- New platform support (e.g., Bitbucket) = new gateway, no changes to use cases

### Example

```typescript
// GOOD: Extensible via interface
export interface ThreadFetchGateway {
  fetchThreads(mergeRequestId: MergeRequestId): Promise<Thread[]>;
}

// GitLab implementation
export class GitLabThreadFetchGateway implements ThreadFetchGateway {
  async fetchThreads(mergeRequestId: MergeRequestId): Promise<Thread[]> {
    // GitLab-specific API calls
  }
}

// GitHub implementation — no existing code modified
export class GitHubThreadFetchGateway implements ThreadFetchGateway {
  async fetchThreads(mergeRequestId: MergeRequestId): Promise<Thread[]> {
    // GitHub-specific API calls
  }
}

// For closed sets, use union types
type ReviewPhase = "initializing" | "agents-running" | "synthesizing" | "publishing" | "completed";
```

### ReviewFlow extension points

- `ThreadFetchGateway` -> GitLab, GitHub (new platforms add a new class)
- `ExecutionGateway` -> CLI execution abstraction
- `ReviewContextGateway` -> different sources of review context

---

## 3. Liskov Substitution Principle (LSP)

**Implementations must honor the contract of the interface**

### In ReviewFlow

- A gateway implementation must never throw unexpected errors
- Behavior must be consistent across all implementations
- Use discriminated return types instead of exceptions for expected failures

### Example

```typescript
// GOOD: All implementations respect the contract
export interface ReviewContextGateway {
  fetchContext(mergeRequestId: MergeRequestId): Promise<ReviewContext | null>;
}

export class GitLabReviewContextGateway implements ReviewContextGateway {
  async fetchContext(mergeRequestId: MergeRequestId): Promise<ReviewContext | null> {
    // Returns null if not found — does not throw
  }
}

export class GitHubReviewContextGateway implements ReviewContextGateway {
  async fetchContext(mergeRequestId: MergeRequestId): Promise<ReviewContext | null> {
    // Same contract: returns null if not found
  }
}

// BAD: Violates the contract
export class BrokenReviewContextGateway implements ReviewContextGateway {
  async fetchContext(mergeRequestId: MergeRequestId): Promise<ReviewContext | null> {
    throw new Error("Not implemented"); // LSP VIOLATION — callers expect null, not an exception
  }
}
```

---

## 4. Interface Segregation Principle (ISP)

**Small focused interfaces rather than large ones**

### In ReviewFlow

- Separate gateway interfaces by concern
- Controllers depend only on the use cases they need
- Clients depend only on what they use

### Example

```typescript
// GOOD: Focused interfaces
export interface ThreadFetchGateway {
  fetchThreads(mergeRequestId: MergeRequestId): Promise<Thread[]>;
}

export interface ReviewContextGateway {
  fetchContext(mergeRequestId: MergeRequestId): Promise<ReviewContext | null>;
}

export interface TrackingGateway {
  track(mergeRequestId: MergeRequestId, assignee: string): Promise<void>;
  getTracked(mergeRequestId: MergeRequestId): Promise<TrackedMr | null>;
}

// Controller depends only on what it needs
export interface GitLabWebhookDependencies {
  reviewContextGateway: ReviewContextGateway;
  threadFetchGateway: ThreadFetchGateway;
  trackAssignment: TrackAssignmentUseCase;
}

// BAD: Fat interface
export interface ReviewPlatformGateway {
  fetchThreads(id: MergeRequestId): Promise<Thread[]>;
  fetchContext(id: MergeRequestId): Promise<ReviewContext | null>;
  postComment(id: MergeRequestId, body: string): Promise<void>;
  resolveThread(threadId: string): Promise<void>;
  track(id: MergeRequestId, assignee: string): Promise<void>;
  getStats(): Promise<Stats>;
  // Not all consumers need all of these
}
```

---

## 5. Dependency Inversion Principle (DIP)

**Depend on abstractions (interfaces), not on concrete implementations**

### In ReviewFlow

- Use cases define the interfaces they need (gateway contracts)
- Concrete implementations live in `interface-adapters/gateways/`
- The composition root (`src/main/routes.ts`) wires everything together

### Example

```typescript
// GOOD: Use case depends on an interface
export class TriggerReviewUseCase implements UseCase<TriggerReviewInput, void> {
  constructor(
    private reviewContextGateway: ReviewContextGateway,  // Interface
    private threadFetchGateway: ThreadFetchGateway,      // Interface
  ) {}

  async execute(input: TriggerReviewInput): Promise<void> {
    const context = await this.reviewContextGateway.fetchContext(input.mergeRequestId);
    const threads = await this.threadFetchGateway.fetchThreads(input.mergeRequestId);
    // Business logic using abstractions
  }
}

// Composition root (routes.ts) — only place for concrete instantiation
app.post('/webhooks/gitlab', async (request, reply) => {
  await handleWebhook(request, reply, logger, {
    reviewContextGateway: new GitLabReviewContextGateway(httpClient),
    threadFetchGateway: new GitLabThreadFetchGateway(executor),
    trackAssignment: new TrackAssignmentUseCase(trackingGateway),
  });
});

// BAD: Concrete dependency
export class TriggerReviewUseCase {
  private gateway = new GitLabReviewContextGateway(); // Coupled to GitLab
}
```

### ReviewFlow architecture

```
src/
├── entities/              # Domain types and validation (no dependencies)
├── usecases/              # Business logic (depends on gateway interfaces)
├── interface-adapters/
│   ├── gateways/          # Concrete implementations of gateway interfaces
│   ├── controllers/       # Inbound: webhook/HTTP -> use case calls
│   └── presenters/        # Outbound: domain -> external format
└── main/
    └── routes.ts          # Composition root — wires concrete deps
```

---

## SOLID checklist for review

- [ ] **SRP**: Does this module have a single reason to change?
- [ ] **OCP**: Can I add behavior without modifying existing code?
- [ ] **LSP**: Are all implementations of this interface interchangeable?
- [ ] **ISP**: Could this interface be split into smaller, more focused ones?
- [ ] **DIP**: Does this module depend on interfaces or concrete types?
