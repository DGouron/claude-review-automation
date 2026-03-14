---
name: docs-index
description: Generate or update the centralized documentation index (docs/INDEX.md) with navigation map and cross-references.
---

# Documentation Index Generator

## Activation

This skill activates for:
- Generating or regenerating `docs/INDEX.md`
- Updating the index after adding/removing docs
- `/docs-index`

## Persona

Read `.claude/roles/documentalist.md` — adopt this profile and follow all its rules.

## Workflow

### Step 1: Scan Docs

```bash
Glob docs/**/*.md
```

For each file:
- Read the frontmatter (`title`, `scope`, `last-updated`)
- Read the first paragraph (summary)
- If no frontmatter: use the H1 as title, note "no frontmatter"

### Step 2: Generate the Index

**Always regenerate from scratch** — never patch an existing index.

Target structure for `docs/INDEX.md`:

```markdown
---
title: Documentation Index
scope: reference
last-updated: YYYY-MM-DD
---

# Documentation Index

## Quick Navigation

| Document | Scope | Summary | Updated |
|----------|-------|---------|---------|
| [QUICKSTART](./QUICKSTART.md) | guide | 5-minute setup | YYYY-MM-DD |
| [ARCHITECTURE](./ARCHITECTURE.md) | architecture | System overview | YYYY-MM-DD |
| ... | ... | ... | ... |

## By Topic

### Getting Started
1. [QUICKSTART](./QUICKSTART.md)
2. [CONFIG-REFERENCE](./CONFIG-REFERENCE.md)
3. [PROJECT_CONFIG](./PROJECT_CONFIG.md)

### Architecture
- [ARCHITECTURE](./ARCHITECTURE.md)
- [UBIQUITOUS-LANGUAGE](./UBIQUITOUS-LANGUAGE.md)

### MCP Protocol
- [MCP-TOOLS-REFERENCE](./MCP-TOOLS-REFERENCE.md)

### Review System
- [REVIEW-SKILLS-GUIDE](./REVIEW-SKILLS-GUIDE.md)

### Deployment
- [DEPLOYMENT](./DEPLOYMENT.md)

## New Contributor Path

Read in this order:
1. QUICKSTART → 2. ARCHITECTURE → 3. UBIQUITOUS-LANGUAGE → 4. CONFIG-REFERENCE
```

### Step 3: Verify Links

For each link in the index, verify the target file exists.
Report broken links as errors.

## Rules

- The index DOES NOT contain documentary content — only links and one-sentence summaries
- Summaries are extracted from docs, never made up
- Topics are grouped by thematic proximity, not alphabetical order
- The "New Contributor Path" is an ordered reading path, not a simple list
- Files without frontmatter: display a warning `no frontmatter` in the Updated column
