---
name: ddd
description: Strategic DDD guide for this project. Use to split the domain into bounded contexts, define ubiquitous language, create new business modules, or analyze context boundaries. Tactical patterns follow Clean Architecture (see architecture skill).
---

# Domain-Driven Design - Strategic Guide

## Persona

Read `.claude/roles/architect.md` — adopt this profile and follow all its rules.

## Activation

This skill activates for high-level domain decisions:
- Splitting into Bounded Contexts
- Defining the Ubiquitous Language
- Creating a new business module
- Analyzing relationships between contexts

## Important clarification

> **Clean Architecture definitions take precedence over DDD tactical definitions.**

We use DDD only at the **strategic** level (domain splitting, language). Tactical patterns (Entities, Use Cases, Gateways, Presenters) follow **Clean Architecture**.

| What we take from DDD | What we do NOT take |
|------------------------|---------------------|
| Bounded Contexts | Aggregates |
| Ubiquitous Language | Repositories (we have Gateways) |
| Context Mapping | Domain Events |
| Module splitting | Complex Value Objects |

---

## Bounded Context

> "A Bounded Context delimits the applicability of a particular model." — Eric Evans

A Bounded Context = a module in `modules/<context-name>/`

Each BC is an **autonomous package** with its own public API.

### Identifying a Bounded Context

**Signs that a new BC is needed:**
- The same term has different meanings depending on context
- A different team could manage this part
- The model is becoming too complex
- Business rules are diverging

**ReviewFlow example:**

| Bounded Context | Responsibility |
|-----------------|----------------|
| `review` | Code review orchestration and result handling |
| `tracking` | MR/PR assignment tracking and follow-up |
| `webhook` | Inbound webhook processing (GitLab/GitHub) |
| `mcp` | Model Context Protocol server and tools |
| `dashboard` | Review statistics and visualization |
| `security` | Secret detection and access control |

---

## Communication between Bounded Contexts

BCs communicate **via their public APIs**, like two independent packages.

```typescript
// modules/tracking/index.ts (public API)
export { TrackAssignmentUseCase } from "./application/usecases/trackAssignment.usecase"
export { createTrackedMr } from "./domain/factories/trackedMrFactory"
export type { TrackingGateway } from "./application/ports/gateways/trackingGateway"

// modules/review/ imports from the public API
import { TrackAssignmentUseCase } from "@/modules/tracking"
```

### Communication rules

| Allowed | Forbidden |
|---------|-----------|
| Import from another BC's `index.ts` | Directly import an internal file |
| Pass data (DTO, primitives) | Share mutable entities |
| Call an exposed Use Case | Access internal state |

### Concrete example

```typescript
// modules/review/application/usecases/triggerReview.usecase.ts
import { TrackAssignmentUseCase } from "@/modules/tracking"  // Public API

export const triggerReview = async (data) => {
  const trackAssignment = new TrackAssignmentUseCase(trackingGateway);
  // ...
}
```

```typescript
// FORBIDDEN - internal import
import { parseTrackingData } from "@/modules/tracking/domain/validators/trackingValidator"
```

---

## Ubiquitous Language

> "Use the model as the backbone of a language." — Eric Evans

Business vocabulary must be:
- **Consistent**: same term = same concept within a given context
- **Explicit**: no ambiguity
- **Shared**: understood by devs AND business stakeholders

### In code

```typescript
// Ubiquitous Language respected
class ReviewContext { ... }
class TrackedMr { ... }
function triggerReview() { ... }
function trackAssignment() { ... }

// Technical or ambiguous vocabulary
class Data { ... }           // "Data" is not a business term
class ReviewRequest { }      // "Request" vs "ReviewContext"?
function doReview() { }      // "do" vs "trigger"?
```

### Language documentation

Each BC maintains its glossary in `/docs/business/glossary/<context>.md`

```markdown
# Glossary - Review

| Term | Definition |
|------|------------|
| ReviewContext | The full context for a code review (diff, MR metadata, threads) |
| TrackedMr | A merge request being tracked for review assignments |
| ReviewAction | An action to perform on the platform (comment, resolve, reply) |
| DiffMetadata | Parsed metadata from a merge request diff |
```

---

## Workflow: Creating a new Bounded Context

### Step 1: Identify the domain

```
DDD - Identification

New domain identified: [name]

Questions to validate:
1. What business problem does it solve?
2. What are the specific terms?
3. What are the main entities?
4. Which existing BCs will use it?

Shall we explore these questions?
```

### Step 2: Define the language

```
DDD - Ubiquitous Language

Proposed glossary for [context]:

| Term | Definition |
|------|------------|
| ... | ... |

Are these terms aligned with the business vocabulary?
```

### Step 3: Define the public API

```
DDD - Public API

Planned exports for [context]:

Entities: [list]
Use Cases: [list]
Types: [list]

Which other BCs will consume this API?
```

### Step 4: Create the structure

```
DDD - Structure

I will create:
modules/[context]/
├── index.ts           # Public API
├── entities/
├── use-cases/
├── interface-adapters/
└── testing/

+ Glossary: docs/business/glossary/[context].md

Shall we create this structure?
```

After validation -> **Switch to the Architecture skill** for tactical details.

---

## Anti-patterns to avoid

- A single catch-all "domain" module
- Mixing vocabulary from multiple contexts
- Circular dependencies between contexts
- Importing internal files from another BC
- Naming modules by technical aspect ("services", "models")

---

## References

- *Domain-Driven Design* (Eric Evans, 2003) - Chapters 1-4 (strategic)
- For tactical patterns -> see **architecture** skill (Clean Architecture)
