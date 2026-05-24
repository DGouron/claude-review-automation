# Spec #176 — Persist Completed Job History to Disk

**Labels**: enhancement, P2-important, queue, observability
**Date**: 2026-05-24
**Status**: drafted

---

## Context

The job queue keeps only the last 20 completed jobs in memory (`pQueueAdapter.ts`). A daemon restart wipes the entire history, making it impossible to debug an older failure, compute recurrence patterns, or build a meaningful timeline view. The operator currently has no way to answer questions like "how many reviews failed yesterday?" or "did that MR fail because of a timeout last Tuesday?".

This spec adds a simple, file-based persistence layer: every completed job (success, failure, killed, timeout) is appended to a daily JSONL file, with configurable retention. No new dependency, no database, no UI — just a durable trace that unlocks debugging and serves as the foundation for any future analytics or timeline UI.

---

## Rules

- Every job completion (success, failure, killed, timeout) persists one record to disk
- Records are stored as JSONL (one JSON object per line) for append-only safety
- Storage path is one file per day: `~/.claude-review/jobs/<YYYY-MM-DD>.jsonl`
- Each record contains: jobId, projectPath, mergeRequestId, startedAt, completedAt, durationMs, status, exitReason
- Retention is 7 days by default, configurable
- Files older than the retention window are deleted on daemon startup
- At daemon startup, files inside the retention window are loaded into the in-memory recent list
- Write failures (disk full, permission denied) must not block the job pipeline — warning logged, pipeline continues
- Concurrent writes from parallel completing jobs must not corrupt the file
- A malformed line in an existing file is skipped with a warning, the rest of the file remains usable

---

## Scenarios

- nominal write on success: {job: "completed", jobId: "RV-abc", status: "success"} → record appended to today's file
- write on failure: {job: "completed", status: "failed", exitReason: "claude exit code 1"} → record appended with status "failed"
- write on killed job: {job: "killed", exitReason: "memory limit exceeded"} → record appended with status "killed"
- daily rotation at midnight: {currentDate: "2026-05-25", lastWriteDate: "2026-05-24"} → new file created for 2026-05-25, no append to yesterday's file
- retention sweep on startup: {filesOnDisk: "10 days", retentionDays: 7} → 3 oldest files deleted, 7 remain
- reload at startup: {filesOnDisk: "7 days", retentionDays: 7} → all 7 days loaded into in-memory recent history
- write failure best-effort: {diskFull: true, job: "completed"} → pipeline continues + warning "Échec persistance job RV-abc : disque plein"
- concurrent writes: {2 jobs: "completed simultaneously"} → both records present in file, no corruption
- malformed line tolerated: {file: "2026-05-20.jsonl", corruptLine: 5} → file kept + warning "Ligne 5 illisible, ignorée" + remaining lines loaded
- missing storage directory: {path: "~/.claude-review/jobs/", exists: false} → directory created automatically on first write

---

## Out of Scope

- EventBus refactoring (SPEC-82) — separate work; this spec uses the existing completion hook in `pQueueAdapter`
- UI timeline visualization in dashboard — separate spec if value emerges from the persisted data
- Real-time streaming of records to clients — persistence concern only
- Compression of old files — premature optimization, 7 days of JSONL stays small
- SQLite or any database — JSONL keeps it simple, human-readable, grep-friendly
- Per-project retention rules — global retention only
- Backup or rotation policies beyond simple age-based deletion
- Querying API on top of persisted records — out of scope until a real consumer asks for it

---

## Glossary

| Term | Definition |
|------|------------|
| Job record | A single line in a JSONL file representing one completed job |
| JSONL | JSON Lines format — one JSON object per line, append-friendly |
| Retention window | The number of days of history kept on disk; older files are deleted |
| Best-effort persistence | Persistence failures do not interrupt the main pipeline; a warning is logged |
| Completion hook | The existing point in `pQueueAdapter` where a job is marked completed and added to the in-memory recent list |

---

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | No prerequisite spec; the completion hook already exists |
| Negotiable | OK | Storage format and retention default are open to discussion |
| Valuable | OK | Debugability + foundation for future timeline / analytics |
| Estimable | OK | Bounded: 1 gateway, 1 use case, 1 startup loader, 1 retention scheduler |
| Small | OK | ~8 files, fits 1.5j IA |
| Testable | OK | 10 scenarios cover nominal, edge, and failure paths |

**Verdict**: READY

---

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 3 | Queue framework + new storage gateway |
| Impact | 1 | Medium — unlocks debugging and is the foundation for any future observability UI |
| Confidence | 90% | Pattern simple, no external dependency, no protocol invention |
| Effort | 3 pts | 1.5j IA |
| **Score** | **0.90** | |

**Priority**: Moderate

---

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
