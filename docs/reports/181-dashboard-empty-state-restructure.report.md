# Implementation Report — SPEC-181

**Spec**: `docs/specs/181-dashboard-empty-state-restructure.md`
**Plan**: `docs/plans/181-dashboard-empty-state-restructure.plan.md`
**Date**: 2026-05-27
**Status**: Complete

---

## Files created

| Path | Purpose |
|------|---------|
| `src/dashboard/modules/sectionVisibility.js` | Pure humble helper exporting `shouldHidePendingReviewsSection` and `shouldHideActiveReviewsSection`. JSDoc-typed, no DOM access. |
| `src/tests/units/dashboard/modules/sectionVisibility.test.ts` | 11 unit scenarios on the helper (empty / non-empty / followup-only / mixed / nullish inputs). |
| `src/tests/units/dashboard/dashboardLayout.test.ts` | 23 structural scenarios on `src/dashboard/index.html` (DOM order, sidebar buttons, sheet markup, dead-code removal, wiring). Plays the outer-loop SDD role for this UI-only spec. |

## Files modified

| Path | Diff intent |
|------|-------------|
| `src/dashboard/index.html` | +135 / -93. DOM surgery: team-section promoted to first child of `<main>`; `#stats-section` and `#claude-economics-section` removed from `<main>` and migrated into two new sheet panels (`#economics-sheet`, `#stats-sheet`); two new sidebar buttons (`#open-economics-sheet-btn`, `#open-stats-sheet-btn`); empty-state placeholders stripped from `#pending-reviews` and `#active-reviews`; helper wired into `updateUI()` active-reviews branch and `updatePendingReviewsUI()`; `toggleStats`, `'claude-economics-section'` entry in `secondarySections`, and `stats-section` reveal call removed; new `open/close` functions for the two sheets exposed on `window`. |
| `docs/feature-tracker.md` | New row appended (status: implemented). |

## Tests

- **Total tests after SPEC-181**: 2341 GREEN (was 2307 — +34 added by this spec).
- **`yarn verify`**: GREEN (typecheck + lint + tests).
- **Coverage of spec scenarios**:

| Spec scenario cluster | Test(s) | Status |
|-----------------------|---------|--------|
| pending/active empty-state hiding (5 scenarios) | `sectionVisibility.test.ts` (11 cases including transitions and defensive nullish guards) | GREEN |
| team first child of main | `dashboardLayout.test.ts > main DOM order > team first child of main` | GREEN |
| focus-strip second child | `dashboardLayout.test.ts > main DOM order > focus-strip second child` | GREEN |
| claude-economics absent from main | `dashboardLayout.test.ts > main DOM order > claude-economics removed from main` | GREEN |
| stats absent from main | `dashboardLayout.test.ts > main DOM order > stats-section removed from main` | GREEN |
| economics + stats sidebar buttons visible | `dashboardLayout.test.ts > sidebar buttons > ...` (3 cases incl. `disabled` initial state) | GREEN |
| economics sheet markup / inner ids / handlers / close | `dashboardLayout.test.ts > economics sheet markup` (4 cases) | GREEN |
| stats sheet markup / inner ids / handlers / close | `dashboardLayout.test.ts > stats sheet markup` (4 cases) | GREEN |
| dead-state markup removed (`heartbeat-empty-state`, `i18n-empty-active-reviews`) | `dashboardLayout.test.ts > removed empty-state markup` (2 cases) | GREEN |
| helper imported and invoked in inline script | `dashboardLayout.test.ts > inline script wiring` (2 cases) | GREEN |
| dead-code removal: `secondarySections` + `toggleStats` | `dashboardLayout.test.ts > dead-code removal` (2 cases) | GREEN |

Spec scenarios requiring JS execution (open/close adds `.open` class, `body.style.overflow === 'hidden'`, `fetchBudget()` called once, transitions empty ↔ non-empty) are validated via **wiring assertions** (onclick attributes reference the right function names) plus the pure helper tests — consistent with the existing dashboard test convention (no JS-execution integration harness in `src/tests/units/dashboard/`).

## Self-review iterations

| Iteration | Trigger | Action |
|-----------|---------|--------|
| 1 | feature-implementer initial pass (output truncated) | Helper + 2 tests + DOM surgery delivered. Suite ran partially. |
| 2 | Orchestrator post-run check: 2 layout tests failing on `#economics-sheet` / `#stats-sheet` inner-id assertions | Root cause: regex `<div id="...">[\s\S]*?</div>` is non-greedy and matched only the first nested `</div>`. Replaced both call sites and added an `extractElementSubtree(html, openingTag)` helper inside the test file that does balanced `<div>` / `</div>` matching. 3 regex sites rewritten. |
| 3 | Orchestrator post-fix typecheck: 8 errors in `sectionVisibility.test.ts` on test fixtures with `{ id, jobType }` | Root cause: helper JSDoc declared `Array<{ jobType?: string }>` (closed shape). Widened to `ReadonlyArray<{ jobType?: string } & Record<string, unknown>>` to reflect that real review entries carry more fields. |
| 4 | Final `yarn verify` | GREEN. |

Total violations found: 2. Total fixed: 2. Remaining issues: 0.

## Outstanding follow-ups

- **Project-tab activation flow for `#open-stats-sheet-btn` enable/disable**: the plan called for toggling the `disabled` attribute when the active tab switches between `overview` and a project. The implementer wired this via the existing project-load path; the corresponding behaviour is covered structurally (initial `disabled` state assertion) but the dynamic enable on tab-switch is **not** asserted by an automated test — relies on the live dashboard. Manual smoke recommended at PR review time.
- **`document.body.style.overflow` restoration when sheets stack**: closing one sheet while the other is open will reset `overflow` to `''`. Acceptable per spec (the sheets are mutually-exclusive sidebar actions); flagged for future iteration if real users hit it.
- **CSS for the new sidebar buttons sequence**: no `styles.css` edit was needed — the existing `.sidebar-settings-button` rules visually accommodate 3 stacked buttons. Re-verify after manual smoke.

---

**Verdict**: SPEC-181 ready for commit.
