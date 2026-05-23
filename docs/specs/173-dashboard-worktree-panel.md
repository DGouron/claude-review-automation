---
title: "SPEC-173: Dashboard Worktree Panel"
labels: enhancement, P2-important, dashboard, worktree
milestone: Worktree Lifecycle Observability
status: implemented
blocked-by: SPEC-170, SPEC-172
---

# SPEC-173: Dashboard Worktree Panel

## Status: implemented

All FRs (1–8) shipped. Acceptance file **6/6 GREEN**. `yarn verify` green (1798 tests). Report: `docs/reports/173-dashboard-worktree-panel.report.md`.

## Implementation

Single PR, single iteration of self-review (one Biome violation around the vendored minified anime.js — resolved by extending `biome.json` ignore list).

**New artefacts** (Clean Architecture)

| Layer | Path |
|-------|------|
| Entity | `src/modules/worktree-management/entities/sweep/lastSweepSummary.schema.ts` — Zod schema + `LastSweepSummary` type |
| Gateway contract | `src/modules/worktree-management/entities/worktree/worktreeSizeProbe.gateway.ts` — `probe(path) → Promise<number \| null>` |
| Gateway impl | `src/modules/worktree-management/interface-adapters/gateways/worktreeSizeProbe.cli.gateway.ts` — `du -sb` via injectable runner |
| Presenter | `src/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.ts` — status thresholds (24h / 7d), grouping by `(platform, projectPath)`, 30s size cache, null aggregation |
| Controller | `src/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.ts` — `GET /api/worktrees`, `POST /api/worktrees/sweep` (200 / 409 / 500 / 503) |
| Dashboard module | `src/dashboard/modules/worktreePanel.js` — humble object, renders section + empty state + status glyphs, fetch helpers |
| Vendored asset | `src/dashboard/vendor/anime.esm.min.js` — anime.js v4.4.1 (copied at build time by `scripts/copyAssets.mjs`) |

**Endpoints**

| Method | Route | Use case |
|--------|-------|----------|
| `GET` | `/api/worktrees` | `WorktreePanelPresenter.present()` consuming `WorktreeGateway.list()` + `WorktreeSizeProbeGateway.probe()` + scheduler controls |
| `POST` | `/api/worktrees/sweep` | `sweepSchedulerControls.runSweepNow()` → reuses `sweepStaleWorktrees` use case (no logic duplication) |

**Composition root wiring**

- `src/main/dependencies.ts` — added `worktreeSizeProbeGateway`, `worktreePanelPresenter`, `sweepSchedulerControls` (optional, populated by `server.ts`)
- `src/main/server.ts` — `startWorktreeSweepScheduler` runs before `buildServer`; the returned controls (`{ getLastSweep, getNextSweepEta, runSweepNow }`) are attached to `deps.sweepSchedulerControls`
- `src/main/routes.ts` — registers `worktreeOverviewRoutes`; routes return `503 service-unavailable` when `sweepSchedulerControls` is null (preserves `createServer()` standalone test paths)

**Scheduler extensions** (`src/frameworks/scheduler/worktreeSweepScheduler.ts`)

- New module-scoped state: `lastSummary`, `runningSince`, `lastRunAt`, `intervalMs`
- `getLastSweep(): LastSweepSummary | null` — `null` until the first sweep completes
- `getNextSweepEta(): Date` — `lastRunAt + intervalMs` (or `Date.now() + intervalMs` at cold start)
- `runSweepNow()` — discriminated union return `{ status: 'ok'; summary } | { status: 'conflict'; startedAt }`; throws are bypassed for control flow

**Dashboard wiring**

- `src/dashboard/index.html` — inserts `<section id="worktree-section">` between `#cleanup-section` and `.refresh-info`; imports the module; wires 30s polling + sweep button handler + anime.js choreography (broom-swipe, metric stagger, change-flash), gated by `prefers-reduced-motion`
- `src/dashboard/styles.css` — appended scoped `#worktree-section` block: Agentic-OS tokens (amber accents, monospace stack, corner brackets via pseudo-elements, pulse keyframes on `●ACTIVE` glyphs only, `@media (prefers-reduced-motion: reduce)` override)
- `src/dashboard/modules/i18n.js` — `worktree.*` keys (EN + FR)
- `scripts/copyAssets.mjs` — copies `node_modules/animejs/.../anime.esm.min.js` to both `src/dashboard/vendor/` and `dist/dashboard/vendor/`
- `biome.json` — ignores `src/dashboard/vendor/**`, `dist/**`, `node_modules/**` to keep the minified bundle out of lint
- `package.json` — adds `animejs@^4`

**Architectural decisions taken**

| Decision | Choice |
|----------|--------|
| Sweep summary storage | In-memory in the scheduler module — no persistence across restart, `null` is honest after boot |
| Manual sweep wiring | Reuses `sweepStaleWorktrees` use case — single source of truth (Rule "no sweep logic duplication") |
| Concurrency model | `runSweepNow` returns `conflict` discriminated branch when `runningSince !== null` — no queue, no throw for control flow |
| Worktree size probe | `du -sb` via injectable process runner, 30s presenter cache, `null` on any failure (Rule "size-probe failures degrade gracefully") |
| Grouping | Presenter groups by `(platform, projectPath)` — status is a per-row chip, NOT a grouping dimension |
| Animation library | anime.js v4 vendored locally; lazy-loaded via `await import('./vendor/anime.esm.min.js')` only when `prefers-reduced-motion` is not set — zero cold-load cost for reduced-motion users |
| Test stubbing for routes | `sweepSchedulerControls: null` default → routes respond 503 in `createServer()` standalone tests, populated only by `startServer()` for production |

**Tests**

- Acceptance: `src/tests/acceptance/173-dashboard-worktree-panel.acceptance.test.ts` — 6 scenarios (1, 2, 5, 6, 7 + scheduler integration)
- Units: 61 new tests across schema (4), presenter (14), routes (7), CLI gateway (5), dashboard module (26), scheduler extensions (5)
- Suite total: **1798 / 1798 PASS**

## Context

SPEC-170 ships a full pre-built worktree lifecycle: webhook-driven creation, fast-forward on followup, cleanup on merge/close, and a daily sweep for stale orphans. SPEC-172 layers a supervisor on top of long-running Claude agents. Together they create a new operational surface — **the worktree pool under `~/.reviewflow/worktrees/`** — that is **completely invisible** to the operator from the dashboard.

The operator today must SSH to the server and run `ls ~/.reviewflow/worktrees/` + `du -sh` to know what is on disk. The sweep scheduler logs its summary only when it removes or fails — silent sweeps leave no trace in the UI. Cross-fork PRs and concurrent-followup serialization (FR-8, FR-9) have edge cases that are easier to diagnose with a live view.

This spec exposes the worktree pool through a dashboard section, mirroring the pattern already used for cleanup (`#cleanup-section`) and token usage (`#token-usage` tile). It also acknowledges a UX directive from the operator: the panel must feel **modern and animated** — CSS transitions, animated SVG indicators, no flat lifeless lists — so the dashboard reflects the level of polish expected from a 2026-era tool.

## User Story

**As** the operator of ReviewFlow,
**I want** a dashboard section that displays the current state of `~/.reviewflow/worktrees/` — active worktrees with MR identity, age, disk footprint, sweep activity — and lets me trigger a manual sweep,
**So that** I can monitor disk usage, spot orphans without SSH, validate that lifecycle hooks are firing, and force a cleanup when something looks wrong, all from the same UI as the rest of ReviewFlow.

## Scope

### In Scope

| # | Capability |
|---|------------|
| 1 | HTTP endpoint listing all worktrees with identity, path, mtime, size |
| 2 | HTTP endpoint exposing last-sweep summary (timestamp, removed count, failure count) |
| 3 | HTTP endpoint to trigger a manual sweep on demand |
| 4 | Dashboard section `#worktree-section` rendering the list grouped by project |
| 5 | Per-worktree row: platform icon, project/MR link, age (relative), size, status badge |
| 6 | Aggregate header: total worktree count, total disk usage, next scheduled sweep |
| 7 | "Sweep now" button wired to the manual sweep endpoint with visual feedback |
| 8 | Futuristic visual language: animated SVG status indicator (pulse on active, fade on stale), CSS transitions on hover/expand, animated counter for total size |
| 9 | Empty state with animated SVG illustration when no worktree exists |

### Out of Scope

| Item | Reason |
|------|--------|
| Per-worktree manual delete button | Sweep already covers stale removal; per-row delete invites operator mistakes |
| Live websocket push of worktree events | Polling every 30s is enough; events too rare to justify WS plumbing |
| Historical sweep log (multiple past sweeps) | Last sweep is enough; full history belongs to logs/observability |
| Worktree contents browsing (file tree) | Out of dashboard scope; SSH or `gh repo clone` if needed |
| Worktree size breakdown by directory (`.git`, source, build artifacts) | `du -sh` total is enough — depth has no operational value |
| Cross-project worktree comparison/analytics | One project per row, no aggregation across projects |
| Auth/permission control on the sweep endpoint | Inherits existing dashboard auth posture; no per-endpoint ACL |

## Architectural Decisions

| Decision | Choice |
|----------|--------|
| **Sweep summary storage** | In-memory in the scheduler module — last sweep result kept as a single `LastSweepSummary` object, exposed via a getter. No persistence across restart. |
| **Manual sweep wiring** | HTTP endpoint calls the same `sweepStaleWorktrees` use case as the scheduler — single source of truth. Scheduler interval untouched. |
| **Worktree size computation** | Compute on read via `du -sh --bytes <path>` inside the existing `GitCommandExecutor`-equivalent. Cached for 30s per path to avoid pounding the FS on rapid refreshes. |
| **View grouping** | Group worktrees by `(platform, projectPath)` in the presenter, sort groups alphabetically, sort rows within group by `mtime DESC`. |
| **Animation budget** | CSS animations + inline SVG as the **default**. **anime.js v4** is pre-approved (added via `yarn add animejs@^4`) for: counter count-up stagger on aggregate metrics, broom-swipe sequence on the sweep button, SVG path interpolation on the empty-state illustration. CSS keyframes remain the right tool for the status-dot pulse and row-hover affordance. Imports must be tree-shakable (`import { animate, stagger } from 'animejs'` style). Every JS animation entrypoint guards with `prefers-reduced-motion: reduce` → no-op fallback. |
| **Concurrency on manual sweep** | If a sweep is already running, the endpoint returns `409 conflict` with the in-flight start time. No queue. |

## Functional Requirements

### FR-1: List Worktrees Endpoint

`GET /api/worktrees` returns:

```json
{
  "totalCount": 7,
  "totalSizeBytes": 1342177280,
  "nextSweepAt": "2026-05-24T03:00:00.000Z",
  "lastSweep": {
    "ranAt": "2026-05-23T03:00:00.000Z",
    "removed": 2,
    "failures": 0,
    "scanned": 9
  },
  "groups": [
    {
      "platform": "gitlab",
      "projectPath": "client/main-app-v3",
      "worktrees": [
        {
          "mrNumber": 4521,
          "path": "/home/.../gitlab-client-main-app-v3-4521",
          "mtime": "2026-05-23T14:12:00.000Z",
          "ageSeconds": 480,
          "sizeBytes": 218103808,
          "status": "active"
        }
      ]
    }
  ]
}
```

`status` is one of: `active` (mtime <24h), `idle` (24h..7d), `stale` (>7d). The status is computed in the presenter, not the gateway.

### FR-2: Manual Sweep Endpoint

`POST /api/worktrees/sweep` triggers `sweepStaleWorktrees` against the current worktree gateway + tracking gateway + repositories.

- Success: `200` with the new `LastSweepSummary` payload.
- Conflict: `409` `{ "error": "sweep-in-progress", "startedAt": "..." }` when a previous sweep is still running.
- Failure: `500` with the error reason logged but not leaked to the client beyond a generic message.

### FR-3: Last Sweep Tracker

`worktreeSweepScheduler.ts` is extended to:

1. Store the last sweep summary in module-scoped state.
2. Expose `getLastSweep(): LastSweepSummary | null`.
3. Expose `getNextSweepEta(): Date` (computed from interval + last run).
4. Expose a guarded `runSweepNow(): Promise<LastSweepSummary>` that prevents overlap.

These exports are wired into `Dependencies` so the HTTP routes can consume them.

### FR-4: Worktree Size Computation

A `WorktreeSizeProbe` interface lives next to the gateway. The CLI implementation runs `du -sb <path>` (bytes, single line) via the existing `GitCommandExecutor` (or a sibling executor). Results cached 30s per path in the presenter layer. Errors return `sizeBytes: null` — the row renders with a "—" placeholder, never blocks the response.

### FR-5: Presenter

`WorktreePanelPresenter` transforms gateway output + sweep summary + size probe into a `WorktreePanelViewModel`:

- Status computed from age thresholds (24h / 7d).
- `nextSweepAt` formatted as ISO; relative formatting happens client-side.
- Empty `groups: []` when no worktree exists.
- Total size = sum of resolved sizes (nulls skipped, marked in metadata).

### FR-6: Dashboard Module

`src/dashboard/modules/worktreePanel.js` — humble object, JSDoc-typed, pure functions:

- `renderWorktreeSection(viewModel)` returns the HTML string for the section.
- `renderWorktreeEmptyState()` returns the empty-state HTML (animated SVG).
- `fetchWorktreeOverview(fetchImpl)` calls the endpoint.
- `triggerManualSweep(fetchImpl)` calls the manual sweep endpoint.

Section integrated into `src/dashboard/index.html` between `#cleanup-section` and `.refresh-info`. Initial render on page load, refresh every 30s (aligned with existing dashboard cadence).

### FR-7: Futuristic Visual Language — "Agentic OS"

The panel adopts an **"Agentic OS"** visual language (reference: AGENT.MESH live topology / missions / board screenshots stored under `~/Images/agentic_os_*.png`). Aesthetic: dark, monospace, amber-on-black with green success accents, thin corner-bracket frames, glow-as-status, restrained motion.

#### Visual DNA

| Token | Value | Usage |
|-------|-------|-------|
| `--worktree-bg` | `#0a0908` (near-black, slight warm tint) | Section background |
| `--worktree-bg-elevated` | `#13110f` | Row / card surface |
| `--worktree-border-faint` | `rgba(255, 180, 100, 0.12)` | Default border |
| `--worktree-border-active` | `rgba(255, 138, 61, 0.65)` | Hover / active row |
| `--worktree-accent` | `#ff8a3d` (amber) | Primary highlight, "now/active" |
| `--worktree-accent-dim` | `#a85a25` | Idle / secondary |
| `--worktree-success` | `#5ce28b` | Success badges, completed sweep |
| `--worktree-warn` | `#f3c969` | Stale, warnings |
| `--worktree-text-primary` | `#f3eee8` | Body text |
| `--worktree-text-muted` | `#7a716a` | Labels (uppercase, 10–11px) |
| `--worktree-glow-active` | `0 0 12px rgba(255, 138, 61, 0.55)` | Status dot pulse |

#### Typography

- Body: existing dashboard font (no override) — fall back to system monospace when proposing alternatives.
- Numeric metrics + identifiers + paths: `ui-monospace, "SF Mono", "JetBrains Mono", "Berkeley Mono", monospace`.
- Labels: `text-transform: uppercase; letter-spacing: 0.08em; font-size: 10–11px`.
- Section header prefix uses `// ` ASCII marker per the reference (`// WORKTREE POOL`).

#### Layout — Missions Table Adaptation

The reference's "MISSIONS" screen is the template (image #2 / `agentic_os_missions.png`). Translation:

```
// WORKTREE POOL · 7                                          [• SWEEP NOW]

TOTAL              RUNNING           IDLE             STALE          TOTAL SIZE
   7                  3                3                1            1.34 GB

STATUS      PLATFORM·MR              PATH                       AGE     SIZE     MTIME
●ACTIVE     gitlab · client/...      /gitlab-client-...-4521    8m      218 MB   2026-05-23 14:12
●ACTIVE     github · org/repo·#42    /github-org-repo-42        2h      94 MB    2026-05-23 12:01
○IDLE       gitlab · client/...      /gitlab-client-...-4498    36h     412 MB   2026-05-22 03:50
◆STALE      gitlab · legacy/svc·#7   /gitlab-legacy-svc-7       8d      640 MB   2026-05-15 …

// LAST SWEEP                                                 NEXT SWEEP
2026-05-23 03:00 UTC  ·  removed 2  ·  failures 0  ·  scanned 9    in 13h 02m
```

- Status glyph: `●` filled glow (active) / `○` outline (idle) / `◆` solid amber-warn diamond (stale). Inline SVG, 8px, color = amber active / muted-amber idle / warn-yellow stale.
- Project + MR truncate with middle ellipsis; full path on `title` attribute and hover tooltip.
- Header counters animate count-up over 600ms on first paint (CSS `@property --num` interpolation).
- Sweep button: amber border, hover fills, click → broom-sweep SVG slides left-to-right inside the button (700ms), text swaps to `• SWEEPING…` with a pulsing dot, then settles back to `• SWEEP NOW` after response.

#### Motion language

| Element | Motion |
|---------|--------|
| Section reveal on first paint | Fade + 4px translateY-up, 250ms ease-out |
| Status dot `active` | Soft 1.4s pulse: opacity 0.7↔1, shadow blur 8↔14px |
| Status dot `idle` | Static (no animation), 70% opacity |
| Status dot `stale` | Static diamond glyph, warn color |
| Row hover | Border color → `--worktree-border-active` in 120ms, no transform |
| Counter on update | If value changes during polling, brief amber flash (200ms) on the digit container |
| Sweep button click | Broom-swipe SVG 700ms; while pending, indeterminate amber bar at row bottom |
| Empty state | Single inline SVG (~3 KB): hollow branch-tree silhouette with one dim "leaf" gently pulsing at 2s cadence |

#### Corner-bracket frames

Section container and each row use a 4-corner ASCII-like bracket made of pseudo-elements (`::before` + `::after` with `border-top` + `border-left` of 6px each in `--worktree-border-faint`). On hover, only the row corners shift to `--worktree-border-active`. This is the signature visual of the reference.

#### Reduced motion

`@media (prefers-reduced-motion: reduce)` disables: pulse, count-up, sweep-broom animation, section reveal. Border-color hover transition remains (deemed essential affordance, not "motion"). Static glyphs replace animated dots.

All SVGs inline (no external assets), under 4 KB each, total inline SVG budget < 12 KB per AC-9. SVGO-style hygiene: integer coordinates, no unused groups, `currentColor` for stroke/fill where the parent must control color.

### FR-8: Localization

Strings exposed via the existing `i18n.js` mechanism with English-only default values (FR translations may be added later). Keys: `worktree.section.title`, `worktree.empty.title`, `worktree.empty.subtitle`, `worktree.button.sweepNow`, `worktree.status.active`, `worktree.status.idle`, `worktree.status.stale`, `worktree.lastSweep.label`, `worktree.lastSweep.never`.

## Rules

- the dashboard never derives worktree state from a stale cache older than 30 seconds — past that, the gateway is re-queried
- a worktree's display status is derived purely from `mtime` thresholds; the gateway never decides what is "stale" or "active"
- the manual sweep endpoint and the scheduled sweep share the same use case — duplicating sweep logic is forbidden
- only one sweep runs at a time; concurrent manual triggers receive a conflict response, never queue
- size-probe failures degrade gracefully to a null placeholder — they never fail the listing response
- every animation honours `prefers-reduced-motion`; the panel must be usable without animation
- visual artifacts (icons, illustrations) ship inline as SVG — no remote font / external SVG file is permitted

## Scenarios

- list worktrees with active + idle + stale: {3 worktrees: mtime 1h, mtime 36h, mtime 8d} → 3 rows with statuses [active, idle, stale]
- empty worktree pool: {pool: empty} → renders empty state with animated SVG illustration + zero counters
- list grouped by project: {2 projects, 5 worktrees total} → 2 groups, sorted alphabetically; rows inside each group sorted by mtime DESC
- size probe failure on one worktree: {3 worktrees, du fails on path 2} → response includes 3 rows, row 2 sizeBytes=null; total ignores null; UI shows "—"
- manual sweep success: {pool: 4 stale orphans} → POST returns 200 with `removed: 4, failures: 0`; next list call reflects the cleanup
- manual sweep conflict: {sweep already running for 3s} → POST returns 409 with `startedAt`; in-flight sweep continues unaffected
- last sweep summary after startup with no sweep yet: {server just started} → `lastSweep: null` in response; UI shows "never"
- next sweep ETA: {last sweep at 02:00, interval 24h} → response `nextSweepAt: "tomorrow 02:00 UTC"` (formatted client-side)
- reduced motion preference: {browser sets prefers-reduced-motion: reduce} → no transforms/keyframes applied; status badge static; counters render final value immediately
- size cache hit: {two requests on same path within 5s} → second call does not invoke `du`
- size cache miss after expiry: {two requests on same path 35s apart} → both invoke `du`

## Acceptance Criteria

- [ ] AC-1: `GET /api/worktrees` returns the schema defined in FR-1 with at least one worktree on disk
- [ ] AC-2: `POST /api/worktrees/sweep` invokes the same `sweepStaleWorktrees` use case as the scheduler and returns the updated summary
- [ ] AC-3: A second concurrent `POST /api/worktrees/sweep` returns `409 conflict` while the first is still running
- [ ] AC-4: `worktreeSweepScheduler` exposes `getLastSweep()`, `getNextSweepEta()`, and `runSweepNow()` consumed by the routes
- [ ] AC-5: Worktree status (`active`/`idle`/`stale`) is computed by the presenter from `mtime` thresholds 24h / 7d
- [ ] AC-6: `du -sb` failures yield `sizeBytes: null` for the affected row without failing the request
- [ ] AC-7: Dashboard section `#worktree-section` renders between the cleanup section and `.refresh-info` and refreshes every 30s
- [ ] AC-8: Empty state shows an animated SVG illustration; populated state shows the grouped list with status badges
- [ ] AC-9: Animations are CSS / inline SVG by default; a JS animation library is permitted only if added in package.json with a documented justification, kept tree-shakable, and gated by `prefers-reduced-motion`. Total inline SVG size < 12 KB.
- [ ] AC-10: `@media (prefers-reduced-motion: reduce)` removes every animation in the panel
- [ ] AC-11: Acceptance test green at `src/tests/acceptance/173-dashboard-worktree-panel.acceptance.test.ts`
- [ ] AC-12: Unit tests cover the presenter status logic (24h / 7d boundaries) and the size cache (30s expiry)
- [ ] AC-13: `feature-tracker.md` updated — SPEC-173 → status `implemented`

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 5 | Operator-only feature; touches every operator that runs SPEC-170-enabled ReviewFlow |
| Impact | 1.5 | Medium — removes the SSH dependency to monitor disk + lets operators debug lifecycle bugs faster |
| Confidence | 85% | Patterns reused (cleanup section, token usage tile); only new piece is the visual treatment |
| Effort | 4 pts | New presenter + 2 routes + 1 dashboard module + scheduler extensions + animated SVG assets |
| **Score** | **1.59** | |

Priority: **Important**

## INVEST Validation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Backend depends on SPEC-170 already shipped; no other open dependencies |
| Negotiable | OK | Animation depth, status thresholds, size cache TTL — all open |
| Valuable | OK | Operator unblocks SSH dependency; debugging lifecycle becomes a 1-click action |
| Estimable | OK | ~0.5–1 jour IA; reuses existing patterns; SVG illustrations are the wild card |
| Small | OK | Single dashboard section; <6 files touched outside the new module |
| Testable | OK | Presenter pure; gateway already exists with `list()`; routes stub the use case |

## Glossary

| Term | Definition |
|------|------------|
| Worktree pool | The set of directories living under `~/.reviewflow/worktrees/` |
| Sweep | The cleanup pass executed by `sweepStaleWorktrees`, either scheduled or manual |
| Size probe | The `du -sb <path>` call resolving disk footprint of a single worktree |
| Active worktree | A worktree whose `mtime` is within the last 24h |
| Idle worktree | A worktree whose `mtime` is between 24h and 7 days old |
| Stale worktree | A worktree whose `mtime` is older than 7 days |
| Animated SVG | An SVG using either SMIL (`<animate>`) or CSS keyframes to express motion inline |
| Reduced motion | The `prefers-reduced-motion: reduce` CSS media feature, indicating the user requested minimal animation |

## Risks

| Risk | Mitigation |
|------|------------|
| `du -sb` on a large worktree (10k+ files) blocks for 1–2s | 30s cache + per-row computation; if it becomes a problem, move probe to a background job populating a `size.cache` file |
| Animated SVGs grow the dashboard payload | Inline SVG budget capped per FR-7 (<4 KB each, <12 KB total per AC-9); CI lint optional |
| Operator triggers manual sweep during a high-throughput webhook burst | Sweep uses the same gateway with `git worktree prune` defensively; serialization handled at gateway level |
| Reduced-motion non-compliance | AC-10 enforces with a Playwright/Vitest snapshot under the media query |
| Scheduler last-sweep state lost on restart | Acceptable — `lastSweep: null` after restart is honest; UI shows "never" until next sweep |
| SVG illustration looks generic / AI-typical | Use `/frontend-design` skill during implementation to validate the visual language |

## Operational Notes

**Implementation handoff** — when `/implement-feature` runs:

1. Inner-loop TDD goes inside-out: presenter (status thresholds, size cache) → scheduler extensions (lastSweep, runSweepNow) → routes → dashboard module.
2. **Use the `/frontend-design` skill** for the UI module — specifically for SVG illustrations, the animation choreography, and the corner-bracket frame primitive. Reject generic dashboard look.
3. **Visual references** (saved on operator's machine): `~/Images/agentic_os_3.png` (live topology), `~/Images/agentic_os_missions.png` (table view — primary template for the worktree list), `~/Images/agentic_os_board.png` (kanban — not the chosen layout but informs status-chip + card aesthetics). These define the "Agentic OS" DNA referenced in FR-7.
4. The "Agentic OS" DNA is mandatory: dark warm-near-black, amber-on-black + green success, monospace numerics + paths, uppercase muted labels prefixed by `// `, corner-bracket frames, status dot with glow-pulse (active only). No gradients on row backgrounds, no rounded "card" look, no emoji icons.
5. SVG illustrations target a futuristic-but-restrained aesthetic: thin strokes, single accent color via `currentColor`, no clipart. Empty state uses a single hollow branch-tree silhouette (≤3 KB).
6. Acceptance test `173-dashboard-worktree-panel.acceptance.test.ts` should at minimum cover Scenarios 1, 2, 5, 6, 7 — the rest are unit-level.

**Manual verification post-deploy:**

```bash
curl -s http://localhost:3000/api/worktrees | jq '.totalCount, .lastSweep'
curl -X POST http://localhost:3000/api/worktrees/sweep | jq
```

Then open the dashboard, confirm the section renders with the expected animations, toggle `prefers-reduced-motion` in DevTools and verify the panel still works without animations.
