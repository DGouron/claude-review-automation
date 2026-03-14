---
title: "SPEC-060: reviewflow skill install — Install Skills from Multiple Sources"
issue: https://github.com/DGouron/review-flow/issues/60
labels: enhancement, cli, P1-critical, skills
milestone: Skill Management
status: DRAFT
---

# SPEC-060: `reviewflow skill install` — Install Skills from Multiple Sources

## Problem Statement

ReviewFlow skills (`.claude/skills/<name>/SKILL.md`) are the primary mechanism for injecting domain-specific knowledge into Claude Code sessions. Today, there is no programmatic way to install a skill into a project. Developers must:

1. **Know where the skill lives** (a template directory, a Git repository, a colleague's machine)
2. **Manually copy the skill directory** to `.claude/skills/<name>/` in their project
3. **Verify the skill structure** themselves (does it have a `SKILL.md`? is the frontmatter valid?)
4. **Handle conflicts** manually when a skill with the same name already exists

This friction discourages skill sharing and reuse. A developer who creates a useful skill in project A has no standard path to install it in project B. Teams cannot share skills via Git repositories without writing custom scripts.

The `reviewflow skill install` command solves this by providing a single, validated installation path for skills from three sources: a local directory, a Git URL, or (in the future) a skill catalog.

## User Story

**As** a developer using ReviewFlow,
**I want** `reviewflow skill install <source>` to copy a validated skill into my project's `.claude/skills/` directory,
**So that** I can reuse skills across projects and share them with my team without manual file management.

### Persona

**Sam** -- Backend developer managing 4 repositories with ReviewFlow. Created a TDD skill in project A and wants to install it in project B. A colleague shares a security skill via a Git URL. Sam wants a single command to install either source with validation and conflict handling.

## Preconditions

- A project directory exists with (or without) a `.claude/skills/` directory
- The command is run from within a project directory (or a `--target` path is specified)
- For Git URL installs: `git` CLI is available on the system
- For catalog installs: the skill catalog (#61) is available (deferred -- see Challenge section)

## Challenge: Catalog Dependency (#61)

The issue lists "Install from skill catalog by name" as an acceptance criterion. After investigation:

- Issue #61 (skill catalog system) does NOT exist yet -- there is no catalog index, no hosting, no registry format
- Without a catalog, "install by name" has no source to resolve against
- Building a catalog inline would be scope creep (estimated P2/XL effort) and would violate INVEST independence

**Decision**: The `skill install` command supports **three source types** differentiated by argument format:

| Argument format | Source type | Status |
|-----------------|------------|--------|
| Absolute/relative path (e.g., `/path/to/skill/`) | Local directory | **In scope** |
| Git URL (e.g., `https://github.com/user/repo.git`) | Git repository | **In scope** |
| Bare name (e.g., `tdd`) | Catalog lookup | **Deferred** -- prints actionable error: "Catalog not available yet. Install from a local path or Git URL. See issue #61." |

This means the command is immediately useful for the two most common sharing scenarios (local copy and Git sharing) while the catalog infrastructure matures independently.

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | **Install from local path** | Copy a skill directory from a local filesystem path into the target project's `.claude/skills/` |
| 2 | **Install from Git URL** | Clone a Git repository to a temp directory, locate the skill within it, and extract it to `.claude/skills/` |
| 3 | **SKILL.md validation** | Before installing, verify the source contains a valid `SKILL.md` with parseable YAML frontmatter (`name` field required) |
| 4 | **`--force` flag** | Overwrite an existing skill with the same name without prompting |
| 5 | **Conflict detection** | If a skill with the same name already exists and `--force` is not set, abort with a clear error message |
| 6 | **Post-install validation** | After copying, verify the installed skill has a valid `SKILL.md` at the destination |
| 7 | **Skill name resolution** | Derive the skill name from frontmatter `name` field; fall back to directory name |
| 8 | **`--target` flag** | Specify the target project path (defaults to current working directory) |
| 9 | **`--name` flag** | Override the installed skill's directory name (useful when installing from a Git repo with a generic name) |
| 10 | **Catalog placeholder** | Detect bare name arguments (no path separator, no URL scheme) and print a clear "catalog not available" message |

### Out of Scope

| Item | Reason |
|------|--------|
| Skill catalog system (#61) | Does not exist yet. Install-by-name is deferred. |
| Skill versioning | No `version` field exists in current skill frontmatter. Versioning is a catalog concern. |
| Skill updates / upgrades | "Update an existing skill to latest version" requires version tracking. Separate concern. |
| Skill dependency resolution | Skills do not declare dependencies on other skills. No transitive install. |
| `skill uninstall` / `skill remove` | Separate command, separate issue. |
| Interactive mode (prompts) | The command is non-interactive. `--force` replaces confirmation prompts. |
| Skill registry / publishing | Publishing skills to a catalog is the inverse of install. Out of scope. |
| Multi-skill install | Installing multiple skills in a single command invocation. Run the command multiple times. |
| Git subpath specification | For Git URL installs, the skill must be at the repository root or in a conventional `.claude/skills/<name>/` location. Arbitrary subpaths require `--path` flag -- deferred for simplicity. |

## Functional Requirements

### FR-1: Source Type Detection

The command detects the source type from the argument:

| Detection rule | Source type | Example |
|----------------|------------|---------|
| Starts with `http://`, `https://`, or `git@` | Git URL | `https://github.com/user/my-skill.git` |
| Contains a path separator (`/` or `\`) or is `.` or `..` | Local path | `/home/user/skills/tdd`, `../shared-skills/security`, `.` |
| None of the above (bare word) | Catalog name | `tdd`, `security` |

### FR-2: Install from Local Path

1. Resolve the path to an absolute path
2. Verify the path exists and is a directory
3. Run SKILL.md validation (FR-5)
4. Determine the skill name (FR-7)
5. Check for conflicts at the destination (FR-6)
6. Copy the entire source directory to `<target>/.claude/skills/<skill-name>/`
7. Run post-install validation (FR-8)
8. Print success message with installed skill name and path

If the source path points directly to a `SKILL.md` file (not a directory), the command uses the parent directory as the source.

### FR-3: Install from Git URL

1. Create a temporary directory
2. Clone the repository with `--depth 1` (shallow clone for speed)
3. Locate the skill in the cloned repository:
   - **Case A**: Root contains `SKILL.md` -- the entire repo is the skill
   - **Case B**: Repo has `.claude/skills/` with exactly one skill subdirectory -- use that
   - **Case C**: Repo has `.claude/skills/` with multiple skill subdirectories -- error: "Multiple skills found. Use `--name <skill>` to specify which one."
   - **Case D**: No `SKILL.md` found at root or in `.claude/skills/` -- error: "No valid skill found in repository."
4. Run SKILL.md validation (FR-5) on the located skill
5. Determine the skill name (FR-7)
6. Check for conflicts at the destination (FR-6)
7. Copy the skill directory to `<target>/.claude/skills/<skill-name>/`
8. Clean up the temporary directory
9. Run post-install validation (FR-8)
10. Print success message

The `--name` flag can be used to select a specific skill when a Git repo contains multiple skills (Case C).

### FR-4: Catalog Name (Deferred)

When a bare name is detected (no path separator, no URL scheme):

1. Print: "Skill catalog is not available yet. Install from a local path or Git URL."
2. Print: "  reviewflow skill install /path/to/skill"
3. Print: "  reviewflow skill install https://github.com/user/skill.git"
4. Print: "See: https://github.com/DGouron/review-flow/issues/61"
5. Exit with code 1

This provides a clear upgrade path -- when the catalog lands, the same argument position will work.

### FR-5: SKILL.md Validation (Pre-Install)

Before installing, validate the source skill:

1. `SKILL.md` file exists in the skill directory root
2. `SKILL.md` starts with YAML frontmatter delimited by `---`
3. Frontmatter contains a `name` field (non-empty string)
4. Frontmatter `name` is a valid directory name (alphanumeric, hyphens, underscores; no spaces or special characters)

If validation fails, print the specific validation error and abort. No partial installation.

Validation errors:

| Check | Error message |
|-------|---------------|
| No SKILL.md | "No SKILL.md found in <path>." |
| No frontmatter | "SKILL.md has no YAML frontmatter (must start with '---')." |
| No `name` field | "SKILL.md frontmatter is missing the required 'name' field." |
| Invalid `name` | "Skill name '<name>' contains invalid characters. Use only alphanumeric, hyphens, and underscores." |

### FR-6: Conflict Detection

Before copying, check if `<target>/.claude/skills/<skill-name>/` already exists.

| Situation | `--force` absent | `--force` present |
|-----------|------------------|-------------------|
| Destination does not exist | Install proceeds | Install proceeds |
| Destination exists | Error: "Skill '<name>' already exists. Use --force to overwrite." Exit 1. | Delete existing directory, then install. Print warning: "Overwriting existing skill '<name>'." |

### FR-7: Skill Name Resolution

The installed skill's directory name is determined in order of priority:

1. `--name <custom-name>` flag (if provided) -- validated against the same naming rules as FR-5
2. `name` field from SKILL.md YAML frontmatter
3. Source directory name (last component of the path)

### FR-8: Post-Install Validation

After copying the skill to the destination:

1. Verify `SKILL.md` exists at `<target>/.claude/skills/<skill-name>/SKILL.md`
2. Verify the file is readable
3. Parse frontmatter and confirm `name` field is present

If post-install validation fails, remove the partially installed skill and report the error. The installation is atomic -- it either fully succeeds or leaves no trace.

### FR-9: Target Directory

The `--target` flag specifies where to install the skill. Defaults to the current working directory.

1. The target directory must exist
2. If `.claude/skills/` does not exist in the target, create it automatically (with `mkdir -p`)
3. The `.claude/` directory is not created if the target has no `.claude/` directory at all -- error: "No .claude/ directory found in <target>. Is this a Claude Code project?"

### FR-10: CLI Integration

Register `skill install` as a subcommand of the `skill` command group (introduced by #59). The argument parsing follows this pattern:

```
reviewflow skill install <source> [options]

Arguments:
  <source>              Local path, Git URL, or skill name (catalog)

Options:
  --force               Overwrite existing skill with the same name
  --target <path>       Target project directory (default: current directory)
  --name <name>         Override the skill directory name
```

Update `printHelp()` to include the `skill install` subcommand and its options.

### FR-11: Output

**Success output:**

```
Installed skill '<name>' from <source-type>
  Source: <source>
  Path:   <target>/.claude/skills/<name>/

Skill '<name>': <description>
```

**Error output (all errors go to stderr):**

Errors follow the pattern: specific message + actionable suggestion.

## Acceptance Criteria (Gherkin)

### Scenario 1: Install a skill from a local directory

```gherkin
Feature: reviewflow skill install

  Scenario: Install a valid skill from a local path
    Given a directory "/tmp/my-skill" containing a valid SKILL.md with name "my-skill"
    And a target project at "/home/user/my-project" with a ".claude/" directory
    And no skill named "my-skill" exists in the target
    When I run "reviewflow skill install /tmp/my-skill --target /home/user/my-project"
    Then the skill is copied to "/home/user/my-project/.claude/skills/my-skill/"
    And "SKILL.md" exists at the destination
    And the output shows "Installed skill 'my-skill' from local path"
    And the exit code is 0
```

### Scenario 2: Install a skill from a Git URL

```gherkin
  Scenario: Install a skill from a Git repository
    Given a Git repository at "https://github.com/user/tdd-skill.git"
    And the repository root contains a valid SKILL.md with name "tdd"
    And a target project with a ".claude/" directory
    When I run "reviewflow skill install https://github.com/user/tdd-skill.git"
    Then the repository is shallow-cloned to a temporary directory
    And the skill is copied to ".claude/skills/tdd/"
    And the temporary directory is cleaned up
    And the output shows "Installed skill 'tdd' from git"
    And the exit code is 0
```

### Scenario 3: Conflict without --force

```gherkin
  Scenario: Abort when skill already exists and --force is not set
    Given a target project with an existing skill "security" in ".claude/skills/security/"
    And a source skill with name "security"
    When I run "reviewflow skill install /tmp/security-skill"
    Then the output shows "Skill 'security' already exists. Use --force to overwrite."
    And the existing skill is NOT modified
    And the exit code is 1
```

### Scenario 4: Overwrite with --force

```gherkin
  Scenario: Overwrite existing skill when --force is set
    Given a target project with an existing skill "security" in ".claude/skills/security/"
    And a source skill with name "security" and different content
    When I run "reviewflow skill install /tmp/security-skill --force"
    Then the existing skill is replaced with the new content
    And the output shows "Overwriting existing skill 'security'"
    And the output shows "Installed skill 'security' from local path"
    And the exit code is 0
```

### Scenario 5: Invalid SKILL.md -- no frontmatter

```gherkin
  Scenario: Reject skill with missing frontmatter
    Given a directory "/tmp/bad-skill" containing a SKILL.md without YAML frontmatter
    When I run "reviewflow skill install /tmp/bad-skill"
    Then the output shows "SKILL.md has no YAML frontmatter"
    And no files are copied
    And the exit code is 1
```

### Scenario 6: Invalid SKILL.md -- no name field

```gherkin
  Scenario: Reject skill with missing name in frontmatter
    Given a directory "/tmp/no-name-skill" containing a SKILL.md with frontmatter but no "name" field
    When I run "reviewflow skill install /tmp/no-name-skill"
    Then the output shows "SKILL.md frontmatter is missing the required 'name' field"
    And no files are copied
    And the exit code is 1
```

### Scenario 7: No SKILL.md in source

```gherkin
  Scenario: Reject source directory without SKILL.md
    Given a directory "/tmp/not-a-skill" with no SKILL.md file
    When I run "reviewflow skill install /tmp/not-a-skill"
    Then the output shows "No SKILL.md found in /tmp/not-a-skill"
    And the exit code is 1
```

### Scenario 8: Bare name triggers catalog-not-available message

```gherkin
  Scenario: Bare name argument reports catalog unavailability
    When I run "reviewflow skill install tdd"
    Then the output shows "Skill catalog is not available yet"
    And the output shows "Install from a local path or Git URL"
    And the exit code is 1
```

### Scenario 9: --name flag overrides skill directory name

```gherkin
  Scenario: Override installed skill name with --name flag
    Given a directory "/tmp/generic-skill" containing a valid SKILL.md with name "generic"
    And a target project with a ".claude/" directory
    When I run "reviewflow skill install /tmp/generic-skill --name my-custom-name"
    Then the skill is copied to ".claude/skills/my-custom-name/"
    And the output shows "Installed skill 'my-custom-name'"
    And the exit code is 0
```

### Scenario 10: Auto-create .claude/skills/ directory

```gherkin
  Scenario: Create .claude/skills/ directory if missing
    Given a target project with a ".claude/" directory but no ".claude/skills/" subdirectory
    And a valid source skill
    When I run "reviewflow skill install /tmp/my-skill"
    Then ".claude/skills/" is created automatically
    And the skill is installed inside it
    And the exit code is 0
```

### Scenario 11: Reject target without .claude/ directory

```gherkin
  Scenario: Abort if target has no .claude/ directory
    Given a target directory "/tmp/not-claude-project" with no ".claude/" subdirectory
    When I run "reviewflow skill install /tmp/my-skill --target /tmp/not-claude-project"
    Then the output shows "No .claude/ directory found"
    And the exit code is 1
```

### Scenario 12: Git repo with multiple skills requires --name

```gherkin
  Scenario: Git repo with multiple skills requires explicit selection
    Given a Git repository with ".claude/skills/skill-a/" and ".claude/skills/skill-b/"
    When I run "reviewflow skill install https://github.com/user/multi-skills.git"
    Then the output shows "Multiple skills found. Use --name <skill> to specify which one."
    And the exit code is 1
```

### Scenario 13: Post-install validation fails

```gherkin
  Scenario: Rollback if post-install validation fails
    Given a source skill that passes pre-install validation
    And a filesystem error occurs during copy causing SKILL.md to be missing at destination
    When the install process runs
    Then the partially copied skill directory is removed
    And the output shows an error about post-install validation failure
    And the exit code is 1
```

### Scenario 14: Skill directory includes reference files

```gherkin
  Scenario: Install copies all files in the skill directory
    Given a source skill with SKILL.md and a "references/" subdirectory containing additional files
    When I run "reviewflow skill install /tmp/my-skill"
    Then the entire skill directory is copied including "references/" and its contents
    And the directory structure is preserved
```

### Scenario 15: Source path is a SKILL.md file, not a directory

```gherkin
  Scenario: Source is a SKILL.md file path
    Given a valid SKILL.md at "/tmp/my-skill/SKILL.md"
    When I run "reviewflow skill install /tmp/my-skill/SKILL.md"
    Then the parent directory "/tmp/my-skill/" is used as the source
    And the skill is installed normally
```

## Non-Functional Requirements

| NFR | Criteria |
|-----|----------|
| **Execution time** | < 5 seconds for local installs. < 30 seconds for Git clones (network-dependent). |
| **Atomic installation** | Either the skill is fully installed or no trace is left. No partial installs. |
| **Temporary files** | Git clone temp directories are cleaned up in all cases (success, error, interruption). Use `try/finally`. |
| **Stdout / stderr separation** | Success messages go to stdout; errors and warnings go to stderr. |
| **Exit codes** | 0 = success, 1 = validation/conflict/error. |
| **No config modification** | The command does NOT modify `~/.claude-review/config.json`. It only writes to the target project's `.claude/skills/` directory. |

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | Depends on the `skill` subcommand group structure introduced by #59 (`parseCliArgs.ts` handles `skill` subcommands). However, the install use case logic, validation, and filesystem operations are fully independent. If #59 is not yet merged, the `skill` command group parser can be added in this ticket. Does NOT depend on #61 (catalog) -- catalog install is deferred with a clear placeholder message. | PASS |
| **Negotiable** | Git repository skill discovery strategy (root vs. `.claude/skills/`) is negotiable. `--name` flag semantics are negotiable. Error message wording is negotiable. | PASS |
| **Valuable** | Enables skill sharing and reuse across projects without manual file management. The two most common sharing patterns (local copy, Git URL) are covered. Foundation for the catalog install path when #61 lands. | PASS |
| **Estimable** | CLI parsing follows the established pattern (`parseCliArgs.ts`). Filesystem operations (copy directory, validate file) are straightforward. Git clone via `child_process.execSync` follows the existing pattern in `cli.ts`. Estimate: 2-3 days. | PASS |
| **Small** | 1 CLI subcommand, 1-2 use cases (install skill + validate skill), source type detection, filesystem gateway. No server changes, no API changes. | PASS |
| **Testable** | All 15 scenarios above are concrete test cases with deterministic inputs and outputs. All I/O (filesystem, git clone) is injectable via dependency interfaces per project conventions. | PASS |

## Definition of Done

- [ ] `reviewflow skill install <source>` command is registered in the CLI parser
- [ ] `parseCliArgs.ts` handles `skill install` with `--force`, `--target`, and `--name` flags
- [ ] `printHelp()` updated to include `skill install` and its options
- [ ] Source type detection differentiates local path, Git URL, and bare name
- [ ] Local path install: copies full directory to `.claude/skills/<name>/`
- [ ] Git URL install: shallow clones, locates skill, copies, cleans up temp directory
- [ ] Bare name argument prints "catalog not available" message with guidance
- [ ] SKILL.md pre-install validation checks: file exists, frontmatter present, `name` field present, name format valid
- [ ] Conflict detection: existing skill blocks install without `--force`
- [ ] `--force` flag overwrites existing skills with warning
- [ ] `--name` flag overrides installed skill directory name
- [ ] `--target` flag specifies target project directory
- [ ] `.claude/skills/` auto-created if `.claude/` exists but `skills/` does not
- [ ] Error when target has no `.claude/` directory
- [ ] Post-install validation confirms `SKILL.md` at destination; rollback on failure
- [ ] Entire skill directory copied (including `references/`, examples, etc.)
- [ ] Temp directories cleaned up in all cases (success, error)
- [ ] Unit tests cover all 15 Gherkin scenarios (Detroit school, state-based)
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] No `as Type` assertions, no `any`, no relative imports

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Git not installed on the user's system | Git URL installs fail | Check for `git` availability before attempting clone. Print: "Git is required for URL installs. Install Git or use a local path." |
| Large Git repos take a long time to clone | UX feels slow for Git installs | Use `--depth 1` for shallow clone. Print progress: "Cloning repository..." |
| Filesystem permissions prevent writing to `.claude/skills/` | Install fails with cryptic OS error | Catch permission errors and print a clear message: "Permission denied: cannot write to <path>." |
| Skill name collision between frontmatter and directory name | Ambiguity about which name takes precedence | Priority order is documented: `--name` > frontmatter `name` > directory name. Always show the resolved name in output. |
| SKILL.md validation is too strict (rejects valid skills from other ecosystems) | Users cannot install skills with non-standard frontmatter | Validation requires only `name`. The `description` field is recommended but not required. |
| #59 (skill list) not yet merged when this is implemented | `skill` command group does not exist in parser | The `skill` command group parser addition is small and can be included in this ticket if #59 has not landed. |

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `skill` subcommand group in `parseCliArgs.ts` | Implementation prerequisite | Introduced by #59; can be added here if #59 not merged |
| `.claude/skills/<name>/SKILL.md` convention | Convention | Exists (used by all current skills) |
| YAML frontmatter format (`name`, `description`) | Convention | Exists (all current skills use `---` delimited frontmatter) |
| `git` CLI | Runtime prerequisite (Git URL installs only) | External dependency; checked at runtime |
| Issue #61 (skill catalog) | **NOT required** | Deferred; bare name install prints placeholder message |

## Architecture Notes

Following the project's Clean Architecture, the implementation should be structured as:

- **Use case**: `installSkill.usecase.ts` -- orchestrates validation, source resolution, copy, and post-validation
- **Gateway contract**: `skillFilesystem.gateway.ts` in `entities/` -- defines interface for directory operations (copy, exists, read, delete)
- **Gateway implementation**: `skillFilesystem.local.gateway.ts` in `interface-adapters/gateways/` -- implements filesystem operations
- **Validation**: Skill validation logic lives in the domain layer (entity/guard) since SKILL.md structure is a domain concern
- **Source detection**: Pure function, no dependencies -- can live alongside the use case or as a shared utility

All external I/O (filesystem, git clone) is injected via dependency interfaces, enabling Detroit-school testing with stubs.
