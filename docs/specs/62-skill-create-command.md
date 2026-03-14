---
title: "SPEC-062: reviewflow skill create — Scaffold Custom Skills"
issue: https://github.com/DGouron/review-flow/issues/62
labels: enhancement, cli, P2-important, skills
milestone: Skill Management
status: DRAFT
---

# SPEC-062: `reviewflow skill create` — Scaffold Custom Skills

## Problem Statement

Claude Code skills (`.claude/skills/<name>/SKILL.md`) are the primary mechanism for injecting domain-specific knowledge into Claude Code sessions. ReviewFlow itself ships with 20+ skills covering TDD, security, architecture, and more. Users who want to create their own skills face three problems:

1. **No standard starting point**: There is no scaffold or template for a generic skill. Users must open an existing `SKILL.md`, mentally strip out the domain-specific content, and reverse-engineer the expected structure (YAML frontmatter, sections, activation triggers).
2. **Structural mistakes**: Missing YAML frontmatter, missing `name` field, incorrect directory layout -- all silently accepted until something breaks at runtime. The `skill install` command (SPEC-060) validates `name` in frontmatter, so a skill created without it cannot be shared.
3. **No guidance on skill anatomy**: Skills range from simple checklists (`security`) to multi-phase workflows (`tdd`) to orchestrators with agents (`implement-feature`). A new user has no way to know which structure fits their need without reading multiple existing skills.

### How is this different from `init-project`?

`init-project` (SPEC-030) generates **ReviewFlow-specific review skills** with MCP workflow plumbing pre-wired (`[PHASE:...]`, `[PROGRESS:...]`, `[REVIEW_STATS:...]`). Its output is always a review-code + review-followup pair, tightly coupled to the ReviewFlow review pipeline.

`skill create` scaffolds a **generic custom skill** that could be anything: a commit workflow, a DDD guide, a testing protocol, an onboarding checklist. It knows nothing about MCP markers or review pipelines. The two commands serve fundamentally different purposes:

| Aspect | `init-project` | `skill create` |
|--------|----------------|-----------------|
| **Purpose** | Bootstrap ReviewFlow review pipeline for a project | Scaffold any custom skill from scratch |
| **Output** | review-code + review-followup SKILL.md with MCP markers | Single generic SKILL.md with user-defined purpose |
| **Templates** | Review-specific (basic, with-agents) | Structural (minimal, guided, with-references) |
| **MCP markers** | Yes, pre-wired | No |
| **Target audience** | ReviewFlow user onboarding a project | Any Claude Code user creating a skill |

## User Story

**As** a developer using Claude Code skills,
**I want** `reviewflow skill create` to interactively scaffold a well-structured skill with valid frontmatter and appropriate sections,
**So that** I can create custom skills quickly without reverse-engineering existing ones or making structural mistakes.

### Persona

**Alex** -- Full-stack developer, 5 years experience. Uses Claude Code daily. Has been using ReviewFlow's built-in skills (`/tdd`, `/security`, `/commit`) for two months. Wants to create a custom skill for their team's deployment checklist. Has never opened a `SKILL.md` file and does not know the expected structure.

## Preconditions

- The command is run from within a project directory that has a `.claude/` directory (or `--target` specifies one)
- No external dependencies required (no network, no Git, no config file)

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | **Interactive wizard** | Prompt for skill name, description, and template selection |
| 2 | **Template selection** | Choose between `minimal`, `guided`, and `with-references` scaffolds |
| 3 | **SKILL.md generation** | Create a valid SKILL.md with correct YAML frontmatter and template-appropriate sections |
| 4 | **Directory creation** | Create `.claude/skills/<skill-name>/` and, for `with-references`, a `references/` subdirectory |
| 5 | **Name validation** | Validate skill name format (lowercase alphanumeric + hyphens, no spaces/special characters) |
| 6 | **Conflict detection** | Warn if a skill with the same name already exists; offer overwrite or abort |
| 7 | **`--target` flag** | Specify the project directory (defaults to current working directory) |
| 8 | **Non-interactive mode (`-y`)** | Accept defaults: template=minimal, skip prompts. Name and description still required as flags. |
| 9 | **Post-creation summary** | Display created files and next-steps guidance |

### Out of Scope

| Item | Reason |
|------|--------|
| Review-specific templates (MCP markers, PHASE/PROGRESS) | Covered by `init-project` (SPEC-030). Different purpose. |
| Agent creation alongside skill | Agent scaffolding is a separate concern. The `agent-creator` skill already handles this interactively. |
| Skill publishing / sharing | No catalog or registry exists yet (#61). |
| Skill validation beyond creation | A future `skill validate` command could check existing skills. |
| Framework-specific templates (React, Node, Python) | Skills are framework-agnostic by design. Users fill in domain knowledge. |
| Editing or updating existing skills | Different command, different scope. |
| Language selection (EN/FR) | Generic skills are written in English (code/technical content). User edits the content in any language after creation. |

## Functional Requirements

### FR-1: CLI Integration

Register `skill create` as a subcommand of the `skill` command group (introduced by SPEC-059). The argument parsing follows this pattern:

```
reviewflow skill create [options]

Options:
  --name <name>           Skill name (required in non-interactive mode)
  --description <desc>    Skill description (required in non-interactive mode)
  --template <template>   Template: minimal | guided | with-references (default: minimal)
  --target <path>         Target project directory (default: current directory)
  -y, --yes               Non-interactive mode (uses defaults, requires --name and --description)
  --force                 Overwrite existing skill with the same name without prompting
```

Update `printHelp()` to include `skill create` and its options.

### FR-2: Interactive Wizard

When run without `-y`, the wizard prompts:

| Prompt | Type | Validation | Default |
|--------|------|------------|---------|
| Skill name | text input | Lowercase alphanumeric + hyphens only. Min 2 chars, max 50 chars. No leading/trailing hyphens. | None (required) |
| Description | text input | Non-empty. Max 200 chars. | None (required) |
| Template | select | One of: `minimal`, `guided`, `with-references` | `minimal` |

The wizard displays a brief explanation of each template before the selection prompt:

```
Choose a template:

  minimal          — Name, description, and a single content section.
                     Best for: simple checklists, short guidelines.

  guided           — Structured with Persona, Activation, Workflow, and Output sections.
                     Best for: multi-step processes, review skills, workflows.

  with-references  — Like guided, plus a references/ subdirectory for supporting files.
                     Best for: skills with examples, patterns, or external knowledge.
```

### FR-3: Name Validation

The skill name is validated against these rules:

| Rule | Valid | Invalid |
|------|-------|---------|
| Lowercase alphanumeric + hyphens | `my-skill`, `tdd`, `code-review-v2` | `My Skill`, `my_skill`, `my.skill` |
| Min 2 characters | `db` | `a` |
| Max 50 characters | (up to 50) | (51+) |
| No leading/trailing hyphens | `my-skill` | `-my-skill`, `my-skill-` |
| No consecutive hyphens | `my-skill` | `my--skill` |

If validation fails, display the specific rule violated and re-prompt (interactive mode) or exit with code 1 (non-interactive mode).

### FR-4: Template Definitions

#### Template: `minimal`

The simplest possible skill. Name, description, one content section.

```markdown
---
name: <skill-name>
description: <description>
---

# <Skill Name (Title Case)>

## Activation

This skill activates when:
- <!-- Define when this skill should be used -->

## Instructions

<!-- Add your skill instructions here -->
```

#### Template: `guided`

Structured skill with common sections pre-filled as placeholders.

```markdown
---
name: <skill-name>
description: <description>
---

# <Skill Name (Title Case)>

## Persona

<!-- Optional: Define a persona or role for this skill -->
<!-- Example: Read `.claude/roles/senior-dev.md` — adopt this profile. -->

## Activation

This skill activates when:
- <!-- Define when this skill should be used -->

## Workflow

### Step 1: <!-- Name this step -->

<!-- Describe what to do in this step -->

### Step 2: <!-- Name this step -->

<!-- Describe what to do in this step -->

## Constraints

<!-- List rules and boundaries for this skill -->
- <!-- Constraint 1 -->
- <!-- Constraint 2 -->

## Output

<!-- Define the expected output format -->
```

#### Template: `with-references`

Like `guided`, but adds a references section and creates a `references/` subdirectory.

```markdown
---
name: <skill-name>
description: <description>
---

# <Skill Name (Title Case)>

## Persona

<!-- Optional: Define a persona or role for this skill -->
<!-- Example: Read `.claude/roles/senior-dev.md` — adopt this profile. -->

## Activation

This skill activates when:
- <!-- Define when this skill should be used -->

## Workflow

### Step 1: <!-- Name this step -->

<!-- Describe what to do in this step -->

### Step 2: <!-- Name this step -->

<!-- Describe what to do in this step -->

## Constraints

<!-- List rules and boundaries for this skill -->
- <!-- Constraint 1 -->
- <!-- Constraint 2 -->

## References

Supporting files are in the `references/` directory:
- <!-- List reference files as you add them -->

## Output

<!-- Define the expected output format -->
```

Additionally creates:
- `references/` subdirectory
- `references/.gitkeep` (empty file to ensure the directory is tracked by Git)

### FR-5: Conflict Detection

Before creating files, check if `.claude/skills/<skill-name>/` already exists.

| Situation | `--force` absent | `--force` present |
|-----------|------------------|-------------------|
| Destination does not exist | Create proceeds | Create proceeds |
| Destination exists (interactive) | Prompt: "Skill '<name>' already exists. Overwrite? (y/N)" | Delete existing, create new. Print warning. |
| Destination exists (non-interactive) | Error: "Skill '<name>' already exists. Use --force to overwrite." Exit 1. | Delete existing, create new. Print warning. |

### FR-6: Directory Structure

The command creates:

```
<target>/.claude/skills/<skill-name>/
└── SKILL.md

# For with-references template:
<target>/.claude/skills/<skill-name>/
├── SKILL.md
└── references/
    └── .gitkeep
```

If `.claude/skills/` does not exist but `.claude/` does, create `skills/` automatically.

If `.claude/` does not exist, error: "No .claude/ directory found in <target>. Is this a Claude Code project?" Exit 1.

### FR-7: Non-Interactive Mode (`-y`)

When `-y` is passed:
- `--name` is required. If missing: error "The --name flag is required in non-interactive mode." Exit 1.
- `--description` is required. If missing: error "The --description flag is required in non-interactive mode." Exit 1.
- `--template` defaults to `minimal` if not provided.
- No prompts are displayed.

### FR-8: Post-Creation Output

After successful creation, display:

```
Created skill '<name>':
  .claude/skills/<name>/SKILL.md

Next steps:
  1. Open .claude/skills/<name>/SKILL.md and fill in the placeholder sections
  2. Use the skill with: /skill-name
  3. To share this skill: reviewflow skill install /path/to/<name> --target /other/project
```

For `with-references` template, also show:
```
  .claude/skills/<name>/references/.gitkeep

  Tip: Add reference files (examples, patterns, checklists) to the references/ directory.
```

### FR-9: Target Directory

The `--target` flag specifies where to create the skill. Defaults to the current working directory.

1. The target directory must exist
2. The target must contain a `.claude/` directory
3. `.claude/skills/` is auto-created if missing

Same behavior as `skill install` (SPEC-060, FR-9) for consistency.

## Acceptance Criteria (Gherkin)

### Scenario 1: Create a minimal skill interactively

```gherkin
Feature: reviewflow skill create

  Scenario: Scaffold a minimal skill via interactive wizard
    Given a project at "/path/to/my-project" with a ".claude/" directory
    And no skill named "deploy-checklist" exists
    When I run "reviewflow skill create"
    And I enter "deploy-checklist" for the skill name
    And I enter "Pre-deployment verification checklist" for the description
    And I select "minimal" for the template
    Then ".claude/skills/deploy-checklist/SKILL.md" is created
    And the SKILL.md frontmatter contains name: "deploy-checklist"
    And the SKILL.md frontmatter contains description: "Pre-deployment verification checklist"
    And the SKILL.md body contains "# Deploy Checklist"
    And the SKILL.md body contains "## Activation"
    And the SKILL.md body contains "## Instructions"
    And the output shows "Created skill 'deploy-checklist'"
    And the output shows next steps guidance
    And the exit code is 0
```

### Scenario 2: Create a guided skill interactively

```gherkin
  Scenario: Scaffold a guided skill with structured sections
    Given a project with a ".claude/" directory
    And no existing skill with the chosen name
    When I run "reviewflow skill create"
    And I enter "code-review" for the skill name
    And I enter "Team code review guidelines" for the description
    And I select "guided" for the template
    Then ".claude/skills/code-review/SKILL.md" is created
    And the SKILL.md contains sections: Persona, Activation, Workflow, Constraints, Output
    And the Workflow section contains "Step 1" and "Step 2" placeholders
    And no "references/" directory is created
```

### Scenario 3: Create a skill with references

```gherkin
  Scenario: Scaffold a skill with a references subdirectory
    Given a project with a ".claude/" directory
    When I run "reviewflow skill create"
    And I enter "architecture" for the skill name
    And I enter "Architecture decision guide" for the description
    And I select "with-references" for the template
    Then ".claude/skills/architecture/SKILL.md" is created
    And ".claude/skills/architecture/references/.gitkeep" is created
    And the SKILL.md contains a "## References" section
    And the References section mentions the "references/" directory
```

### Scenario 4: Non-interactive mode with all flags

```gherkin
  Scenario: Create a skill non-interactively
    Given a project with a ".claude/" directory
    When I run "reviewflow skill create --name my-skill --description 'My custom skill' --template guided -y"
    Then no interactive prompts are shown
    And ".claude/skills/my-skill/SKILL.md" is created with guided template
    And the frontmatter contains name: "my-skill" and description: "My custom skill"
    And the exit code is 0
```

### Scenario 5: Non-interactive mode missing --name

```gherkin
  Scenario: Non-interactive mode requires --name flag
    When I run "reviewflow skill create -y --description 'desc'"
    Then the output shows "The --name flag is required in non-interactive mode."
    And the exit code is 1
    And no files are created
```

### Scenario 6: Non-interactive mode missing --description

```gherkin
  Scenario: Non-interactive mode requires --description flag
    When I run "reviewflow skill create -y --name my-skill"
    Then the output shows "The --description flag is required in non-interactive mode."
    And the exit code is 1
    And no files are created
```

### Scenario 7: Invalid skill name

```gherkin
  Scenario: Reject invalid skill name
    Given a project with a ".claude/" directory
    When I run "reviewflow skill create --name 'My Skill' --description 'desc' -y"
    Then the output shows an error about invalid skill name format
    And the exit code is 1
    And no files are created
```

### Scenario 8: Skill name too short

```gherkin
  Scenario: Reject skill name with less than 2 characters
    When I run "reviewflow skill create --name 'a' --description 'desc' -y"
    Then the output shows an error about minimum name length
    And the exit code is 1
```

### Scenario 9: Conflict without --force (non-interactive)

```gherkin
  Scenario: Abort when skill already exists and --force is not set
    Given a project with an existing skill "security" in ".claude/skills/security/"
    When I run "reviewflow skill create --name security --description 'desc' -y"
    Then the output shows "Skill 'security' already exists. Use --force to overwrite."
    And the existing skill is NOT modified
    And the exit code is 1
```

### Scenario 10: Overwrite with --force

```gherkin
  Scenario: Overwrite existing skill when --force is set
    Given a project with an existing skill "security" in ".claude/skills/security/"
    When I run "reviewflow skill create --name security --description 'New security' --force -y"
    Then the existing skill directory is replaced
    And the new SKILL.md contains description: "New security"
    And the output shows a warning about overwriting
    And the exit code is 0
```

### Scenario 11: Target project without .claude/ directory

```gherkin
  Scenario: Reject target without .claude/ directory
    Given a directory "/tmp/plain-project" with no ".claude/" subdirectory
    When I run "reviewflow skill create --target /tmp/plain-project --name my-skill --description 'desc' -y"
    Then the output shows "No .claude/ directory found"
    And the exit code is 1
```

### Scenario 12: Auto-create .claude/skills/ directory

```gherkin
  Scenario: Create .claude/skills/ if it does not exist
    Given a project with a ".claude/" directory but no ".claude/skills/" subdirectory
    When I run "reviewflow skill create --name my-skill --description 'desc' -y"
    Then ".claude/skills/" is created automatically
    And ".claude/skills/my-skill/SKILL.md" is created
    And the exit code is 0
```

### Scenario 13: Skill name with leading/trailing hyphens

```gherkin
  Scenario: Reject skill name with leading hyphen
    When I run "reviewflow skill create --name '-bad-name' --description 'desc' -y"
    Then the output shows an error about invalid skill name format
    And the exit code is 1
```

### Scenario 14: Title case conversion in SKILL.md heading

```gherkin
  Scenario: Skill name is converted to title case for the heading
    When I run "reviewflow skill create --name 'deploy-checklist' --description 'desc' -y"
    Then the SKILL.md contains "# Deploy Checklist" as the heading
    And the frontmatter name remains "deploy-checklist" (lowercase)
```

### Scenario 15: Default template in non-interactive mode

```gherkin
  Scenario: Default to minimal template when --template is omitted
    When I run "reviewflow skill create --name my-skill --description 'desc' -y"
    Then the SKILL.md uses the minimal template structure
    And the SKILL.md does NOT contain "## Persona" or "## Workflow" sections
```

## Non-Functional Requirements

| NFR | Criteria |
|-----|----------|
| **Execution time** | < 1 second (no network, no Git, pure local file creation) |
| **No side effects** | Only creates files within `.claude/skills/<name>/`. Never modifies existing skills (unless `--force`), never modifies config files. |
| **Stdout / stderr separation** | Success messages and post-creation summary go to stdout; errors go to stderr. |
| **Exit codes** | 0 = success, 1 = validation error, conflict, or missing prerequisites. |
| **Atomic creation** | If an error occurs mid-creation (e.g., after creating directory but before writing SKILL.md), clean up the partial directory. |

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | No dependency on other pending features. Uses the `skill` subcommand group (SPEC-059) but the parser change is trivial and can be included here if needed. Does not depend on `init-project`, `skill install`, or the catalog (#61). | PASS |
| **Negotiable** | Template names and section content are negotiable. Number of templates is negotiable. Whether to include a `with-agents` template is negotiable (excluded here to avoid overlap with `init-project`). Interactive prompt flow is negotiable. | PASS |
| **Valuable** | Eliminates the guesswork of creating a well-structured skill. Ensures every created skill has valid frontmatter (compatible with `skill install` validation). Reduces the barrier to skill creation from "read and reverse-engineer existing skills" to "run a command and fill in placeholders". | PASS |
| **Estimable** | CLI pattern is established (`parseCliArgs.ts`, `@inquirer/prompts`). File generation is straightforward string interpolation. Validation is simple regex. No new dependencies. Estimate: 1-2 days. | PASS |
| **Small** | 1 CLI subcommand, 1 use case (create skill), 3 templates (string literals), name validation (reusable from SPEC-060). No server changes, no API changes, no new dependencies. | PASS |
| **Testable** | All 15 scenarios above are concrete test cases with deterministic inputs and outputs. All I/O (filesystem) is injectable via dependency interfaces. Template content can be snapshot-tested. | PASS |

## Definition of Done

- [ ] `reviewflow skill create` command is registered in the CLI parser
- [ ] `parseCliArgs.ts` handles `skill create` with `--name`, `--description`, `--template`, `--target`, `--force`, and `-y` flags
- [ ] `printHelp()` updated to include `skill create` and its options
- [ ] Interactive wizard prompts for name, description, and template selection
- [ ] Template explanations displayed before selection prompt
- [ ] Name validation enforces: lowercase alphanumeric + hyphens, 2-50 chars, no leading/trailing/consecutive hyphens
- [ ] Three templates generate correct SKILL.md content: `minimal`, `guided`, `with-references`
- [ ] YAML frontmatter includes `name` and `description` fields in all templates
- [ ] Skill name is converted to title case for the `#` heading in SKILL.md
- [ ] `with-references` template creates `references/.gitkeep` file
- [ ] Conflict detection: existing skill blocks creation without `--force`
- [ ] `--force` flag overwrites existing skills with warning
- [ ] Non-interactive mode (`-y`) requires `--name` and `--description`, defaults template to `minimal`
- [ ] `--target` flag specifies target project directory
- [ ] `.claude/skills/` auto-created if `.claude/` exists but `skills/` does not
- [ ] Error when target has no `.claude/` directory
- [ ] Post-creation summary displays created files and next-steps guidance
- [ ] Atomic creation: partial directories cleaned up on error
- [ ] Unit tests cover all 15 Gherkin scenarios (Detroit school, state-based)
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] No `as Type` assertions, no `any`, no relative imports

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Template content becomes outdated as skill conventions evolve | Generated skills have stale structure | Templates are simple string literals -- easy to update. A future `skill validate` command could flag outdated structure. |
| Users confuse `skill create` with `init-project` | Wrong command used, wrong output | Clear help text differentiates the two. `skill create` help says "scaffold a custom skill" while `init-project` says "bootstrap ReviewFlow review pipeline". |
| Name validation rejects valid use cases (e.g., underscores) | User frustration | Validation rules match the existing convention across all 20+ skills in the codebase (all use lowercase + hyphens). Document the convention clearly. |
| `with-references` template encourages large reference files that bloat Claude context | Performance degradation at skill load time | Tip in post-creation output warns about keeping references concise. This is a user responsibility, not a tool concern. |
| Skill name collision with built-in ReviewFlow skills | User overwrites a built-in skill unknowingly | Built-in skills live in ReviewFlow's own `.claude/skills/`, not in user projects. No collision possible unless user copies them manually. |

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `skill` subcommand group in `parseCliArgs.ts` | Implementation prerequisite | Introduced by SPEC-059; can be added here if SPEC-059 not merged |
| `.claude/skills/<name>/SKILL.md` convention | Convention | Exists (used by all current skills) |
| YAML frontmatter format (`name`, `description`) | Convention | Exists (all current skills use `---` delimited frontmatter) |
| `@inquirer/prompts` | Interactive prompts | Already installed |
| Skill name validation rules | Shared with SPEC-060 | Same validation logic; can be extracted to a shared utility |
