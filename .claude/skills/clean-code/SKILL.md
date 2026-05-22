---
name: clean-code
description: Clean Code (Robert C. Martin) guide to produce and challenge code that is readable, durable, simple, and consistent. Covers naming, functions, comments, smells, and refactor heuristics. Complements `/solid` (SOLID principles) and `/anti-overengineering` (YAGNI/KISS). Activate during the REFACTOR phase of the TDD cycle and during implementation self-review.
triggers:
  - "clean code"
  - "readability"
  - "refactor"
  - "code smell"
  - "naming"
  - "intention.?revealing"
  - "boy.?scout"
  - "function too long"
  - "too many arguments"
  - "challenge.*code"
---

# Clean Code — Refactor & Challenge

Source: *Clean Code* (Robert C. Martin, 2008) + *Clean Coder* (2011).

## When to activate

- REFACTOR phase of the TDD cycle (after GREEN, before the next RED)
- Implementation self-review (end of `feature-implementer` workflow)
- Code review of a PR/MR
- Explicit request for simplification, readability, "challenge this code"

## Scope vs neighboring skills

This skill NEVER duplicates the content of `/solid` or `/anti-overengineering`. It complements them.

| Concern | Skill to use |
|---|---|
| **Responsibility architecture** (SRP, OCP, LSP, ISP, DIP) | `/solid` |
| **Should I add a pattern?** (YAGNI, KISS, pragmatic architecture) | `/anti-overengineering` |
| **Readability, naming, functions, smells, refactor heuristics** | **`/clean-code`** (here) |

Once the pattern is decided (`/anti-overengineering`) and responsibilities are placed (`/solid`), `/clean-code` makes intent self-evident.

---

## The 5 pillars

### 1. SOLID Design — delegated to `/solid`

Activate `/solid` for SRP, OCP, LSP, ISP, DIP. Mentioned here only as a structuring reminder: clean code rests on well-placed responsibilities.

### 2. Readability first

> "The ratio of time spent reading to writing code is well over 10:1. We are constantly reading old code as part of the effort to write new code." — Robert C. Martin

#### Naming (chap. 2)

- **Intention-revealing**: the name should be enough to understand. If you write a comment to explain, the name is broken.
  - OK `daysSinceLastReview` — KO `d`, `days`, `elapsed`
  - OK `filterMergedPullRequests(prs)` — KO `processPrs(prs, true)`
- **No disinformation**: `accountList` must be a `List`, otherwise `accounts`.
- **Perceptible distinction**: `getActiveAccount()` vs `getActiveAccounts()` is a time bomb. Prefer `getCurrentAccount()` vs `getAllActiveAccounts()`.
- **Searchable**: short names only for short scopes (loop index = `index` in a 3-line loop — not `i` even though short).
- **No encoding**: no Hungarian notation (`strName`, `bIsActive`), no `I` prefix for interfaces.
- **Class names = nouns** (`ReviewContext`, `ThreadFetchGateway`), **method names = verbs** (`save`, `fetchByCriteria`).
- **Full words only** (project rule, `coding-standards.md`): no `ex`, `i`, `ctx`, `gw`. Always `existing`, `index`, `context`, `gateway`.

#### Functions (chap. 3)

- **Small**: < 20 lines. Ideally < 10. If you have to scroll to read the function, it's too long.
- **Do one thing**: if you can extract a sub-function with a name that is not a simple rephrasing of the parent function, the original was doing too much.
- **One level of abstraction per function**: don't mix business orchestration and string manipulation in the same function.
- **Few arguments**: 0-2 ideal, 3 = challenge it, 4+ = mandatory refactor (parameter object).
- **No flag arguments**: `render(isPublic: true)` → `renderPublic()` + `renderPrivate()`.
- **No hidden side effects**: a function named `checkPassword(user, password)` that ALSO resets the session is a trap.
- **Command-Query Separation**: either the function modifies state, or it returns info. Not both.
- **Prefer exceptions to error codes**: for invariants, throw a typed `BusinessRuleViolation`. No `return null` or `return { error: ... }` smuggled as control flow. Use discriminated unions (`{ status: 'success' | 'failed' }`) for expected outcomes (cf. `coding-standards.md` § Error Typing).

#### Comments (chap. 4)

> "The proper use of comments is to compensate for our failure to express ourself in code." — Martin

- **Project rule** (`CLAUDE.md`): zero comments except if vital. Self-documenting code first.
- **Acceptable**:
  - Documented workaround (ticket link, upstream bug link)
  - Non-obvious invariant that cannot be encoded in the type system
  - Warning about a non-local consequence (e.g. "Modifying here impacts X")
  - JSDoc on public APIs (not considered a comment)
- **Forbidden**:
  - Modification journal (`// 2026-03-12: added X`)
  - Closing comments (`} // end if`)
  - Commented-out dead code (`git log` is the history)
  - Positional comments (`// ============ SECTION ============`)
  - Code rephrased in prose (`// fetch the user` above `const user = ...`)

#### Formatting (chap. 5)

- **Variables close to their usage**: no grouped declarations at the top of a function.
- **Newspaper metaphor**: top of the file = overview (main exports), bottom = details (private helpers).
- **Top-down readability**: calling functions above called functions.

### 3. Sustainable quality

> "Leave the campground cleaner than you found it." — Boy Scout Rule

- **Boy Scout Rule**: each touched file should be slightly cleaner. Renaming a confusing variable adjacent to the diff scope = OK. Out-of-scope structural refactor = NO (cf. `scope-discipline.md`).
- **TDD as quality guard rail**: refactor ONLY with green tests. If no tests cover the touched area, write a *characterization test* before.
- **Code smells (Martin, chap. 17)** — refactor checklist:

| Smell | Description | Refactor |
|---|---|---|
| **G5 Duplication** | Same logic 3+ times | Extract a named function |
| **G14 Feature Envy** | Method manipulates more attributes of another class than its own | Move the method |
| **G15 Selector Arguments** | Booleans/enums that choose a behavior | Split into multiple functions |
| **G20 Function Names Should Say What They Do** | Must read the body to know | Rename |
| **G23 Prefer Polymorphism to If/Else Chains** | Switch on a type | Polymorphism or mapping object |
| **G28 Encapsulate Conditionals** | `if (a && !b && c.isExpired())` | Extract as `if (shouldRemove(x))` |
| **G30 One Thing** | "This function does X **and** Y" | Split |
| **G34 One Level of Abstraction** | Mix orchestration + detail | Extract the detail |
| **G35 Magic Numbers** | `if (count > 7)` | Named constant `MAX_RETRIES` |

### 4. Simplicity

- **Delegated to `/anti-overengineering`**: YAGNI, KISS, do not anticipate hypothetical business.
- **Clean Code side-effects**:
  - No "just in case" parameters. A function has only the parameters it needs **now**.
  - No dead code: if a function is no longer called, delete it. `git log` is the history.
  - No speculative abstraction (`AbstractBaseFactoryProvider`) for a single use case.

### 5. Consistency

- **One convention per context**: if the module uses `entitiesById: Record<id, Entity>`, the neighbor should too. No mixing `Map<id, Entity>` in the same Bounded Context.
- **Project patterns to respect** (cf. `coding-standards.md`):
  - Gateway = interface (port) in `entities/` + impl (adapter) in `interface-adapters/gateways/`
  - Use case = class implementing `UseCase<Input, Output>` interface
  - Controller = transforms inbound events into use case calls, no business logic
  - Presenter = pure function `(domainData) => viewModel`
  - View = Humble Object (zero logic, render only)
- **Factory usage**: factories in `src/tests/factories/` are mandatory for test data. Never hardcoded.
- **Naming patterns (project)**:
  - Suffixes: `.usecase.ts`, `.gateway.ts`, `.presenter.ts`, `.factory.ts`, `.stub.ts`, `.guard.ts`, `.schema.ts`, `.valueObject.ts`
  - Gateway impls: `<domain>.<platform>.<transport?>.gateway.ts` (e.g. `threadFetch.gitlab.gateway.ts`)
  - Stubs: `<gateway>.stub.ts` (test doubles), located in `src/tests/stubs/`
  - Imports: `@/` alias + `.js` extension MANDATORY (no relative paths, no barrel `index.ts`)

---

## Application workflow — REFACTOR phase (TDD cycle)

After each GREEN of the Detroit cycle, BEFORE moving to the next RED:

1. **Re-read the diff** (not the full file, just what was just written).
2. **Pass 1 — Naming**: does each new identifier reveal intent?
3. **Pass 2 — Functions**: size, arguments, abstraction level.
4. **Pass 3 — Smells G5/G14/G15/G23**: duplication, feature envy, flag args, switch.
5. **Pass 4 — Consistency**: style aligned with the neighboring module?
6. **Re-run tests**: a refactor without green tests is a future bug, not a refactor.

---

## Self-review checklist

- [ ] **Naming**: zero abbreviation, intention-revealing, distinguishable, no `I` prefix
- [ ] **Functions**: < 20 lines, 0-2 args, do one thing, no boolean flag
- [ ] **Comments**: none, except workaround/non-obvious invariant
- [ ] **Format**: declarations near usage, top-down readability
- [ ] **Smells**: no duplication 3+, no switch on type, no selector arg
- [ ] **Consistency**: project patterns (gateway/usecase/presenter/view) respected
- [ ] **Tests**: still green after each refactor pass
- [ ] **Boy scout**: the diff leaves the file at least as clean
- [ ] **Imports**: `@/` alias + `.js` extension, no relative paths, no barrels

---

## How to challenge a PR or a proposal

Questions to ask the author (or yourself):

| Question | If the answer is… | Action |
|---|---|---|
| "What does this function do?" | contains "and" | Split |
| "Why this name?" | "because it contains X" | Rename to `X` |
| "Why this boolean parameter?" | "it changes what it does" | Split into 2 functions |
| "What is this comment for?" | "explain what the code does" | Delete + rename |
| "Could you delete it?" | "yes but maybe later…" | Delete now |
| "Why 3 abstraction levels here?" | "in case we extend" | YAGNI → activate `/anti-overengineering` |

---

## ReviewFlow-specific heuristics

Recurring smells observed in this codebase, to challenge during refactor:

- **God Use Case**: a use case > 80 lines or with 5+ dependencies → split into sub-use-cases or extract collaborators (cf. `clean-architecture`).
- **Floating Promise**: any async call must be `await`-ed, `return`-ed, or explicitly `void`. Pino logger ignores rejections silently.
- **Business logic in Controllers**: the controller transforms only. Any branching on domain state → move to a use case.
- **Type assertions**: zero `as`, `as unknown as T`, `!` non-null assertion. If needed, the upstream typing is broken — fix it with a Zod guard or type narrowing.
- **Cross-module direct import**: no direct import from another module's `interface-adapters/` or `usecases/`. Cross only through `entities/` contracts.
- **Undefined leakage**: `undefined` is banned in domain types. Use `null` for intentional absence. Catch at module boundaries with Zod.
- **Magic strings for IDs**: prefer branded types (`type SessionId = string & { __brand: 'SessionId' }`) over raw `string`.
- **Comment explaining a TODO without ticket**: every TODO must point to a spec slug, GitHub issue, or be deleted.

<!-- ENRICH: add recurring smells observed during reviews. Format: "Short name — symptom — refactor". -->

---

## References

- *Clean Code* — Robert C. Martin (2008), chap. 2 (Naming), 3 (Functions), 4 (Comments), 5 (Formatting), 17 (Smells).
- *Clean Coder* — Robert C. Martin (2011), chap. on TDD discipline and the courage to refactor.
- *Refactoring* (2nd ed.) — Martin Fowler (2018), catalog of named refactorings.
- Neighboring skills: `/solid`, `/anti-overengineering`, `/refactoring`, `/tdd`, `/clean-architecture`.
- Project rules: `.claude/rules/coding-standards.md`, `.claude/rules/scope-discipline.md`, `.claude/rules/anti-hallucination.md`.
