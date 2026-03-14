---
name: refactoring-mikado-strangler
description: Guide for large-scale refactorings with Mikado and Strangler Fig. Use for architecture migration, library replacement, module splitting, or pattern changes. Maintains a Mikado graph to track dependencies.
---

# Large Scale Refactoring - Mikado & Strangler Fig

## Persona

Read `.claude/roles/senior-dev.md` — adopt this profile and follow all its rules.

## Activation

This skill activates for refactorings that exceed a TDD cycle scope:
- Architecture migration
- Library or framework replacement
- Splitting a monolithic module
- Pattern change (e.g., callbacks -> promises -> async/await)
- Bounded context restructuring

## Choosing the method

| Criterion | Mikado | Strangler Fig |
|-----------|--------|---------------|
| Old code stays functional during | No | Yes |
| Need to deliver incrementally | Difficult | Ideal |
| Complex dependencies to untangle | Ideal | Possible |
| Complete replacement of a system | Possible | Ideal |

**Ask the user** which method to use if it's not obvious.

---

## Mikado Method

### Principle

1. **Try** the final goal directly
2. **Observe** what breaks
3. **Revert** immediately (no broken code left around)
4. **Note** the discovered prerequisites in the graph
5. **Recurse** on each prerequisite
6. **Implement** the leaves of the graph (those with no dependencies)

### Interactive workflow

#### Step 1: Initialization

```
MIKADO - Initialization

Main goal: [description]
Graph file: docs/mikado/[name]-graph.md

I will create the tracking file.
Shall we begin?
```

Create the graph file:
```markdown
# Mikado Graph: [Goal]

## Status: IN PROGRESS

## Main goal
- [ ] [Goal description]

## Discovered prerequisites
(Fills in as attempts are made)

## Attempt history
(Log of attempts and discoveries)
```

#### Step 2: Attempt

```
MIKADO - Attempt

I will try: [goal or prerequisite]
Expected: [what should break]

Shall we try?
```

After validation:
1. Attempt the modification
2. Run `yarn test:run`
3. Note EVERYTHING that breaks
4. **REVERT IMMEDIATELY** with `git checkout .`

#### Step 3: Analysis

```
MIKADO - Analysis

Attempt: [what we tried]
Result: [success / failure]

Errors encountered:
- [error 1] -> Prerequisite: [required action]
- [error 2] -> Prerequisite: [required action]

I'm updating the graph.
Which prerequisite do we tackle first?
```

#### Step 4: Implementation (leaves)

When a prerequisite has no dependencies:
```
MIKADO - Implementation

Prerequisite to implement: [description]
This is a leaf of the graph (no dependencies).

-> Activating the TDD skill for proper implementation.
```

**Switch to the TDD skill** to implement the prerequisite with RED-GREEN-REFACTOR.

#### Step 5: Validation

After each implementation:
```
MIKADO - Validation

Prerequisite completed: [description]
Updating the graph: done

Next action:
- [ ] [Another leaf to process]
- [ ] [Retry a parent goal]

What do we continue with?
```

---

## Strangler Fig Method

### Principle

1. **Create** the new system alongside the old one
2. **Migrate** calls progressively to the new system
3. **Cohabitation**: both systems run in parallel
4. **Remove** the old one when nothing uses it anymore

### Interactive workflow

#### Step 1: Planning

```
STRANGLER - Planning

Old system: [description]
New system: [description]

Entry points to migrate:
1. [point 1]
2. [point 2]
...

I'm creating the tracking file: docs/strangler/[name]-migration.md
Which entry point do we start with?
```

Create the tracking file:
```markdown
# Strangler Migration: [Name]

## Status: IN PROGRESS

## Old system
- Location: [path]
- Entry points: [list]

## New system
- Location: [path]
- Migrated entry points: 0/[total]

## Migration plan

| Entry point | Status | Date |
|-------------|--------|------|
| [point 1] | Pending | - |
| [point 2] | Pending | - |

## Old system removal checklist
- [ ] All entry points migrated
- [ ] No references to old code
- [ ] Old system tests removed/migrated
- [ ] Old code deleted
```

#### Step 2: Creating the new system

```
STRANGLER - New system

I will create the new implementation for: [entry point]
Location: [path]

-> Activating the TDD skill for proper implementation.
```

**Switch to the TDD skill** to create the new implementation.

#### Step 3: Migrating an entry point

```
STRANGLER - Migration

Entry point: [description]
Old: [code/path]
New: [code/path]

Migration plan:
1. [step 1]
2. [step 2]

Shall we migrate?
```

#### Step 4: Cohabitation verification

```
STRANGLER - Verification

Migration completed: [entry point]

Checklist:
- [ ] Tests pass
- [ ] Old code still functional (if other dependencies exist)
- [ ] New code used by [consumers]

Updating the tracking file.
Next entry point?
```

#### Step 5: Removal

When all entry points are migrated:
```
STRANGLER - Removal

All entry points have been migrated!

Old code to remove:
- [file 1]
- [file 2]

Tests to remove/migrate:
- [test 1]

Shall we clean up?
```

---

## Integration with the TDD skill

Every time we need to **implement** code (Mikado prerequisite or new Strangler system), we switch to the TDD skill:

```
-> This prerequisite requires code.
-> Activating the TDD skill to implement with RED-GREEN-REFACTOR.
-> Returning to the Refactoring skill once complete.
```

---

## Tracking files

Graphs and plans are stored in:
```
docs/
├── mikado/
│   └── [name]-graph.md
└── strangler/
    └── [name]-migration.md
```

These files serve as living documentation and allow resuming an interrupted refactoring.

---

## Anti-patterns to block

- Leaving broken un-reverted code (Mikado)
- Removing the old system before the new one is complete (Strangler)
- Implementing without tests (always go through the TDD skill)
- Multiple refactorings in parallel
- Skipping a step without user validation
