# Implementation Report — SPEC-48 Review Focus Selection

**Spec**: `docs/specs/48-review-focus-selection.md`
**Plan**: `docs/plans/48-review-focus-selection.plan.md`
**Worktree**: `.claude/worktrees/spec-48-add-doc-focus`
**Date**: 2026-05-23
**Status**: Complete — `yarn verify` GREEN, all 12 scenarios covered.

---

## Files created

| Path | Lines | Purpose |
|------|-------|---------|
| `src/modules/review-execution/entities/progress/reviewFocus.type.ts` | 43 | `ReviewFocus` union, `REVIEW_FOCUS_VALUES`, `isReviewFocus`, `reviewSkillForFocus`, `defaultAgentsForFocus`, `dedupAgents` |
| `src/tests/acceptance/reviewFocus.acceptance.test.ts` | 175 | Outer SDD loop — covers SC1, SC2, SC3+11, SC3b, SC4, SC5, SC6, SC7 |
| `src/tests/factories/projectConfig.factory.ts` | 62 | Shared `ProjectConfigFactory.create(overrides)` |
| `src/tests/units/modules/review-execution/entities/progress/reviewFocus.type.test.ts` | — | Unit tests for the entity helpers |
| `src/tests/units/modules/review-execution/entities/progress/agentDefinition.type.test.ts` | — | `DEFAULT_*_AGENTS` shape + FULLSTACK dedup |
| `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.test.ts` | — | Route validation + GET passthrough + skill derivation |
| `.claude/skills/review-back/SKILL.md` | 574 | Backend audit pipeline (7 audits, no React, + security/performance) |
| `.claude/skills/review-fullstack/SKILL.md` | 433 | Fullstack audit pipeline (8 audits, deduplicated union) |
| `.claude/skills/review-doc/SKILL.md` | 404 | Documentation audit pipeline (5 audits: markdown-quality, link-validity, terminology, freshness, examples-validity) |
| `docs/reports/48-review-focus-selection.report.md` | this file | This report |

## Files modified

| Path | Change |
|------|--------|
| `src/config/projectConfig.ts` (+89/-?) | Add `reviewFocus?` field; precedence rule (`reviewSkill > reviewFocus` with `logWarn`); derivation fallback; new helper `getProjectAgentsOrFocusDefaults` |
| `src/frameworks/config/configLoader.ts` (+26/-?) | `enrichRepository` derives `skill` from focus when `reviewSkill` absent |
| `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts` (+38/-?) | Accept `reviewFocus`, relax `reviewSkill` required check, derive skill before SKILL.md existence check |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` (+4/-?) | Switch from `getProjectAgents` to `getProjectAgentsOrFocusDefaults` (CRITICAL — without this, runtime ignores focus) |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` (+4/-?) | Same switch as github controller |
| `src/modules/review-execution/entities/progress/agentDefinition.type.ts` (+46/-?) | Add `DEFAULT_FRONT_AGENTS`, `DEFAULT_BACK_AGENTS`, `DEFAULT_FULLSTACK_AGENTS`, `DEFAULT_DOC_AGENTS`; preserve `DEFAULT_AGENTS` for backward compat |
| `src/tests/units/config/projectConfig.test.ts` (+194/-?) | Focus parsing, derivation, precedence warning, invalid focus rejection, helper tests |
| `src/tests/units/frameworks/config/configLoader.test.ts` (+85/-?) | `enrichRepository` skill derivation |
| `src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts` (+1/-?) | Stay green after helper switch |
| `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts` (+1/-?) | Stay green after helper switch |
| `src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts` (+1/-?) | Stay green after helper switch |
| `docs/feature-tracker.md` (+1/-1) | Status bumped `drafted` → `planned` (will be bumped to `implemented` by orchestrator) |
| `docs/specs/48-review-focus-selection.md` (+83/-20) | Amended earlier in session to add `doc` focus (scenarios 3b + 12, DEFAULT_DOC_AGENTS) |

## Tests

- **Total**: 248 test files, **1787 tests passing**, 0 failing.
- **Acceptance**: `reviewFocus.acceptance.test.ts` GREEN (8 scenarios at config layer).
- **Unit coverage**: factory + 5 unit suites + 3 route tests.
- **No regressions**: existing acceptance suite for SPEC-46 still GREEN after webhook helper switch.

## Spec coverage

| Scenario | Covered by |
|----------|------------|
| SC1 — back resolves to `review-back` + DEFAULT_BACK_AGENTS | `reviewFocus.acceptance.test.ts` SC1 |
| SC2 — front resolves to `review-front` + DEFAULT_FRONT_AGENTS | `reviewFocus.acceptance.test.ts` SC2 |
| SC3 — fullstack resolves to `review-fullstack` + DEFAULT_FULLSTACK_AGENTS (no dups) | `reviewFocus.acceptance.test.ts` SC3 + unit `agentDefinition.type.test.ts` (dedup) |
| SC3b — doc resolves to `review-doc` + DEFAULT_DOC_AGENTS | `reviewFocus.acceptance.test.ts` SC3b |
| SC4 — backward compat (no focus, reviewSkill kept) | `reviewFocus.acceptance.test.ts` SC4 |
| SC5 — reviewSkill > reviewFocus precedence with logWarn | `reviewFocus.acceptance.test.ts` SC5 (spy on `logBuffer`) |
| SC6 — invalid focus rejected with message containing all 4 values | `reviewFocus.acceptance.test.ts` SC6 + `projectConfig.test.ts` |
| SC7 — explicit `agents` array overrides focus defaults | `reviewFocus.acceptance.test.ts` SC7 |
| SC8 — GET /api/project-config exposes reviewFocus | `projectConfig.routes.test.ts` (passthrough confirmed) |
| SC9 — configLoader.enrichRepository derives skill from focus | `configLoader.test.ts` |
| SC10 — review-back skill has security + performance audits | `.claude/skills/review-back/SKILL.md` audit table |
| SC11 — fullstack dedup | `reviewFocus.type.test.ts` (dedupAgents) + `agentDefinition.type.test.ts` |
| SC12 — review-doc skill audits doc concerns, no code patterns | `.claude/skills/review-doc/SKILL.md` audit table |

## Risks materialized

Of the 7 risks listed in the plan:

| # | Risk | Outcome |
|---|------|---------|
| 1 | Required-field relaxation too permissive | Mitigated — explicit "neither set throws" unit test added |
| 2 | Dedup by object reference fails | Mitigated — `dedupAgents` keys on `agent.name` via `Map`, unit-tested |
| 3 | Error message drift after adding `doc` | Mitigated — message built dynamically from `REVIEW_FOCUS_VALUES` |
| 4 | Webhooks not switched to new helper | Mitigated — both github + gitlab controllers updated, tests still green |
| 5 | Route SKILL.md check before derivation | Mitigated — route derives skill on the fly before existence check |
| 6 | Spec drift on `doc` focus | N/A — worktree spec was amended before implementer ran; planner caveat obsolete |
| 7 | `logWarn` couples config to framework | Accepted — same coupling already exists in `projectConfig.routes.ts`; documented in JSDoc |

## Unresolved issues

**One typing fix applied post-agent**: the agent paused mid-Step 7 on a vitest mock typing error (`fsPromises.stat` overload returning `Stats | BigIntStats | undefined`). Resolved by:
- Switching `mockImplementation(async () => fakeStats())` → `mockResolvedValue(fakeStats())` (cleaner, no overload inference issue)
- Tightening `fakeStats()` return type to `Stats` with an explicit nullish check (no `as` cast — complies with project rule)

No other unresolved issues. `yarn verify` is GREEN.

## Architecture decisions

- **No new branded type for `ReviewFocus`** — closed literal union is sufficient, zero runtime cost.
- **`dedupAgents` lives in entity layer** (`reviewFocus.type.ts`) — pure function, no I/O, reusable.
- **`logWarn` called from `loadProjectConfig` directly** — same coupling pattern as `projectConfig.routes.ts`. Passing a logger through every call site would explode the surface for one log line. KISS wins.
- **`DEFAULT_AGENTS` preserved** — backward compatibility for callers without `reviewFocus`.
- **Webhook controllers use the new helper** — without this, the feature only worked in config-layer tests. The plan flagged this as the highest-impact risk.
- **`GET /api/project-config` exposes `reviewFocus` for free** — the route already returns the config as-is (line 76 passthrough). No mapping added.
