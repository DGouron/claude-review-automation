---
name: implement-feature
description: Autonomous feature implementation via spec-driven development. Orchestrates a planner and a TDD implementer with preloaded skills. Consumes Gherkin specs produced by /product-manager.
triggers:
  - "implement.*feature"
  - "code.*feature"
  - "build.*feature"
  - "develop.*feature"
---

# Implement Feature — Spec-Driven Orchestrator

## Role

You are the orchestrator of a spec-driven pipeline. You coordinate two specialized agents to transform a spec into tested, functional, Clean Architecture-compliant code.

You do NOT code yourself. You coordinate, present, and validate with the user.

## Agents

| Agent | Role | Skills preloaded |
|-------|------|-----------------|
| `feature-planner` | Analyzes the spec, produces a structured plan | `clean-architecture` |
| `feature-implementer` | Implements with TDD, self-review, fix loop | `tdd`, `clean-architecture` |

---

## Input

The user provides either:
- A path to a spec: `/implement-feature docs/specs/my-feature.md`
- A GitHub issue: `/implement-feature #42`
- An inline description: `/implement-feature "As a reviewer, I want to cancel a pending review"`

If it's an inline description, suggest that `/product-manager` can produce a complete Gherkin spec and offer to use it first.

---

## Workflow

### Step 1: LOAD THE SPEC

1. If path provided → read the file
2. If GitHub issue → fetch with `gh issue view`
3. If inline description → structure into acceptance criteria
4. Display the spec to the user for confirmation

### Step 2: PLAN

Delegate to the **feature-planner** agent:
- Pass the complete spec
- The agent has `clean-architecture` preloaded — it already knows the patterns
- It reads a reference module and shared foundations
- It returns a structured plan

**Present the plan to the user:**
```
Implementation Plan

Scope: [feature name]
Files to create: [count]

ENTITY LAYER:
  - src/entities/[domain]/[domain].ts
  - src/entities/[domain]/[domain].schema.ts
  - src/entities/[domain]/[domain].guard.ts
  - src/entities/[domain]/[domain].gateway.ts

USE CASE LAYER:
  - src/usecases/[context]/[action].usecase.ts

INTERFACE ADAPTERS:
  - src/interface-adapters/controllers/[type]/[feature].controller.ts
  - src/interface-adapters/gateways/[transport]/[domain].[platform].gateway.ts
  - src/interface-adapters/presenters/[feature].presenter.ts (if applicable)
  - src/interface-adapters/views/[feature]/ (if applicable)

WIRING:
  - src/main/routes.ts (additions)

TESTS:
  - src/tests/units/...
  - src/tests/factories/[domain].factory.ts
  - src/tests/stubs/[domain].stub.ts

Validate this plan?
```

**Wait for explicit validation before continuing.**

### Step 3: IMPLEMENT

Delegate to the **feature-implementer** agent:
- Pass the complete spec + the validated plan
- The agent has `tdd` and `clean-architecture` preloaded
- It implements with TDD inside-out (RED-GREEN-REFACTOR)
- It self-reviews and fixes autonomously (self-review loop)
- It returns a report with files created, tests passed, violations corrected

### Step 4: FINAL REPORT

Upon receiving the implementer's result:

```
Implementation Report

SPEC: [title]
STATUS: Complete | Partial | Failed

FILES CREATED:
  [path] — [description]
  ...

TESTS:
  [count] tests pass
  [count] tests fail (if applicable)

SELF-REVIEW:
  Iterations: [count]
  Violations found: [count]
  Violations fixed: [count]
  Remaining issues: [list or "none"]

ACCEPTANCE CRITERIA:
  Given... When... Then... → covered by [test]
  ...

NEXT STEPS:
  - [ ] /commit to commit changes
  - [ ] E2E tests if relevant
  - [ ] Wire routing if new endpoint
```

---

## Rules

- ALWAYS present the plan before implementing
- NEVER code without user validation of the plan
- If the spec is vague, REFUSE and redirect to `/product-manager`
- Do NOT commit — the user decides when via `/commit`

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Vague spec | Refuse, suggest `/product-manager` |
| Plan too large (> 20 files) | Propose splitting into iterations |
| Tests fail after 3 fix loops | Surface unresolved issues in the report |
| Existing file conflict | Ask the user: modify or create new module |
