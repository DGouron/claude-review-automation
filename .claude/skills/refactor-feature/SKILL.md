---
name: refactor-feature
description: Autonomous refactoring via spec-driven development. Orchestrates contract tests, batch planning, and incremental implementation with regression checks. Reuses feature-planner and feature-implementer agents.
triggers:
  - "refactor.*feature"
  - "refactoring.*feature"
  - "migrate.*feature"
  - "migration.*feature"
---

# Refactor Feature — Spec-Driven Refactoring Orchestrator

## Role

You are the orchestrator of a spec-driven refactoring pipeline. You coordinate two agents to modify existing code safely, with tests, incrementally.

You do NOT code yourself. You coordinate, present, and validate with the user.

## Difference with /implement-feature

| Aspect | /implement-feature | /refactor-feature |
|--------|-------------------|-------------------|
| **Goal** | Create code from scratch | Modify/delete existing code |
| **Key phase** | TDD inside-out (RED first) | Contract tests (GREEN first) |
| **Plan** | Files to create by layer | Files to modify/delete, by batch |
| **Progression** | Final report | Incremental tracking in `docs/refactor/` |
| **Main risk** | "it doesn't work" | Regression on existing consumers |

## Agents

| Agent | Role | Skills preloaded |
|-------|------|-----------------|
| `feature-planner` | Analyzes the spec, produces a refactoring plan by batch | `clean-architecture` |
| `feature-implementer` | Implements modifications with TDD, self-review | `tdd`, `clean-architecture` |

## Skills consumed

| Skill | What we use | Phase |
|-------|-------------|-------|
| `/refactoring` | Methodology (Mikado / Strangler Fig), tracking file structure, batch workflow | Phase 0 (method choice) + Phase 2 (tracking) |
| `/tdd` | RED-GREEN-REFACTOR cycle. In Phase 1, twist: GREEN first instead of RED first | Phase 1 (contract tests) + Phase 3 (implementation) |

---

## Input

The user provides either:
- A path to a spec: `/refactor-feature docs/specs/my-refactoring.md`
- A GitHub issue: `/refactor-feature #42`
- An inline description

If the spec is vague or missing, suggest `/product-manager` to structure it.

---

## Workflow

### Phase 0: LOAD SPEC + CHOOSE METHOD

1. Read the spec (file or GitHub issue)
2. Read the current code of main impacted files
3. **Choose the method** (`/refactoring` conventions):
   - **Strangler Fig** if old code must stay functional during migration
   - **Mikado** if dependencies are complex to untangle
   - **Import swap** if it's a simple import replacement (sub-case of Strangler)
   - Ask the user if not obvious
4. Display a summary:

```
Refactoring Context

SPEC: [title]
METHOD: [Strangler Fig / Mikado / Import swap]
SCOPE: [count] files to modify, [count] to delete

FIXES:
  - [fix 1] — [file]
  ...

MIGRATIONS:
  - [file] — [old → new]
  ...

RISKS:
  - [identified regression]
  ...

Continue?
```

### Phase 1: CONTRACT TESTS (twist `/tdd` — GREEN first)

**BEFORE any modification**, capture current behavior.

Classic TDD (`/tdd`) starts with RED. Here, we invert: we write tests that PASS immediately with existing code. These tests become the safety net for all subsequent phases.

Delegate to the **feature-implementer** with special instructions:

```
MODE: CONTRACT TESTS (not classic TDD)

Write tests that PASS with the CURRENT code.
These tests capture the existing contract and serve as safety net during refactoring.

RULES:
- Tests must be GREEN from the start (not RED)
- Test OBSERVABLE BEHAVIOR, not implementation details
- Cover nominal cases + edge cases from the spec
- Run tests and confirm they ALL pass
- Use existing factories and stubs
- Structure: src/tests/units/ mirroring source

FILES TO COVER:
[list of files to be modified]

BEHAVIORS TO CAPTURE:
[Gherkin scenarios — what MUST continue working after refactoring]
```

After receiving result:

```
Contract Tests

TESTS CREATED: [count]
ALL GREEN: yes/no

Captured behaviors:
  - [test] → [behavior]
  ...

These tests are our safety net.
Move to planning?
```

**If tests fail** → STOP. The current code has a pre-existing bug. Signal to user: continue (test documents the bug) or fix first.

### Phase 2: PLAN

Delegate to the **feature-planner** with refactoring context:

```
MODE: REFACTORING (not new feature)

Do NOT create new entities/usecases/gateways (unless the spec explicitly asks).
Plan the MODIFICATION of existing files, split into batches.

SPEC: [full spec content]

CONSTRAINTS:
- Each batch must be autonomous (all tests pass after the batch)
- Order: foundational fixes first, then consumer migrations one by one
- Max 5-8 files per batch
- If a modified file has an existing test, include it in the batch

OUTPUT FORMAT:

PLAN:
  type: refactoring
  spec_file: [path]

  BATCH_1: [descriptive name]
    MODIFY:
      - [path] — [what changes and why]
    DELETE:
      - [path] — [why]
    TESTS:
      - [path] — [test to create/modify]
    regression_command: yarn test:ci

  BATCH_2: [descriptive name]
    ...

  IMPLEMENTATION_ORDER:
    1. Batch 1 — [justification]
    2. Batch 2 — [justification]
```

**Present the plan to the user. Wait for explicit validation.**

Create the tracking file per `/refactoring` skill conventions:
- Location: `docs/refactor/00-[method]-[objective].md`
- Structure: progress table by batch with status
- Committed with the code as living documentation

### Phase 3: IMPLEMENT BY BATCH

For each batch in the plan:

#### 3a. Delegate to feature-implementer

Pass:
- The complete spec
- The current batch plan only
- The list of contract tests (safety net)
- Instructions: classic TDD (RED-GREEN-REFACTOR) for modifications

#### 3b. Regression check (orchestrator)

After each batch, run:

```bash
yarn test:ci
```

- **All tests pass** (including Phase 1 contract tests) → continue
- **Tests fail** → STOP, signal to user

#### 3c. Update tracking file

- Mark batch as completed
- Note modified files and date

#### 3d. Batch report

```
Batch [N]/[total]: [name] — Done

FILES MODIFIED: [count]
  - [path] — [change]

TESTS: [X] pass / [Y] total
REGRESSIONS: none

Next batch: [name]
Continue?
```

**Wait for validation between each batch** unless the user explicitly asks to chain them.

### Phase 4: FINAL REPORT

```
Refactoring Report

SPEC: [title]
STATUS: Complete | Partial | Failed

BATCHES: [N]/[total] completed

FILES MODIFIED: [total count]
  - [path] — [change]
  ...

FILES DELETED: [count]
  - [path]
  ...

TESTS:
  Contract tests (Phase 1): [count] — all GREEN
  New tests: [count]
  Modified tests: [count]
  Regressions: none

SELF-REVIEW:
  Iterations: [count]
  Violations found: [count]
  Violations fixed: [count]

ACCEPTANCE CRITERIA:
  Given... When... Then... → covered by [test]
  ...

NEXT STEPS:
  - [ ] /commit to commit changes
  - [ ] Update tracking file if multi-ticket
  - [ ] E2E if relevant
```

---

## Rules

- **ALWAYS** write contract tests BEFORE modifying anything
- **ALWAYS** present the plan before implementing
- **ALWAYS** run regression check (`yarn test:ci`) after each batch
- **ALWAYS** wait for validation between batches
- **NEVER** modify without user validation of the plan
- **NEVER** delete old code until the new code is tested
- Do NOT commit — the user decides when via `/commit`

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Vague spec | Refuse, suggest `/product-manager` |
| Contract tests fail on current code | STOP — pre-existing bug, ask user |
| Regression after a batch | STOP — diagnose, do not continue |
| Plan > 8 files per batch | Split into smaller batches |
| Tests fail after 3 fix loops | Surface unresolved issues in the report |
| File out of spec scope | Do NOT touch, signal to user |
