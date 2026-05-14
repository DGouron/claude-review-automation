# EventBus Queue State

**Spec**: [docs/specs/82-eventbus-queue-state.md](../specs/82-eventbus-queue-state.md)
**Merged**: 2026-03-14 (marked implemented)
**Issue**: [#82](https://github.com/DGouron/review-flow/issues/82)

---

## Scope

- Replace two global mutable callbacks (`progressChangeCallback`, `stateChangeCallback`) in `pQueueAdapter.ts` with a typed `QueueEventBus` interface
- `QueueEventBus` contract in `src/entities/queue/` (inner layer defines the port)
- `InMemoryQueueEventBus` implementation in `src/frameworks/queue/`
- `initQueue()` now receives `QueueEventBus` via DI; `websocket.ts` subscribes via `eventBus.on()`
- `server.ts` (composition root) creates the instance and injects it into both consumers
- `on()` returns an unsubscribe function — same pattern as existing `logBuffer.onLog()`

---

## Outcome

Zero global mutable callback variables remain in `pQueueAdapter.ts`. Multiple listeners can now subscribe independently. Dependency Rule restored: `websocket.ts` depends on the `QueueEventBus` abstraction, not directly on `pQueueAdapter.ts` internals.

---

## Tests / Verification

Unit tests for `InMemoryQueueEventBus` cover all 7 Gherkin scenarios (multiple listeners, unsubscribe, full job lifecycle state transitions, failed job). Existing WebSocket test updated. `yarn verify` green at merge.

---

## Outstanding / Follow-ups

- `activeJobs`, `completedJobs`, `recentJobs` Maps in `pQueueAdapter.ts` remain global (explicitly out of scope — separate extraction concern)
- New event types (`job:cancelled`) can be added in follow-up tickets
