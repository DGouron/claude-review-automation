---
title: "SPEC-059: reviewflow skill list — Display Installed Skills"
issue: https://github.com/DGouron/review-flow/issues/59
labels: enhancement, cli, P1-critical, skills
milestone: Skill Management
status: DRAFT
---

# SPEC-059: `reviewflow skill list` — Display Installed Skills

## Problem Statement

ReviewFlow uses Claude Code skills (`.claude/skills/<name>/SKILL.md`) across multiple projects. As the number of skills and configured repositories grows, developers have no visibility into:

1. **Which skills are installed** in a given project or across all configured projects
2. **What each skill does** (name, description) without manually opening each `SKILL.md` file
3. **Which projects use which skills** -- there is no cross-project skill inventory

Today, the only way to answer "what skills do I have?" is to `ls .claude/skills/` in each project and read each frontmatter block manually. This friction increases as users add repositories via `reviewflow init` and `reviewflow init-project`.

## User Story

**As** a developer using ReviewFlow across multiple repositories,
**I want** `reviewflow skill list` to display all installed skills with their metadata and project associations,
**So that** I can quickly audit my skill inventory without navigating file trees.

### Persona

**Sam** -- Backend developer managing 4 repositories in ReviewFlow. Uses `reviewflow init-project` to onboard projects. Has customized review skills in 2 projects and left defaults in the others. Wants to know which skills exist, where they are used, and whether any project is missing a skill.

## Preconditions

- At least one repository is configured in `~/.claude-review/config.json` (via `reviewflow init`)
- Skills are stored as `.claude/skills/<name>/SKILL.md` inside each project's directory

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | **List installed skills** | Scan all configured repositories for `.claude/skills/*/SKILL.md` files |
| 2 | **Display skill metadata** | Parse YAML frontmatter from each `SKILL.md`: `name`, `description` |
| 3 | **Show project associations** | For each skill, show which repository/repositories contain it |
| 4 | **`--json` flag** | Machine-readable JSON output of all skill data |
| 5 | **`--project <path>` filter** | List skills for a single project only instead of all repositories |
| 6 | **Formatted table output** | Human-readable terminal output with columns aligned |
| 7 | **Graceful handling** | Handle missing directories, unreadable files, malformed frontmatter without crashing |

### Out of Scope

| Item | Reason |
|------|--------|
| `--available` flag / catalog browsing | The skill catalog (#61) does not exist yet. It is P2/XL effort and has no defined index format, no hosting, no search. Adding `--available` now would either show nothing or require building the catalog inline. **Recommendation**: defer `--available` to a future issue after #61 delivers the catalog index. |
| Skill versioning | No `version` field exists in current skill frontmatter. This is a catalog concern (#61). |
| Installing / uninstalling skills | Separate commands: `skill install` (#60), `skill create` (#62). |
| Agent-to-skill mapping | While agents reference skills in their frontmatter (`skills:` field), this is agent metadata, not skill metadata. Display which agents reference a skill is a nice-to-have for a later iteration. |
| Skill validation / health check | Checking if a skill's `SKILL.md` is well-formed beyond frontmatter parsing is a separate concern. |
| Skills from ReviewFlow's own `.claude/skills/` | The command lists skills in **configured repositories**, not ReviewFlow's internal development skills. |

### Challenge: `--available` Flag

The original issue requests `--available` for catalog browsing. After investigation:

- Issue #61 (skill catalog system) is **OPEN**, P2, effort XL
- No catalog index format is defined yet (JSON vs YAML undecided)
- No hosting is set up (GitHub repo? gist? registry?)
- No search capability exists

**Verdict**: `--available` has a hard dependency on #61. Including it in this P1 ticket would either (a) block this ticket on a P2/XL dependency, or (b) force a half-baked stub. Neither is acceptable. The `--available` flag should be added to `skill list` **after** #61 delivers the catalog, as a separate small ticket.

## Functional Requirements

### FR-1: Skill Discovery

The command scans all **enabled** repositories from `~/.claude-review/config.json`. For each repository:

1. Read `localPath` from the config
2. Look for `.claude/skills/` directory at that path
3. For each subdirectory in `.claude/skills/`, check for `SKILL.md`
4. Parse YAML frontmatter to extract `name` and `description`

If `--project <path>` is provided, scan only that path (which must exist and contain `.claude/skills/`).

### FR-2: Metadata Extraction

Each skill's metadata is extracted from the YAML frontmatter in `SKILL.md`:

```yaml
---
name: tdd
description: Interactive guide for Detroit School TDD...
---
```

Extracted fields:
- **name**: from frontmatter `name` field (fall back to directory name if missing)
- **description**: from frontmatter `description` field (display "No description" if missing)
- **directory**: the skill's directory name (e.g., `tdd`, `security`, `commit`)
- **project**: the repository name from the config

### FR-3: Human-Readable Output (default)

Display a table grouped by project:

```
Skills for my-app (/home/user/projects/my-app):
  Name               Description
  review-code        Code review skill for frontend projects
  review-followup    Follow-up review for resolved threads

Skills for my-api (/home/user/projects/my-api):
  Name               Description
  review-code        Basic code review skill template
  review-followup    Basic follow-up review skill template
  tdd                Interactive guide for Detroit School TDD

Total: 5 skills across 2 projects
```

If no skills are found in any project:
```
No skills found in configured repositories.
```

If a specific project has no skills:
```
No skills found in /path/to/project.
```

### FR-4: JSON Output (`--json`)

When `--json` is passed, output a JSON structure:

```json
{
  "skills": [
    {
      "name": "review-code",
      "description": "Code review skill for frontend projects",
      "directory": "review-code",
      "project": "my-app",
      "projectPath": "/home/user/projects/my-app",
      "path": "/home/user/projects/my-app/.claude/skills/review-code/SKILL.md"
    }
  ],
  "total": 5,
  "projectCount": 2
}
```

No decorative text, no color codes -- pure JSON to stdout. Errors go to stderr.

### FR-5: Project Filter (`--project`)

`reviewflow skill list --project /path/to/my-app` limits the scan to a single project path. The path does not need to be in the config -- any valid path with `.claude/skills/` is accepted. This supports ad-hoc inspection of projects not yet registered in ReviewFlow.

### FR-6: Error Handling

| Situation | Behavior |
|-----------|----------|
| No config file found | Print error: "No configuration found. Run `reviewflow init` first." Exit 1. |
| Config has no repositories | Print: "No repositories configured." Exit 0. |
| Repository `localPath` does not exist | Skip silently (project may have been moved/deleted). |
| `.claude/skills/` directory missing in a project | Skip that project (no skills installed). |
| `SKILL.md` has no frontmatter | Use directory name as `name`, "No description" as `description`. |
| `SKILL.md` is unreadable (permissions) | Skip with warning to stderr. |
| `--project` path does not exist | Print error: "Path does not exist: <path>". Exit 1. |

### FR-7: CLI Integration

Add `skill list` as a subcommand of a new `skill` command group. The CLI currently uses flat commands (e.g., `start`, `stop`, `init`). This introduces the first nested subcommand pattern: `reviewflow skill list`.

The `skill` command group prepares for future subcommands: `skill install` (#60), `skill create` (#62).

If `reviewflow skill` is called without a subcommand, display help for the skill command group.

## Acceptance Criteria (Gherkin)

### Scenario 1: List skills across all configured repositories

```gherkin
Feature: reviewflow skill list

  Scenario: Display installed skills from all repositories
    Given a ReviewFlow config with 2 enabled repositories "my-app" and "my-api"
    And "my-app" has skills "review-code" and "review-followup" in .claude/skills/
    And "my-api" has skill "review-code" in .claude/skills/
    When I run "reviewflow skill list"
    Then the output shows skills grouped by project
    And "my-app" section lists "review-code" and "review-followup" with descriptions
    And "my-api" section lists "review-code" with its description
    And the total line shows "3 skills across 2 projects"
```

### Scenario 2: JSON output

```gherkin
  Scenario: Machine-readable output with --json
    Given a ReviewFlow config with 1 enabled repository "my-app"
    And "my-app" has skill "tdd" with description "Interactive guide for Detroit School TDD"
    When I run "reviewflow skill list --json"
    Then the output is valid JSON
    And it contains a "skills" array with 1 entry
    And the entry has "name", "description", "directory", "project", "projectPath", "path"
    And "total" is 1
    And "projectCount" is 1
```

### Scenario 3: Filter by project

```gherkin
  Scenario: List skills for a single project
    Given a ReviewFlow config with 2 repositories
    And I have skills in both repositories
    When I run "reviewflow skill list --project /path/to/my-app"
    Then only skills from "/path/to/my-app" are displayed
    And the total line reflects only that project
```

### Scenario 4: No skills found

```gherkin
  Scenario: No skills installed in any project
    Given a ReviewFlow config with 1 enabled repository "my-app"
    And "my-app" has no .claude/skills/ directory
    When I run "reviewflow skill list"
    Then the output shows "No skills found in configured repositories."
    And the exit code is 0
```

### Scenario 5: Malformed SKILL.md frontmatter

```gherkin
  Scenario: Skill with missing frontmatter
    Given a repository "my-app" with a skill directory "custom-review"
    And "custom-review/SKILL.md" has no YAML frontmatter
    When I run "reviewflow skill list"
    Then the skill is listed with name "custom-review" (from directory name)
    And description shows "No description"
```

### Scenario 6: Repository path no longer exists

```gherkin
  Scenario: Configured repository path was deleted
    Given a ReviewFlow config with repository "old-project" at "/path/that/no/longer/exists"
    And another repository "my-app" at a valid path with skills
    When I run "reviewflow skill list"
    Then "old-project" is silently skipped
    And skills from "my-app" are displayed normally
```

### Scenario 7: No configuration file

```gherkin
  Scenario: ReviewFlow not initialized
    Given no ReviewFlow config file exists
    When I run "reviewflow skill list"
    Then I see "No configuration found. Run `reviewflow init` first."
    And the exit code is 1
```

### Scenario 8: Disabled repositories are skipped

```gherkin
  Scenario: Skip disabled repositories
    Given a ReviewFlow config with repository "my-app" enabled and "archived-app" disabled
    And both have skills installed
    When I run "reviewflow skill list"
    Then only skills from "my-app" are shown
    And "archived-app" skills are not listed
```

### Scenario 9: --project with non-existent path

```gherkin
  Scenario: Filter by non-existent project path
    When I run "reviewflow skill list --project /does/not/exist"
    Then I see "Path does not exist: /does/not/exist"
    And the exit code is 1
```

### Scenario 10: skill command without subcommand

```gherkin
  Scenario: Display skill command help
    When I run "reviewflow skill"
    Then I see help text listing available skill subcommands
    And "list" is listed as a subcommand
```

## Non-Functional Requirements

| NFR | Criteria |
|-----|----------|
| **Execution time** | < 2 seconds for 10 repositories with 20 skills total (local filesystem I/O only, no network) |
| **No side effects** | Read-only command -- never modifies any file |
| **Stdout / stderr separation** | JSON and table output go to stdout; warnings and errors go to stderr |
| **Exit codes** | 0 = success (even if no skills found), 1 = configuration error or invalid input |

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | No dependency on unbuilt features. Uses existing config file and skill directory conventions. Does not require #61 (catalog), #60 (install), or #62 (create). | PASS |
| **Negotiable** | Output format (table layout, grouping) is negotiable. `--project` filter is negotiable. JSON schema is negotiable. | PASS |
| **Valuable** | Gives immediate visibility into skill inventory across projects. Essential foundation for the skill management milestone -- users must see what they have before they can install or create new skills. | PASS |
| **Estimable** | CLI pattern is well-established (`parseCliArgs.ts`, `cli.ts`). YAML frontmatter parsing is straightforward. No new dependencies needed (can parse frontmatter with regex or a simple parser). Estimate: 1-2 days. | PASS |
| **Small** | 1 new CLI subcommand, 1 use case (list skills), 1 presenter (format output). No API changes, no server changes, no new dependencies. | PASS |
| **Testable** | All 10 scenarios above are concrete test cases. All I/O (filesystem, config loading) is injectable via dependency interfaces. | PASS |

## Definition of Done

- [ ] `reviewflow skill list` command is registered in the CLI parser
- [ ] `reviewflow skill` without subcommand shows help for the skill command group
- [ ] `parseCliArgs.ts` handles `skill list` as a nested subcommand with `--json` and `--project` flags
- [ ] `printHelp()` updated to include `skill list` and its options
- [ ] Scans all enabled repositories from config for `.claude/skills/*/SKILL.md`
- [ ] Parses YAML frontmatter (`name`, `description`) from each `SKILL.md`
- [ ] Falls back to directory name if frontmatter `name` is missing
- [ ] Human-readable table output grouped by project (default)
- [ ] `--json` produces valid JSON to stdout with `skills`, `total`, `projectCount` fields
- [ ] `--project <path>` filters to a single project (does not require config registration)
- [ ] Graceful handling: missing paths, missing directories, malformed frontmatter, unreadable files
- [ ] Disabled repositories are skipped
- [ ] Exit code 0 on success, 1 on configuration/input errors
- [ ] Unit tests cover all 10 Gherkin scenarios (Detroit school, state-based)
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] No `as Type` assertions, no `any`, no relative imports

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Frontmatter parsing edge cases (multi-line description, special characters) | Metadata displayed incorrectly or parsing crash | Use a simple regex-based parser for the `---` delimited block; test with real skill files from this repo |
| Large number of repositories slows scanning | CLI feels slow | Filesystem I/O is fast for local directories; parallelize scanning if needed in future iteration |
| Nested subcommand pattern (skill list) diverges from current flat CLI structure | Parser complexity, user confusion | Document clearly in help; the pattern is standard (git, docker, npm all use subcommands) |
| `--available` expected by users who read the issue | Confusion when flag is missing | Print a clear message if `--available` is passed: "Catalog browsing is not yet available. See issue #61." |

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `~/.claude-review/config.json` | Runtime prerequisite | Exists (produced by `reviewflow init`) |
| `.claude/skills/*/SKILL.md` convention | Convention | Exists (used by all current skills) |
| YAML frontmatter format | Convention | Exists (all current skills use `---` delimited frontmatter with `name` and `description`) |
| Issue #61 (skill catalog) | **NOT required** | Deferred; `--available` excluded from this spec |
