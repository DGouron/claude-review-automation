# Plan — SPEC-48 Review Focus Selection (front / back / fullstack / doc)

> Source spec: `docs/specs/48-review-focus-selection.md`
> Worktree: `.claude/worktrees/spec-48-add-doc-focus`
> Status: planned

---

## PLAN

- **scope**: Add an optional `reviewFocus` field to ProjectConfig that selects a curated set of audit agents and a curated SKILL.md (front | back | fullstack | doc). `reviewSkill`, when explicitly set, keeps precedence over `reviewFocus` (with a warning). The `agents` array, when explicitly set, keeps precedence over focus-derived defaults.
- **is_new_module**: false. The feature extends existing files in two layers: `src/config/projectConfig.ts` (legacy boundary) and `src/modules/review-execution/entities/progress/agentDefinition.type.ts` (focus → agents mapping). One new entity helper file is added for the focus type + derivation function. Three new SKILL.md asset folders are added under `.claude/skills/`.

### Anti-overengineering challenge

- No new Use Case, no new Gateway, no new Controller, no new Presenter — this is a pure configuration enrichment.
- No branded type for `reviewFocus`: the value space is closed (`'front' | 'back' | 'fullstack' | 'doc'`), a literal union string is sufficient and zero-cost.
- No DI ceremony for the precedence warning: the existing `logWarn` from `@/frameworks/logging/logBuffer.js` is the canonical sink and is already used by `projectConfig.routes.ts` for the same configuration domain. Passing a logger through `loadProjectConfig` would multiply boilerplate for one log line.
- Dedup is a 4-line helper, not a class.

---

## ENTITIES

### `reviewFocus` value object (focus type + derivation)

- **file**: `src/modules/review-execution/entities/progress/reviewFocus.type.ts`
- **content**:
  - Exported literal union `ReviewFocus = 'front' | 'back' | 'fullstack' | 'doc'`
  - Exported const tuple `REVIEW_FOCUS_VALUES = ['front', 'back', 'fullstack', 'doc'] as const`
  - Exported type guard `isReviewFocus(value: unknown): value is ReviewFocus`
  - Exported `reviewSkillForFocus(focus: ReviewFocus): string` → returns `review-{focus}`
  - Exported `defaultAgentsForFocus(focus: ReviewFocus): AgentDefinition[]` returning the curated list per focus
  - Exported `dedupAgents(agents: AgentDefinition[]): AgentDefinition[]` — order-preserving Set-based dedup keyed on `agent.name`
- **test**: `src/tests/units/modules/review-execution/entities/progress/reviewFocus.type.test.ts`
- **factory**: none required — focus is a primitive union. A `ProjectConfigFactory` is created in `src/tests/factories/projectConfig.factory.ts` to centralize fixtures (see Unit Test Plan).
- **scenarios covered**: 1, 2, 3, 6, 10, 11

### Extended `agentDefinition.type.ts`

- **file**: `src/modules/review-execution/entities/progress/agentDefinition.type.ts` (modified, not replaced)
- **additions**:
  - `DEFAULT_FRONT_AGENTS` — `clean-architecture, ddd, react-best-practices, solid, testing, code-quality` (+ existing terminal agents `threads`, `report`)
  - `DEFAULT_BACK_AGENTS` — `clean-architecture, ddd, solid, testing, code-quality, security, performance` (+ `threads`, `report`)
  - `DEFAULT_FULLSTACK_AGENTS` — order-preserving dedup union of FRONT ∪ BACK (= `clean-architecture, ddd, react-best-practices, solid, testing, code-quality, security, performance` + `threads`, `report`)
  - `DEFAULT_DOC_AGENTS` — `markdown-quality, link-validity, terminology, freshness, examples-validity` (+ `threads`, `report`)
- **important**: `DEFAULT_AGENTS` must remain unchanged (backward compatibility for callers that resolve to it when no focus is set).
- **scenarios covered**: 1, 2, 3, 10, 11, plus the new doc scenario

### `ProjectConfig` extension (boundary)

- **file**: `src/config/projectConfig.ts` (modified)
- **change**:
  - Add `reviewFocus?: ReviewFocus` to the exported `ProjectConfig` interface
  - `loadProjectConfig` reads `parsed.reviewFocus`; if present and not a `ReviewFocus`, throw `Invalid reviewFocus: must be 'front', 'back', 'fullstack', or 'doc'`
  - `reviewSkill` resolution logic:
    1. If `parsed.reviewSkill` is a non-empty string AND `parsed.reviewFocus` is a valid focus → keep `reviewSkill`, call `logWarn('Both reviewFocus and reviewSkill set — reviewSkill takes precedence', { reviewSkill, reviewFocus })`
    2. If `parsed.reviewSkill` is missing/empty AND `parsed.reviewFocus` is a valid focus → set `reviewSkill = reviewSkillForFocus(focus)` and drop the "required field" check
    3. If neither → keep current behavior (throws on missing `reviewSkill`)
  - Add new helper `getProjectAgentsOrFocusDefaults(localPath: string): AgentDefinition[] | undefined` returning `config.agents ?? (config.reviewFocus ? defaultAgentsForFocus(config.reviewFocus) : undefined)`
  - Keep `getProjectAgents` unchanged for backward compat (used by webhook controllers)
- **scenarios covered**: 4, 5, 6, 7, 9

### `ProjectConfig` (configLoader local interface)

- **file**: `src/frameworks/config/configLoader.ts` (modified)
- **change**:
  - Add `reviewFocus?: ReviewFocus` to the local `ProjectConfig` interface
  - In `enrichRepository`, derive `skill`: `projectConfig.reviewSkill ?? (projectConfig.reviewFocus ? reviewSkillForFocus(projectConfig.reviewFocus) : 'review-code')`
- **scenarios covered**: 9

---

## USE CASES

None required. The feature lives in the entity/config boundary. If the spec later asks for "dashboard displays focus", that becomes a Presenter concern (see PRESENTERS section), not a use case.

---

## GATEWAYS

None. No new external resource is introduced. Skill files are read by the existing Claude invoker via filesystem.

---

## CONTROLLERS

### `projectConfig.routes.ts` (modified)

- **file**: `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts`
- **change**:
  - When validating, accept `reviewFocus` if present and reject if not in `REVIEW_FOCUS_VALUES`
  - Relax the `reviewSkill` required-fields check: `reviewSkill` is required only when `reviewFocus` is absent
  - When `reviewFocus` is set and `reviewSkill` is absent in the file, derive the skill via `reviewSkillForFocus(focus)` before checking the SKILL.md existence on disk
  - The response `config` object is returned as-is (verified in code: line 76 `return { success: true, config, path: configPath }`), so `reviewFocus` is automatically exposed once present in the JSON — Scenario 8 requires no extra mapping
- **test**: `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.test.ts` (add cases for focus validation + skill derivation + GET response shape)
- **scenarios covered**: 6, 8, 9

---

## PRESENTERS

None required for SPEC-48 (the dashboard receives `reviewFocus` as a passthrough field — Scenario 8). Any "focus badge" UI is a follow-up dashboard concern, explicitly out of scope.

## VIEWS

None.

---

## FRAMEWORKS / CONFIG

- **Logger sink** (Scenario 5): `logWarn` from `src/frameworks/logging/logBuffer.ts` is called inside `loadProjectConfig`. This keeps the warning visible in the in-memory log buffer that the dashboard `/api/logs` route already serves — no new wiring.
- **No new env var, no new queue, no new scheduler.**

---

## SKILLS (Markdown assets)

Three new `.claude/skills/<name>/SKILL.md` files modeled after `.claude/skills/review-front/SKILL.md`. Each follows the same 6-section structure: Persona, Context, READ-ONLY MODE, Activation, Sequential Architecture, Workflow → Phase 1/2/3, Inline Comments, Report Publishing, Exit Commands. The differences are in the **audit table** (Phase 2) and the **executive summary** rows.

### `.claude/skills/review-back/SKILL.md`

- **front-matter**: `name: review-back`, description mentions 7 sequential audits (Clean Archi, DDD, TypeScript Best Practices, SOLID, Testing, Code Quality, Security, Performance — replacing React with Security+Performance, so 7 audits not 6).
- **audit table** (Phase 2):
  | # | Agent | Skill to read | Focus |
  |---|-------|---------------|-------|
  | 1 | clean-architecture | `/.claude/skills/clean-architecture/SKILL.md` | Dependency Rule, layers |
  | 2 | ddd | `/.claude/skills/ddd/SKILL.md` | Bounded Context, language |
  | 3 | typescript-best-practices | `/CLAUDE.md` | Types, async, imports |
  | 4 | solid | `/.claude/skills/solid/SKILL.md` | 5 principles |
  | 5 | testing | `/.claude/skills/tdd/SKILL.md` | Coverage, patterns |
  | 6 | code-quality | `/CLAUDE.md` | Conventions |
  | 7 | security | `/.claude/skills/security/SKILL.md` | Secret exposure, input validation, auth patterns |
  | 8 | performance | inline rules in this SKILL.md | N+1 queries, unbounded loops, memory leaks |
- **no React audit** (Scenario 10).
- Inline rules for `performance` audit (no separate skill folder per spec scoping note).

### `.claude/skills/review-fullstack/SKILL.md`

- **front-matter**: `name: review-fullstack`, description mentions 8 sequential audits (clean-architecture, ddd, react-best-practices, solid, testing, code-quality, security, performance).
- **audit table**: deduplicated union of front + back. Order: from FRONT first (clean-architecture → code-quality), then BACK's extras (security, performance).
- The skill explicitly mentions dedup so a reader auditing a monorepo understands no audit runs twice.

### `.claude/skills/review-doc/SKILL.md`

- **front-matter**: `name: review-doc`, description mentions 5 sequential audits oriented toward documentation projects.
- **audit table**:
  | # | Agent | Skill to read | Focus |
  |---|-------|---------------|-------|
  | 1 | markdown-quality | inline rules | heading hierarchy, lists, tables, code-fence languages |
  | 2 | link-validity | inline rules | internal links resolve, anchors exist, no `TODO`/`FIXME` placeholders |
  | 3 | terminology | inline rules | ubiquitous vocabulary, no synonyms drift, glossary consistency |
  | 4 | freshness | inline rules | stale dates, deprecated APIs referenced, version pins |
  | 5 | examples-validity | inline rules | code snippets compile/parse, commands match the current CLI |
- These 5 audits map to the explicit `DEFAULT_DOC_AGENTS` list.
- **no React audit, no SOLID, no Clean Architecture** — it is a docs-only audit pipeline.
- Read-only mode still applies: the skill produces a report and inline comments, never edits the docs.

---

## WIRING

- **routes**: no addition required in `src/main/routes.ts`. `projectConfig.routes.ts` is already plugged.
- **dependencies**: no new gateway to instantiate.
- **DEFAULT_AGENTS callers** (`src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts:558` and `gitlab.controller.ts:617`) currently do `getProjectAgents(j.localPath) ?? DEFAULT_AGENTS`. They will be updated to call the new `getProjectAgentsOrFocusDefaults(j.localPath) ?? DEFAULT_AGENTS` so the focus-derived defaults take effect when no explicit agents array is provided. This is the minimum touch to honor Scenario 7's negative case (explicit override) + Scenarios 1/2/3 default-agent assertions through the webhook → review path.

---

## IMPLEMENTATION_ORDER

Detroit inside-out, with the SDD outer loop opened first.

1. **`src/tests/acceptance/reviewFocus.acceptance.test.ts`** — write the acceptance suite covering Scenarios 1, 2, 3, 3b (fullstack dedup), 4, 5, 6, plus a doc-focus default-agents scenario. RED initially. Justification: outer loop, locks the contract before any unit work.
2. **`src/tests/factories/projectConfig.factory.ts`** — create `ProjectConfigFactory.create(overrides)` returning a valid `ProjectConfig` object. Justification: avoid hardcoded fixtures in 5+ test files.
3. **`src/modules/review-execution/entities/progress/reviewFocus.type.ts`** + its test — entity-layer value type and derivation helpers (RED → GREEN). Justification: pure domain logic, no dependency on filesystem or fastify.
4. **Extend `src/modules/review-execution/entities/progress/agentDefinition.type.ts`** + test — add the 4 `DEFAULT_*_AGENTS` constants, verify dedup for FULLSTACK via the helper from step 3.
5. **`src/config/projectConfig.ts`** + extend `src/tests/units/config/projectConfig.test.ts` — add `reviewFocus` parsing, precedence rule, derivation fallback, `getProjectAgentsOrFocusDefaults`. Use the factory from step 2.
6. **`src/frameworks/config/configLoader.ts`** + new test `src/tests/units/frameworks/config/configLoader.test.ts` (or extend existing if present) — extend `ProjectConfig` local interface, derive `skill` in `enrichRepository`.
7. **`src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts`** + extend its tests — accept `reviewFocus`, relax `reviewSkill` required check, verify GET response includes `reviewFocus`.
8. **Update callers**: `github.controller.ts` and `gitlab.controller.ts` to use `getProjectAgentsOrFocusDefaults`. Existing controller tests must keep passing; add focused tests if behavior changes around defaults.
9. **`.claude/skills/review-back/SKILL.md`** — author the skill from the review-front template, swap audits.
10. **`.claude/skills/review-fullstack/SKILL.md`** — author the dedup-union skill.
11. **`.claude/skills/review-doc/SKILL.md`** — author the documentation-focused skill with the 5 doc audits.
12. **Acceptance run** — Scenarios from step 1 must turn GREEN.
13. **`yarn verify`** — typecheck + lint + tests + coverage.
14. **Update tracker**: `docs/feature-tracker.md` status `planned → implementing` (done by implementer agent) and ultimately `implemented`.

---

## ACCEPTANCE_TEST

- **file**: `src/tests/acceptance/reviewFocus.acceptance.test.ts`
- **note**: SDD outer loop — written FIRST by implementer, RED during implementation, GREEN at the end.
- **scenarios covered (config-layer)**:
  - SC1: `reviewFocus: 'back'`, no `reviewSkill` → `loadProjectConfig` returns `reviewSkill: 'review-back'` and `getProjectAgentsOrFocusDefaults` returns `DEFAULT_BACK_AGENTS`
  - SC2: `reviewFocus: 'front'` → `'review-front'` + `DEFAULT_FRONT_AGENTS`
  - SC3: `reviewFocus: 'fullstack'` → `'review-fullstack'` + `DEFAULT_FULLSTACK_AGENTS` with no duplicates (Scenarios 3 + 11)
  - SC3b (doc): `reviewFocus: 'doc'` → `'review-doc'` + `DEFAULT_DOC_AGENTS`
  - SC4: no `reviewFocus`, `reviewSkill: 'review-front'` → `'review-front'` + falls back to explicit `agents` or `undefined`
  - SC5: both set → `reviewSkill` kept, `logWarn` called with the documented message (spy on `logBuffer`)
  - SC6: invalid focus `'mobile'` → `loadProjectConfig` throws `Invalid reviewFocus: ...`
  - SC7: focus `'back'` + explicit `agents: [{ name: 'security', ... }]` → `getProjectAgentsOrFocusDefaults` returns the explicit array, not `DEFAULT_BACK_AGENTS`
- Scenarios 8 (HTTP), 9 (configLoader enrichment), 10 (skill content), 11 (dedup) live in their own unit tests (HTTP route test, configLoader test, agentDefinition test).

---

## UNIT TEST PLAN

| Test file | What it asserts | Factories/stubs |
|-----------|----------------|-----------------|
| `src/tests/units/modules/review-execution/entities/progress/reviewFocus.type.test.ts` | `isReviewFocus`, `reviewSkillForFocus`, `defaultAgentsForFocus`, `dedupAgents` order-preserving | none |
| `src/tests/units/modules/review-execution/entities/progress/agentDefinition.type.test.ts` | DEFAULT_*_AGENTS shape, FULLSTACK = dedup(FRONT ∪ BACK), DOC content matches spec | none |
| `src/tests/units/config/projectConfig.test.ts` (extend) | focus parsing, derivation, precedence warning, invalid focus rejection, `getProjectAgentsOrFocusDefaults` | `ProjectConfigFactory` |
| `src/tests/units/frameworks/config/configLoader.test.ts` | `enrichRepository` derives skill from focus when reviewSkill absent | mocks for `fs` + `execSync` |
| `src/tests/units/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.test.ts` | accept `reviewFocus`, reject invalid focus, return `reviewFocus` in GET payload, derive skill on the fly for SKILL.md existence check | fastify inject |
| `src/tests/factories/projectConfig.factory.ts` | shared factory producing valid `ProjectConfig` with overrides | n/a (factory itself) |

---

## RISK CALLOUTS

1. **Backward compatibility — required-field relaxation in `loadProjectConfig`**
   - Current code throws when `reviewSkill` is missing (`requiredFields` list line 90). Relaxing this for the case `reviewFocus is present` is correct but easy to over-relax. Risk: a malformed config with neither field gets accepted.
   - Mitigation: the relaxation must be conditional — `reviewSkill` is required UNLESS a valid `reviewFocus` is present. Unit-test the "neither set" path explicitly to ensure it still throws.

2. **Agent dedup correctness for FULLSTACK (Scenario 11)**
   - A naive `Array.from(new Set(...))` does not work because `AgentDefinition` is an object reference, so duplicates by `name` would slip through.
   - Mitigation: `dedupAgents` keys on `agent.name` using a `Map` (order-preserving) — explicitly tested. Pseudocode (no implementation here): build a `Map<string, AgentDefinition>` walked in input order, return `[...map.values()]`.

3. **Validation error messages (Scenario 6)**
   - Spec says the message must be `Invalid reviewFocus: must be 'front', 'back', or 'fullstack'`. With `doc` added, the message must include all four values; the acceptance test must assert the full message exactly to prevent drift.
   - Mitigation: build the message dynamically from `REVIEW_FOCUS_VALUES` so the list stays in sync.

4. **Webhook controllers use `getProjectAgents` (not the new helper)**
   - Without updating `github.controller.ts:558` and `gitlab.controller.ts:617`, Scenarios 1/2/3/3b/7 are only honored in the config layer, not in real reviews. The default agents would still be `DEFAULT_AGENTS` (React-flavored) at runtime.
   - Mitigation: step 8 of `IMPLEMENTATION_ORDER` updates both controllers. Existing controller tests must continue to pass; if they assert `DEFAULT_AGENTS`, the new helper returns it when neither `agents` nor `reviewFocus` is set.

5. **`projectConfig.routes.ts` SKILL.md existence check**
   - Today the route checks that `config.reviewSkill` resolves to a real SKILL.md on disk. Once focus derivation is added, the route must derive the skill BEFORE checking — otherwise a focus-only config returns "reviewSkill missing".
   - Mitigation: derive locally in the route handler; do not invoke `loadProjectConfig` from there (the route reads JSON directly).

6. **Spec drift — the spec file on disk still mentions only front/back/fullstack**
   - The user's prompt says the spec was "just amended" to add `doc` and 12 scenarios, but the file at `docs/specs/48-review-focus-selection.md` currently shows 11 Gherkin scenarios with no `doc` references. The plan is built for 4 focuses based on the user's instruction. If the spec amendment lands later with different doc-agent names than `markdown-quality, link-validity, terminology, freshness, examples-validity`, the constants need adjustment.
   - Mitigation: callout in the implementer report; values are isolated to a single constant.

7. **Logging the precedence warning (Scenario 5)**
   - Calling `logWarn` from inside `loadProjectConfig` couples the config boundary to the framework logger. Acceptable because that same coupling already exists indirectly (`projectConfig.routes.ts` calls `logInfo`/`logError`), and the alternative (passing a logger to every `loadProjectConfig` call site) explodes the surface area for one log line. KISS wins; documented in the file's JSDoc.

---

## REFERENCE_FILES

- `docs/specs/48-review-focus-selection.md` — source of truth for scenarios, agent lists, derivation pseudocode.
- `src/config/projectConfig.ts` — boundary parser that needs the focus field and derivation/precedence logic.
- `src/modules/review-execution/entities/progress/agentDefinition.type.ts` — current `DEFAULT_AGENTS` shape, target for `DEFAULT_FRONT_AGENTS` / `BACK` / `FULLSTACK` / `DOC` constants.
- `src/frameworks/config/configLoader.ts` — second `ProjectConfig` interface (local) + `enrichRepository` skill derivation.
- `src/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.ts` — HTTP route exposing config to the dashboard; validates and returns the config as-is (Scenario 8 passthrough confirmed at line 76).
- `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts:558` and `gitlab.controller.ts:617` — call sites of `getProjectAgents` that need to switch to `getProjectAgentsOrFocusDefaults`.
- `.claude/skills/review-front/SKILL.md` — template for the three new skills.
- `src/frameworks/logging/logBuffer.ts` — `logWarn` sink for Scenario 5.
- `src/tests/units/config/projectConfig.test.ts` — existing config tests; pattern for `vi.mock('node:fs')` + JSON fixtures.
- `src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts` — acceptance test pattern reference (SDD outer loop in this codebase).
