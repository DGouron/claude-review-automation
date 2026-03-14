---
name: tdd
description: Interactive guide for Detroit School TDD. Use whenever the user asks to write or modify code - new feature, bug fix, debug, refactoring, modification. Activates a RED-GREEN-REFACTOR workflow with validation at each step.
---

# TDD Interactive Guide - Detroit School

## Persona

Read `.claude/roles/senior-dev.md` — adopt this profile and follow all its rules.

## Detroit School Philosophy

**State-based testing**: We test the observable result, not the internal interactions.

| Principle | Explanation |
|-----------|-------------|
| **Test state** | Verify the final result, not how we got there |
| **Inside-Out** | Start from the domain, work outward |
| **Minimal mocks** | Only for external I/O (gateways, API, DB) |
| **Robust tests** | Resistant to internal refactoring |

**When to mock:**
- Gateways (API, database, file system)
- External services (email, notifications)
- Internal business logic
- Collaborations between domain objects

```typescript
// Detroit: we test the final state
it("should add item to cart", () => {
  const cart = new Cart()
  cart.add(product)

  expect(cart.items).toContain(product)
  expect(cart.total).toBe(10)
})

// London: we test interactions (avoid this)
it("should call inventory.reserve", () => {
  const inventory = mock<Inventory>()
  cart.add(product)
  expect(inventory.reserve).toHaveBeenCalled()
})
```

**ReviewFlow example** (project-relevant test):

```typescript
// src/tests/units/entities/reviewScore.test.ts
describe("ReviewScore", () => {
  // Detroit: we test the STATE of the result
  it("should create a valid review score", () => {
    const score = createReviewScore(8);

    expect(score.value).toBe(8);
    expect(score.label).toBe("good");
  });

  // Validation before use
  it("should reject a score below 0", () => {
    const result = createReviewScore(-1);

    expect(result).toBeNull(); // Final state
  });

  // Boundary validation
  it("should reject a score above 10", () => {
    const result = createReviewScore(11);

    expect(result).toBeNull(); // Final state
  });
});
```

---

## TDD Manifesto

TDD follows these fundamental principles:

| Principle | Meaning |
|-----------|---------|
| **Baby steps** | Small steps for fast and regular feedback |
| **Continuous refactoring** | We improve now, not "later" |
| **Evolutionary design** | We develop what is necessary and sufficient |
| **Executable documentation** | Tests ARE the living documentation |
| **Minimalist code** | Simple and functional > over-dimensioned |

## Minimal Test Principle

> "The simplest thing that could possibly work." — Kent Beck

> "As the tests get more specific, the code gets more generic." — Robert C. Martin

**Rules:**
1. **One behavior per test**
2. **From naive to complete**: simple case first, edge cases after
3. **No anticipation**: one cycle at a time

**Typical progression:**
```
Cycle 1: "should create a completion" (nominal case)
Cycle 2: "should have a rating" (property)
Cycle 3: "should reject rating below 1" (validation)
Cycle 4: "should reject rating above 5" (validation)
```

**Anti-pattern:**
```typescript
// Test too broad
it("should validate a completion with rating 1-5 and ISO datetime", () => {
  // tests rating min, max, date format, nominal case...
})

// One behavior per test
it("should create a completion", () => { ... })
it("should reject rating below 1", () => { ... })
```

---

## Activation

This skill activates whenever the user asks to touch code:
- New features: "Implement...", "Add...", "Create..."
- Bug fixes: "Fix...", "Correct...", "Repair..."
- Debug: "Why does...", "It doesn't work..."
- Modifications: "Modify...", "Change...", "Update..."
- Refactoring: "Refactor...", "Improve...", "Clean up..."

---

## Mandatory Workflow

At each cycle, follow these 3 phases with **stop and user validation** between each.

### Phase RED

**Goal**: Write ONE failing test

**Actions**:
1. Announce: "RED: I will test [specific behavior]"
2. Identify the smallest possible test (baby step)
3. Propose the test WITHOUT writing it
4. Wait for validation
5. Write the test after validation
6. Run `yarn test:run` to confirm failure
7. Ask: "The test fails as expected. Move to GREEN?"

**Template:**
```
RED - Test Proposal

Behavior to test: [description]
File: [path]

Proposed test:
[test code - state-based, verifies the result]

This test verifies that [explanation of expected state].
Validate this test?
```

---

### Phase GREEN

**Goal**: Make the test pass with MINIMAL code

**Actions**:
1. Announce: "GREEN: I will make the test pass with minimum code"
2. Propose the minimal implementation WITHOUT writing it
3. Wait for validation
4. Write the code after validation
5. Run `yarn test:run` to confirm success
6. Ask: "The test passes. Refactor or next cycle?"

**Rules**:
- MINIMAL code that makes the test pass
- No premature optimization
- Hardcoded values accepted if sufficient

**Template:**
```
GREEN - Implementation Proposal

To make the test pass, I propose:
[minimal code]

This is intentionally minimal because [explanation].
Validate this implementation?
```

---

### Phase REFACTOR

**Goal**: Simplify without changing behavior

**Principles**:
- **KISS**: The simplest solution
- **YAGNI**: Remove what is not necessary
- **DRY**: Factor out only if there is real duplication

**Actions**:
1. Announce: "REFACTOR: Analyzing simplification opportunities"
2. Look for: dead code, premature abstractions, accidental complexity
3. Propose refactorings one by one
4. Wait for validation for each
5. Run `yarn test:run` after each refactoring
6. Ask: "Refactor complete. Next RED cycle?"

**Priority order**: Remove > Simplify > Reorganize

**Template:**
```
REFACTOR - Analysis

Code smells detected:
- [smell 1]: [explanation]

Proposed refactoring:
[description of change]

Apply this refactoring?
```

---

## Special Case: Debug / Bug Fix

1. **Understand**: Expected behavior vs actual
2. **RED**: Test that reproduces the bug (must fail)
3. **GREEN**: Fix so the test passes
4. **REFACTOR**: Clean up if necessary

The test becomes a protective regression test.

---

## Mandatory Checkpoints

Never move to the next phase without:
- Explicit user validation
- Tests executed and result confirmed

## Specs and tickets: no predetermined code

TDD relies on **progressive design discovery**. Specs/tickets must NOT contain:

| Forbidden | Why |
|-----------|-----|
| Test names | The test emerges from the need, not the other way around |
| File names | Architecture reveals itself through iteration |
| Method signatures | Design comes from the simplest code |
| Installation commands | Dependencies come when necessary |

**Principle**: We don't predict the final code. We proceed by baby steps, from the most naive implementation to the final case.

```
Ticket with "Tests to implement: should_create_user_with_email"
Ticket with "Files: src/services/user.service.ts"
Ticket with "Method: createUser(email: string): User"

Ticket with Gherkin criteria describing the expected BEHAVIOR
```

The RED-GREEN-REFACTOR cycle makes the design emerge. The ticket describes the WHAT (behavior), not the HOW (implementation).

---

## Anti-patterns to Block

- Production code without a red test
- Multiple tests at once
- Implementing more than necessary in GREEN
- Refactoring without green tests
- Skipping a phase without validation
- Mocking internal business logic
- Predetermining code in specs/tickets

---

## End of Cycle

```
Cycle Complete

Tests added: [number]
Behaviors covered: [list]
Next suggested behavior: [suggestion]

Continue?
```
