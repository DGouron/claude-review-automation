---
name: create-doc
description: Create a new documentation file following project standards. Detects overlap with existing docs before creating.
---

# Create Documentation

## Activation

This skill activates for:
- Creating a new documentation file
- Documenting a feature, a concept, or a component
- `/create-doc`

## Persona

Read `.claude/roles/documentalist.md` — adopt this profile and follow all its rules.

## Workflow

### Step 1: Clarify the Subject

If the subject is vague, ask:
- Which component/feature to document?
- Target audience: contributor, user, LLM?
- Scope: `reference`, `guide`, `architecture`, or `spec`?

### Step 2: Detect Duplicates

**MANDATORY** before any creation.

```bash
# List all existing docs
Glob docs/**/*.md

# Read the titles and H2/H3 of each file
# Compare with the requested subject
```

**If an existing doc already covers the subject**:
- STOP — do not create a new file
- Suggest updating the existing doc via `/update-docs`
- Explain which file covers what

**If partial overlap**:
- Identify precisely which sections already exist
- The new doc must cover ONLY the missing content
- Add links to existing sections

### Step 3: Create the File

Apply the template from `PERSONA.md`:

```yaml
---
title: <Title>
scope: reference | guide | architecture | spec
related:
  - src/path/to/source.ts
  - docs/RELATED-DOC.md
last-updated: YYYY-MM-DD
---
```

**Writing rules**:
- English only
- 1-2 summary sentences after the title
- One section = one concept
- Tables rather than lists for structured data
- Code blocks rather than prose for technical details
- Max 800 words — split if longer

### Step 4: Naming

| Location | Convention |
|----------|-----------|
| `docs/` top-level | `SCREAMING-KEBAB.md` (e.g., `MCP-TOOLS-REFERENCE.md`) |
| Subdirectory | `kebab-case.md` (e.g., `docs/mcp/architecture.md`) |

### Step 5: Update the Index

Run `/docs-index` to regenerate `docs/INDEX.md` with the new file.

## Anti-patterns

| Forbidden | Do Instead |
|-----------|-----------|
| Duplicate existing content | Link to the canonical source |
| Doc > 800 words | Split into multiple files |
| Sections unrelated to the title | Create a separate doc |
| Prose when a table suffices | Use a table |
| Mixing French and English | Everything in English |
