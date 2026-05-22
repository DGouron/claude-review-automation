---
name: solid
description: SOLID Principles from Clean Architecture (Robert C. Martin). Use for code review, refactoring decisions, or when designing new modules/components.
---

# SOLID Principles - Clean Architecture Reference

> Based on "Clean Architecture" by Robert C. Martin, Chapter 7-11 (pages 57-90)

## Persona

Read `.claude/roles/architect.md` — adopt this profile and follow all its rules.

## When to Activate

This skill activates for:
- Code review with design concerns
- Refactoring decisions
- Designing new modules or components
- Evaluating class/function responsibilities

---

## SRP: Single Responsibility Principle

> **"A module should have one, and only one, reason to change."** — Clean Architecture, p.62

### Definition

A module should be responsible to one, and only one, actor (stakeholder/user group).

### In ReviewFlow

```typescript
// ❌ Bad: one class, three actors driving change
//   - the developer (trigger flow)
//   - the platform integration (GitLab/GitHub API)
//   - the dashboard (stats persistence)
class ReviewService {
  async triggerReview(mr: TrackedMr): Promise<void> {
    /* developer concern: enqueue a review job */
  }
  async fetchThreads(mrId: MergeRequestId): Promise<Thread[]> {
    /* platform concern: hit GitLab/GitHub API */
  }
  async saveStats(stats: ReviewStats): Promise<void> {
    /* dashboard concern: persist aggregated metrics */
  }
}

// ✅ Good: one module per actor
export class TriggerReviewUseCase implements UseCase<TriggerReviewInput, void> {
  constructor(private readonly queue: QueueGateway) {}
  async execute(input: TriggerReviewInput): Promise<void> {
    await this.queue.enqueue(input);
  }
}

export interface ThreadFetchGateway {
  fetch(mrId: MergeRequestId): Promise<Thread[]>;
}

export class ReviewStatsPresenter {
  present(stats: ReviewStats): ReviewStatsViewModel {
    return { average: stats.averageScore, total: stats.totalReviews };
  }
}
```

---

## OCP: Open-Closed Principle

> **"A software artifact should be open for extension but closed for modification."** — Clean Architecture, p.70

### Definition

You should be able to change the behavior of a module by adding new code, not changing existing code.

### In ReviewFlow

```typescript
// ❌ Bad: every new platform forces editing the use case
async function fetchThreads(
  mrId: MergeRequestId,
  platform: Platform
): Promise<Thread[]> {
  if (platform === 'gitlab') return glabCli.fetchThreads(mrId);
  if (platform === 'github') return ghCli.fetchThreads(mrId);
  // Adding Bitbucket means editing this function...
  throw new Error(`Unknown platform: ${platform}`);
}

// ✅ Good: use case depends on an abstraction, new platforms add new classes
export interface ThreadFetchGateway {
  fetch(mrId: MergeRequestId): Promise<Thread[]>;
}

export class GitLabThreadFetchGateway implements ThreadFetchGateway {
  async fetch(mrId: MergeRequestId): Promise<Thread[]> { /* glab CLI */ }
}

export class GitHubThreadFetchGateway implements ThreadFetchGateway {
  async fetch(mrId: MergeRequestId): Promise<Thread[]> { /* gh CLI */ }
}

// Adding Bitbucket = a new class, zero changes to existing use cases
export class BitbucketThreadFetchGateway implements ThreadFetchGateway {
  async fetch(mrId: MergeRequestId): Promise<Thread[]> { /* bb CLI */ }
}
```

---

## LSP: Liskov Substitution Principle

> **"Subtypes must be substitutable for their base types."** — Clean Architecture, p.78

### Definition

If S is a subtype of T, objects of type T may be replaced with objects of type S without altering any desirable properties.

### In ReviewFlow

Gateway contracts are the most common LSP carrier in this codebase. Every implementation must honor the documented behavior — including the **null-return convention for intentional absence** (`undefined` is banned in domain types).

```typescript
// Contract: returns null when no review context exists for the MR
export interface ReviewContextGateway {
  findByMr(mrId: MergeRequestId): Promise<ReviewContext | null>;
}

// ❌ Bad: throws on absence — callers written against the contract break
class FileReviewContextGateway implements ReviewContextGateway {
  async findByMr(mrId: MergeRequestId): Promise<ReviewContext | null> {
    const path = this.pathFor(mrId);
    if (!existsSync(path)) {
      throw new Error('Context not found'); // violates the null-return contract
    }
    return JSON.parse(readFileSync(path, 'utf-8'));
  }
}

// ✅ Good: every implementation honors the contract
class FileReviewContextGateway implements ReviewContextGateway {
  async findByMr(mrId: MergeRequestId): Promise<ReviewContext | null> {
    const path = this.pathFor(mrId);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  }
}

class MemoryReviewContextGateway implements ReviewContextGateway {
  constructor(private readonly contexts = new Map<MergeRequestId, ReviewContext>()) {}
  async findByMr(mrId: MergeRequestId): Promise<ReviewContext | null> {
    return this.contexts.get(mrId) ?? null;
  }
}
```

---

## ISP: Interface Segregation Principle

> **"Don't depend on things you don't need."** — Clean Architecture, p.84

### Definition

Clients should not be forced to depend on methods they don't use. Many client-specific interfaces are better than one general-purpose interface.

### In ReviewFlow

```typescript
// ❌ Bad: one fat platform interface, every consumer carries unused capabilities
export interface ReviewPlatformGateway {
  fetchThreads(mrId: MergeRequestId): Promise<Thread[]>;
  fetchDiff(mrId: MergeRequestId): Promise<DiffMetadata>;
  postComment(mrId: MergeRequestId, body: string): Promise<void>;
  resolveThread(threadId: ThreadId): Promise<void>;
  searchOpenMrs(): Promise<TrackedMr[]>;
}

// A presenter that only reads threads still depends transitively on write capabilities
export class ThreadListPresenter {
  constructor(private readonly platform: ReviewPlatformGateway) {}
  async present(mrId: MergeRequestId): Promise<ThreadListViewModel> {
    const threads = await this.platform.fetchThreads(mrId);
    return { items: threads.map(toViewModel) };
  }
}

// ✅ Good: focused gateways, each client depends only on what it actually uses
export interface ThreadFetchGateway {
  fetch(mrId: MergeRequestId): Promise<Thread[]>;
}

export interface DiffMetadataFetchGateway {
  fetch(mrId: MergeRequestId): Promise<DiffMetadata>;
}

export interface ReviewActionGateway {
  postComment(mrId: MergeRequestId, body: string): Promise<void>;
  resolveThread(threadId: ThreadId): Promise<void>;
}

// The presenter depends only on the read capability it needs
export class ThreadListPresenter {
  constructor(private readonly threadFetch: ThreadFetchGateway) {}
  async present(mrId: MergeRequestId): Promise<ThreadListViewModel> {
    const threads = await this.threadFetch.fetch(mrId);
    return { items: threads.map(toViewModel) };
  }
}
```

---

## DIP: Dependency Inversion Principle

> **"Depend on abstractions, not concretions."** — Clean Architecture, p.87

### Definition

High-level modules should not depend on low-level modules. Both should depend on abstractions.

### The Core Insight

> "The source code dependencies point in the opposite direction to the flow of control." — Clean Architecture, p.89

```
Flow of control:    Controller → Gateway → glab/gh CLI
Source dependency:  Controller → Interface ← Gateway implementation
```

### In ReviewFlow

The composition root (`src/main/routes.ts`) is the only place that instantiates concrete gateways. Controllers and use cases depend exclusively on abstractions injected through a typed `Dependencies` interface.

```typescript
// ❌ Bad: controller depends on a concrete implementation
import { GitLabThreadFetchGateway } from '@/interface-adapters/gateways/threadFetch.gitlab.gateway.js';

export async function handleGitLabWebhook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const threadFetch = new GitLabThreadFetchGateway(executor); // direct instantiation!
  const threads = await threadFetch.fetch(mrId);
  // ...
}

// ✅ Good: depend on the abstraction, inject from the composition root

// 1. Abstraction lives in the entities (domain) layer
// src/entities/thread/threadFetch.gateway.ts
export interface ThreadFetchGateway {
  fetch(mrId: MergeRequestId): Promise<Thread[]>;
}

// 2. Controller receives the abstraction via typed Dependencies
export interface GitLabWebhookDependencies {
  threadFetch: ThreadFetchGateway;
}

export async function handleGitLabWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: GitLabWebhookDependencies
): Promise<void> {
  const threads = await deps.threadFetch.fetch(mrId);
  // ...
}

// 3. Composition root wires the concrete implementation
// src/main/routes.ts
app.post('/webhooks/gitlab', async (request, reply) => {
  await handleGitLabWebhook(request, reply, {
    threadFetch: new GitLabThreadFetchGateway(executor),
  });
});
```

### Dependency Direction in Clean Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frameworks                        │
│           (Fastify, Claude CLI, p-queue)             │
├──────────────────────────┬──────────────────────────┤
│                          │                          │
│   ┌──────────────────────▼──────────────────────┐   │
│   │              Interface Adapters              │   │
│   │     (Webhook controllers, Presenters,        │   │
│   │      platform Gateway implementations)       │   │
│   └──────────────────────┬──────────────────────┘   │
│                          │                          │
│   ┌──────────────────────▼──────────────────────┐   │
│   │              Application Layer               │   │
│   │     (Use Cases, Gateway interfaces)          │   │
│   └──────────────────────┬──────────────────────┘   │
│                          │                          │
│   ┌──────────────────────▼──────────────────────┐   │
│   │               Domain Layer                   │   │
│   │  (TrackedMr, ReviewContext, ReviewScore)     │   │
│   └─────────────────────────────────────────────┘   │
│                                                      │
└──────────────────────────────────────────────────────┘

     ↑ Source code dependencies point INWARD
     ↓ Control flow can point either direction
```

---

## SOLID Checklist for Code Review

- [ ] **SRP**: Does this module have only one reason to change?
- [ ] **OCP**: Can I extend behavior without modifying existing code?
- [ ] **LSP**: Can all implementations be used interchangeably?
- [ ] **ISP**: Does this interface expose only what clients need?
- [ ] **DIP**: Do high-level modules depend on abstractions?

---

## Key Quotes from Clean Architecture

> "The SOLID principles tell us how to arrange our functions and data structures into classes, and how those classes should be interconnected." — p.58

> "The goal of the principles is the creation of mid-level software structures that: tolerate change, are easy to understand, and are the basis of components that can be used in many software systems." — p.58

> "Violating OCP is the most common way of creating fragile designs." — p.71
