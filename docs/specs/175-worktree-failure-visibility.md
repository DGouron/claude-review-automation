# Spec #175 — Make Degraded Worktrees Visible and Cleanable from the Dashboard

**Labels**: enhancement, P2-important, dashboard, worktree
**Date**: 2026-05-24
**Status**: implemented

---

## Amendment (2026-05-28)

The `missing-build-artifacts` degraded state was **removed**. Review worktrees are created via `git worktree add` with no dependency install step — they never carry `node_modules` because a code review reads source, it does not build. The signal therefore flagged every freshly created worktree as degraded ("Artefacts de build manquants" / "Cleanup forcé recommandé"), a 100% false positive. The three remaining signals (`stale`, `orphan-git-lock`, `unresolved-conflict`) are genuine stuck-worktree conditions and are kept. References to the removed signal below are struck through for historical context.

---

## Implementation

See `docs/reports/175-worktree-failure-visibility.report.md` for the full implementation report.

### Artefacts

- **Entities**: `WorktreeHealth` discriminated union (`healthy` | `degraded` with `DegradedReason` of kind `stale` | `orphan-git-lock` | `unresolved-conflict`), `WorktreeHealthReport`, `WorktreeHealthProbeGateway` contract.
- **Use cases**: `detectDegradedWorktrees` (ordered first-match detection), `removeWorktree` extended with `force?: boolean` for registry-only cleanup when FS path is absent.
- **Services**: `InMemoryForceCleanupLockService` (concurrency guard keyed by `${platform}:${projectPath}:${mrNumber}`).
- **Gateways**: `WorktreeHealthProbeFileSystemGateway` (resolves worktree-local `.git` pointer → `<main-repo>/.git/worktrees/<name>/`, probes `index.lock`/`HEAD.lock` ages, runs `git status --porcelain=v1` for unresolved conflicts).
- **Presenter**: `worktreePanel.presenter.ts` extended with `degradedCount` + `degraded[]` carrying French user-facing reason labels and ready-to-POST cleanup payloads.
- **Controller**: `worktreeOverview.routes.ts` extended (GET payload + new POST endpoint).
- **View**: `dashboard/modules/worktreePanel.js` gains `renderDegradedAlerts` and `triggerForceCleanup`; `index.html` binds the click handlers; `styles.css` adds the alert chrome.
- **Settings**: `runtimeSettings.ts` adds `worktreeStaleThresholdHours` (default 24, range [1, 720]).

### Endpoints

| Method | Route | Use case |
|--------|-------|----------|
| GET | `/api/worktrees` | `detectDegradedWorktrees` + presenter (additive `degraded[]` + `degradedCount`, backwards-compatible). |
| POST | `/api/worktrees/cleanup` (body `{ platform, projectPath, mrNumber }`) | `forceCleanupLock.tryAcquire` + `removeWorktree({ force: true })` + `release` in `finally`. |

### Architectural decisions

- **No state machine** — discriminated union + ordered first-match detection (`stale → orphan-lock → unresolved-conflict → missing-artifacts → healthy`).
- **Single probe boundary** — `WorktreeHealthProbeGateway.probe(entry): HealthSignals` aggregates the 3 FS checks in one round-trip instead of 4 micro-gateways.
- **No new force-cleanup use case** — extended existing `removeWorktree.usecase.ts` with backwards-compatible `force?: boolean`.
- **In-memory lock**, no distributed coordination — single-process daemon constraint.
- **No audit-log entity** — structured `logger.info` / `logger.warn` calls satisfy the "logs reason + outcome" rule.
- **POST with JSON body** instead of URL path params — avoids GitLab `projectPath` (`group/project`) URL-encoding pitfalls.

---

## Context

SPEC-170 and SPEC-173 delivered the nominal worktree lifecycle (build, reuse, sweep) and the dashboard panel showing active worktrees. Failures along the way — stale worktrees never collected, orphan git locks, unresolved conflicts, missing build artifacts — are currently logged as warnings only, with no visual surface in the dashboard and no way to act on them without SSH'ing into the host. This forces the operator to discover problems through indirect signals (a review hangs, a job fails mysteriously) instead of seeing the worktree state at a glance.

The dashboard needs to (1) flag degraded worktrees explicitly and (2) offer a force-cleanup action from the UI so the operator can resolve the situation without leaving the dashboard.

---

## Rules

- A worktree in a degraded state must display a visual alert in the dashboard worktree panel
- Detected degraded states: stale (inactive beyond threshold), orphan git lock, unresolved git conflict
- Stale threshold is configurable (default: 24h)
- Each degraded worktree shows: reason, detection timestamp, recommended action
- Force-cleanup action removes the worktree from filesystem AND from git worktree registry (`git worktree prune`)
- Force-cleanup logs reason, timestamp, and outcome (success or failure)
- Only one force-cleanup action per worktree may run concurrently
- Cleanup failures surface as a separate alert and do not silently disappear from the panel
- Healthy worktrees show no alert and no force-cleanup button

---

## Scenarios

- healthy worktree: {state: "active", lastActivity: "5min"} → status "healthy" + no alert
- stale detected: {state: "active", lastActivity: "26h", staleThreshold: "24h"} → status "stale" + alert "Worktree inactif depuis 26h"
- orphan git lock: {gitLockPresent: true, lockAge: "2h"} → status "degraded" + alert "Lock git orphelin depuis 2h"
- unresolved git conflict: {gitStatus: "conflict"} → status "degraded" + alert "Conflit git non résolu"
- ~~missing build artifacts: {buildArtifactsPresent: false} → status "degraded" + alert "Artefacts de build manquants"~~ (removed 2026-05-28 — false positive on every review worktree)
- force-cleanup success: {worktree: "stale", action: "force-cleanup"} → removed + log entry "Force cleanup (raison : inactif 26h)"
- force-cleanup failure: {worktree: "stale", action: "force-cleanup", filesystemError: "EACCES"} → reject "Cleanup échoué : permission refusée" + alert preserved + failure log entry
- force-cleanup already running: {worktree: "stale", action: "force-cleanup", inProgress: true} → reject "Cleanup déjà en cours sur ce worktree"
- alert clears after success: {worktree: "stale", action: "force-cleanup", succeeded: true} → alert removed from panel + worktree disappears from list
- multiple degraded worktrees: {worktrees: 3, allStale: true} → 3 distinct alerts shown + 3 independent force-cleanup buttons

---

## Out of Scope

- Auto-recovery (delete-then-rebuild) — separate spec if real demand emerges
- Disk pressure / capacity-based proactive cleanup — separate concern
- Per-MR retry logic on failed worktree creation — already handled by SPEC-170 lifecycle
- Confirmation dialog before force-cleanup — degraded state implies the operator already saw the alert and decided to act
- Cross-platform support beyond Linux — ReviewFlow runs on systemd Linux only
- Email or push notifications on degraded state — dashboard-only for now

---

## Glossary

| Term | Definition |
|------|------------|
| Worktree | Working directory created via `git worktree add` and used as the isolated checkout for a single MR review |
| Stale | A worktree whose last activity timestamp is older than the configured threshold (default 24h) |
| Degraded | A worktree in a state preventing its normal lifecycle: stale, orphan lock, or conflict |
| Force-cleanup | An operator-triggered removal of a worktree that bypasses the normal lifecycle checks |

---

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | SPEC-170 and SPEC-173 are shipped; no new blocker |
| Negotiable | OK | Detection signals and UI form left to implementation |
| Valuable | OK | Operator regains visibility and one-click resolution without SSH |
| Estimable | OK | Bounded: 1 detection gateway, 1 use case, 1 controller route, 1 presenter, dashboard view update |
| Small | OK | ~10 files, fits 1.5-2j IA |
| Testable | OK | 10 scenarios, each maps to one observable behavior |

**Verdict**: READY

---

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 3 | Worktree module + dashboard panel |
| Impact | 1 | Medium — prevents silent worktree leaks, replaces SSH troubleshooting with one click |
| Confidence | 80% | Detection signals well-understood from SPEC-170/173 code; UI pattern proven by worktree panel |
| Effort | 3 pts | 1.5-2j IA |
| **Score** | **0.80** | |

**Priority**: Moderate

---

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
