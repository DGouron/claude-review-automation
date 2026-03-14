---
name: agent-creator
description: "Guide for creating optimized Claude Code agents. Use to design a new specialized agent, a swarm sub-agent, or a multi-agent workflow. Follows the Skill → Agent (preloaded skills) → Skill orchestration pattern."
---

# Agent Creator

## Activation

This skill activates for:
- Creating a new specialized agent (sub-agent, swarm agent)
- Designing a multi-agent workflow
- Optimizing an existing agent
- Creating a feature-specific or domain-specific agent

## Core Principle

> A feature-specific agent with a targeted persona always outperforms a generic agent.

```
❌ "You are a senior backend engineer"
✅ "You are a TDD implementation agent for the ReviewFlow Clean Architecture Fastify/TypeScript project"
```

## Orchestration Architecture

```
Skill (user entry point, triggers)
  → Agent .claude/agents/*.md (targeted persona, preloaded skills)
    → Skill (knowledge injected into agent context)
```

| Level | Role | Location |
|-------|------|----------|
| Skill | Entry point, orchestration | `.claude/skills/<name>/SKILL.md` |
| Agent | Autonomous execution, dedicated context | `.claude/agents/<name>.md` |
| Skill (preloaded) | Knowledge injected at startup | `skills:` in agent YAML |

### Agent vs Inline Prompt

| Criteria | Agent `.claude/agents/` | Inline prompt |
|----------|------------------------|---------------|
| Skills preloaded | `skills: [tdd, architecture]` | Must read manually |
| Reusable | From any skill | Locked in one skill |
| Configuration | model, maxTurns, permissions, tools, hooks | Limited to Agent tool |
| Discoverability | Visible in `.claude/agents/` | Hidden |

**Rule: ALWAYS create `.claude/agents/<name>.md`. Never inline prompts in references/.**

## Creation Workflow

### Phase 1: INTAKE — Define the need

Before creating the agent, clarify:

1. **What problem does it solve?** — One sentence, not a paragraph
2. **What is its scope?** — Files, modules, or full codebase
3. **How often will it be used?** — One-off or recurring
4. **Does a skill/agent already cover this?** — Check `.claude/skills/` AND `.claude/agents/`
5. **What is its expected output?** — Files created, report, refactoring
6. **Which existing skills should it know?** — For preloading

### Phase 2: DESIGN — Create the agent file

Create `.claude/agents/<agent-name>.md` with this structure:

```yaml
---
name: <agent-name>
description: "Use this agent to [specific action]. [Additional context]."
tools: Read, Glob, Grep, LS                    # Explicit allowlist
model: sonnet|opus                              # sonnet for read-only, opus for code
maxTurns: 15                                    # Adjust to scope
permissionMode: default|bypassPermissions       # bypassPermissions if writing
skills:                                         # Preloaded into context
  - <skill-name-1>
  - <skill-name-2>
---

# <Agent Name>

## Persona (2-3 lines)

You are a [specific role] for [precise context].

## Coding Standards

Read `.claude/rules/coding-standards.md` BEFORE working.

## Mission (numbered, max 7 steps)

1. [Step]
2. [Step]
3. ...

## Constraints (max 10 rules)

- [Rule]
- [Rule]

## Output format

[Exact template of deliverable]
```

### YAML Frontmatter — Supported fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier, lowercase + hyphens |
| `description` | Yes | When to delegate to this agent — Claude matches on this field |
| `tools` | Recommended | Tool allowlist. Omitted = all tools |
| `model` | No | `sonnet` (fast), `opus` (quality), `haiku` (light). Default: inherit |
| `maxTurns` | No | Agentic turn limit. Default: no limit |
| `permissionMode` | No | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan` |
| `skills` | No | List of preloaded skills. Content injected at startup |
| `hooks` | No | Lifecycle hooks: PreToolUse, PostToolUse, Stop |

### Phase 3: SELF-REVIEW — Decide if the agent self-reviews

If the agent **creates or modifies code**, add a self-review phase:

```markdown
## Phase N: SELF-REVIEW (autonomous loop)

After completing the mission:

### Step 1: Run tests
yarn test:ci

### Step 2: Reread each created file
Check: naming, imports, TypeScript, architecture, tests

### Step 3: Fix loop (max 3 iterations)
For each violation: fix → rerun tests → confirm

### Step 4: Escalate
If blocked after 3 iterations → list issues in report
```

### Phase 4: VALIDATION — Checklist

Before publishing the agent, run `references/checklist.md`.

### Phase 5: ITERATION

After first use:
- Did the output match expectations?
- Was the context sufficient?
- Were preloaded skills the right ones?
- Did the agent drift? Why?
- Did self-review catch real problems?
- Adjust the agent file and re-test

## Sizing Rules

### Agent file

| Element | Max size | Why |
|---------|----------|-----|
| Persona | 3 lines | Beyond this, dilutes focus |
| Project context | 10 lines | Agent has preloaded skills + must read code |
| Mission | 5-7 steps | Beyond this, split into sub-agents |
| Constraints | 10 rules | Beyond this, create a dedicated skill |
| Skills preloaded | 3 max | Beyond this, context too heavy at startup |

### Context window

- Preloaded skills consume context (~3-5k tokens per skill)
- An agent reading 20+ files risks degradation
- Prefer targeted agents (5-10 files) over omniscient ones
- If > 10 files to read → split into parallel sub-agents

### When to split into sub-agents

| Signal | Action |
|--------|--------|
| Mission > 7 steps | Split into 2-3 sequential agents |
| Files to read > 10 | Split by category (parallel swarm) |
| Output > 500 lines | One agent synthesizes, another details |
| Scope cross-module | One agent per module |
| Skills preloaded > 3 | Split — too much knowledge dilutes focus |

## ReviewFlow Project Specifics

Agents created for this project must respect:

- **Clean Architecture**: dependency rule, 5 layers (entities, usecases, interface-adapters, frameworks, shared)
- **TDD Detroit School**: failing test first, mocks only for I/O via stubs
- **Conventions**: full words, camelCase .ts, aliases @/ + .js extension
- **Language**: code/tests in English, user-facing text in French
- **Patterns**: Gateway contracts in entities/, impl in interface-adapters/gateways/
- **Testing**: Factories (`static create()`), stub gateways, `yarn test:ci`
- **Coding standards**: point to `.claude/rules/coding-standards.md`

## Agent Patterns

See `references/agent-patterns.md` for reusable templates.

## Anti-patterns

See `references/anti-patterns.md` for common mistakes.
