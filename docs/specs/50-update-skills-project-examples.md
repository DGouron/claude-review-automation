---
title: "SPEC-050: Update Skills with Project-Specific Examples"
issue: https://github.com/DGouron/review-flow/issues/50
labels: enhancement, P2-important, skills
milestone: null
status: DRAFT
---

# SPEC-050: Update Skills with Project-Specific Examples

## Problem Statement

Several skill files (`.claude/skills/`) use generic, textbook-style code examples (Employee/CFO, Cart, Student, UserProfile with React hooks, Rectangle/Square, AddressSearchService) that have no connection to the ReviewFlow domain. When Claude reads these skills as context, the generic examples create cognitive noise -- Claude must mentally translate from "Cart.add(product)" to "QueuePort.enqueue(job)" before applying the principle. Worse, some skills (SOLID) include React/Redux patterns (useState, useEffect, configureStore, createAsyncThunk) that are irrelevant to this Node.js/Fastify/Clean Architecture backend project, potentially steering Claude toward wrong technology choices.

Meanwhile, other skills in the same codebase already demonstrate the target state: `clean-architecture/examples.md` and `solid/solid.md` both use ReviewFlow entities (ReviewScore, ReviewContext, ThreadFetchGateway, TriggerReviewUseCase) exclusively. The inconsistency makes the skill library feel half-migrated.

## Challenge: Is This a Ticket or a Maintenance Task?

This is a **content quality improvement**, not a feature. No production code changes, no tests, no architecture. The deliverable is edited markdown files.

Arguments for treating it as a ticket:
- It affects Claude's review accuracy (the skills are Claude's "brain" during reviews)
- It has clear acceptance criteria (zero generic examples in targeted files)
- It has measurable scope (4 files, finite set of examples to replace)
- It benefits from review (bad examples could mislead worse than generic ones)

Arguments against:
- Pure documentation/configuration change -- no runtime impact
- Could be done as part of a broader "skill quality pass" without a ticket
- Risk of over-specifying what is essentially "rewrite examples in 4 files"

**Verdict**: Worth a ticket because the examples directly influence Claude's behavior. But scope must stay tight: only the files with generic examples, only example replacement, no structural changes to the skills.

## User Story

**As** a developer using ReviewFlow's Claude-powered review system,
**I want** all skill examples to use ReviewFlow's own domain concepts (ReviewContext, TrackedMr, ThreadFetchGateway, triggerReview, etc.),
**So that** Claude produces review guidance that is immediately relevant to this codebase without needing to mentally translate from generic examples.

### Persona

**Alex** -- Solo maintainer of ReviewFlow. Uses `/architecture`, `/tdd`, `/solid`, and `/anti-overengineering` skills daily when developing new features. Notices that Claude sometimes suggests React patterns (from the SOLID skill's generic examples) when the project is a Fastify backend. Wants Claude to "think in ReviewFlow" from the start.

## Scope

### Audit: Current State of Examples per Skill

| Skill file | Generic examples | Project examples | Status |
|------------|-----------------|------------------|--------|
| `clean-architecture/SKILL.md` | None | ReviewScore, ReviewContext, triggerReview, GitHubWebhook controller | Already done |
| `clean-architecture/examples.md` | None | Full ReviewFlow examples for every pattern | Already done |
| `clean-architecture/references.md` | None | ReviewFlow paths, triggerReview, routes.ts | Already done |
| `tdd/SKILL.md` | Cart (1 example, line 32) | ReviewScore (1 example, line 47-74) | **Needs update**: replace Cart with ReviewFlow equivalent |
| `ddd/SKILL.md` | None | ReviewFlow bounded contexts, ReviewContext, TrackedMr | Already done |
| `solid/SKILL.md` | Employee/CFO, UserProfile/React, Student gateway, Rectangle/Square, User hooks, Redux thunk | None | **Needs full rewrite of examples** |
| `solid/solid.md` | None | ReviewFlow examples for all 5 principles | Already done |
| `anti-overengineering/SKILL.md` | AddressSearchService, UserEmailValueObject | None | **Needs update**: replace with ReviewFlow equivalents |
| `product-manager/SKILL.md` | Cart+order Gherkin, logged-in user, notification system, delete button | None | **Needs update**: replace Gherkin examples with ReviewFlow scenarios |
| `refactoring/SKILL.md` | None (process-focused, no code examples) | None | No change needed |

### In Scope

| # | Deliverable | Description |
|---|-------------|-------------|
| 1 | **`solid/SKILL.md` example rewrite** | Replace all 5 SOLID principle examples with ReviewFlow domain equivalents. Remove React/Redux/hooks patterns. Use Fastify, gateways, use cases, presenters. |
| 2 | **`tdd/SKILL.md` Cart example replacement** | Replace the single Cart example (Detroit vs London comparison) with a ReviewFlow equivalent. Keep the existing ReviewScore example. |
| 3 | **`anti-overengineering/SKILL.md` example replacement** | Replace AddressSearchService and UserEmailValueObject examples with ReviewFlow equivalents. |
| 4 | **`product-manager/SKILL.md` Gherkin example replacement** | Replace Cart/order and logged-in user Gherkin examples with ReviewFlow scenarios (e.g., webhook triggers review, review deduplication). |

### Out of Scope

| Item | Reason |
|------|--------|
| Restructuring skill files | This ticket is example replacement only, not reorganization |
| Modifying `solid/solid.md` | Already uses project-specific examples |
| Modifying `clean-architecture/*` | Already uses project-specific examples |
| Modifying `ddd/SKILL.md` | Already uses project-specific examples |
| Adding new skills or sections | Scope creep -- separate ticket if needed |
| Changing skill behavior or workflow | Only examples change, not instructions |
| Modifying production code | This is a documentation-only change |
| Updating `review-front`, `review-followup`, or other review skills | Different concern (review execution, not teaching patterns) |
| Translating skills to French | Skills are in English per project convention |

## Business Rules

- Every code example in a skill file must use types, classes, functions, or patterns that exist in the ReviewFlow codebase (or could plausibly exist based on the current domain model)
- No React, Redux, Vue, Angular, or frontend framework references in any skill (ReviewFlow is a Node.js/Fastify backend)
- Example entities must come from the ReviewFlow ubiquitous language: `ReviewContext`, `ReviewScore`, `TrackedMr`, `ReviewRequest`, `ThreadFetchGateway`, `ReviewContextGateway`, `TriggerReviewUseCase`, `TrackAssignmentUseCase`, `JobStatus`, `DiffMetadata`, `ReviewAction`, `Platform`, `MergeRequestId`, etc.
- Generic pedagogical examples (Employee/CFO for SRP) may be kept **only if** they are immediately followed by a ReviewFlow equivalent that shows the same principle applied to this project. The generic example serves as the "textbook" anchor, the project example serves as the "how we do it here" anchor. However, the preferred approach is to replace entirely.

## Acceptance Criteria

### Scenario 1: SOLID skill uses only ReviewFlow examples

```gherkin
Given the file ".claude/skills/solid/SKILL.md"
When I search for code examples in the file
Then every TypeScript code block uses ReviewFlow types or entities
And no code block contains "Employee", "Student", "User", "UserProfile", "Rectangle", "Square", "Shopping", "Cart", or "Order"
And no code block contains "React", "useState", "useEffect", "Redux", "configureStore", or "createAsyncThunk"
And the file demonstrates all 5 SOLID principles (SRP, OCP, LSP, ISP, DIP)
```

### Scenario 2: TDD skill has no Cart example

```gherkin
Given the file ".claude/skills/tdd/SKILL.md"
When I search for "Cart" in the file
Then no occurrence is found
And the Detroit vs London comparison uses a ReviewFlow example
And the existing ReviewScore example is preserved
```

### Scenario 3: Anti-overengineering skill uses ReviewFlow examples

```gherkin
Given the file ".claude/skills/anti-overengineering/SKILL.md"
When I search for code examples in the file
Then the "Good Simplicity" example uses a ReviewFlow service or use case
And the "Over-Engineering" example uses a ReviewFlow anti-pattern
And the "Start Simple, Evolve" example uses a ReviewFlow type
And no code block contains "AddressSearch" or "UserEmail"
```

### Scenario 4: Product Manager skill uses ReviewFlow Gherkin examples

```gherkin
Given the file ".claude/skills/product-manager/SKILL.md"
When I read the "Gherkin - Syntax Reminder" section
Then the examples use ReviewFlow scenarios (webhooks, reviews, merge requests)
And no example contains "cart", "order", "logged-in user", or "profile"
```

### Scenario 5: No React/frontend patterns remain in any targeted skill

```gherkin
Given all files in ".claude/skills/solid/", ".claude/skills/tdd/", ".claude/skills/anti-overengineering/", and ".claude/skills/product-manager/"
When I search for "React", "Redux", "useState", "useEffect", "JSX", "Component", "configureStore", "createAsyncThunk", ".tsx"
Then no occurrences are found
```

### Scenario 6: Examples are realistic (not hallucinated)

```gherkin
Given any code example in the updated skill files
When I check the types and interfaces used in the example
Then each type or interface either exists in the ReviewFlow codebase under src/
Or is a plausible extension consistent with the current domain model
And no example imports from paths that do not exist
```

## Example Replacements (Guidance, Not Prescription)

These are suggestions for the implementer. The exact code is not predetermined (per TDD principles), but the domain concepts should be used.

### SOLID/SRP: Employee -> Review Pipeline

Replace Employee(calculatePay/reportHours/save) with a ReviewService god-class that handles review triggering, thread management, and reporting -- then show the proper separation into TriggerReviewUseCase, ThreadFetchGateway, and ReviewListPresenter.

### SOLID/OCP: OutputFormatter -> ThreadFetchGateway

Replace the format output switch with the existing ThreadFetchGateway pattern: GitLabThreadFetchGateway, GitHubThreadFetchGateway, and how adding Bitbucket would require no changes to the use case.

### SOLID/LSP: Rectangle/Square -> Gateway contract adherence

Replace with ReviewContextGateway implementations that must honor the null-return contract (not throw).

### SOLID/ISP: UserService -> Segregated gateway interfaces

Replace the fat IUserService with the existing ReviewFlow pattern: ThreadFetchGateway, ReviewContextGateway, TrackingGateway as focused interfaces vs. a monolithic ReviewPlatformGateway.

### SOLID/DIP: Redux thunk -> Composition root

Replace the Redux extraArgument pattern with the ReviewFlow composition root in routes.ts.

### TDD: Cart -> ReviewScore or QueuePort

Replace `Cart.add(product)` / `cart.items` / `cart.total` with ReviewFlow state-based testing (e.g., `ReviewScore.add(other)` testing the result state, vs. a London-school mock checking that `gateway.save` was called).

### Anti-overengineering: AddressSearch -> Review action dispatch

Replace the simple AddressSearchService with a simple review action dispatcher. Replace the over-engineered variant with an AbstractReviewStrategyFactory. Replace UserEmail with MergeRequestId branded type evolution.

### Product Manager Gherkin: Cart -> Webhook/Review

Replace the "cart with 2 items / Place order" example with "a configured repository / a merge request is opened / Then a review job is enqueued". Replace the "logged-out user / profile" example with "a webhook with invalid signature / Then the request is rejected with 401".

## Open Questions

None. The scope is clear, the files are identified, and the replacement direction is defined.

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | No dependency on other tickets. Pure content change. |
| Negotiable | OK | Exact example code is flexible. The requirement is "use ReviewFlow domain", not specific code. |
| Valuable | OK | Directly improves Claude's review accuracy by eliminating irrelevant technology references (React/Redux in a Fastify project). |
| Estimable | OK | 4 files to update. Each file has a known, finite number of examples to replace. Estimate: 0.5-1 day. |
| Small | OK | 4 files, no production code, no tests, no architecture changes. |
| Testable | OK | grep-verifiable: zero occurrences of banned terms, presence of ReviewFlow terms. |

## Definition of Done

- [ ] `solid/SKILL.md` uses only ReviewFlow examples for all 5 SOLID principles
- [ ] `solid/SKILL.md` contains zero React/Redux/frontend framework references
- [ ] `tdd/SKILL.md` Cart example replaced with ReviewFlow equivalent
- [ ] `anti-overengineering/SKILL.md` AddressSearch and UserEmail examples replaced with ReviewFlow equivalents
- [ ] `product-manager/SKILL.md` Gherkin examples use ReviewFlow scenarios
- [ ] No file in the targeted skills contains: Employee, Student, UserProfile (as React component), Rectangle, Square, Cart (as shopping cart), AddressSearch, configureStore, createAsyncThunk, useState, useEffect
- [ ] All replacement examples use types/entities from the ReviewFlow ubiquitous language
- [ ] Existing skill structure and instructions (non-example content) remain unchanged
- [ ] `yarn verify` passes (no production code changed, but validates the build is not broken)
