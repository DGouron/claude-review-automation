# Cover dashboard modules with unit tests

## Context

Six dashboard modules in `src/interface-adapters/views/dashboard/modules/` ship without unit tests. Refactoring them is blind: a breaking change reaches the dashboard before any regression is caught. The original spec was written when 13 modules existed and 13 had tests; the dashboard grew to 22 modules and the gap widened silently.

## Rules

- Every JavaScript module under `src/interface-adapters/views/dashboard/modules/` has at least one corresponding `.test.ts` file
- Test files mirror the module path under `src/tests/units/interface-adapters/views/dashboard/modules/`
- A module is considered covered when its public exports each have at least one nominal scenario and one edge case
- No production code is modified by this spec — test-only change
- Tests follow the existing Detroit-school pattern (state-based, factories, `vi.stubGlobal` for browser globals)

## Scenarios

- nominal: {modules: 22, tests: 22} → acceptance test passes
- gap detected: {modules: 22, tests: 16} → acceptance test rejects with list of uncovered modules
- new module added without test: {add `foo.js`, no `foo.test.ts`} → acceptance test rejects "Module sans test: foo.js"
- module deleted: {remove `bar.js`, keep `bar.test.ts`} → acceptance test rejects "Test orphelin: bar.test.ts"
- empty module list: {modules dir missing or empty} → acceptance test rejects "Aucun module dashboard détecté"

## Out of Scope

- WebSocket connection-management tests (logic still inline in `index.html`, separate spec needed for extraction)
- localStorage persistence tests (same situation as WebSocket)
- Integration tests / browser rendering / visual regression
- Coverage percentage thresholds (separate concern, tracked via `yarn coverage`)
- Refactoring existing tests
- Dashboard presenter tests (no presenter module exists yet)

## Glossary

| Term | Definition |
|------|------------|
| Dashboard module | A `.js` file under `src/interface-adapters/views/dashboard/modules/` consumed by the browser-served `index.html` |
| Covered module | A module whose file path has a matching `.test.ts` in the mirrored test directory |
| Uncovered module | A module with no corresponding test file (the gap this spec closes) |
| Orphan test | A test file whose target module no longer exists |

## Current Gap (verified 2026-05-15)

Modules without tests:
- `cleanup.js`
- `collapsibleList.js`
- `mrSheet.js`
- `sharedViewHelpers.js`
- `statsCharts.js`
- `versionUpdate.js`

## INVEST

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | No code change, only test additions |
| Negotiable | OK | Test depth per module is flexible (min: 1 nominal + 1 edge case) |
| Valuable | OK | Unblocks safe refactoring of all 22 modules |
| Estimable | OK | 6 modules × ~30 min = ~3h |
| Small | OK | Test-only, no production change |
| Testable | OK | Acceptance test gives objective pass/fail |

## Definition of Done

- [ ] Acceptance test `dashboard-modules-coverage.acceptance.test.ts` is GREEN
- [ ] One `.test.ts` exists for each of the 6 uncovered modules
- [ ] Each new test file has at least one nominal scenario and one edge case per public export
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] Feature tracker updated: status `drafted` → `implemented`
