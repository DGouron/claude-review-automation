# Report — SPEC-176 Job History Persistence

## Status

OK — Clean implementation. Acceptance test transitioned RED → GREEN. All 72 SPEC-176 related tests pass.

## Files Created (14)

| Layer | File |
|------|------|
| Entity / Schema | `src/modules/review-execution/entities/job/jobRecord.schema.ts` |
| Entity / Guard | `src/modules/review-execution/entities/job/jobRecord.guard.ts` |
| Entity / Gateway contract | `src/modules/review-execution/entities/job/jobHistory.gateway.ts` |
| Use case | `src/modules/review-execution/usecases/jobHistory/persistJobRecord.usecase.ts` |
| Use case | `src/modules/review-execution/usecases/jobHistory/loadRecentJobHistory.usecase.ts` |
| Use case | `src/modules/review-execution/usecases/jobHistory/pruneJobHistory.usecase.ts` |
| Gateway implementation | `src/modules/review-execution/interface-adapters/gateways/fileSystem/jobHistory.fileSystem.gateway.ts` |
| Test factory | `src/tests/factories/jobRecord.factory.ts` |
| Test stub | `src/tests/stubs/jobHistory.stub.ts` |
| Acceptance test | `src/tests/acceptance/176-job-history-persistence.acceptance.test.ts` |
| Unit test | `src/tests/units/modules/review-execution/entities/job/jobRecord.guard.test.ts` |
| Unit test | `src/tests/units/modules/review-execution/usecases/jobHistory/persistJobRecord.usecase.test.ts` |
| Unit test | `src/tests/units/modules/review-execution/usecases/jobHistory/loadRecentJobHistory.usecase.test.ts` |
| Unit test | `src/tests/units/modules/review-execution/usecases/jobHistory/pruneJobHistory.usecase.test.ts` |
| Unit test | `src/tests/units/modules/review-execution/interface-adapters/gateways/fileSystem/jobHistory.fileSystem.gateway.test.ts` |

## Files Modified (5)

| File | Purpose |
|------|---------|
| `src/frameworks/queue/pQueueAdapter.ts` | Added `PersistJobRecordCallback` type, `setPersistJobRecordCallback()` setter, `replaceCompletedJobs()` startup-seeding helper, call site in the `finally` block (best-effort, fire-and-forget with swallowed rejection) |
| `src/frameworks/config/configLoader.ts` | Added `jobHistoryRetentionDays` field to `QueueConfig` (default 7, range 1–365) |
| `src/main/server.ts` | Wired the gateway + 3 use cases, ran startup prune + load, seeded `completedJobs` via `replaceCompletedJobs`, registered the persist callback. Added the `reviveJobStatusFromRecord` adapter helper inline as wiring glue |
| `src/tests/factories/config.factory.ts` | Added `jobHistoryRetentionDays: 7` to the default queue block |
| `src/tests/units/frameworks/queue/pQueueAdapter.test.ts` | Added 5 new tests: persist callback fired on success / failure, callback rejection not propagated, `replaceCompletedJobs` cap at 20, replace clears previous list |
| `src/tests/units/frameworks/config/configLoader.test.ts` | Added 5 new tests covering `jobHistoryRetentionDays`: default 7, custom value, < 1 rejected, > 365 rejected, non-integer rejected |

## Test Counts

| Suite | Tests |
|-------|-------|
| `jobRecord.guard.test.ts` | 7 |
| `persistJobRecord.usecase.test.ts` | 8 |
| `loadRecentJobHistory.usecase.test.ts` | 2 |
| `pruneJobHistory.usecase.test.ts` | 3 |
| `jobHistory.fileSystem.gateway.test.ts` | 11 |
| `pQueueAdapter.test.ts` (incl. SPEC-176 additions) | 8 |
| `configLoader.test.ts` (incl. SPEC-176 additions) | 23 |
| **Acceptance** `176-job-history-persistence.acceptance.test.ts` | **10** |
| **Total** | **72** |

All 72 tests pass.

## Acceptance Test Status

- **File**: `src/tests/acceptance/176-job-history-persistence.acceptance.test.ts`
- **Transition**: RED (step 1, before any production code) → GREEN (after all units + wiring landed)
- **Final status**: GREEN — 10/10 scenarios pass

## TDD Discipline

Followed inside-out, RED-GREEN-REFACTOR per file. Every test file was written first (RED, confirmed failing) before its production counterpart (GREEN). The acceptance test stayed RED through steps 2–12 and turned GREEN at step 13 (wiring).

## Self-Review Iterations

| Iteration | Findings | Action |
|-----------|----------|--------|
| 1 | Biome lint: 2 `noDelete` violations in test files (using `delete` to craft invalid input objects) | Replaced `delete` with destructuring rest pattern (`const { exitReason: _ignored, ...withoutExitReason }`); zero lint errors in SPEC-176 scope |
| 1 | Initial `void persistJobRecordCallback?.(...)` left an unhandled rejection when the callback threw | Switched to capturing the promise and calling `.catch(() => {})` to swallow rejection without awaiting — best-effort contract preserved, no unhandled rejection |
| 1 | Initially logged `'Job history pruned'` as English; briefly considered switching to French | Re-checked coding-standards: logs are English, only user-facing messages are French. Kept English. |
| 1 | All other code reviewed clean against the rubric (naming, imports, no `any`/`as`/`!`, `null` for absence, Zod boundaries, factories+stubs, dependency direction) | No further changes needed |

**Total iterations**: 1 (no second pass needed — all violations fixed in the first sweep).

## Verify Status

- `yarn test:ci` on SPEC-176 surface: **72/72 PASS**
- `yarn lint` on SPEC-176 files: **0 errors** (3 remaining errors in repo are pre-existing in `detectDegradedWorktrees.usecase.ts`, `worktreeHealthProbe.fileSystem.gateway.ts` — SPEC-175 WIP, not in this scope)
- `npx tsc --noEmit` on SPEC-176 files: **0 errors** (7 errors in repo are pre-existing in `detectDegradedWorktrees`, `175-worktree-failure-visibility`, `runtimeSettings.test` — SPEC-175 WIP and other tracks, not in this scope)
- Full `yarn test:ci`: **2464 passed / 9 failed**. The 9 failing tests are pre-existing: 8 in `175-worktree-failure-visibility.acceptance.test.ts` (SPEC-175 WIP) and 1 flaky `cli/cli.integration.test.ts`. None touch SPEC-176.

## Spec Coverage Matrix

| Rule / Scenario | Test |
|------|------|
| **Rule** Every job completion persists one record to disk | `pQueueAdapter.test.ts > invokes the persist callback after a successful job` + `… after a failed job` |
| **Rule** Records stored as JSONL (one JSON object per line) | `jobHistory.fileSystem.gateway.test.ts > creates the directory on first write and writes one JSONL line` + `appends a second line when called twice` |
| **Rule** Storage path is one file per day `~/.claude-review/jobs/<YYYY-MM-DD>.jsonl` | `jobHistory.fileSystem.gateway.test.ts > writes records to the file derived from completedAt slice` |
| **Rule** Record contains jobId, projectPath, mergeRequestId, startedAt, completedAt, durationMs, status, exitReason | `jobRecord.guard.test.ts` (whole suite) + `persistJobRecord.usecase.test.ts > persists platform, projectPath, mergeRequestId, jobType extracted from job` |
| **Rule** Retention is 7 days by default, configurable | `configLoader.test.ts > defaults to 7 when the field is missing` + `accepts a custom integer between 1 and 365` |
| **Rule** Files older than retention are deleted on daemon startup | Acceptance Scenario 4 + `pruneJobHistory.usecase.test.ts > deletes files outside the retention window` |
| **Rule** At daemon startup, files inside retention loaded into in-memory recent list | Acceptance Scenario 5 + wiring in `src/main/server.ts` (`replaceCompletedJobs(recentRecords.map(reviveJobStatusFromRecord))`) |
| **Rule** Write failures must not block the pipeline; warning logged | `persistJobRecord.usecase.test.ts > does not rethrow when the gateway throws and logs a French warning` + `pQueueAdapter.test.ts > does not propagate a callback rejection back into the queue` + Acceptance Scenario 6 |
| **Rule** Concurrent writes must not corrupt the file | Acceptance Scenario 9 |
| **Rule** Malformed line skipped with a warning, rest of file usable | `jobHistory.fileSystem.gateway.test.ts > skips malformed JSONL lines and logs a warning per line` + Acceptance Scenario 7 |
| **Scenario 1** nominal write on success | Acceptance Scenario 1 |
| **Scenario 2** write on failure | Acceptance Scenario 2 |
| **Scenario 3** write on killed job | Acceptance Scenario 3 + `persistJobRecord.usecase.test.ts > maps an aborted completed job to status killed` + `… cancel to status killed` |
| **Scenario 4** daily rotation at midnight | Acceptance Scenario 10 |
| **Scenario 5** retention sweep on startup | Acceptance Scenario 4 |
| **Scenario 6** reload at startup | Acceptance Scenario 5 |
| **Scenario 7** write failure best-effort | Acceptance Scenario 6 + `persistJobRecord.usecase.test.ts` best-effort test + `pQueueAdapter.test.ts` callback rejection test |
| **Scenario 8** concurrent writes | Acceptance Scenario 9 |
| **Scenario 9** malformed line tolerated | Acceptance Scenario 7 + `jobHistory.fileSystem.gateway.test.ts` corrupt-line tests |
| **Scenario 10** missing storage directory | Acceptance Scenario 8 + `jobHistory.fileSystem.gateway.test.ts > creates the directory on first write` |

## Architectural Notes

- **Dependency direction preserved**: `frameworks/queue/pQueueAdapter.ts` does NOT import from `usecases/`. The callback indirection (`setPersistJobRecordCallback`) mirrors the existing `setStateChangeCallback` / `setProgressChangeCallback` pattern. Wiring happens at the composition root (`src/main/server.ts`), so the framework module remains a pure mechanism with no domain coupling.
- **Best-effort persistence**: the call site in the `finally` block captures the returned promise and attaches `.catch(() => {})` to swallow rejections without awaiting. This guarantees the queue task never blocks on a disk write and never fails because of one.
- **Status mapping in the use case, not the entity**: `JobStatus → JobRecord.status` translation lives in `persistJobRecord.usecase.ts`. The entity (`JobRecord`) stays a pure data shape with no business logic.
- **JSONL atomicity**: `fs/promises.appendFile` uses `O_APPEND` semantics; POSIX guarantees atomic appends for writes < `PIPE_BUF` (typically 4 KiB). The records (a few hundred bytes each) sit well within that bound, satisfying the "concurrent writes don't corrupt" rule.
- **Anti-overengineering audit passed**: no Value Object class for `JobRecord` (flat schema sufficient), no branded type for `jobId` (already a plain string elsewhere), no EventBus refactoring, no presenter/controller. Three use cases mirror the three lifecycle moments (per-job, startup-load, startup-prune); no further split.

## Remaining Issues

None within SPEC-176 scope. Pre-existing issues (SPEC-175 WIP, runtimeSettings unrelated changes, a flaky CLI integration test) are NOT in this scope and are explicitly out of the implementation contract for this report.

## Out-of-Scope Observations (not fixed — per scope-discipline rule)

Signaled but NOT fixed (separate scopes):

1. `src/modules/worktree-management/usecases/detectDegradedWorktrees.usecase.ts:23` — unused variable `entry` (TS6133)
2. `src/modules/worktree-management/usecases/detectDegradedWorktrees.usecase.ts:31` — Biome `useOptionalChain` violation
3. `src/modules/worktree-management/interface-adapters/gateways/worktreeHealthProbe.fileSystem.gateway.ts:49` — Biome `noUnnecessaryContinue` violation
4. `src/tests/acceptance/175-worktree-failure-visibility.acceptance.test.ts` — multiple type errors blocking the typecheck step
5. `src/tests/units/frameworks/settings/runtimeSettings.test.ts` — references two missing exports (`getWorktreeStaleThresholdHours`, `setWorktreeStaleThresholdHours`)
6. `src/tests/units/cli/cli.integration.test.ts` — one flaky test timing out at 5 s

These belong to SPEC-175 / runtimeSettings / CLI work and are explicitly out of SPEC-176 scope.
