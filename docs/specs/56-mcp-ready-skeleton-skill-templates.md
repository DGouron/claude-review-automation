---
title: "SPEC-056: MCP-Ready Skeleton Skill Templates"
issue: https://github.com/DGouron/review-flow/issues/56
labels: enhancement, cli, P1-critical, skills
milestone: Project Bootstrapping
blocked_by: https://github.com/DGouron/review-flow/issues/30
status: DRAFT
---

# SPEC-056: MCP-Ready Skeleton Skill Templates

## Problem Statement

The existing skill templates in `templates/en/` and `templates/fr/` use the old stdout-marker protocol (`[PHASE:...]`, `[PROGRESS:...]`, `[POST_COMMENT:...]`) for progress tracking and actions. However, the production skills (`review-front`, `review-followup`) have migrated to MCP tool calls (`set_phase()`, `start_agent()`, `complete_agent()`, `add_action()`), which provide real-time dashboard tracking, structured thread management, and inline comment posting.

A developer copying the current templates gets a skill that:
- Cannot report progress to the dashboard in real time
- Cannot post inline comments on diff lines
- Cannot manage threads (resolve, reply) programmatically
- Uses deprecated stdout markers that are maintained only for backward compatibility

Meanwhile, the MCP reference doc at `templates/skills/review-with-mcp.md` explains the MCP tools but is not a copy-and-customize template. The gap between "here's how MCP works" and "here's a working skill I can customize" is the friction this issue addresses.

## User Story

**As** a developer setting up ReviewFlow for my project,
**I want** skeleton skill templates that use MCP tool calls with clearly marked sections where I add my own review rules,
**So that** I get full dashboard tracking, inline comments, and thread management out of the box without understanding MCP internals.

### Persona

**Sam** -- Backend developer, 3 years experience. Installed ReviewFlow last week. Wants to create a review skill for their Node.js API project. Does not know what MCP is. Expects to copy a template, fill in their rules, and have it work with the dashboard.

## Preconditions

- Issue #30 (`reviewflow init-project`) defines where these templates are consumed. This spec defines the template **content**; #30 defines the CLI command that copies and parameterizes them.
- The MCP server and tools (`get_workflow`, `start_agent`, `complete_agent`, `set_phase`, `get_threads`, `add_action`) exist and are operational.

## Scope

### In Scope

| # | Deliverable | Description |
|---|-------------|-------------|
| 1 | **`review-basic` MCP template (EN)** | Single-agent review skill with MCP tool calls, categorized empty rule sections, and `<!-- ADD YOUR RULES HERE -->` markers |
| 2 | **`review-basic` MCP template (FR)** | French variant of the above |
| 3 | **`review-with-agents` MCP template (EN)** | Multi-agent orchestrated review skill with sequential agent execution via MCP tool calls |
| 4 | **`review-with-agents` MCP template (FR)** | French variant of the above |
| 5 | **README per template** | Updated README explaining installation, customization, and MCP prerequisites |
| 6 | **Deprecation of old templates** | Add a deprecation notice to the existing non-MCP templates pointing to the new ones |

### Out of Scope

| Item | Reason |
|------|--------|
| `followup-basic` MCP template | Follow-up templates are a separate concern; the existing followup templates already use context-file actions which are compatible with the current system. Can be done in a follow-up issue. |
| Framework-specific rules (React, Vue, etc.) | Rule sections are intentionally empty for the user to fill in |
| Auto-translation between EN and FR | Templates are manually maintained in both languages |
| Removal of old templates | Backward compatibility; deprecation notice is sufficient |
| CLI command to copy templates | That is issue #30 (`init-project`) |
| MCP server changes | Templates consume existing MCP tools, no server changes needed |
| `review-bootstrap` skill changes | Bootstrap skill uses context-file protocol; separate concern |

## Functional Requirements

### FR-1: Template Location

New MCP-ready templates are stored alongside existing templates:

```
templates/
├── en/
│   ├── review-basic/           # Existing (deprecated, marker-based)
│   │   ├── SKILL.md
│   │   └── README.md
│   ├── review-basic-mcp/       # NEW (MCP tool calls)
│   │   ├── SKILL.md
│   │   └── README.md
│   ├── review-with-agents/     # Existing (deprecated, marker-based)
│   │   ├── SKILL.md
│   │   └── README.md
│   └── review-with-agents-mcp/ # NEW (MCP tool calls)
│       ├── SKILL.md
│       └── README.md
└── fr/
    ├── review-basic-mcp/       # NEW
    │   ├── SKILL.md
    │   └── README.md
    └── review-with-agents-mcp/ # NEW
        ├── SKILL.md
        └── README.md
```

### FR-2: Template Structure -- Two Zones

Each MCP template SKILL.md has two clearly separated zones:

**Zone 1 -- User Rules (editable)**

Categorized empty sections where the user adds their review rules. Each section has:
- A section header describing the category
- A `<!-- ADD YOUR RULES HERE -->` marker
- 2-3 example rules as comments to guide the user
- A clear visual separator

Categories for the review templates:
1. **Architecture & Design** -- dependency direction, layer separation, patterns
2. **Code Quality** -- naming conventions, code smells, formatting
3. **Testing** -- coverage expectations, test patterns, naming
4. **Security** -- input validation, secrets, injection
5. **Custom Rules** -- project-specific rules that don't fit other categories

**Zone 2 -- MCP Workflow (do not modify)**

Pre-wired MCP workflow with a clear `<!-- ⚠️ DO NOT MODIFY BELOW THIS LINE -- MCP WORKFLOW -->` separator. This zone contains:
- MCP tool reference table
- Phase progression using `set_phase()`
- Agent progress using `start_agent()` / `complete_agent()`
- Inline comment posting using `add_action(POST_INLINE_COMMENT)`
- Report publishing using `add_action(POST_COMMENT)`
- Stats emission using `[REVIEW_STATS:...]` marker
- Error handling pattern (agent failure does not stop the review)

### FR-3: `review-basic-mcp` Template Content

A single-pass review skill that:
1. Initializes context (`set_phase("initializing")`)
2. Runs a single analysis pass (`set_phase("agents-running")`, `start_agent("analysis")`, `complete_agent("analysis", "success")`)
3. Synthesizes the report (`set_phase("synthesizing")`)
4. Posts inline comments for blocking/important issues (`add_action(POST_INLINE_COMMENT)`)
5. Posts the global report (`add_action(POST_COMMENT)`)
6. Completes (`set_phase("completed")`)

The template includes the `jobId` retrieval pattern: "The `jobId` is available via the `MCP_JOB_ID` environment variable."

### FR-4: `review-with-agents-mcp` Template Content

A multi-agent orchestrated review skill that:
1. Initializes and retrieves workflow (`set_phase("initializing")`, `get_workflow(jobId)`)
2. Executes agents sequentially (`set_phase("agents-running")`):
   - For each agent: `start_agent()` -> analysis -> `complete_agent()`
   - Default placeholder agents: architecture, testing, code-quality
   - Each agent has its own `<!-- ADD YOUR RULES HERE -->` section
3. Synthesizes all agent results (`set_phase("synthesizing")`)
4. Posts inline comments and global report via MCP actions
5. Completes (`set_phase("completed")`)

Includes the sequential execution diagram and anti-memory-leak explanation.

### FR-5: Report Format

Both templates include a report structure template (in Zone 2) consistent with existing production skills:
- Executive summary table (agent scores for with-agents, single score for basic)
- Blocking issues section
- Warnings section
- Suggestions section
- Pre-merge checklist
- `[REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X]` marker

### FR-6: README Content

Each template's README explains:
1. What the template does (basic vs. multi-agent)
2. MCP prerequisite: MCP server must be configured (link to setup docs)
3. Installation steps (copy, rename, customize)
4. How to customize the rule sections
5. Example `config.json` for the project
6. Link to the MCP tools reference

### FR-7: Deprecation Notice on Old Templates

Add a notice at the top of each existing (non-MCP) template's SKILL.md (after the frontmatter):

```markdown
> **DEPRECATED**: This template uses stdout markers. Use the MCP-ready variant
> in `review-basic-mcp/` (or `review-with-agents-mcp/`) for full dashboard
> integration. See [migration guide](../../docs/REVIEW-SKILLS-GUIDE.md).
```

### FR-8: Language Variants

- EN templates use English for all section headers, instructions, and example comments
- FR templates use French for section headers, instructions, and example comments
- MCP tool names, `jobId`, and `<!-- ADD YOUR RULES HERE -->` markers stay in English in both variants (they are technical identifiers)
- The `[REVIEW_STATS:...]` marker format is identical in both languages

## Acceptance Criteria (Gherkin)

### Scenario 1: Basic MCP template contains all required MCP tool calls

```gherkin
Feature: MCP-ready skeleton skill templates

  Scenario: Basic MCP template contains all required MCP tool calls
    Given the file "templates/en/review-basic-mcp/SKILL.md"
    When I read its content
    Then it contains "set_phase(jobId, \"initializing\")"
    And it contains "set_phase(jobId, \"agents-running\")"
    And it contains "set_phase(jobId, \"synthesizing\")"
    And it contains "set_phase(jobId, \"publishing\")"
    And it contains "set_phase(jobId, \"completed\")"
    And it contains "start_agent(jobId,"
    And it contains "complete_agent(jobId,"
    And it contains "add_action("
    And it contains "[REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X]"
    And it does NOT contain "[PHASE:" as a standalone stdout marker
    And it does NOT contain "[PROGRESS:" as a standalone stdout marker
    And it does NOT contain "[POST_COMMENT:" as a standalone stdout marker
```

### Scenario 2: Rule sections have markers for customization

```gherkin
  Scenario: Template has categorized rule sections with markers
    Given the file "templates/en/review-basic-mcp/SKILL.md"
    When I read its content
    Then it contains a section "Architecture & Design"
    And it contains a section "Code Quality"
    And it contains a section "Testing"
    And it contains a section "Security"
    And it contains a section "Custom Rules"
    And each section contains "<!-- ADD YOUR RULES HERE -->"
    And each section contains at least 2 example rules as comments
```

### Scenario 3: With-agents template has sequential agent execution

```gherkin
  Scenario: Multi-agent template contains sequential agent blocks
    Given the file "templates/en/review-with-agents-mcp/SKILL.md"
    When I read its content
    Then it contains "start_agent(jobId, \"architecture\")"
    And it contains "complete_agent(jobId, \"architecture\","
    And it contains "start_agent(jobId, \"testing\")"
    And it contains "complete_agent(jobId, \"testing\","
    And it contains "start_agent(jobId, \"code-quality\")"
    And it contains "complete_agent(jobId, \"code-quality\","
    And each agent block has its own "<!-- ADD YOUR RULES HERE -->" marker
    And the "Sequential Architecture" diagram is present
```

### Scenario 4: No direct platform CLI commands

```gherkin
  Scenario: Templates do not contain direct platform CLI calls
    Given any file in "templates/en/review-basic-mcp/" or "templates/en/review-with-agents-mcp/"
    When I search for "glab " or "gh api" or "gh pr" in the file
    Then no occurrences are found
    And all platform interactions use MCP "add_action" calls
```

### Scenario 5: French variant matches English structure

```gherkin
  Scenario: French template has same structure as English
    Given the file "templates/fr/review-basic-mcp/SKILL.md"
    When I compare its structure with "templates/en/review-basic-mcp/SKILL.md"
    Then both have the same number of "<!-- ADD YOUR RULES HERE -->" markers
    And both have the same MCP tool calls in Zone 2
    And the French template uses French section headers
    And the French template uses French example rules
    And the "<!-- ADD YOUR RULES HERE -->" marker text is in English in both
```

### Scenario 6: MCP workflow zone is clearly separated

```gherkin
  Scenario: Zone 2 is clearly marked as do-not-modify
    Given any MCP template SKILL.md
    When I read its content
    Then it contains "<!-- ⚠️ DO NOT MODIFY BELOW THIS LINE -- MCP WORKFLOW -->"
    And all MCP tool calls appear AFTER this separator
    And all "<!-- ADD YOUR RULES HERE -->" markers appear BEFORE this separator
```

### Scenario 7: Old templates have deprecation notice

```gherkin
  Scenario: Existing templates are marked as deprecated
    Given the file "templates/en/review-basic/SKILL.md"
    When I read its content
    Then it contains "DEPRECATED"
    And it mentions the MCP-ready variant "review-basic-mcp"
```

### Scenario 8: README explains MCP prerequisites

```gherkin
  Scenario: README includes MCP setup information
    Given the file "templates/en/review-basic-mcp/README.md"
    When I read its content
    Then it explains that the MCP server must be configured
    And it provides installation steps
    And it lists the customization sections
    And it includes an example config.json
```

### Scenario 9: Template includes inline comment instructions

```gherkin
  Scenario: Template explains how to post inline comments
    Given the file "templates/en/review-basic-mcp/SKILL.md"
    When I read the MCP workflow zone
    Then it contains instructions for "POST_INLINE_COMMENT"
    And it explains that inline comments can only be posted on lines in the diff
    And it shows the add_action call format for inline comments
```

### Scenario 10: Error handling pattern is documented

```gherkin
  Scenario: Template includes error handling for agent failures
    Given the file "templates/en/review-with-agents-mcp/SKILL.md"
    When I read the MCP workflow zone
    Then it contains a pattern for "complete_agent(jobId, agentName, \"failed\","
    And it explains that a failed agent should not stop the review
    And it shows continuing to the next agent after failure
```

## Template Content Sketch

### review-basic-mcp/SKILL.md (EN) -- High-Level Structure

```
---
name: review-basic
description: Basic MCP-ready code review skill. Customize for your project.
---

# Basic Code Review

## Persona
<!-- ADD YOUR RULES HERE -->
[Default persona]

## Review Rules

### Architecture & Design
<!-- ADD YOUR RULES HERE -->
<!-- Example: Dependencies must point inward (domain has no external imports) -->
<!-- Example: Controllers must not contain business logic -->

### Code Quality
<!-- ADD YOUR RULES HERE -->
<!-- Example: No abbreviations in variable names -->
<!-- Example: Functions must be under 30 lines -->

### Testing
<!-- ADD YOUR RULES HERE -->
<!-- Example: Every new function must have a unit test -->
<!-- Example: Tests follow Given-When-Then structure -->

### Security
<!-- ADD YOUR RULES HERE -->
<!-- Example: All user input must be validated -->
<!-- Example: No secrets in source code -->

### Custom Rules
<!-- ADD YOUR RULES HERE -->

---

<!-- ⚠️ DO NOT MODIFY BELOW THIS LINE -- MCP WORKFLOW -->

## MCP Tools Reference
[Table of tools]

## Workflow
### Phase 1: Initialization
[set_phase, context gathering]

### Phase 2: Analysis
[start_agent, analysis, complete_agent]

### Phase 3: Synthesis
[set_phase, report generation]

### Phase 4: Publish
[add_action POST_INLINE_COMMENT, add_action POST_COMMENT]

### Phase 5: Complete
[set_phase completed, REVIEW_STATS]

## Report Structure
[Report template]

## Error Handling
[Agent failure pattern]
```

## Non-Functional Requirements

| NFR | Criteria |
|-----|----------|
| **No runtime dependencies** | Templates are static markdown files. No build step, no compilation. |
| **Copy-paste ready** | A developer can copy a template folder, fill in rules, and have a working skill. |
| **MCP version compatibility** | Templates target the current MCP tool API. If the API changes, templates must be updated. |

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | These templates can be created and reviewed independently of #30 (init-project). #30 consumes these templates but the templates are usable without the CLI command (manual copy). The blocker relationship is that #30 should use these templates when generating skeleton skills, so the templates should land first. | PASS |
| **Negotiable** | Template content (example rules, report format, section categories) is negotiable. The number of categories can be adjusted. The specific example comments can change. | PASS |
| **Valuable** | Eliminates the gap between the MCP reference doc and a working skill. Developers get full dashboard integration from day one instead of discovering later that their skill does not report progress. | PASS |
| **Estimable** | 4 SKILL.md files + 4 README files + 4 deprecation notices. The MCP workflow zone is largely copy-paste from existing production skills (`review-front`). The rule sections are intentionally empty. Estimate: 1-2 days. | PASS |
| **Small** | 12 files total (4 SKILL.md + 4 README + 4 deprecation edits). No code changes, no tests needed (these are static markdown templates). | PASS |
| **Testable** | All 10 Gherkin scenarios are verifiable by reading file content. Can be automated with grep/search assertions if desired. | PASS |

## Definition of Done

- [ ] `templates/en/review-basic-mcp/SKILL.md` exists with Zone 1 (5 categorized rule sections with `<!-- ADD YOUR RULES HERE -->` markers) and Zone 2 (MCP workflow with `set_phase`, `start_agent`, `complete_agent`, `add_action` calls)
- [ ] `templates/en/review-with-agents-mcp/SKILL.md` exists with sequential agent execution blocks (architecture, testing, code-quality) and per-agent rule sections
- [ ] `templates/fr/review-basic-mcp/SKILL.md` exists as French variant with identical MCP workflow
- [ ] `templates/fr/review-with-agents-mcp/SKILL.md` exists as French variant with identical MCP workflow
- [ ] Each template folder has a `README.md` with installation steps, customization guide, and example config.json
- [ ] No template contains `glab`, `gh api`, or `gh pr` commands
- [ ] All templates use MCP tool calls (`set_phase`, `start_agent`, `complete_agent`, `add_action`) instead of stdout markers for progress and actions
- [ ] All templates include the `[REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X]` marker
- [ ] Each template has a clear `<!-- ⚠️ DO NOT MODIFY BELOW THIS LINE -- MCP WORKFLOW -->` separator
- [ ] Existing templates (`templates/en/review-basic/`, `templates/en/review-with-agents/`, and FR variants) have a deprecation notice added at the top
- [ ] Templates include inline comment instructions using `add_action(POST_INLINE_COMMENT)`
- [ ] With-agents template includes error handling pattern for agent failures

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| MCP tool API changes break templates | Templates become outdated silently | Keep MCP workflow zone in a single source section so updates are localized. Consider a `reviewflow validate-skill` command in a future issue. |
| Users modify the MCP workflow zone | Review pipeline breaks | Clear visual separator and "DO NOT MODIFY" warning. README explains the zones. |
| Template proliferation (basic, with-agents, basic-mcp, with-agents-mcp, followup) | Maintenance burden | Deprecation notice on old templates signals direction. Plan to remove non-MCP templates in a future major version. |
| #30 (init-project) may want a different template structure | Rework needed | Coordinate: this spec defines template content, #30 defines how templates are consumed. The Zone 1 / Zone 2 structure is compatible with #30's skeleton generation approach. |

## Relationship to Other Specs

| Spec | Relationship |
|------|-------------|
| SPEC-003 (`skill-templates.md`) | This spec supersedes SPEC-003 for MCP-ready variants. SPEC-003's deliverables (marker-based templates) are now considered deprecated. |
| SPEC-030 (#30, `init-project`) | #30 consumes these templates as the source content for its skeleton generation. This spec must land before or alongside #30. |
