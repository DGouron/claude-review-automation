# Report — SPEC-175: Worktree Failure Visibility & Force-Cleanup

- **Spec**: `docs/specs/175-worktree-failure-visibility.md`
- **Plan**: `docs/plans/175-worktree-failure-visibility.plan.md`
- **Branch**: `feat/spec-175-worktree-failure-visibility` (isolated worktree)
- **Date**: 2026-05-27
- **Status**: implemented

> **Amendment (2026-05-28)**: the `missing-build-artifacts` signal documented below was removed. Review worktrees are never prebuilt with `node_modules`, so the check flagged every worktree as degraded. The three remaining signals (`stale`, `orphan-git-lock`, `unresolved-conflict`) are unaffected.

---

## Summary

Adds visibility for degraded worktrees (stale / orphan-lock / unresolved-conflict / missing-artifacts) on the dashboard worktree panel, plus a force-cleanup action exposed via `POST /api/worktrees/cleanup`. The detection use case applies an ordered first-match decision over signals returned by a single-call `WorktreeHealthProbeGateway`; the FS implementation probes the worktree-local `.git` pointer to find the main repo's per-worktree directory, checks `index.lock` / `HEAD.lock` ages, runs `git status --porcelain=v1` for conflicts, and `existsSync(<worktree>/node_modules)` for build artifacts. Concurrency is guarded by an in-memory lock keyed by `${platform}:${projectPath}:${mrNumber}`, acquired and released around each cleanup. The presenter exposes a `degraded[]` array with French user-facing reason labels; the dashboard renders an alert block per row with a `FORCE CLEANUP` button.

---

## Files

### Created (12)

1. `src/modules/worktree-management/entities/worktree/worktreeHealth.schema.ts` — discriminated `WorktreeHealth` + `DegradedReason`, `WorktreeHealthReport`.
2. `src/modules/worktree-management/entities/worktree/worktreeHealthProbe.gateway.ts` — contract `WorktreeHealthProbeGateway.probe(entry): HealthSignals`.
3. `src/modules/worktree-management/usecases/detectDegradedWorktrees.usecase.ts` — ordered detection (stale → orphan-lock → conflict → missing-artifacts → healthy).
4. `src/modules/worktree-management/services/forceCleanupLock.ts` — `InMemoryForceCleanupLockService` (in-memory `Set<string>`).
5. `src/modules/worktree-management/interface-adapters/gateways/worktreeHealthProbe.fileSystem.gateway.ts` — FS implementation (git pointer resolution, lock probing, porcelain conflict scan, `node_modules` check).
6. `src/tests/factories/worktreeHealth.factory.ts`
7. `src/tests/stubs/worktreeHealthProbe.stub.ts`
8. `src/tests/acceptance/175-worktree-failure-visibility.acceptance.test.ts`
9. `src/tests/units/modules/worktree-management/entities/worktree/worktreeHealth.schema.test.ts`
10. `src/tests/units/modules/worktree-management/usecases/detectDegradedWorktrees.usecase.test.ts`
11. `src/tests/units/modules/worktree-management/services/forceCleanupLock.test.ts`
12. `src/tests/units/modules/worktree-management/interface-adapters/gateways/worktreeHealthProbe.fileSystem.gateway.test.ts`

### Modified (10)

1. `src/modules/worktree-management/entities/worktree/worktree.gateway.ts` — `RemoveWorktreeRequest.force?: boolean`.
2. `src/modules/worktree-management/entities/gitCommand/gitCommand.gateway.ts` — added `'status-porcelain'` to `GitCommandKind`.
3. `src/modules/worktree-management/usecases/removeWorktree.usecase.ts` — accepts `force?: boolean`; when forced and FS reports absent, returns `removed` (registry-only cleanup).
4. `src/modules/worktree-management/interface-adapters/gateways/worktree.fileSystem.gateway.ts` — propagates `force` flag.
5. `src/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.ts` — `degradedCount`, `degraded[]`, French reason labels.
6. `src/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.ts` — extended GET payload + `POST /api/worktrees/cleanup` (JSON body; 200/400/409/500/503 envelopes).
7. `src/frameworks/settings/runtimeSettings.ts` — `worktreeStaleThresholdHours` (default 24, range [1, 720]).
8. `src/main/dependencies.ts` — instantiates `WorktreeHealthProbeFileSystemGateway` + `InMemoryForceCleanupLockService`.
9. `src/main/routes.ts` — wires the new deps into `worktreeOverviewRoutes`.
10. `src/dashboard/modules/worktreePanel.js` + `src/dashboard/index.html` + `src/dashboard/styles.css` — `renderDegradedAlerts`, `triggerForceCleanup`, `bindForceCleanupButtons`, alert CSS (warning amber + corner brackets + reduce-motion respect).
   Plus matching extensions to `src/tests/units/...` for the presenter, routes, dashboard module, and runtimeSettings tests.

---

## Validation

```
$ yarn verify
Test Files  307 passed (307)
Tests       2435 passed (2435)
Duration    16.11s
```

Typecheck: clean. Biome lint: clean. All 2435 tests pass.

---

## Acceptance test

- **File**: `src/tests/acceptance/175-worktree-failure-visibility.acceptance.test.ts`
- **Status**: GREEN
- **Result**: 6 tests pass (5 scenario tests + 1 internal consistency check)

---

## Scenario coverage matrix

| # | Scenario | Covered by | Status |
|---|----------|-----------|--------|
| 1 | healthy worktree → no alert | `detectDegradedWorktrees.usecase.test.ts` "returns healthy when no signal trips" | OK |
| 2 | stale 26h vs 24h threshold | usecase + acceptance scenario 2 | OK |
| 3 | orphan git lock (2h) | usecase test "flags orphan-git-lock" + FS gateway test | OK |
| 4 | unresolved git conflict | usecase test + FS gateway "flags 'unresolved-conflict' when status porcelain reports UU markers" | OK |
| 5 | missing build artifacts | usecase test + FS gateway "reports missing: true when node_modules is absent" | OK |
| 6 | force-cleanup success | routes test "POST /api/worktrees/cleanup returns 200" + acceptance scenario 6 | OK |
| 7 | force-cleanup failure (EACCES) preserves alert, releases lock | routes tests + acceptance scenario 7 | OK |
| 8 | force-cleanup already running → 409 | `forceCleanupLock.test.ts` + routes test + acceptance scenario 8 | OK |
| 9 | alert clears after success | presenter test "excludes healthy reports" + acceptance scenario 6 (next GET shows degradedCount=0) | OK |
| 10 | multiple degraded worktrees → N independent alerts/buttons | presenter test "produces N independent rows" + dashboard `renderDegradedAlerts` tests + acceptance scenario 10 | OK |

---

## User-validated decisions applied

- **DEC-1**: `worktreeStaleThresholdHours` added to `runtimeSettings.ts` (default 24, min 1, max 720). No new UI.
- **DEC-2**: Git lock probe resolves `<worktree>/.git` file → `<main-repo>/.git/worktrees/<name>/`, checks `index.lock` + `HEAD.lock` only.
- **DEC-3**: Missing build artifacts = `<worktree>/node_modules` absent.

---

## Self-review iterations

- **Iteration 1**: Initial implementation. `yarn verify` surfaced two type issues — an unused `entry` parameter in `decideReason` and a `platform: string` widening in the dashboard test factory. Fixed by removing the unused parameter and typing the factory's override interface explicitly.
- **Iteration 2**: Biome flagged one `useOptionalChain` lint issue on `signals.orphanLock !== null && signals.orphanLock.present`. Replaced with `signals.orphanLock?.present`.
- **Total**: 2 iterations to reach zero violations.

---

## Remaining issues

None.

---

## Notes for review

- The new GET payload is backwards-compatible: dashboards predating SPEC-175 simply receive `degradedCount: 0` + `degraded: []`.
- All new route deps on `worktreeOverviewRoutes` are optional, so the pre-existing SPEC-173 acceptance test (which omits them) keeps passing without modification.
- The `runtimeSettings.worktreeStaleThresholdHours` field is enforced via Zod with a default; existing settings files without the field load successfully and persist the default on first save.
- `removeWorktree` remains backwards-compatible when `force` is unset.
