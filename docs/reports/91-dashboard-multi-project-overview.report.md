# Report — SPEC-91 Dashboard Multi-Project Overview

- **Spec**: [`docs/specs/91-dashboard-multi-project-overview.md`](../specs/91-dashboard-multi-project-overview.md)
- **Plan**: _not persisted_
- **Status**: implemented
- **Date**: 2026-05-25
- **Effort**: ~2 AI-days (matches estimate)

---

## Outcome

All 10 plan steps delivered. `yarn verify` GREEN end-to-end (typecheck + lint 673 files + 272 test files / 1968 tests pass, 0 fail). 12/12 spec scenarios covered (9 automated, 3 via wiring code review per plan disposition).

This delivery closes the UI gap identified in the spec's 2026-05-24 re-draft. The backend layer (`/api/stats`, `/api/reviews`, WebSocket multi-project) was already in place from an earlier increment.

---

## Files

### Created (11)

| File | Role | LOC |
|---|---|---|
| `src/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.ts` | New Fastify plugin `GET /api/repositories` | 22 |
| `src/modules/statistics-insights/interface-adapters/presenters/overview.presenter.ts` | `OverviewPresenter` — aggregates active jobs + project stats + recent reviews | 249 |
| `src/dashboard/modules/overview.js` | Humble object: `buildOverviewModel`, `renderOverviewHtml`, `renderSparklineSvg`, `shouldRefreshOverviewOnState` | ~280 |
| `src/dashboard/modules/tabBar.js` | Humble object: `buildTabBarModel`, `renderTabBarHtml`, `readActiveTab`, `writeActiveTab`, `resolveActiveView`, `resolveTabClick` | ~140 |
| `src/tests/acceptance/91-dashboard-multi-project-overview.acceptance.test.ts` | Outer-loop SDD acceptance (Scenarios 2/4/6/9/10/12 + `/api/repositories`) | 310 |
| `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.test.ts` | Route unit tests | — |
| `src/tests/units/modules/statistics-insights/interface-adapters/presenters/overview.presenter.test.ts` | Presenter unit tests | — |
| `src/tests/units/dashboard/modules/overview.test.ts` | Humble object unit tests | — |
| `src/tests/units/dashboard/modules/tabBar.test.ts` | Tab bar unit tests | — |
| `src/tests/factories/{repositoryConfig,projectStatsApiResponse,recentReviewFile}.factory.ts` | 3 test factories | — |

### Modified (5)

| File | Delta | Change |
|---|---|---|
| `src/dashboard/index.html` | +261 / −42 | Tab bar replaces project dropdown, overview-section mount, WS handler refresh, thin orchestration calling extracted helpers |
| `src/dashboard/modules/constants.js` | +1 | `STORAGE_KEY_ACTIVE_TAB` export |
| `src/dashboard/styles.css` | +336 | Agentic OS DNA block (corner-bracket frames, `// LABEL` prefix, glow-pulse status dots, amber/green accents, monospace) |
| `src/main/routes.ts` | +5 / −9 | Register `repositoriesRoutes` plugin (replaces previous inline route) |
| `src/tests/units/dashboard/modules/constants.test.ts` | +2 | Assertion on `STORAGE_KEY_ACTIVE_TAB` |

---

## Tests

| Suite | Count | Pass | Fail |
|---|---|---|---|
| SPEC-91 acceptance | 8 | 8 | 0 |
| `repositories.routes.test.ts` | 4 | 4 | 0 |
| `overview.presenter.test.ts` | 12 | 12 | 0 |
| `tabBar.test.ts` | 8 | 8 | 0 |
| `overview.test.ts` | 11 | 11 | 0 |
| `constants.test.ts` (updated) | 3 | 3 | 0 |
| **New / updated for SPEC-91** | **46** | **46** | **0** |
| **Full repo (regression check)** | **1968** | **1968** | **0** |

---

## Scenario coverage

| Scenario | Verification |
|---|---|
| 1 — Overview default on load | `tabBar.test.ts` — `buildTabBarModel({ activeTabId: null })` marks `overview` active |
| 2 — Active reviews across projects | acceptance + presenter test (DESC by `startedAt`) |
| 3 — Active reviews update real-time | Wiring code review: WS `init`/`state` handler calls `refreshOverviewSection()` when `activeTabId === 'overview'` |
| 4 — Project cards with stats | acceptance + presenter test (sparkline max 10 points) |
| 5 — Click card → navigate to project tab | Wiring code review: `.overview-project-card` click → `activateProjectTab(dataset.projectPath)` |
| 6 — Recent reviews feed | acceptance + presenter test (DESC by `mtime`, cap 10) |
| 7 — Per-project tab unchanged | Wiring code review: `activateProjectTab` only writes active tab + invokes existing `loadProjectConfigFromPath` |
| 8 — Tab persistence | `tabBar.test.ts` — localStorage round-trip |
| 9 — No configured projects | acceptance + presenter (3 French empty messages) |
| 10 — Project with 0 reviews | acceptance + presenter (score `-`, empty sparkline) |
| 11 — `/api/stats` no path | Pre-existing test |
| 12 — Review completes while Overview visible | acceptance test (mutation moves job from active to recent) |

---

## Architectural decisions

- **No new entity, no new use case, no new gateway** — anti-overengineering challenge from the plan honoured. Overview is presentation aggregation only, so logic lives in the presenter and the dashboard modules.
- **Humble Objects strictly enforced** — humble JS modules contain only render and pure helpers (`resolveActiveView`, `shouldRefreshOverviewOnState`, `resolveTabClick`). ALL formatting, sorting, sparkline computation, and French empty-state messages live in the TypeScript `OverviewPresenter` (unit-tested).
- **Inline-logic budget in `index.html`** — orchestration only (fetch, mount, attach listeners). Decision helpers extracted into testable JS modules to avoid untested inline logic accumulating in the 2k+ LOC HTML file.
- **Tab persistence** — `localStorage` under key `review-flow-active-tab` (exported as `STORAGE_KEY_ACTIVE_TAB` from `constants.js`).
- **Per-project tab behaviour unchanged** — `activateProjectTab` only writes active tab + dispatches existing `loadProjectConfigFromPath`. Hide/show via `body.overview-tab-active` CSS toggle. Legacy globals kept null-guarded to avoid touching unrelated code.

---

## Self-review

- **Iterations**: 1
- **Violations found and fixed**: 1
  - `formatOverviewElapsed` in `index.html` was passing a fake ISO string built from elapsed-ms back into `formatDuration`, which interpreted it as a timestamp and computed `now − epoch-derived-date` → always returned `now` (~57 years). Replaced with direct `formatDuration(startedAt)`. Re-ran `yarn verify` → still GREEN.
- **Remaining violations**: 0
- **Dependency rule**: prod code never imports from `@/tests/*`. An earlier intermediate violation (presenter importing factory type) was caught and fixed during implementation by moving the type to the presenter file.
- **Scope discipline**: every modified file is in the plan's scope. No drive-by refactors.

---

## Follow-ups (out of scope)

- Legacy window globals `onProjectSelect`, `loadProjectConfig`, `removeCurrentProject` are now unreachable from the UI. Could be removed in a cleanup pass.
- `syncServerRepositories()` still kept defensively to populate `STORAGE_KEY_PROJECTS` for any consumer that still reads it. Same cleanup candidate.
- `i18n-project-placeholder`, `i18n-project-load`, `i18n-project-input` translation keys still exist but are no longer rendered. Prune-candidate.
