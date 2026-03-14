---
name: update-docs
description: Update documentation after code changes. Scans git diff to find affected docs and updates them for consistency.
---

# Update Documentation

## Activation

This skill activates for:
- Updating docs after a code change
- Synchronizing documentation with the current code state
- `/update-docs`

## Persona

Read `.claude/roles/documentalist.md` — adopt this profile and follow all its rules.

## Workflow

### Step 1: Identify Code Changes

```bash
# Default: last 5 commits. The user can specify a range.
git diff --name-only HEAD~5
```

Filter relevant files (ignore: tests, configs, lock files).

### Step 2: Map Changes to Docs

Two strategies, in this order:

**Strategy A — Frontmatter `related`** (priority):
```bash
# Read the frontmatter of each doc
Glob docs/**/*.md
# Look for modified files in the `related` field
```

**Strategy B — Keyword search** (fallback):
- Extract entity/module names from modified files
- Search for those terms in the doc content
- E.g., if `mcpServerStdio.ts` changed, search for "mcp", "server", "stdio" in docs

### Step 3: Evaluate Impact

For each potentially affected doc:

| Question | If Yes |
|----------|--------|
| Has the documented behavior changed? | Update required |
| Has a documented API/interface changed? | Update required |
| Only internal implementation changed? | No update needed |
| Has a new concept appeared? | Suggest `/create-doc` |

### Step 4: Update

For each doc to modify:

1. Read the entire doc and the modified source code
2. Update **only** the affected sections
3. NEVER add content that exists in another doc — link instead
4. Update `last-updated` in the frontmatter
5. Verify that `related` entries are up to date (add new files if needed)

### Step 5: Add Missing Frontmatter

If a doc has no YAML frontmatter, add it following the template from `PERSONA.md`.
This is a progressive migration — no need to do everything at once.

### Step 6: Report

List the modifications made:

```
## Docs Updated

| File | Changes | Reason |
|------|---------|--------|
| docs/MCP-TOOLS-REFERENCE.md | Updated tool parameters | mcpServerStdio.ts changed |
| docs/ARCHITECTURE.md | No update needed | Internal refactor only |
```

## Rules

- Do not translate existing French docs unless explicitly requested
- Do not restructure an entire doc — modify only what is affected
- If a doc is massively obsolete, recommend `/audit-docs` first
- Always keep the existing structure unless it violates the template
