# SPEC-173 — Implementation Report

## Status: OK (Clean)

Spec: `docs/specs/173-dashboard-worktree-panel.md`
Plan: `docs/plans/173-dashboard-worktree-panel.plan.md`
Acceptance test: `src/tests/acceptance/173-dashboard-worktree-panel.acceptance.test.ts`

## Files Created

| Path | Description |
|------|-------------|
| `src/modules/worktree-management/entities/sweep/lastSweepSummary.schema.ts` | Zod schema + `LastSweepSummary` type (ranAt + counters) |
| `src/modules/worktree-management/entities/worktree/worktreeSizeProbe.gateway.ts` | Gateway contract — `probe(path) → Promise<number \| null>` |
| `src/modules/worktree-management/interface-adapters/gateways/worktreeSizeProbe.cli.gateway.ts` | CLI impl — `du -sb` via injectable process runner |
| `src/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.ts` | Status thresholds (24h/7d), grouping, 30s size cache, null aggregation |
| `src/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.ts` | GET `/api/worktrees` + POST `/api/worktrees/sweep` (200/409/500/503) |
| `src/dashboard/modules/worktreePanel.js` | Humble object — render section / empty state / status badge + fetch helpers |
| `src/dashboard/vendor/anime.esm.min.js` | Vendored anime.js v4.4.1 ESM bundle (copied from node_modules at build time) |
| `src/tests/stubs/worktreeSizeProbe.stub.ts` | Stub gateway with per-path size mapping + default |
| `src/tests/factories/lastSweepSummary.factory.ts` | Factory for sweep summaries |
| `src/tests/units/modules/worktree-management/entities/sweep/lastSweepSummary.schema.test.ts` | Schema validation tests (4) |
| `src/tests/units/modules/worktree-management/interface-adapters/presenters/worktreePanel.presenter.test.ts` | Presenter tests (14) — thresholds, grouping, cache, aggregation |
| `src/tests/units/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.test.ts` | Routes tests (7) — GET/POST/409/500/503 |
| `src/tests/units/modules/worktree-management/interface-adapters/gateways/worktreeSizeProbe.cli.gateway.test.ts` | CLI gateway tests (5) — parsing, errors, command shape |
| `src/tests/units/dashboard/modules/worktreePanel.test.ts` | Humble-object tests (26) — render, escape, badges, fetch, sweep |
| `src/tests/acceptance/173-dashboard-worktree-panel.acceptance.test.ts` | Outer-loop acceptance test (6 scenarios) |

## Files Modified

| Path | Reason |
|------|--------|
| `src/frameworks/scheduler/worktreeSweepScheduler.ts` | Added module state, `getLastSweep`, `getNextSweepEta`, `runSweepNow` (discriminated union return + concurrency guard) |
| `src/tests/units/frameworks/scheduler/worktreeSweepScheduler.test.ts` | 5 new tests covering the SPEC-173 extensions |
| `src/main/dependencies.ts` | Added `worktreeSizeProbeGateway`, `worktreePanelPresenter`, `sweepSchedulerControls: null` (filled in `server.ts`) |
| `src/main/server.ts` | Started scheduler before `buildServer`; populated `deps.sweepSchedulerControls` with discriminated-union runSweepNow proxy |
| `src/main/routes.ts` | Registered `worktreeOverviewRoutes` with the composition root options |
| `src/dashboard/index.html` | Inserted `<section id="worktree-section">` between `#cleanup-section` and `.refresh-info`; imported `worktreePanel.js`; wired 30s polling, sweep button handler, anime.js choreography (broom-swipe, metric stagger, change-flash) gated by `prefers-reduced-motion` |
| `src/dashboard/styles.css` | Appended `#worktree-section` styles — scoped tokens, corner-bracket frames, monospace numerics, pulse keyframes, reduced-motion override |
| `src/dashboard/modules/i18n.js` | Added EN + FR `worktree.*` keys |
| `scripts/copyAssets.mjs` | Copies `anime.esm.min.js` into `src/dashboard/vendor/` and `dist/dashboard/vendor/` at build time |
| `biome.json` | Ignores `src/dashboard/vendor/**` (minified anime.js bundle would fail lint) |
| `package.json` | Added `animejs@^4` (locked-in choice for choreography) |

## Tests

| Suite | Count | Result |
|-------|-------|--------|
| Acceptance — SPEC-173 | 6 | PASS |
| `lastSweepSummary.schema` | 4 | PASS |
| `worktreePanel.presenter` | 14 | PASS |
| `worktreeOverview.routes` | 7 | PASS |
| `worktreeSizeProbe.cli.gateway` | 5 | PASS |
| `dashboard/modules/worktreePanel` | 26 | PASS |
| `worktreeSweepScheduler` (existing + 5 new) | 9 | PASS |
| **Full suite** | **1798** | **PASS** |

`yarn verify` (typecheck + lint + test:ci) green.

## Self-Review

| Criterion | Status |
|-----------|--------|
| Imports use `@/` alias + `.js` extension | OK — no relative imports in new files |
| No `any`, no `as Type` assertions, no `!` non-null | OK — grep clean |
| `null` used for absence in domain types | OK — `LastSweepSummary \| null`, `sizeBytes: number \| null` |
| Factories used (no hardcoded test data) | OK — `LastSweepSummaryFactory` + stub builders |
| Stubs cover I/O boundaries only | OK — `StubWorktreeSizeProbeGateway`, `ConfigurableWorktreeGateway` |
| State-based assertions (Detroit) | OK — assertions on returned payloads/view models |
| Tests in English | OK |
| User-facing strings in French/English (i18n) | OK — `i18n.js` keys, EN values now, FR ready |
| Visual DNA: `// WORKTREE POOL · N`, `●ACTIVE`/`○IDLE`/`◆STALE`, corner brackets, monospace, scoped tokens | OK |
| `prefers-reduced-motion` disables anime.js + CSS animations | OK — early return in `loadAnimeApi`, `animation: none !important` in CSS |
| Inline SVG total < 12 KB | OK — ~1.2 KB of inline SVG |
| `runSweepNow` returns discriminated union (no throw for control flow) | OK |
| Scheduler controls propagate via optional `Dependencies` field | OK — `sweepSchedulerControls` set after `startWorktreeSweepScheduler` |
| Grouping by `(platform, projectPath)`, not by status | OK — presenter groups; status is a per-row chip |

**Iterations**: 1 review-fix pass — found Biome choking on the vendored minified anime.js; resolved by adding `files.ignore` to `biome.json`. No other violations.

## Acceptance Test

File: `src/tests/acceptance/173-dashboard-worktree-panel.acceptance.test.ts`
Status: **GREEN** (6/6)

| Scenario from spec | Test in acceptance file | Status |
|--------------------|-------------------------|--------|
| 1 — list with active + idle + stale | `Scenario 1 — list worktrees with active + idle + stale` | OK |
| 2 — empty worktree pool | `Scenario 2 — empty worktree pool` | OK |
| 5 — manual sweep success | `Scenario 5 — manual sweep success` | OK |
| 6 — manual sweep conflict (409) | `Scenario 6 — manual sweep conflict` | OK |
| 7 — lastSweep null on cold start | `Scenario 7 — lastSweep null on cold start` | OK |
| FR-3 — scheduler exposes controls consumed by routes | `Scheduler integration (FR-3)` | OK |

## Spec Coverage

| Rule / Scenario | Covered by | Test |
|-----------------|-----------|------|
| **Rule** — gateway never decides "stale"/"active"; status from `mtime` thresholds in presenter | Presenter status thresholds | `worktreePanel.presenter.test.ts` (status thresholds describe block, 4 cases) |
| **Rule** — same use case for scheduled + manual sweep | `runSweepNow` reuses `sweepStaleWorktrees` via `runSweepInternal` | `worktreeSweepScheduler.test.ts` "runSweepNow runs the sweep and returns an ok result" |
| **Rule** — only one sweep at a time; concurrent → conflict, no queue | `runningSince` flag in scheduler | `worktreeSweepScheduler.test.ts` "runSweepNow returns a conflict result when a sweep is already running" |
| **Rule** — size-probe failures degrade gracefully to `null` | `WorktreeSizeProbeCliGateway` returns null on exit≠0 / throw | `worktreeSizeProbe.cli.gateway.test.ts` "returns null when du exits with a non-zero code" / "throws" |
| **Rule** — every animation honours `prefers-reduced-motion` | `loadAnimeApi` early-returns null when reduced-motion is set; CSS media-query `animation: none !important` | Visual verification (manual) + the CSS rule is in `styles.css` |
| **Rule** — visual artifacts ship inline as SVG (no remote font / external SVG file) | Inline `<svg>` markup in `worktreePanel.js`; anime.js is vendored locally, not loaded from a CDN | Manual review |
| **Rule** — 30s cache horizon on worktree state | Presenter `sizeCache` with 30s TTL | `worktreePanel.presenter.test.ts` "size cache (30s TTL)" — 2 tests |
| Scenario 1 — active/idle/stale rows | Presenter + routes | acceptance Scenario 1 |
| Scenario 2 — empty pool → empty-state SVG | Presenter returns empty groups; dashboard module renders empty-state | acceptance Scenario 2 + dashboard `renderWorktreeEmptyState` test |
| Scenario 3 — grouping + sort | Presenter groups & sorts | `worktreePanel.presenter.test.ts` "grouping and sorting" — 2 tests |
| Scenario 4 — size probe failure on one row | Presenter aggregates skipping nulls | `worktreePanel.presenter.test.ts` "sums total size skipping null entries" |
| Scenario 5 — manual sweep success | Routes POST 200 path | acceptance Scenario 5 + routes test |
| Scenario 6 — manual sweep conflict | Routes POST 409 | acceptance Scenario 6 + routes test |
| Scenario 7 — `lastSweep: null` on cold start | Scheduler returns null until first sweep | acceptance Scenario 7 + scheduler test "returns null from getLastSweep when no sweep has run yet" |
| Scenario 8 — next sweep ETA | Scheduler `getNextSweepEta` math | `worktreeSweepScheduler.test.ts` "getNextSweepEta returns now + interval" |
| Scenario 9 — reduced motion | Anime.js gated, CSS animation reset | Code review (CSS + JS guard) |
| Scenario 10 — size cache hit within TTL | Presenter caches in memory | `worktreePanel.presenter.test.ts` "does not re-probe the same path within the TTL window" |
| Scenario 11 — size cache miss after expiry | Presenter expiry math | `worktreePanel.presenter.test.ts` "re-probes after the TTL window expires" |
| FR-1 GET schema | Routes + presenter | routes test + acceptance |
| FR-2 POST sweep (200/409/500) | Routes | routes test (4 cases) |
| FR-3 scheduler exposes lastSweep/nextSweep/runSweepNow | Scheduler extensions | scheduler test (5 new cases) + acceptance "Scheduler integration" |
| FR-4 size probe via `du -sb`, cached 30s, null on failure | CLI gateway + presenter cache | CLI gateway tests + presenter cache tests |
| FR-5 presenter ISO formatting | Presenter | presenter test "formats lastSweep ranAt as ISO string" / "formats nextSweepAt as ISO string" |
| FR-6 dashboard module exports | `worktreePanel.js` | dashboard module test (26 tests) |
| FR-7 visual DNA | CSS + JS module + inline SVG | Manual visual review (no automated assertion beyond DOM strings — by design for a humble UI module) |
| FR-8 i18n keys | `i18n.js` updated for EN + FR | Manual code review |

## Open Issues

None blocking.

Notes for the orchestrator:

1. **Vendoring anime.js** — the dashboard ships as static HTML/CSS/JS (no bundler), so anime.js is copied as `src/dashboard/vendor/anime.esm.min.js` and refreshed at build time by `scripts/copyAssets.mjs`. The browser imports it lazily via `await import('./vendor/anime.esm.min.js')` only when reduced-motion is *not* set — keeping the cold-load cost zero for the reduced-motion path.
2. **`biome.json`** now ignores `src/dashboard/vendor/**` so the minified bundle does not block lint. Same exclusion applies to `dist/**` and `node_modules/**` (which were not previously ignored explicitly).
3. **FR-7 visual choices** that are subjective and might be revisited: the corner-bracket frames are 12px and use `border-top`/`border-left` + `border-bottom`/`border-right` (2 corners each on `::before`/`::after`). The metric tile grid is 5 columns at all viewport widths — narrow screens will get horizontal scroll on `.worktree-table-wrapper`. No responsive breakpoint added (out-of-scope for this spec).
4. **`Dependencies.sweepSchedulerControls`** is intentionally `null` after `createDependencies()` and only filled by `startServer()` before `buildServer()`. Tests using `createServer()` will hit the 503 path on the new routes — acceptable per plan's "Open implementation decisions §2".
