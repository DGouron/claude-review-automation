---
name: skill-creator
description: Guide for creating or updating a ReviewFlow skill. Use when the user wants to create a new skill, update an existing skill, or asks how to add a slash command that extends Claude's capabilities in this project.
user-invocable: true
---

# Skill Creator

Guide for creating effective skills in the ReviewFlow project.

## About Skills

Skills are modular, self-contained packages that extend Claude's capabilities with specialized workflows, domain knowledge, and tool integrations. They transform Claude from a general-purpose agent into a project-specialized one.

### What Skills Provide

1. **Specialized workflows** — Multi-step procedures (e.g. `/ship`, `/tdd`, `/implement-feature`)
2. **Domain expertise** — ReviewFlow-specific knowledge, architecture patterns, business rules
3. **Bundled resources** — References and assets loaded on demand

## Core Principles

### Concise is Key

The context window is a shared resource. Only add context Claude does not already have. Challenge each paragraph: "Does Claude really need this?" If not, remove it.

### Set Appropriate Degrees of Freedom

- **High freedom** (text instructions): multiple approaches valid, context-dependent
- **Medium freedom** (pseudocode/templates): preferred pattern exists, variation acceptable
- **Low freedom** (shell scripts): operations are fragile, consistency critical

### Anatomy of a ReviewFlow Skill

```
.claude/skills/<skill-name>/
├── SKILL.md            (required)
│   ├── YAML frontmatter (required: name + description)
│   └── Markdown instructions
└── references/         (optional — bundled docs loaded by reference)
```

## Skill Creation Process

1. Understand the skill with 2-3 concrete usage examples
2. Draft the frontmatter (`name`, `description`, `user-invocable`)
3. Write the body — imperative instructions, low prose
4. Test it: invoke `/skill-name` and verify Claude follows the workflow
5. Register in `CLAUDE.md` skills table

## Frontmatter Reference

```yaml
---
name: skill-name            # kebab-case, matches folder name
description: >              # PRIMARY TRIGGER — LLM reads only this initially.
  One or two sentences.     # Include natural-language trigger phrases.
  "Use when the user says X, Y, Z."
user-invocable: true        # true = can be invoked with /skill-name
allowed-tools: Bash, Read   # optional — restrict available tools
---
```

**Official fields**: `name`, `description`, `user-invocable`, `allowed-tools`, `disable-model-invocation`, `context`.

> `triggers: []` is NOT an official field — it is silently ignored. The `description` is the only trigger mechanism.

## Writing Guidelines

- Write in **English** — no exceptions (code, body, comments)
- Use **imperative form**: "Run", "Read", "Stop", never "You should run"
- `description` is the primary trigger — include natural trigger phrases in it
- Keep the body under **400 lines**
- Include only what Claude does not already know
- Prefer tables and bullet lists over prose paragraphs
- Match ReviewFlow conventions (see `CLAUDE.md` and `.claude/rules/coding-standards.md`)

## What NOT to Include

- Generic programming knowledge Claude already has
- README-style context that belongs in docs
- Comments explaining what the skill is (the frontmatter does that)
- Skills are for AI agents, not humans — do not write tutorials

## ReviewFlow-Specific Conventions

| Convention | Detail |
|------------|--------|
| Package manager | `yarn` — never `pnpm` or `npm` |
| Main branch | `master` — never `main` |
| Quality gate | `yarn verify` (typecheck + lint + test:ci) |
| Commit format | Conventional Commits via commitlint |
| Language | English everywhere (code, tests, commits, logs) |
| Imports | `@/` alias + `.js` extension mandatory |
| No barrel exports | Direct imports only, no `index.ts` re-exports |

## Skill Registration

After creating a skill, add it to the skills table in `CLAUDE.md`:

```markdown
| `/skill-name` | When to use this skill |
```

## Quick Template

```markdown
---
name: my-skill
description: Brief description. Use when the user says "X", "Y", or wants to Z.
user-invocable: true
---

# My Skill — Short Title

## Activation

This skill activates with `/my-skill`.

## Workflow

### Step 1: <Action>

<Instructions>

### Step 2: <Action>

<Instructions>

## Rules

- NEVER do X
- ALWAYS do Y
```
