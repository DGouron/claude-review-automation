# Spec #175 — Make Degraded Worktrees Visible and Cleanable from the Dashboard

**Labels**: enhancement, P2-important, dashboard, worktree
**Date**: 2026-05-24
**Status**: drafted

---

## Context

SPEC-170 and SPEC-173 delivered the nominal worktree lifecycle (build, reuse, sweep) and the dashboard panel showing active worktrees. Failures along the way — stale worktrees never collected, orphan git locks, unresolved conflicts, missing build artifacts — are currently logged as warnings only, with no visual surface in the dashboard and no way to act on them without SSH'ing into the host. This forces the operator to discover problems through indirect signals (a review hangs, a job fails mysteriously) instead of seeing the worktree state at a glance.

The dashboard needs to (1) flag degraded worktrees explicitly and (2) offer a force-cleanup action from the UI so the operator can resolve the situation without leaving the dashboard.

---

## Rules

- A worktree in a degraded state must display a visual alert in the dashboard worktree panel
- Detected degraded states: stale (inactive beyond threshold), orphan git lock, unresolved git conflict, missing build artifacts
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
- missing build artifacts: {buildArtifactsPresent: false} → status "degraded" + alert "Artefacts de build manquants"
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
| Degraded | A worktree in a state preventing its normal lifecycle: stale, orphan lock, conflict, or missing build artifacts |
| Force-cleanup | An operator-triggered removal of a worktree that bypasses the normal lifecycle checks |
| Build artifacts | The files produced by the project's build (e.g., `node_modules`, `dist`) whose absence indicates an interrupted setup |

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
