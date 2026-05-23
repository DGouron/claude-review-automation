---
title: "SPEC-172: Claude Agents Supervisor Lifecycle Managed by ReviewFlow"
labels: enhancement, P1-critical, operational, claude-invocation
milestone: June 15 Migration
status: DRAFT
blocked-by: SPEC-169
---

# SPEC-172: Claude Agents Supervisor Lifecycle Managed by ReviewFlow

## Context

`claude --bg` (subscription-billed background sessions, introduced by SPEC-169) requires a per-user supervisor process — `claude agents` — to be already running on the machine. Today, the supervisor must be started manually in a terminal (e.g., `claude agents` from `pts/2`). If the terminal closes or the machine reboots, the supervisor dies, and every subsequent webhook fails with a confusing error rather than a clear "supervisor down" signal. ReviewFlow currently has zero awareness of its supervisor dependency.

## User Story

**As** the operator of ReviewFlow,
**I want** the `reviewflow-app` daemon to detect at boot whether the `claude agents` supervisor is running, surface its health on `/health`, and auto-spawn a detached supervisor when missing,
**So that** the system survives reboots and supervisor crashes without manual intervention.

## Scope

### In Scope

| # | Capability |
|---|------------|
| 1 | Check at daemon boot whether `claude agents` supervisor responds |
| 2 | Surface supervisor health on `/health` endpoint as `degraded` when down |
| 3 | Auto-spawn `claude agents` as a detached process when absent at boot |
| 4 | Re-check supervisor health periodically (every 60 seconds) during runtime |
| 5 | Log a clear warning when the supervisor is observed down between checks |
| 6 | Avoid spawning a duplicate supervisor when one already runs |

### Out of Scope

| Item | Reason |
|------|--------|
| Restart-supervisor-on-crash watchdog | If the spawned supervisor dies, the next 60s periodic check spawns a new one. No need for a dedicated watchdog |
| Persistent supervisor state outside the daemon | `claude agents` already persists its own state under `~/.claude/` — ReviewFlow does not need to mirror it |
| Per-project supervisor instances | A single supervisor handles all projects; ReviewFlow does not partition by project |
| User-facing supervisor controls (dashboard buttons) | Operator-level only; UI surfacing is a separate concern |
| Replacing the supervisor with our own session manager | Out of scope — `claude agents` is the official mechanism |

## Rules

- the supervisor is considered up if `claude agents --json` exits 0 and returns a JSON array
- the supervisor is considered down if the command fails, times out (>5s), or returns invalid JSON
- when down at boot, ReviewFlow spawns a new supervisor as a detached process (orphan-safe)
- when down between periodic checks, ReviewFlow logs a warning and attempts a re-spawn at the next check
- two instances of ReviewFlow on the same machine never spawn two supervisors (file-lock guard)
- the `/health` endpoint surfaces supervisor status alongside other health signals; the daemon does not refuse dispatches when down, but every dispatch carries an extra warning in the queue
- if the supervisor cannot be spawned (e.g., `claude` binary missing), the daemon still starts but `/health` reports `degraded` and `reason: 'supervisor-spawn-failed'`

## Scenarios

- supervisor up at boot: {`claude agents --json`: "exits 0, valid JSON"} → log "supervisor reachable" + health "ok"
- supervisor down at boot, spawn succeeds: {`claude agents --json`: "exits non-zero", spawn: "ok"} → spawn detached + log "supervisor spawned" + health "ok" after re-check
- supervisor down at boot, spawn fails: {`claude agents --json`: "exits non-zero", spawn: "command not found"} → log warning + health "degraded" with reason "supervisor-spawn-failed"
- supervisor dies between checks: {periodic check t=60: "ok", t=120: "exits non-zero"} → log warning + attempt respawn
- two daemons racing on same machine: {two ReviewFlow processes boot simultaneously} → file lock under `~/.reviewflow/supervisor.lock` ensures only one spawn happens
- supervisor command times out: {`claude agents --json`: "hangs >5s"} → kill the probe + treat as down + spawn
- spawn detached process: {spawn invocation} → child has `detached: true`, `stdio: 'ignore'`, `unref()` so parent crash does not kill it

## Acceptance Criteria

- [ ] AC-1: At daemon boot, a `SupervisorHealthCheckUseCase` runs and logs `claude agents` supervisor reachability
- [ ] AC-2: If unreachable at boot, the daemon spawns `claude agents` detached and logs the new PID
- [ ] AC-3: The `/health` endpoint returns `{ status: 'ok' | 'degraded', supervisor: 'up' | 'down' | 'unknown', reason?: string }` reflecting the latest probe
- [ ] AC-4: A periodic re-check runs every 60s; if a previously-up supervisor goes down, a warning is logged and a respawn is attempted
- [ ] AC-5: A file lock at `~/.reviewflow/supervisor.lock` prevents two ReviewFlow processes from spawning two supervisors
- [ ] AC-6: The probe is bounded by a 5-second timeout to avoid blocking the daemon boot indefinitely
- [ ] AC-7: When the daemon shuts down, it does NOT kill the spawned supervisor (detached + unref); only systemd or operator action terminates it
- [ ] AC-8: Acceptance test at `src/tests/acceptance/172-claude-agents-supervisor-lifecycle.acceptance.test.ts` covers the four main scenarios (up, down→spawn-ok, down→spawn-fail, periodic-respawn)
- [ ] AC-9: Tracker updated — SPEC-172 → status `implemented`

## Operational Notes

**Detached spawn pattern (Node.js)**:

```typescript
import { spawn } from 'node:child_process';
const child = spawn('claude', ['agents'], {
  detached: true,
  stdio: 'ignore',
  cwd: process.env.HOME,
});
child.unref();
return child.pid;
```

`unref()` releases the parent's reference to the child, so the parent event loop can exit without killing the child. `stdio: 'ignore'` cuts the pipe inheritance.

**Health probe**:

```typescript
import { spawn } from 'node:child_process';
function probeSupervisor(): Promise<'up' | 'down'> {
  return new Promise(resolve => {
    const child = spawn('claude', ['agents', '--json'], { timeout: 5000 });
    let stdout = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.on('close', code => {
      if (code !== 0) return resolve('down');
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? 'up' : 'down');
      } catch {
        resolve('down');
      }
    });
    child.on('error', () => resolve('down'));
  });
}
```

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 9 | Every webhook dispatch depends on the supervisor; without it, ReviewFlow is dead |
| Impact | 3 | Critical — supervisor down = silent dispatch failure for every review |
| Confidence | 80% | Detached spawn pattern is standard; the unknowns are around supervisor-side behaviour under edge conditions |
| Effort | 1.5 pts | Two use cases, one gateway, one scheduled probe, one `/health` extension |
| **Score** | **14.4** | |

Priority: **Critical**

## INVEST Validation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Depends on SPEC-169 being live, otherwise independent |
| Negotiable | OK | Auto-spawn vs warn-only is a knob; periodic interval is open |
| Valuable | OK | Removes a major silent-failure class — operator no longer needs to remember `claude agents` |
| Estimable | OK | ~0.5 jour IA |
| Small | OK | Clear boundaries; touches `main/`, a new `supervisor-management` module, and `/health` route |
| Testable | OK | Both the probe and the spawn can be mocked via injected dependencies |

## Glossary

| Term | Definition |
|------|------------|
| Supervisor | The `claude agents` process that manages all `claude --bg` background sessions on a user account |
| Probe | A short-lived child invocation (`claude agents --json`) used to detect whether the supervisor is reachable |
| Detached process | A child process whose lifecycle is decoupled from its parent (Node.js: `{ detached: true }` + `child.unref()`) |
| Health-check | Periodic call to the probe that updates the `/health` endpoint's view of supervisor state |

## Risks

| Risk | Mitigation |
|------|------------|
| The `claude` binary is not in PATH for the daemon | Resolve `claude` from `~/.nvm/versions/.../bin/claude` or use `which claude` at boot; surface the failure clearly in `/health` |
| Spawn succeeds but the new supervisor immediately dies | Re-check after 2 seconds; if still down, mark as `degraded: supervisor-spawn-failed-unstable` |
| `--allow-dangerously-skip-permissions` on spawned `claude agents` requires its own disclaimer | Verify empirically before implementing; if true, fall back to default permission posture (probe + warn, no spawn) |
| `~/.reviewflow/supervisor.lock` is left stale after daemon crash | Use `flock` semantics or PID-validated lock (check the PID inside the lock file is still alive) |
| Periodic 60s probe consumes resources | Each probe spawns a child process; 60s interval is conservative. Measure CPU/memory impact in staging |
| Operator wants to inspect or kill the supervisor manually | Spawned supervisor stays accessible via `claude agents --json` and `kill <pid>`; no encapsulation barrier |
