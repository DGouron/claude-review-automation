# Spec #48 — Review Focus Selection (front / back / fullstack / doc)

## Status: implemented

**Issue**: [#48](https://github.com/DGouron/review-flow/issues/48)
**Labels**: enhancement, P2-important, skills
**Milestone**: None
**Date**: 2026-03-14
**Implemented**: 2026-05-23

## Implementation

**Report**: `docs/reports/48-review-focus-selection.report.md`
**Plan**: `docs/plans/48-review-focus-selection.plan.md`

### Artefacts

- **Entity** — `src/modules/review-execution/entities/progress/reviewFocus.type.ts` (union, helpers, dedup)
- **Entity (extended)** — `src/modules/review-execution/entities/progress/agentDefinition.type.ts` (`DEFAULT_FRONT_AGENTS`, `DEFAULT_BACK_AGENTS`, `DEFAULT_FULLSTACK_AGENTS`, `DEFAULT_DOC_AGENTS`)
- **Config boundary** — `src/config/projectConfig.ts` (parse, precedence, derivation, `getProjectAgentsOrFocusDefaults`)
- **Framework** — `src/frameworks/config/configLoader.ts` (`enrichRepository` skill derivation)
- **Controller (HTTP)** — `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts` (validation + GET passthrough)
- **Controllers (Webhook)** — `github.controller.ts` and `gitlab.controller.ts` switched to `getProjectAgentsOrFocusDefaults`
- **Skills** — `.claude/skills/review-back/SKILL.md`, `review-fullstack/SKILL.md`, `review-doc/SKILL.md`

### Endpoints

None added. Existing `GET /api/project-config` now passes through the optional `reviewFocus` field.

### Architectural decisions

- Closed literal union `'front' | 'back' | 'fullstack' | 'doc'` (no branded type — zero runtime cost).
- `dedupAgents` lives in the entity layer (pure, reusable, unit-tested by `name`).
- `logWarn` called directly inside `loadProjectConfig` for the precedence warning (same coupling pattern as `projectConfig.routes.ts`; passing a logger through every call site = boilerplate explosion for one log line).
- `DEFAULT_AGENTS` preserved for backward compatibility — callers without `reviewFocus` keep current behavior.
- Webhook controllers switched to `getProjectAgentsOrFocusDefaults` to honor focus-derived defaults at runtime (without this, the feature would only pass config-layer tests).

### Verification

- 248 test files, 1787 tests passing, 0 failing.
- `yarn verify` GREEN (typecheck + lint + test:ci).
- 12/12 spec scenarios covered (acceptance + unit + skill-content).

---

---

## Problem Statement

Today, every project funnels through the same `review-front` skill, which hardcodes a React-oriented audit pipeline (Clean Architecture, DDD, TypeScript Best Practices, SOLID, Testing, Code Quality — with `react-best-practices` as a default agent). A backend Node.js API project reviewed through this pipeline gets audited for React patterns it does not use, while missing backend-specific concerns like security and performance. A fullstack monorepo gets the worst of both: half-relevant audits and no coverage of the backend half. A documentation-heavy repository (VitePress site, handbook, runbooks) gets audited for code patterns that do not apply, while real doc concerns — broken links, stale references, terminology drift, examples that no longer compile — go unchecked.

The root cause is that the system has **no concept of stack focus**. The `reviewSkill` field in `.claude/reviews/config.json` selects the SKILL.md file, and the `agents` array selects which audits run, but there is no structured way to say "this is a backend project" (or "this is a doc-heavy repo") and have the correct skill + agents + audit rules selected automatically.

**User impact**: operators must manually author or copy-paste skill files and agent lists per project. Backend, fullstack, and doc-heavy projects either get irrelevant audits (React best practices on an Express API or on a docs site) or require manual skill customization that is undocumented and error-prone.

---

## User Story

**As** a ReviewFlow operator configuring a new project,
**I want** to set a `reviewFocus` ("front", "back", "fullstack", or "doc") in the project config,
**So that** the review automatically selects the right skill, agents, and audit rules for my project's stack — without me having to author a custom SKILL.md.

### Persona

**Alex** — DevOps engineer, manages 5 repositories: 2 frontend (React), 1 backend (Node.js API), 1 fullstack monorepo, 1 VitePress documentation site for the platform handbook. Currently uses ReviewFlow for the frontend projects only because the default skill does not make sense for the backend or for pure-doc repos. Wants to onboard the remaining repos without writing custom skills.

---

## Scope Challenge & Decisions

### Why not just let users customize `agents` in config.json?

They already can — and that is the problem. The `agents` array lets you pick *which audits run*, but each audit's *rules* are baked into the SKILL.md. A user adding `{ "name": "security", "displayName": "Security" }` to their agents list gets the agent tracked in the dashboard, but the skill has no section defining what the security audit checks for. The focus concept ties together: (1) which skill file to use, (2) which agents are defaults, and (3) which audit rules apply.

### Why not one unified skill with conditional sections?

A single SKILL.md that branches on focus would be massive and hard to maintain. Four focused skills (review-front, review-back, review-fullstack, review-doc) are simpler, each with audit sections tailored to their stack. This is the approach the issue proposes and it aligns with existing patterns (review-front already exists as a standalone skill).

### Why include "doc" as a focus rather than a separate spec?

Documentation-only repos (handbooks, runbooks, VitePress sites) and doc-heavy MRs need a fundamentally different audit pipeline: no Clean Architecture, no SOLID, no React patterns. Putting "doc" alongside front/back/fullstack reuses the same selection mechanism (single `reviewFocus` field, identical derivation logic) instead of inventing a parallel concept. The `audit-docs` skill already exists in the repo as proof that doc-specific lenses are meaningful; this spec promotes that idea to a first-class focus.

### Language handling — no dependency on i18n (#45)

Per the issue: language is enforced at prompt level by injecting `You MUST respond in {language}.` in the system prompt. Skills are language-agnostic (always written in English). No dependency on issue #45.

### Backward compatibility

The `reviewFocus` field is optional. When absent, the system falls back to the existing `reviewSkill` field exactly as today. No breaking change.

---

## Acceptance Criteria (Gherkin)

### Feature: Review focus selection

#### Scenario 1: Backend project uses review-back skill (nominal)

```gherkin
Given a project config with "reviewFocus": "back"
  And no "reviewSkill" override
When the system resolves the review skill for this project
Then the skill used is "review-back"
  And the default agents are: clean-architecture, ddd, solid, testing, code-quality, security, performance
```

#### Scenario 2: Frontend project uses review-front skill (nominal)

```gherkin
Given a project config with "reviewFocus": "front"
  And no "reviewSkill" override
When the system resolves the review skill for this project
Then the skill used is "review-front"
  And the default agents are: clean-architecture, ddd, react-best-practices, solid, testing, code-quality
```

#### Scenario 3: Fullstack project uses review-fullstack skill (nominal)

```gherkin
Given a project config with "reviewFocus": "fullstack"
  And no "reviewSkill" override
When the system resolves the review skill for this project
Then the skill used is "review-fullstack"
  And the default agents are: clean-architecture, ddd, react-best-practices, solid, testing, code-quality, security, performance
  And there are no duplicate agents
```

#### Scenario 3b: Doc-only project uses review-doc skill (nominal)

```gherkin
Given a project config with "reviewFocus": "doc"
  And no "reviewSkill" override
When the system resolves the review skill for this project
Then the skill used is "review-doc"
  And the default agents are: markdown-quality, link-validity, terminology, freshness, examples-validity
  And the default agents do NOT include react-best-practices, solid, ddd, clean-architecture
```

#### Scenario 4: Backward compatibility — no reviewFocus uses reviewSkill

```gherkin
Given a project config without "reviewFocus"
  And "reviewSkill" is set to "review-front"
When the system resolves the review skill for this project
Then the skill used is "review-front"
  And the agents are loaded from the config "agents" array or the existing defaults
```

#### Scenario 5: reviewSkill overrides reviewFocus when both present

```gherkin
Given a project config with "reviewFocus": "back"
  And "reviewSkill" is explicitly set to "my-custom-skill"
When the system resolves the review skill for this project
Then the skill used is "my-custom-skill"
  And a warning is logged: "Both reviewFocus and reviewSkill set — reviewSkill takes precedence"
```

#### Scenario 6: Invalid reviewFocus value rejected

```gherkin
Given a project config with "reviewFocus": "mobile"
When the project config is loaded
Then an error is thrown: "Invalid reviewFocus: must be 'front', 'back', 'fullstack', or 'doc'"
  And the project is not configured for review
```

#### Scenario 7: Default agents from focus are overridden by explicit agents array

```gherkin
Given a project config with "reviewFocus": "back"
  And "agents" is explicitly set to [{ "name": "security", "displayName": "Security" }]
When the system resolves agents for this project
Then the agents are [{ "name": "security", "displayName": "Security" }]
  And the focus-derived defaults are NOT used
```

#### Scenario 8: Dashboard displays project focus

```gherkin
Given a project with "reviewFocus": "back"
When the project config is loaded via GET /api/project-config
Then the response includes "reviewFocus": "back"
  And the dashboard can display the focus label
```

#### Scenario 9: Config loader enriches repository with focus-derived skill

```gherkin
Given a project config with "reviewFocus": "fullstack" and no "reviewSkill"
When the config loader enriches this repository
Then the enriched RepositoryConfig has skill "review-fullstack"
```

#### Scenario 10: review-back skill includes security and performance audits

```gherkin
Given a review is triggered on a project with "reviewFocus": "back"
When the review-back skill runs
Then audit agents include "security" checking for: secret exposure, input validation, auth patterns
  And audit agents include "performance" checking for: N+1 queries, unbounded loops, memory leaks
  And audit agents do NOT include "react-best-practices"
```

#### Scenario 11: review-fullstack skill deduplicates agents from front + back

```gherkin
Given the "front" focus defines agents: [clean-architecture, ddd, react-best-practices, solid, testing, code-quality]
  And the "back" focus defines agents: [clean-architecture, ddd, solid, testing, code-quality, security, performance]
When the "fullstack" focus resolves its agents
Then the result is: [clean-architecture, ddd, react-best-practices, solid, testing, code-quality, security, performance]
  And no agent appears twice
```

#### Scenario 12: review-doc skill audits documentation concerns, not code patterns

```gherkin
Given a review is triggered on a project with "reviewFocus": "doc"
When the review-doc skill runs
Then audit agents are exactly: markdown-quality, link-validity, terminology, freshness, examples-validity
  And audit agents do NOT include "react-best-practices", "solid", "ddd", "clean-architecture"
  And the review reports broken/unreachable links, stale references, terminology drift, and example code that no longer matches the source
```

---

## Out of Scope

| Item | Reason |
|------|--------|
| Creating new audit skills (security/SKILL.md, performance/SKILL.md) | Audit rules are sections within the review-back/review-fullstack SKILL.md, not separate skill files. Separate skill files are a future decomposition concern. |
| i18n / language selection (#45) | Language is handled at prompt level, not skill level. Explicitly decoupled per issue. |
| CLI command to set reviewFocus | Focus is set manually in `.claude/reviews/config.json`. A CLI wizard is covered by #57 (interactive agent configuration). |
| Auto-detection of stack from file extensions | Interesting idea but adds complexity. Focus is explicitly configured by the operator. |
| Per-file focus routing in monorepos | Fullstack focus reviews the entire MR. Routing different files to different skills is a future feature. |
| Followup skill per focus | The `reviewFollowupSkill` is independent of focus. A followup-back/followup-fullstack/followup-doc split may come later but is not part of this scope. |
| Auto-detection of doc MRs (markdown-only diff) inside a code project | A code project with one MR touching only `.md` files still runs its configured focus (front/back/fullstack). Routing such an MR to `review-doc` is a future enhancement. |
| Doc rendering / preview tooling | This spec audits doc content quality, not the rendered output. VitePress/Docusaurus build checks remain the responsibility of the project's own CI. |
| Template generation for new focuses | Covered by #56 (MCP-ready skeleton skill templates). This issue creates the production skills, not the templates. |

---

## Technical Notes

### What needs to be created

| Component | Description |
|-----------|-------------|
| `review-back/SKILL.md` | Backend review skill: same structure as `review-front` but with security + performance audits replacing react-best-practices. No React audit. |
| `review-fullstack/SKILL.md` | Fullstack review skill: union of front + back audits. 8 sequential audits (clean-architecture, ddd, react-best-practices, solid, testing, code-quality, security, performance). |
| `review-doc/SKILL.md` | Documentation review skill: doc-only audit pipeline. Reuses lenses from the existing `audit-docs` skill (duplication, staleness, language, verbosity) and adds audits tuned for MR/PR-level doc review (links, terminology, example freshness). NO code-architecture audits. |
| Focus-to-agents mapping | A constant or function mapping `"front" → [agents]`, `"back" → [agents]`, `"fullstack" → [agents]`, `"doc" → [agents]` for default agent resolution. |

### What needs to be modified

| Component | File(s) | Change |
|-----------|---------|--------|
| **ProjectConfig interface** | `src/config/projectConfig.ts` | Add optional `reviewFocus?: "front" \| "back" \| "fullstack" \| "doc"` field |
| **loadProjectConfig** | `src/config/projectConfig.ts` | Validate `reviewFocus` if present; derive `reviewSkill` from focus when `reviewSkill` is not explicitly set |
| **Default agents resolution** | `src/entities/progress/agentDefinition.type.ts` | Add `DEFAULT_BACK_AGENTS`, `DEFAULT_FULLSTACK_AGENTS`, and `DEFAULT_DOC_AGENTS` constants; add a `getDefaultAgentsForFocus(focus)` function |
| **Config loader (enrichRepository)** | `src/frameworks/config/configLoader.ts` | When enriching, if project config has `reviewFocus`, use it to derive the `skill` field (unless `reviewSkill` is explicitly set) |
| **ProjectConfig interface (configLoader)** | `src/frameworks/config/configLoader.ts` | Add `reviewFocus` to the local `ProjectConfig` interface |
| **Project config validation route** | `src/interface-adapters/controllers/http/projectConfig.routes.ts` | Validate `reviewFocus` value if present; validate derived skill exists |
| **Project config tests** | `src/tests/units/config/projectConfig.test.ts` | Add tests for focus-to-skill derivation, focus-to-agents mapping, backward compatibility, invalid focus rejection |

### Agent mapping constants

```
FRONT:      clean-architecture, ddd, react-best-practices, solid, testing, code-quality
BACK:       clean-architecture, ddd, solid, testing, code-quality, security, performance
FULLSTACK:  clean-architecture, ddd, react-best-practices, solid, testing, code-quality, security, performance
DOC:        markdown-quality, link-validity, terminology, freshness, examples-validity
```

#### DEFAULT_DOC_AGENTS — audit definitions

| Agent | Checks for |
|-------|------------|
| `markdown-quality` | Heading hierarchy, unclosed code fences, list indentation, broken tables, missing alt text |
| `link-validity` | Internal anchors that no longer exist, dead relative file links, external URLs reachable (HEAD probe) |
| `terminology` | Ubiquitous-language adherence, banned terms, undefined acronyms, inconsistent capitalization of product names |
| `freshness` | Versions/deps cited in prose still match `package.json`; "as of YYYY" timestamps stale beyond threshold |
| `examples-validity` | Code blocks in `ts`/`tsx`/`json` parse; imports/exports referenced still exist in source |

`clarity` and `structure` were considered but deferred — they overlap with the existing `/audit-docs` skill's verbosity/duplication lenses, which operators can invoke ad-hoc. Promotion to `DEFAULT_DOC_AGENTS` can happen in a future spec once usage data shows they catch issues the Standard 5 miss.

### Skill derivation logic (pseudocode)

```
if reviewSkill is explicitly set:
    use reviewSkill (warn if reviewFocus also set)
else if reviewFocus is set:
    use "review-{focus}" as skill name
else:
    use "review-code" (existing default fallback)
```

### Agent derivation logic (pseudocode)

```
if agents array is explicitly set in config:
    use it (user override)
else if reviewFocus is set:
    use DEFAULT_AGENTS_FOR_FOCUS[reviewFocus]
else:
    use DEFAULT_AGENTS (existing behavior)
```

---

## Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| `review-front/SKILL.md` exists | Done | Used as the template for review-back and review-fullstack |
| #45 — i18n | Open | **No dependency** — explicitly decoupled per issue |
| #56 — MCP-ready skeleton templates | Open | **No dependency** — this issue creates production skills, not templates |
| #57 — Interactive agent config wizard | Open | **No dependency** — focus is set manually in config.json |

---

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | No blockers. review-front exists as reference. No dependency on #45, #56, or #57. | PASS |
| **Negotiable** | Agent lists per focus are negotiable. Fullstack deduplication strategy is negotiable. Override precedence (reviewSkill vs reviewFocus) is negotiable. | PASS |
| **Valuable** | Directly enables backend and fullstack projects to use ReviewFlow with appropriate audits. Removes the friction of manual skill authoring for non-frontend repos. | PASS |
| **Estimable** | 4 deliverables: 3 new SKILL.md files (review-back, review-fullstack, review-doc) modeled on review-front + config changes in 4 files with clear boundaries. Effort: 10 points (revised from 8 — review-doc adds ~2). | PASS |
| **Small** | After scoping out CLI wizard (#57), i18n (#45), and templates (#56): 3 skill files + config logic + tests. Fits in 2-3 sprint days (~0.4 AI-day per [[feedback_estimates_ai_days]] ratio). | PASS |
| **Testable** | 12 Gherkin scenarios with concrete assertions. Config logic is unit-testable. Skill files are integration-testable via existing review pipeline. | PASS |

---

## Suggested Decomposition

Given the 10-point effort estimate, recommended sub-tasks:

1. **Config layer** — Add `reviewFocus` to `ProjectConfig`, validation, skill/agent derivation logic, and unit tests (Scenarios 1-7, 9)
2. **review-back skill** — Create `review-back/SKILL.md` with security + performance audits, no React audit (Scenario 10)
3. **review-fullstack skill** — Create `review-fullstack/SKILL.md` with deduplicated union of front + back audits (Scenario 11)
4. **review-doc skill** — Create `review-doc/SKILL.md` with `DEFAULT_DOC_AGENTS` audits, no code-architecture audits (Scenarios 3b, 12)
5. **Dashboard + API** — Expose `reviewFocus` in `GET /api/project-config` response (Scenario 8)

Sub-tasks 1-4 are sequential against the config layer (1) but 2/3/4 are parallelizable once 1 lands. Sub-task 5 is independent.

---

## Definition of Done

- [ ] `reviewFocus` field accepted in `.claude/reviews/config.json` with values `"front"`, `"back"`, `"fullstack"`, `"doc"`
- [ ] Invalid `reviewFocus` values are rejected with a clear error message
- [ ] When `reviewFocus` is set and `reviewSkill` is not, the skill is derived as `"review-{focus}"`
- [ ] When both `reviewFocus` and `reviewSkill` are set, `reviewSkill` takes precedence with a logged warning
- [ ] When neither is set, existing behavior is preserved (fallback to `reviewSkill` or `"review-code"`)
- [ ] Default agents per focus are defined and used when no explicit `agents` array is provided
- [ ] Explicit `agents` array in config overrides focus-derived defaults
- [ ] `review-back/SKILL.md` exists with security + performance audits, no React audit
- [ ] `review-fullstack/SKILL.md` exists with deduplicated union of front + back audits
- [ ] `review-doc/SKILL.md` exists with `DEFAULT_DOC_AGENTS` audits (markdown-quality, link-validity, terminology, freshness, examples-validity) and no code-architecture audits
- [ ] `GET /api/project-config` returns `reviewFocus` when present
- [ ] Unit tests cover all 12 Gherkin scenarios
- [ ] `yarn verify` passes (typecheck + lint + tests)
