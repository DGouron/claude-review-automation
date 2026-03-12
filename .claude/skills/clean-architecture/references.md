# Clean Architecture References

Sources: *Clean Architecture* (Robert C. Martin, 2017)

---

## Key Chapters

| Chapter | Concept | Project Application |
|---------|---------|---------------------|
| Ch. 20 | Business Rules | Entities in `src/entities/` |
| Ch. 21 | Screaming Architecture | Structure `src/entities/`, `src/usecases/`, `src/interface-adapters/` |
| Ch. 22 | The Clean Architecture | Concentric layers |
| Ch. 23 | Presenters & Humble Objects | Presenter/ViewModel separation |
| Ch. 26 | The Main Component | `src/main/routes.ts` and `src/main/dependencies.ts` |

---

## The Dependency Rule (Ch. 22)

> "Source code dependencies must point only inward, toward higher-level policies."

```
Entities ← Use Cases ← Interface Adapters ← Frameworks
```

**Consequence**: An Entity must never import from `interface-adapters/`.

---

## Humble Object Pattern (Ch. 23, p. 212-213)

Separates testable code from code that is hard to test.

| Component | Testable | Logic |
|-----------|----------|-------|
| Presenter | Yes | Transform data into ViewModel |
| Controller | Yes | Orchestrate use cases |
| View (HTTP Response) | No (humble) | Pure rendering of ViewModel |

**Rule**: If you write an `if` in a Fastify route handler, it should probably be in the Controller or Presenter.

---

## Use Cases (Ch. 20-21)

> "Use cases contain application-specific business rules."

A Use Case:
- Represents ONE user intention
- Orchestrates Entities
- Knows nothing about the UI or transport

**Naming**: `<verb><Entity>.usecase.ts`
- `triggerReview.usecase.ts`
- `trackAssignment.usecase.ts`
- `cancelReview.usecase.ts`

---

## Boundaries & Gateways (Ch. 22)

Gateways implement dependency inversion.

```
Use Case → Gateway Interface (in entities/)
                ↑
Gateway Implementation (in interface-adapters/)
```

The Use Case depends on the abstraction, not the implementation.

---

## The Main Component (Ch. 26)

> "Main is the dirtiest component in the system."

The `main` component (`src/main/routes.ts` and `src/main/dependencies.ts`):
- Instantiates concrete implementations
- Configures dependency injection
- Is the only place that knows infrastructure details

```typescript
// main/routes.ts — The "dirty" component
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

## Entity vs Use Case

| Aspect | Entity | Use Case |
|--------|--------|----------|
| Scope | Enterprise-wide | Application-specific |
| Dependencies | No external dependencies | Entities + Gateways |
| Example | `ReviewScore.severity` | `triggerReview()` which enqueues and tracks |

---

## Screaming Architecture (Ch. 21)

> "Your architecture should tell readers about the system, not about the frameworks."

The folder structure screams the business intent:

```
✅ src/entities/reviewContext/     → You understand the domain
✅ src/usecases/tracking/          → You understand the business actions
❌ src/components/                 → You only understand the framework
```
