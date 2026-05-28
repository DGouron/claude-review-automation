# Plan — SPEC-176 Job History Persistence

PLAN:
  scope: Persist every completed job (success/failure/killed/timeout) to a daily JSONL file at `~/.claude-review/jobs/<YYYY-MM-DD>.jsonl`. On daemon startup, prune files outside the retention window (default 7 days, configurable) and reload remaining records into the in-memory `completedJobs` list. Best-effort writes: failures log a warning but never block the pipeline. Tolerate corrupted lines on load.
  is_new_module: false
  module: `src/modules/review-execution/`

  Anti-overengineering challenge:
    - 3 use cases proposed (persist / load / prune). Each maps to a distinct lifecycle moment (per-job, startup-load, startup-prune). No further split. No EventBus, no presenter, no controller.
    - Single fileSystem gateway implements 3 verbs (`appendRecord`, `loadRecordsWithinWindow`, `deleteRecordsOutsideWindow`). No CLI gateway, no API.
    - No branded type for `JobRecordId` — `jobId` is already a plain string in `ReviewJob` and would only introduce friction. Branded type reserved for `JobHistoryStorageRoot: string` if it surfaces as a public domain value; otherwise keep injectable raw path.
    - `JobRecord` is a flat data shape; no Value Object class, just a schema + guard. Business invariants (positive duration, valid status enum) live in the schema.

---

ENTITIES:
  - name: JobRecord
    schema: src/modules/review-execution/entities/job/jobRecord.schema.ts
    guard: src/modules/review-execution/entities/job/jobRecord.guard.ts
    gateway_contract: src/modules/review-execution/entities/job/jobHistory.gateway.ts
    test: src/tests/units/modules/review-execution/entities/job/jobRecord.guard.test.ts
    factory: src/tests/factories/jobRecord.factory.ts
    fields:
      - jobId: string                  # from `ReviewJob.id`
      - platform: 'gitlab' | 'github'
      - projectPath: string
      - mergeRequestId: number         # mirrors `ReviewJob.mrNumber`
      - jobType: 'review' | 'followup'
      - startedAt: string              # ISO-8601 (mandatory; the spec lists it)
      - completedAt: string            # ISO-8601
      - durationMs: number             # non-negative; derived in adapter from start/completed
      - status: 'success' | 'failed' | 'killed' | 'timeout'
      - exitReason: string | null      # `null` not `undefined` per coding-standards
    notes:
      - Status mapping from current `JobStatus.status` (queued/running/completed/failed):
          - `completed` + not aborted → 'success'
          - `failed` + error matches /aborted|cancel/i + signal aborted → 'killed'
          - `failed` + error matches /timeout/i (or PQueue timeout error) → 'timeout'
          - otherwise `failed` → 'failed'
        Mapping is performed by the new use case `persistJobRecord` (NOT inside the entity).

USECASES:
  - name: persistJobRecord
    file: src/modules/review-execution/usecases/jobHistory/persistJobRecord.usecase.ts
    test: src/tests/units/modules/review-execution/usecases/jobHistory/persistJobRecord.usecase.test.ts
    type: command
    input: { jobStatus: JobStatus, abortSignalAborted: boolean, now: () => Date }
    output: `Promise<void>`             # best-effort, swallows errors and logs
    responsibility:
      - Build `JobRecord` from `JobStatus` (status mapping + duration computation)
      - Delegate to `JobHistoryGateway.appendRecord(record)`
      - Catch any error: log warning ("Échec persistance job `<id>` : `<reason>`") then return
    dependencies: { jobHistoryGateway: JobHistoryGateway, logger: Logger }

  - name: loadRecentJobHistory
    file: src/modules/review-execution/usecases/jobHistory/loadRecentJobHistory.usecase.ts
    test: src/tests/units/modules/review-execution/usecases/jobHistory/loadRecentJobHistory.usecase.test.ts
    type: query
    input: { retentionDays: number, now: () => Date }
    output: `Promise<JobRecord[]>`      # ordered most-recent-first
    responsibility:
      - Call `JobHistoryGateway.loadRecordsWithinWindow(retentionDays, now)`
      - Skip malformed lines (the gateway already filters; this use case just sorts + caps)
      - Sort descending by `completedAt`
    dependencies: { jobHistoryGateway: JobHistoryGateway, logger: Logger }

  - name: pruneJobHistory
    file: src/modules/review-execution/usecases/jobHistory/pruneJobHistory.usecase.ts
    test: src/tests/units/modules/review-execution/usecases/jobHistory/pruneJobHistory.usecase.test.ts
    type: command
    input: { retentionDays: number, now: () => Date }
    output: Promise<{ deletedFilenames: string[] }>
    responsibility:
      - Call `JobHistoryGateway.deleteRecordsOutsideWindow(retentionDays, now)`
      - Log summary `{ deletedFilenames.length }` for observability
    dependencies: { jobHistoryGateway: JobHistoryGateway, logger: Logger }

GATEWAYS:
  - name: JobHistoryGateway
    contract: src/modules/review-execution/entities/job/jobHistory.gateway.ts
    implementation: src/modules/review-execution/interface-adapters/gateways/fileSystem/jobHistory.fileSystem.gateway.ts
    impl_test: src/tests/units/modules/review-execution/interface-adapters/gateways/fileSystem/jobHistory.fileSystem.gateway.test.ts
    stub: src/tests/stubs/jobHistory.stub.ts
    methods:
      - `appendRecord(record: JobRecord): Promise<void>`
          • Writes one JSON line atomically using `fs/promises.appendFile` (POSIX append is atomic for sizes < PIPE_BUF, which our small JSON lines respect — satisfies "concurrent writes don't corrupt")
          • Ensures `~/.claude-review/jobs/` directory exists (mkdir recursive on first write)
          • Filename derived from `record.completedAt` slice 0..10 → `<YYYY-MM-DD>.jsonl`
      - `loadRecordsWithinWindow(retentionDays: number, now: Date): Promise<JobRecord[]>`
          • Lists `.jsonl` files in the storage dir
          • Filters files by date in filename ≥ now - retentionDays
          • For each file: read, split by `\n`, parse each line via `jobRecordGuard.safeParse`; on failure log "Ligne `<n>` illisible, ignorée"
          • Returns flat array of valid records
      - deleteRecordsOutsideWindow(retentionDays: number, now: Date): Promise<{ deletedFilenames: string[] }>
          • Lists files, deletes those with date < now - retentionDays via `fs/promises.unlink`
          • Returns deleted filenames for logging
      - getStorageDirectory(): string   # injectable via constructor option `rootDir` (defaults to `~/.claude-review/jobs/`)
    constructor_options:
      - rootDir?: string                # defaults to `join(homedir(), '.claude-review', 'jobs')`
      - logger: Logger                  # for the malformed-line warning
    notes:
      - Follows the pattern from `PendingReviewRequestFileSystemGateway`
      - All I/O is wrapped in try/catch; errors are surfaced for `appendRecord` (the use case decides to swallow) but swallowed in load/delete (mirror existing behavior in `reviewLogFile.fileSystem.gateway.ts`)

CONTROLLERS:
  (none — the integration point is the queue framework, not an HTTP/webhook controller)

PRESENTERS:
  (none — out of scope: spec excludes UI)

VIEWS:
  (none)

WIRING:
  files_to_modify:

    1. src/frameworks/queue/pQueueAdapter.ts
       - Add module-level mutable reference: `let persistJobRecordCallback: ((status: JobStatus, aborted: boolean) => Promise<void>) | null = null;`
       - Add exported setter: `setPersistJobRecordCallback(callback: typeof persistJobRecordCallback): void`
         (mirrors the existing `setStateChangeCallback` / `setProgressChangeCallback` patterns — keeps `pQueueAdapter` free of any direct import to `usecases/`)
       - In the `finally` block (lines 255-267), immediately after `completedJobs.unshift(jobStatus)` and before `stateChangeCallback?.()`:
           • Call `void persistJobRecordCallback?.(jobStatus, abortController.signal.aborted);`
           • The `void` discards the promise (best-effort, never awaited, never throws into the queue task)
       - Add exported `replaceCompletedJobs(records: JobStatus[]): void` to allow the startup loader to seed the in-memory list (must respect `MAX_COMPLETED_JOBS` cap)
       - NO new direct imports to `usecases/` from the framework: dependency-injected via callback (preserves the `frameworks → usecases` direction without coupling at module level)

    2. src/frameworks/config/configLoader.ts
       - Add field to `QueueConfig`: `jobHistoryRetentionDays: number`
       - Default to 7 if not present in config.json (backward compatible)
       - Validation: `>= 1` and `<= 365`, with French error message "Configuration invalide : jobHistoryRetentionDays invalide"
       - Persist new field through `validateAndEnrichConfig`
       - Update `src/tests/factories/config.factory.ts` to include the new default

    3. src/main/server.ts
       - After `initQueue(deps.logger);`, before scheduler startup:
           • Instantiate `JobHistoryFileSystemGateway` (with `deps.logger`)
           • Instantiate the 3 use cases (persist / load / prune)
           • Run `pruneJobHistory.execute({ retentionDays: config.queue.jobHistoryRetentionDays, now: () => new Date() })` then `loadRecentJobHistory.execute(...)` (await — recovery flow already runs after listen, but this is small and bounded)
           • Convert loaded `JobRecord[]` → `JobStatus[]` (a small adapter helper lives next to the loader call in `server.ts` since it's wiring glue)
           • Call `replaceCompletedJobs(seedStatuses)` to seed in-memory ring
           • Register the persist callback: `setPersistJobRecordCallback((status, aborted) => persistJobRecord.execute({ jobStatus: status, abortSignalAborted: aborted, now: () => new Date() }))`

    4. src/main/dependencies.ts (if `Dependencies` interface needs a new field for the gateway/usecases)
       - Add `jobHistoryGateway: JobHistoryGateway` so other consumers (future tests, future stats) can access it through the composition root
       - Instantiate in `createDependencies` factory
       - NOTE: this is the only addition to dependencies.ts; keep additions minimal

    5. src/tests/factories/config.factory.ts
       - Add `jobHistoryRetentionDays: 7` to the default queue block

  routes: (none — no new HTTP route)

  dependencies:
    - new gateway: JobHistoryFileSystemGateway(rootDir?, logger)
    - new use cases: PersistJobRecordUseCase, LoadRecentJobHistoryUseCase, PruneJobHistoryUseCase

---

IMPLEMENTATION_ORDER:

  Walking Skeleton (vertical slice end-to-end on the success path):
    1. Acceptance test (RED — outer loop): `src/tests/acceptance/jobHistoryPersistence.acceptance.test.ts`
       — Spawn `JobHistoryFileSystemGateway` + the 3 use cases against a tmpdir, simulate one completed `JobStatus` flowing through `persistJobRecord`, then call `loadRecentJobHistory` and assert one record back. Stays RED until step 9.

    2. `src/tests/factories/jobRecord.factory.ts` (test data shape)
       — Just a factory; no production code yet. Anchors the canonical record shape used by all tests.

    3. `src/modules/review-execution/entities/job/jobRecord.schema.ts` (Zod)
       — Justification: pure type + boundary validation; no dep.

    4. `src/modules/review-execution/entities/job/jobRecord.guard.ts`
       — `createGuard(jobRecordSchema, 'jobRecord')`. Test: `parse / safeParse / isValid` happy + reject path.

    5. `src/modules/review-execution/entities/job/jobHistory.gateway.ts` (interface only)
       — Defines `appendRecord`, `loadRecordsWithinWindow`, `deleteRecordsOutsideWindow`. No test (pure type).

    6. `src/tests/stubs/jobHistory.stub.ts`
       — In-memory implementation for use case tests. Stores records in array, applies date filter.

    7. `src/modules/review-execution/usecases/jobHistory/persistJobRecord.usecase.ts`
       — Test first (RED): `JobStatus` → `JobRecord` mapping including all 4 status branches (success / failed / killed / timeout), then GREEN.
       — Critical: best-effort behavior. Stub gateway throws → use case logs + returns void, no rethrow.

    8. `src/modules/review-execution/usecases/jobHistory/loadRecentJobHistory.usecase.ts`
       — Test first: load returns records sorted desc by `completedAt`. GREEN.

    9. `src/modules/review-execution/usecases/jobHistory/pruneJobHistory.usecase.ts`
       — Test first: returns deleted filenames, logs summary. GREEN.

   10. `src/modules/review-execution/interface-adapters/gateways/fileSystem/jobHistory.fileSystem.gateway.ts`
       — Test against `os.tmpdir()`:
         • appendRecord creates dir, appends 1 line, second call appends 2nd line (no corruption)
         • loadRecordsWithinWindow with date-window filter (file outside window ignored)
         • loadRecordsWithinWindow with one malformed line → warning logged, valid lines returned
         • deleteRecordsOutsideWindow removes only old files, returns deleted names
         • missing directory tolerated (no throw)

   11. Update `src/frameworks/config/configLoader.ts` (+ `src/tests/factories/config.factory.ts`)
       — Test in `configLoader.test.ts`: default 7, custom value parsed, invalid → throws with French message.

   12. Update `src/frameworks/queue/pQueueAdapter.ts`
       — Add `setPersistJobRecordCallback` + `replaceCompletedJobs` + call site in `finally`.
       — Test: existing pQueueAdapter tests must still pass; add one test where the callback is registered and verifying it's invoked on completion with the right `JobStatus` and `aborted` flag.

   13. Wire in `src/main/server.ts` (+ `src/main/dependencies.ts` if needed)
       — No dedicated unit test for server.ts wiring; the acceptance test from step 1 now goes GREEN.

   14. Run `yarn verify` end-to-end.

REFERENCE_FILES:
  - src/frameworks/queue/pQueueAdapter.ts — the integration hook (lines 255-267 finally block) and the JobStatus type (lines 54-61). Mandatory read: the callback indirection avoids violating dependency direction.
  - src/modules/review-execution/entities/job/jobContext.gateway.ts — existing entity in target folder; confirms naming + location.
  - src/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.ts — concrete Zod schema pattern (z.enum, z.string().min(1), `z.infer<>`).
  - src/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.guard.ts — `createGuard(schema, 'context')` pattern (1-liner).
  - src/modules/review-execution/interface-adapters/gateways/pendingReviewRequest.fileSystem.gateway.ts — closest pattern: `~/.claude-review/...` rootDir, `homedir()` default, `mkdirSync({ recursive: true })`, safeParse + skip malformed, `unlinkSync` for delete. Direct template.
  - src/modules/data-lifecycle/interface-adapters/gateways/fileSystem/reviewLogFile.fileSystem.gateway.ts — best-effort I/O pattern with empty catch blocks; mirror this style for the new gateway's load/delete (but use async `fs/promises` consistently).
  - src/modules/data-lifecycle/usecases/cleanup/cleanupExpiredReviews.usecase.ts — retention-style use case template; delegate filtering to a small policy or compute inline (we'll inline, RetentionPolicy is overkill for one comparison).
  - src/shared/foundation/guard.base.ts — `createGuard<T>(schema, 'instigator')` API surface.
  - src/frameworks/config/configLoader.ts — where to add the new `QueueConfig.jobHistoryRetentionDays` and update `validateAndEnrichConfig`.
  - src/main/server.ts — composition root where startup load + prune fire, and where the persist callback is registered on the queue module.
  - src/tests/factories/reviewJob.factory.ts — pattern for the new `jobRecord.factory.ts`.
  - src/tests/factories/config.factory.ts — to update with the new default field.

---

ACCEPTANCE_TEST:
  file: src/tests/acceptance/jobHistoryPersistence.acceptance.test.ts
  note: "SDD outer loop — written first by the implementer, RED during implementation, GREEN once steps 1-13 land."
  scenarios_covered_by_test (mirror of spec/176):
    - nominal write on success
    - write on failure (with exitReason)
    - write on killed job (abort path)
    - retention sweep on startup deletes files older than N days
    - reload at startup repopulates the in-memory completed list
    - write failure best-effort: a throwing gateway does not break the pipeline (no rethrow visible from queue's perspective)
    - malformed line tolerated: a corrupted JSONL file still yields valid records + warning
    - missing storage directory auto-created on first write
    - concurrent writes (two simultaneous appends) — both records present, no corruption
    - daily rotation: a record written after midnight lands in the new day's file
