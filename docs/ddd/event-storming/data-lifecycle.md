# Event Storming — Data Lifecycle

*Date: 2026-03-22*
*Scope: Cleanup of expired reviews, log files, and data retention policies*

## Domain Events (🟧)

| Event | Trigger | Source file |
|-------|---------|-------------|
| ReviewsExpired | Cleanup use case identifies expired reviews | `usecases/cleanup/cleanupExpiredReviews.usecase.ts` |
| ReviewFileDeleted | Individual review file removed | `usecases/cleanup/cleanupExpiredReviews.usecase.ts` |
| LogFileDeleted | Individual log file removed | `usecases/cleanup/cleanupExpiredReviews.usecase.ts` |

## Commands / Use Cases (🟦)

| Command | Actor | Event produced | Source file |
|---------|-------|----------------|-------------|
| CleanupExpiredReviews | User (API/scheduled) | ReviewsExpired | `usecases/cleanup/cleanupExpiredReviews.usecase.ts` |

## Entities (🟨)

| Entity | Responsibility | Files |
|--------|----------------|-------|
| RetentionPolicy | Value object: determines if a review is expired based on retention days and current date | `entities/cleanup/retentionPolicy.valueObject.ts` |

## Policies and Business Rules (🟪)

| Rule | Description | Source file |
|------|-------------|-------------|
| Retention expiration | Review files older than `retentionDays` are eligible for deletion | `entities/cleanup/retentionPolicy.valueObject.ts` |
| Dual cleanup | Both review files and associated log files are cleaned up together | `usecases/cleanup/cleanupExpiredReviews.usecase.ts` |

## Presenters (🟩)

*No dedicated presenters.*

## Gateways and External Systems (⬜)

| System | Interaction | Gateway contract | Implementation |
|--------|-------------|-----------------|----------------|
| File System | List and delete review files | `entities/review/reviewFile.gateway.ts` | `interface-adapters/gateways/reviewFile.gateway.ts` |
| File System | List and delete log files | `ReviewLogFileGateway` | `interface-adapters/gateways/reviewLogFile.gateway.ts` |

## Relations with other Bounded Contexts

| Related BC | Pattern (Vaughn Vernon) | Direction | Detail |
|-----------|------------------------|-----------|--------|
| Review Execution | Conformist | Cleanup → Review | Cleanup conforms to ReviewFileGateway contract owned by Review Execution domain |

## Ubiquitous Language

| Term | Definition in this BC | Equivalent term in other BCs |
|------|----------------------|------------------------------|
| RetentionPolicy | Rule for determining data expiration | — |
| Cleanup | Process of removing expired data | — |

## Hot Spots (🩷)

| Problem | Severity | Detail |
|---------|----------|--------|
| No tracking data cleanup | 🟡 | Only review files and logs are cleaned up — tracking data (`TrackedMr`) has no retention policy and grows indefinitely |
| No stats cleanup | 🟡 | ProjectStats are never pruned — historical stats accumulate without bound |
