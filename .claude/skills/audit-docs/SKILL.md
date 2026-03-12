---
name: audit-docs
description: Audit documentation for duplication, staleness, language issues, and verbosity. Read-only — produces an actionable report.
---

# Audit Documentation

## Activation

This skill activates for:
- Checking documentation quality
- Detecting duplicates, stale docs, inconsistencies
- `/audit-docs`

## Persona

Read `.claude/roles/documentalist.md` — adopt this profile and follow all its rules.

## Mode

**READ-ONLY.** This skill analyzes and reports. It does not modify any file.

## Workflow — 5 Audit Passes

### Pass 1: Inventory

```bash
Glob docs/**/*.md
Glob templates/**/*.md
```

For each file, extract:
- Title (H1 or frontmatter `title`)
- Frontmatter present? (yes/no)
- Headings H2/H3
- Detected language
- Approximate word count

Produce an inventory table.

### Pass 2: Duplicate Detection

Compare H2/H3 headings across all file pairs:

1. **Title overlap**: if two docs share > 40% of their H2/H3, flag them
2. **Similar content**: for flagged pairs, compare the first 100 words of each section
3. **Duplicate markers**: look for concept definitions (e.g., `THREAD_RESOLVE`, phase names) that appear in multiple files

**Known issues to detect**:
- `DEPLOYMENT.md` vs `deployment/README.md` — nearly identical
- `PROJECT_CONFIG.md` vs `CONFIG-REFERENCE.md` — project config overlap
- Markers documented in 5+ files
- Troubleshooting duplicated in 3+ files

### Pass 3: Staleness Detection

1. Check `last-updated` in the frontmatter (if present)
2. For each `related` file in the frontmatter:
   ```bash
   git log -1 --format=%ci <related-file>
   ```
   If the source is more recent than `last-updated`, flag as potentially stale
3. Verify referenced paths in the doc — whether they still exist:
   ```bash
   # For each src/... path mentioned in the doc
   ls <path>
   ```
4. Look for references to concepts/APIs that no longer exist

### Pass 4: Language Consistency

Detect French in each file. Indicators:
- Frequent words: "les", "des", "une", "est", "dans", "pour", "avec", "cette", "qui", "sur"
- Entire sentences in French
- Titles in French

**Rule**: all documentation must be in English.

### Pass 5: Verbosity Analysis

| Threshold | Action |
|-----------|--------|
| Section > 500 words | Suggest condensation or split |
| Document > 800 words | Suggest split into multiple docs |
| Filler phrases detected | List with location |

Filler phrases to detect:
- "it should be noted that", "it is important to mention"
- "as you can see", "as mentioned above/below"
- "in order to" (use "to"), "due to the fact that" (use "because")
- "at the end of the day", "going forward"

## Report Format

```markdown
# Documentation Audit Report

## Summary

| Metric | Count |
|--------|-------|
| Total docs scanned | X |
| Duplication issues | X |
| Stale docs | X |
| Language issues | X |
| Verbosity issues | X |
| Missing frontmatter | X |

## Duplication Issues

### DUPL-001: [Doc A] <-> [Doc B]
- **Topic**: [overlapping topic]
- **Severity**: high | medium | low
- **Overlapping sections**: [list]
- **Action**: Consolidate into [file], link from [other file]

## Stale Documentation

### STALE-001: [Doc]
- **Last updated**: [date or "no frontmatter"]
- **Source changed**: [file] on [date]
- **Action**: Update [specific sections]

## Language Issues

### LANG-001: [Doc]
- **Language**: French (should be English)
- **Action**: Translate to English

## Verbosity Issues

### VERB-001: [Doc] — [Section]
- **Word count**: X (target: < 300)
- **Fillers found**: [list]
- **Action**: Condense

## Recommended Actions (Priority Order)

1. [Highest impact action]
2. [...]
```

## After the Audit

Recommend the appropriate skills:
- Duplicates: `/update-docs` to consolidate
- New doc needed: `/create-doc`
- Missing/stale index: `/docs-index`
