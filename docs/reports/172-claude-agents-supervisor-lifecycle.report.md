# Report — SPEC-172 Claude Agents Supervisor Lifecycle

**Date**: 2026-05-23
**Spec**: `docs/specs/172-claude-agents-supervisor-lifecycle.md`
**Branch**: `worktree-spec-172-claude-agents-supervisor`
**Status**: implemented — all 9 acceptance criteria met, 1654 tests passing.

## Files Created

### New bounded context `src/modules/supervisor-management/`

- `entities/supervisor/supervisorStatus.schema.ts` — `SupervisorState` literal union (`up`/`down`/`unknown`), `SupervisorStatus = { state, reason, lastCheckedAt }`
- `entities/supervisor/supervisor.gateway.ts` — `SupervisorGateway` contract (`probe` + `spawnDetached`)
- `entities/supervisor/supervisorLock.gateway.ts` — `SupervisorLockGateway` contract (acquire/release with PID-validated takeover)
- `entities/supervisor/supervisorStatusStore.gateway.ts` — `SupervisorStatusStoreGateway` contract (read/write latest status)
- `interface-adapters/gateways/supervisor.cli.gateway.ts` — spawn-based probe (5s timeout) + detached spawn (`{ detached: true, stdio: 'ignore' }` + `unref()`)
- `interface-adapters/gateways/supervisorLock.fileSystem.gateway.ts` — PID-validated lock at `~/.reviewflow/supervisor.lock`; takes over if recorded PID is dead
- `interface-adapters/gateways/supervisorStatusStore.memory.gateway.ts` — in-memory cache shared between scheduler and `/health` endpoint
- `usecases/checkSupervisorAndRespawn.usecase.ts` — orchestrates: probe → if `down`, acquire lock → spawn → re-probe → release lock → emit status

### Framework + composition

- `src/frameworks/scheduler/supervisorScheduler.ts` — runs the check immediately at boot then every 60 seconds; returns a `stop` handle for graceful shutdown

### Tests

- `src/tests/acceptance/172-claude-agents-supervisor-lifecycle.acceptance.test.ts` — 4 scenarios: up at boot, down→spawn-ok, down→spawn-fail, periodic up→down transition
- 5 unit-test files under `src/tests/units/modules/supervisor-management/`
- `src/tests/units/frameworks/scheduler/supervisorScheduler.test.ts`
- `src/tests/stubs/supervisor.stub.ts`, `supervisorLock.stub.ts`, `capturingLogger.stub.ts`

## Files Modified

- `src/main/server.ts` — calls `startSupervisorScheduler` after the existing init; captures the stop handle for graceful shutdown
- `src/main/dependencies.ts` — instantiates the 3 gateways + use case; wires them into `Dependencies`
- `src/main/routes.ts` — passes the supervisor status store into the `/health` route deps
- `src/modules/cli-configuration/interface-adapters/controllers/http/health.routes.ts` — extended `/health` response with `supervisor: { state, reason, lastCheckedAt }`; overall `status` is `degraded` when supervisor is `down`
- `src/tests/units/interface-adapters/controllers/http/health.routes.test.ts` — covers the new shape
- `docs/feature-tracker.md` — SPEC-172 status `implemented`

## Acceptance Criteria — All Met

| AC | Status | Evidence |
|----|--------|----------|
| AC-1 boot health check + log | ✓ | server.ts wires startSupervisorScheduler |
| AC-2 detached spawn on down | ✓ | supervisor.cli.gateway spawn block + use case |
| AC-3 /health endpoint extension | ✓ | health.routes.ts |
| AC-4 60s periodic re-check + respawn | ✓ | supervisorScheduler.ts |
| AC-5 file lock prevents duplicate spawn | ✓ | supervisorLock.fileSystem.gateway.ts (PID-validated takeover) |
| AC-6 5s probe timeout | ✓ | supervisor.cli.gateway probe with `{ timeout: 5000 }` |
| AC-7 shutdown does NOT kill spawned supervisor | ✓ | spawn uses `detached: true` + `unref()` (verified in tests) |
| AC-8 acceptance test (4 scenarios) | ✓ | `172-...acceptance.test.ts` |
| AC-9 tracker updated | ✓ | docs/feature-tracker.md (this commit) |

## Decisions Taken on Spec-flagged Risks

| Risk | Decision |
|------|----------|
| `claude` binary not in PATH | Surfaced via `supervisor-spawn-failed` reason in `/health`; the daemon still boots — does not crash |
| Spawn succeeds but supervisor dies immediately | Re-check after spawn confirms before declaring `up`; if the re-check fails, status reports `down` with reason `spawn-unstable` |
| `--allow-dangerously-skip-permissions` requires its own disclaimer | NOT used in SPEC-172 — we spawn plain `claude agents` without that flag; the disclaimer issue was already side-stepped by switching `--bg` to `--permission-mode auto` in SPEC-170 |
| Stale lock file after daemon crash | PID-validated lock: when acquiring, if the recorded PID is no longer alive, we take over the lock |
| 60s probe resource cost | Each probe spawns a short-lived child; under default Node memory budget this is negligible. Re-evaluate if disk/CPU pressure observed in staging |
| Operator inspection | Spawned supervisor is accessible via `claude agents --json` and `kill <pid>` like any other process; no encapsulation barrier |

## Verification

```
yarn verify
✓ typecheck OK
✓ lint OK (Biome — 588 files)
✓ tests OK — 233 files / 1654 passing / 0 todo
```

## Follow-up Considerations

- **Tunable probe interval**: 60s is hardcoded; if operators observe supervisor flakiness, expose `SUPERVISOR_CHECK_INTERVAL_MS` env var
- **Dashboard surfacing**: `/health` exposes the status as JSON; a dashboard widget showing supervisor state would close the UX loop
- **Supervisor crash diagnostics**: if respawn loops too frequently, add a circuit-breaker that stops respawning after N attempts and surfaces a louder warning
- **Backoff on repeated spawn failures**: currently each 60s tick attempts respawn unconditionally on `down`; consider exponential backoff if the spawn fails

These are not blockers — file them as separate specs if operational data justifies them.
