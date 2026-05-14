# Dashboard Multi-Project Overview

**Spec**: [docs/specs/91-dashboard-multi-project-overview.md](../specs/91-dashboard-multi-project-overview.md)
**Merged**: 2026-03-14 (marked implemented)
**Issue**: [#91](https://github.com/DGouron/review-flow/issues/91)

---

## Scope

- Tab bar replacing the project-selector dropdown; Overview tab as default on load
- Overview tab with 3 sections: Active Reviews (real-time via WebSocket), Project Cards (stats + SVG sparkline), Recent Reviews feed (last 10 across all projects)
- Per-project tabs retaining all existing dashboard behavior
- Tab state persisted in localStorage across page reloads
- Reused existing multi-project `GET /api/stats` and `GET /api/reviews` endpoints (no path = all projects)
- No new frontend dependencies (vanilla JS/CSS/SVG)

---

## Outcome

Dashboard now presents a unified cross-project view at load. Existing per-project functionality unchanged. RAM monitoring and per-process CPU bars deferred (see spec Scope Challenge section — requires child PID tracking not yet implemented).

---

## Tests / Verification

Unit tests cover: Overview tab default load, Active Reviews real-time update, project card stats + sparkline, Recent Reviews ordering, tab state persistence, empty states (no projects, project with 0 reviews). `yarn verify` green at merge.

---

## Outstanding / Follow-ups

- **GitHub issue #91 is still open** — close manually once verified in production.
- RAM monitoring bars (per-process) — deferred to a future ticket; requires child PID tracking.
- `GET /api/system/resources` endpoint — deferred with RAM monitoring.
