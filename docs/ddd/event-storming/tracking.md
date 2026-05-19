# Event Storming — Tracking

*Date: 2026-03-22*
*Scope: MR/PR lifecycle tracking — assignment, state transitions, push events, thread synchronization*

## Domain Events (🟧)

| Event | Trigger | Source file |
|-------|---------|-------------|
| MrAssigned | Webhook detects reviewer assignment | `usecases/tracking/trackAssignment.usecase.ts` |
| MrUpdated | Existing TrackedMr updated with new assignment info | `usecases/tracking/trackAssignment.usecase.ts` |
| PushRecorded | New commits pushed to tracked MR | `usecases/tracking/recordPush.usecase.ts` |
| ReviewEventRecorded | Review completion data saved to tracking | `usecases/tracking/recordReviewCompletion.usecase.ts` |
| ThreadsSynced | Thread status refreshed from platform | `usecases/tracking/syncThreads.usecase.ts` |
| StateTransitioned | MR state changed (approved/merged/closed) | `usecases/tracking/transitionState.usecase.ts` |
| FollowupNeeded | Push detected on MR needing re-review | `usecases/tracking/checkFollowupNeeded.usecase.ts` |

## Commands / Use Cases (🟦)

| Command | Actor | Event produced | Source file |
|---------|-------|----------------|-------------|
| TrackAssignment | Webhook (reviewer assigned) | MrAssigned, MrUpdated | `usecases/tracking/trackAssignment.usecase.ts` |
| RecordPush | Webhook (push event) | PushRecorded | `usecases/tracking/recordPush.usecase.ts` |
| RecordReviewCompletion | System (post-review) | ReviewEventRecorded | `usecases/tracking/recordReviewCompletion.usecase.ts` |
| SyncThreads | System (scheduled) | ThreadsSynced | `usecases/tracking/syncThreads.usecase.ts` |
| CheckFollowupNeeded | Webhook (push event) | FollowupNeeded | `usecases/tracking/checkFollowupNeeded.usecase.ts` |
| TransitionState | Webhook (merge/close/approve) | StateTransitioned | `usecases/tracking/transitionState.usecase.ts` |

## Entities (🟨)

| Entity | Responsibility | Files |
|--------|----------------|-------|
| TrackedMr | Full lifecycle state of a tracked MR/PR: state, timestamps, thread counts, review events, push history | `entities/tracking/trackedMr.ts` |
| MrTrackingData | Container for all tracked MRs in a project with aggregate ProjectStats | `entities/tracking/mrTrackingData.ts` |
| AssignmentInfo | Who assigned the review and when | `entities/tracking/assignmentInfo.ts` |
| ReviewEvent | Record of a single review execution: type, duration, score, threads, diff stats | `entities/tracking/reviewEvent.ts` |

## Policies and Business Rules (🟪)

| Rule | Description | Source file |
|------|-------------|-------------|
| TrackedMr identity | `createTrackedMrId(projectPath, mrNumber)` produces unique composite key | `entities/tracking/trackedMr.ts` |
| State transition validation | Uses ReviewRequestState value object to validate transitions | `usecases/tracking/transitionState.usecase.ts` |
| Followup condition | MR must be `pending-fix` OR `pending-approval` with warnings, and `lastPushAt > lastReviewAt` | `usecases/tracking/checkFollowupNeeded.usecase.ts` |
| Timestamp mapping | `approved` → sets `approvedAt`, `merged` → sets `mergedAt` | `usecases/tracking/transitionState.usecase.ts` |
| Idempotent assignment | If TrackedMr already exists, updates rather than creates | `usecases/tracking/trackAssignment.usecase.ts` |

## Presenters (🟩)

| Presenter | Data exposed | File |
|-----------|-------------|------|
| (via dashboard views) | MR sheet with state, threads, events | `interface-adapters/views/dashboard/modules/mrSheet.js` |

## Gateways and External Systems (⬜)

| System | Interaction | Gateway contract | Implementation |
|--------|-------------|-----------------|----------------|
| File System | Persist tracking data JSON | `entities/tracking/reviewRequestTracking.gateway.ts` | `interface-adapters/gateways/fileSystem/reviewRequestTracking.fileSystem.ts` |
| GitLab API | Fetch discussion threads | `entities/threadFetch/threadFetch.gateway.ts` | `interface-adapters/gateways/threadFetch.gitlab.gateway.ts` |
| GitHub API | Fetch review threads (GraphQL) | `entities/threadFetch/threadFetch.gateway.ts` | `interface-adapters/gateways/threadFetch.github.gateway.ts` |

## Relations with other Bounded Contexts

| Related BC | Pattern (Vaughn Vernon) | Direction | Detail |
|-----------|------------------------|-----------|--------|
| Review Execution | Customer-Supplier | Review → Tracking | Review provides completion data (score, duration, threads); Tracking records it as ReviewEvent |
| Platform Integration | Anti-Corruption Layer | Platform → Tracking | Webhook controllers call tracking use cases with domain-transformed data |
| Statistics & Insights | Customer-Supplier | Tracking → Stats | Tracking provides TrackedMr data; Stats aggregates it |
| Shared Kernel | Shared Kernel | Tracking ↔ Stats | `DiffStats` type from `entities/diffStats/` used by both |

## Ubiquitous Language

| Term | Definition in this BC | Equivalent term in other BCs |
|------|----------------------|------------------------------|
| TrackedMr | Full lifecycle record of a MR/PR being tracked | ReviewRequest in Review Execution (overlapping concept) |
| ReviewEvent | Record of one review run with metrics | ReviewJob in Review Execution (different scope) |
| AssignmentInfo | Who triggered the review assignment | — |
| MrTrackingData | All tracked MRs for one project | ProjectStats in Statistics (different focus) |

## Hot Spots (🩷)

| Problem | Severity | Detail |
|---------|----------|--------|
| TrackedMr vs ReviewRequest overlap | 🟡 | Both `TrackedMr` (tracking) and `ReviewRequest` (reviewRequest entity) represent an MR/PR but with different shapes — potential concept duplication |
| Large gateway contract | 🟡 | `ReviewRequestTrackingGateway` has 12+ methods (loadTracking, saveTracking, getById, getByNumber, create, update, getByState, getActiveMrs, remove, archive, recordReviewEvent, recordPush) — may benefit from splitting |
| DiffStats cross-domain coupling | 🟡 | `ReviewEvent` imports `DiffStats` from `entities/diffStats/` — shared type across Tracking and Stats BCs |
