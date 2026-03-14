# Spec #82 — Replace Global Queue State with EventBus

**Issue**: [#82](https://github.com/DGouron/review-flow/issues/82)
**Labels**: refactor, P2-important, architecture
**Milestone**: Architecture Cleanup
**Effort**: 2 points

---

## Problem Statement

The queue system (`pQueueAdapter.ts`) uses **two global mutable callbacks** to propagate state changes to consumers:

```typescript
let progressChangeCallback: ProgressChangeCallback | null = null;
let stateChangeCallback: StateChangeCallback | null = null;
```

These are set via `setProgressChangeCallback()` and `setStateChangeCallback()`, which:

1. **Only allow a single listener** per event type (last writer wins — a second call silently replaces the first).
2. **Create tight implicit coupling** between the queue module and its consumers (currently `websocket.ts`).
3. **Make testing harder** — tests must mock the setter functions, and the global state leaks between test runs.
4. **Violate the Dependency Rule** — `websocket.ts` reaches directly into `frameworks/queue/` to mutate global state, instead of depending on an abstraction.

The `logBuffer.ts` module already solves the same problem correctly with a multi-listener pattern (`onLog()` returns an unsubscribe function), proving the approach works in this codebase.

---

## User Story

**As a** developer working on ReviewFlow,
**I want** queue state changes to be published through a typed EventBus interface,
**So that** multiple consumers can subscribe independently without global mutable state, making the system easier to extend and test.

---

## Current Architecture (Before)

```
pQueueAdapter.ts
  ├── let progressChangeCallback = null    ← global mutable
  ├── let stateChangeCallback = null       ← global mutable
  ├── setProgressChangeCallback(cb)        ← last writer wins
  ├── setStateChangeCallback(cb)           ← last writer wins
  └── stateChangeCallback?.() / progressChangeCallback?.()  ← fire-and-forget

websocket.ts (sole consumer)
  └── setupWebSocketCallbacks()
        ├── setProgressChangeCallback(...)   ← registers single listener
        └── setStateChangeCallback(...)      ← registers single listener
```

### Producers (emit events)

| Location | Event emitted |
|----------|---------------|
| `pQueueAdapter.ts:175` | `stateChangeCallback()` — job queued |
| `pQueueAdapter.ts:195` | `stateChangeCallback()` — job started |
| `pQueueAdapter.ts:230` | `stateChangeCallback()` — job completed/failed |
| `pQueueAdapter.ts:369` | `progressChangeCallback(jobId, progress, event)` — progress update |

### Consumers (subscribe to events)

| Location | Subscribes to |
|----------|---------------|
| `websocket.ts:67-69` | `progressChangeCallback` → `broadcastProgress()` |
| `websocket.ts:70-72` | `stateChangeCallback` → `broadcastStateChange()` |

### Callers of `updateJobProgress()` (which triggers `progressChangeCallback`)

| File | Context |
|------|---------|
| `gitlab.controller.ts` (lines 293, 524) | Review + followup Claude invocation |
| `github.controller.ts` (line 251) | Review Claude invocation |
| `mrTrackingAdvanced.routes.ts` (line 152) | Manual followup |
| `websocket.ts` (line 82) | Review context watcher file-based progress |

---

## Target Architecture (After)

```
entities/queue/queueEventBus.ts           ← contract (interface)
  └── QueueEventBus { on, off, emit }

frameworks/queue/queueEventBus.memory.ts  ← implementation
  └── InMemoryQueueEventBus implements QueueEventBus

pQueueAdapter.ts
  └── receives QueueEventBus via initQueue()
  └── calls eventBus.emit('job:queued', ...) etc.

websocket.ts
  └── subscribes via eventBus.on('job:stateChanged', ...)
  └── subscribes via eventBus.on('job:progressChanged', ...)

server.ts (composition root)
  └── creates InMemoryQueueEventBus
  └── passes to initQueue(logger, eventBus)
  └── passes to setupWebSocketCallbacks(deps, eventBus)
```

---

## Acceptance Criteria (Gherkin)

### Scenario 1: Multiple listeners receive state change events

```gherkin
Given an EventBus with two state-change subscribers
When a job is enqueued
Then both subscribers receive the "job:stateChanged" event
And the event payload contains the job ID and new status "queued"
```

### Scenario 2: Progress events are broadcast to all listeners

```gherkin
Given an EventBus with two progress subscribers
When updateJobProgress is called with a job ID and progress data
Then both subscribers receive the "job:progressChanged" event
And the event payload contains the job ID, progress, and optional progress event
```

### Scenario 3: Unsubscribing stops event delivery

```gherkin
Given a subscriber registered on the EventBus
When the subscriber calls its unsubscribe function
And a new event is emitted
Then the unsubscribed listener is NOT called
And other active listeners still receive the event
```

### Scenario 4: State change events fire at each lifecycle transition

```gherkin
Given a job processor that completes successfully
When the job goes through the full lifecycle
Then "job:stateChanged" is emitted with status "queued"
And "job:stateChanged" is emitted with status "running"
And "job:stateChanged" is emitted with status "completed"
```

### Scenario 5: Failed job emits state change with error

```gherkin
Given a job processor that throws an error
When the job fails
Then "job:stateChanged" is emitted with status "failed"
And the event payload contains the error message
```

### Scenario 6: WebSocket broadcast still works after migration

```gherkin
Given a WebSocket client connected to the server
And the WebSocket module subscribed to the EventBus
When a job status changes
Then the WebSocket client receives a "state" message with active and recent reviews
```

### Scenario 7: No global mutable callbacks remain

```gherkin
Given the refactored codebase
When searching for global mutable callback variables in pQueueAdapter.ts
Then no "let ...Callback" variables exist
And setProgressChangeCallback / setStateChangeCallback are removed
```

---

## EventBus Contract

```typescript
// src/entities/queue/queueEventBus.ts

type QueueEventMap = {
  'job:stateChanged': { jobId: string; status: 'queued' | 'running' | 'completed' | 'failed'; error?: string };
  'job:progressChanged': { jobId: string; progress: ReviewProgress; event?: ProgressEvent };
};

interface QueueEventBus {
  on<K extends keyof QueueEventMap>(event: K, listener: (payload: QueueEventMap[K]) => void): () => void;
  off<K extends keyof QueueEventMap>(event: K, listener: (payload: QueueEventMap[K]) => void): void;
  emit<K extends keyof QueueEventMap>(event: K, payload: QueueEventMap[K]): void;
}
```

The `on()` method returns an unsubscribe function (same pattern as `logBuffer.onLog()`).

---

## Implementation Notes

1. **QueueEventBus interface** lives in `src/entities/queue/` because it is a domain-level contract (Dependency Rule — inner layers define contracts, outer layers implement them).
2. **InMemoryQueueEventBus** lives in `src/frameworks/queue/` as an infrastructure implementation.
3. **initQueue()** signature changes: `initQueue(log: Logger, eventBus: QueueEventBus)` — the eventBus is injected, not created internally.
4. **setupWebSocketCallbacks()** receives the eventBus and subscribes — replacing the two `set*Callback()` calls.
5. **updateJobProgress()** keeps its current signature but internally calls `eventBus.emit('job:progressChanged', ...)` instead of `progressChangeCallback?.()`.
6. **Composition root** (`server.ts`) creates the `InMemoryQueueEventBus` instance and passes it to both `initQueue()` and `setupWebSocketCallbacks()`.

---

## Out of Scope

- **Replacing the `logBuffer.ts` listener pattern** — it already works correctly with multi-listener support. Not part of this refactor.
- **Persistent event storage** — the EventBus is in-memory only. No event replay, no persistence.
- **Global module-level state in `pQueueAdapter.ts` beyond callbacks** — the `activeJobs`, `completedJobs`, `recentJobs` Maps are out of scope for this ticket. They are a separate concern (queue state management vs. event propagation).
- **Refactoring `enqueueReview()` callers** — controllers still call `enqueueReview()` and `updateJobProgress()` the same way. Only the internal notification mechanism changes.
- **Adding new event types** — only `job:stateChanged` and `job:progressChanged` are migrated. New event types (e.g., `job:cancelled`) can be added in follow-up tickets.
- **Moving `ReviewJob` / `JobStatus` types out of `pQueueAdapter.ts`** — that is a separate extraction concern.

---

## INVEST Validation

| Criteria | Assessment | Pass |
|----------|------------|------|
| **Independent** | No dependency on other tickets. Can be done standalone. | YES |
| **Negotiable** | The EventBus contract shape is negotiable (e.g., typed map vs. string events). The goal (remove global callbacks) is fixed. | YES |
| **Valuable** | Removes global mutable state, enables multi-listener, improves testability, respects Dependency Rule. | YES |
| **Estimable** | 2 points. Clear scope: 1 interface, 1 implementation, 3 files to modify (`pQueueAdapter.ts`, `websocket.ts`, `server.ts`), 1 test file to update. | YES |
| **Small** | Touches 5-6 files. Single-purpose: replace callback mechanism with EventBus. Fits in one session. | YES |
| **Testable** | 7 Gherkin scenarios. Unit-testable in isolation (InMemoryQueueEventBus has no I/O). Existing websocket test covers integration. | YES |

---

## Definition of Done

- [ ] `QueueEventBus` interface exists in `src/entities/queue/queueEventBus.ts`
- [ ] `InMemoryQueueEventBus` implementation exists in `src/frameworks/queue/queueEventBus.memory.ts`
- [ ] Unit tests for `InMemoryQueueEventBus` cover all 7 Gherkin scenarios
- [ ] `pQueueAdapter.ts` has zero global mutable callback variables (`progressChangeCallback`, `stateChangeCallback` removed)
- [ ] `setProgressChangeCallback()` and `setStateChangeCallback()` are removed
- [ ] `initQueue()` accepts `QueueEventBus` as a parameter
- [ ] `pQueueAdapter.ts` emits events via `eventBus.emit()` at all 4 lifecycle points
- [ ] `websocket.ts` subscribes to EventBus instead of using setter callbacks
- [ ] `server.ts` creates `InMemoryQueueEventBus` and injects it into both consumers
- [ ] Existing websocket test updated and passing
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] No regression on dashboard WebSocket live updates (manual verification)

---

## Files Impacted

| File | Change |
|------|--------|
| `src/entities/queue/queueEventBus.ts` | **NEW** — EventBus interface + event type map |
| `src/frameworks/queue/queueEventBus.memory.ts` | **NEW** — InMemoryQueueEventBus |
| `src/frameworks/queue/pQueueAdapter.ts` | **MODIFY** — remove global callbacks, use injected EventBus |
| `src/main/websocket.ts` | **MODIFY** — subscribe via EventBus instead of setter callbacks |
| `src/main/server.ts` | **MODIFY** — create and wire EventBus instance |
| `src/tests/units/frameworks/queue/queueEventBus.memory.test.ts` | **NEW** — unit tests |
| `src/tests/units/main/websocket.test.ts` | **MODIFY** — update mocks for EventBus |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking WebSocket live updates | Existing test coverage + manual dashboard verification |
| Listener errors crashing queue processing | Wrap each listener call in try/catch (same pattern as `logBuffer.ts:39-42`) |
| Memory leaks from unremoved listeners | `on()` returns unsubscribe; document cleanup in shutdown path |
