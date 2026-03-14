# Agent Patterns — Reusable Templates

All agents live in `.claude/agents/<name>.md` with YAML frontmatter.

## 1. Explorer Agent (Read-only)

Usage: Targeted search in the codebase, answer a technical question.

```yaml
---
name: <domain>-explorer
description: Use this agent to explore [domain] in the codebase.
tools: Read, Glob, Grep, LS
model: sonnet
maxTurns: 15
permissionMode: default
---
```

**When**: "How does X work?", "Where is Y defined?"
**Size**: Small (5-10 files read)

## 2. Swarm Agent (Parallel audit)

Usage: Multi-faceted investigation with specialized parallel agents.

```yaml
---
name: <category>-auditor
description: Use this agent to audit [category] in [scope].
tools: Read, Glob, Grep, LS
model: sonnet
maxTurns: 20
permissionMode: default
skills:
  - <relevant-skill>
---
```

**When**: Audits, diagnostics, broad investigations
**Size**: Medium (10-20 files read)
**Parallelism**: Launch N agents with `run_in_background: true`

### Finding Template

```
FINDING: [CAT-NNN] Title
SEVERITY: Critical | High | Medium | Low
SCOPE: [file paths or modules]
EFFORT: XS | S | M | L | XL
CONFIDENCE: Confirmed | Probable | Suspected
WHAT: [description]
EVIDENCE: [code snippet, metric, or file reference]
IMPACT: [business terms]
ROOT_CAUSE: [why this exists]
RECOMMENDATION: [specific fix]
```

## 3. Implementation Agent (TDD + self-review)

Usage: Code implementation with TDD and autonomous self-review loop.

```yaml
---
name: <feature>-implementer
description: Use this agent to implement [feature] via TDD inside-out.
tools: Read, Write, Edit, Bash, Glob, Grep, LS
model: opus
maxTurns: 100
permissionMode: bypassPermissions
skills:
  - tdd
  - clean-architecture
---
```

**When**: Features, bug fixes, refactoring with tests
**Size**: Large (10-20 files created)
**Self-review**: Autonomous loop integrated

## 4. Planner Agent (Read-only)

Usage: Analyze a spec and produce a structured implementation plan.

```yaml
---
name: <domain>-planner
description: Use this agent to plan implementation by analyzing specs and mapping to Clean Architecture layers.
tools: Read, Glob, Grep, LS
model: sonnet
maxTurns: 15
permissionMode: default
skills:
  - clean-architecture
---
```

**When**: Before implementation, to structure work
**Size**: Medium (10 files read, 0 files created)

## 5. Review Agent (Code review)

Usage: Review a specific aspect of code.

```yaml
---
name: <aspect>-reviewer
description: Use this agent to review [aspect] of code changes.
tools: Read, Glob, Grep, LS
model: sonnet
maxTurns: 20
permissionMode: default
skills:
  - <relevant-standard-skill>
---
```

**When**: Pre-PR, post-refactoring, conformance check
**Size**: Variable

## 6. Migrator Agent (Strangler Fig)

Usage: Progressive migration from one pattern to another.

```yaml
---
name: <pattern>-migrator
description: Use this agent to migrate from [old pattern] to [new pattern].
tools: Read, Write, Edit, Bash, Glob, Grep, LS
model: opus
maxTurns: 50
permissionMode: bypassPermissions
skills:
  - clean-architecture
---
```

**When**: Large-scale refactoring, pattern adoption
**Size**: Large (10-30 files modified)

## Composition

| Need | Composition |
|------|-------------|
| Full audit | Swarm (N auditors parallel) → Synthesis (1 agent) |
| New module | Planner → Implementer (with preloaded skills) |
| Migration | Explorer → Migrator → Reviewer |
| Full feature | Planner → Implementer (TDD + self-review) |

## Preloading Guide

| Agent type | Skills to preload | Why |
|------------|-------------------|-----|
| Implementer | `tdd`, `clean-architecture` | Needs patterns + TDD workflow |
| Planner | `clean-architecture` | Must map spec to layers |
| Auditor | The audited category's skill | Targeted domain knowledge |
| Reviewer | The standard being reviewed against | Judgment criteria |
| Migrator | `clean-architecture` | Must understand source and target patterns |
| Explorer | None (or 1 max) | Stay light, max context for results |
