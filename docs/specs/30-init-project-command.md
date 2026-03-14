---
title: "SPEC-030: reviewflow init-project — Project Setup with MCP-Ready Skeleton Skills"
issue: https://github.com/DGouron/review-flow/issues/30
labels: enhancement, cli, dx, P1-critical, skills
milestone: Project Bootstrapping
status: DRAFT
---

# SPEC-030: `reviewflow init-project` — Project Setup with MCP-Ready Skeleton Skills

## Problem Statement

Adding a new repository to ReviewFlow today requires:

1. Manually creating `.claude/reviews/config.json` inside the project
2. Copying skill templates from `templates/en/` or `templates/fr/`
3. Replacing `<!-- CUSTOMIZE -->` placeholders with your own rules
4. Understanding the MCP marker system (`[PHASE:...]`, `[PROGRESS:...]`, `[REVIEW_STATS:...]`)
5. Registering the project in the server's `~/.claude-review/config.json` repositories array
6. Knowing which webhook URL to configure on GitLab/GitHub

Steps 2-4 are error-prone and create a steep onboarding cliff. Most users abandon or misconfigure the skill files, resulting in broken review pipelines.

**The `init-project` command eliminates this friction** by generating skeleton skills where the user only fills in their review rules, with all MCP plumbing pre-wired.

## User Story

**As** a developer adding a repository to ReviewFlow,
**I want** `reviewflow init-project <path>` to create MCP-ready review skills with clear sections where I drop my rules,
**So that** I have a working review pipeline without understanding ReviewFlow internals.

### Persona

**Sam** -- Backend developer, 3 years experience. Uses GitLab daily. Installed ReviewFlow via `reviewflow init` last week. Wants to add their team's Node.js API project to the review pipeline. Knows nothing about MCP markers or skill file structure.

## Preconditions

- `reviewflow init` has already been run (server `config.json` exists at `~/.claude-review/config.json`)
- The target path is a git repository with at least one remote

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | **Path validation** | Verify the path is a git repo with a remote |
| 2 | **Language prompt** | Ask EN or FR for the generated skill content |
| 3 | **Review type prompt** | Ask `basic` (single-pass) or `with-agents` (multi-agent) |
| 4 | **Platform detection** | Detect `gitlab` or `github` from git remote URL, confirm with user |
| 5 | **Skeleton skill generation** | Create `review-code/SKILL.md` with MCP workflow pre-wired and empty categorized rule sections |
| 6 | **Followup skill generation** | Create `review-followup/SKILL.md` with context-file-based followup workflow |
| 7 | **Project config creation** | Create `.claude/reviews/config.json` with detected platform, skill names, and agent list |
| 8 | **Server config registration** | Add the project to `~/.claude-review/config.json` repositories array |
| 9 | **Webhook URL display** | Print the platform-specific webhook URL and setup instructions |
| 10 | **Overwrite protection** | Warn if `.claude/reviews/config.json` already exists; offer overwrite or abort |

### Out of Scope

| Item | Reason |
|------|--------|
| Framework-specific rules (React, Vue, Angular...) | Separate concern; skeleton sections are intentionally empty |
| Auto-detecting project tech stack | Over-engineering for v1; user fills in their rules |
| Creating webhook on GitLab/GitHub via API | Requires OAuth flow; display URL instructions instead |
| Editing existing skills | This is init-only; a future `reviewflow update-project` could handle upgrades |
| MCP server configuration | Already handled by `reviewflow init` / `configureMcp` use case |
| Generating `.mcp.json` in the project | Already handled by `claudeInvoker.ts` at review time |
| Custom agent names during init | Users edit `config.json` after init; wizard stays simple |

## Functional Requirements

### FR-1: Path Validation

The command validates the given path:
1. Path exists and is a directory
2. Path is a git repository (`.git/` directory exists or `git rev-parse --is-inside-work-tree` succeeds)
3. At least one git remote is configured (`git remote get-url origin`)

If validation fails, the command prints a specific error message and exits with code 1.

### FR-2: Server Config Prerequisite

Before proceeding, verify that the server config exists (`~/.claude-review/config.json`). If missing, print:
```
ReviewFlow server is not configured. Run "reviewflow init" first.
```
Exit with code 1.

### FR-3: Interactive Prompts

| Prompt | Type | Default | Values |
|--------|------|---------|--------|
| Language | select | English | English, French |
| Review type | select | Basic | Basic (single-pass), With Agents (multi-agent) |
| Platform confirmation | confirm | auto-detected | Y/n |

Platform auto-detection logic:
- Remote URL contains `github.com` -> `github`
- Remote URL contains `gitlab` -> `gitlab`
- Otherwise -> ask user to choose

### FR-4: Skeleton Skill Generation

Generated files inside the target project:

```
<project-path>/
└── .claude/
    ├── reviews/
    │   └── config.json
    └── skills/
        ├── review-code/
        │   └── SKILL.md          # Main review skill
        └── review-followup/
            └── SKILL.md          # Follow-up skill
```

#### review-code/SKILL.md Structure

The skeleton has two distinct zones:

**Zone 1 -- User rules** (editable): Categorized empty sections with `<!-- ADD YOUR RULES HERE -->` markers and examples as comments.

Categories:
- Architecture & Design
- Code Quality
- Testing
- Security
- Custom Rules

**Zone 2 -- MCP workflow** (do not modify): Pre-wired review workflow with progress markers, inline comment posting, and report publishing. This section uses the same patterns as existing templates in `templates/en/review-basic/SKILL.md` and `templates/en/review-with-agents/SKILL.md`.

For `with-agents` type: Zone 2 includes sequential agent execution blocks with `[PROGRESS:agent-name:started/completed]` markers for each default agent (architecture, testing, code-quality).

#### review-followup/SKILL.md Structure

Pre-wired followup skill based on `templates/en/followup-basic/SKILL.md` pattern. Uses context-file-based thread management (reads `.claude/reviews/logs/{mrId}.json`, writes `THREAD_RESOLVE` / `POST_COMMENT` actions).

### FR-5: Project Config (`config.json`)

Generated at `<project-path>/.claude/reviews/config.json`:

```json
{
  "github": true,
  "gitlab": false,
  "defaultModel": "opus",
  "reviewSkill": "review-code",
  "reviewFollowupSkill": "review-followup",
  "agents": []
}
```

- Platform booleans set based on detected/confirmed platform
- `agents` array populated only for `with-agents` review type with default agents:
  ```json
  [
    { "name": "architecture", "displayName": "Architecture" },
    { "name": "testing", "displayName": "Testing" },
    { "name": "code-quality", "displayName": "Code Quality" }
  ]
  ```
- For `basic` type: `agents` is an empty array

### FR-6: Server Config Registration

Add the project to `~/.claude-review/config.json` repositories array:

```json
{
  "name": "<directory-name>",
  "localPath": "<absolute-path>",
  "enabled": true
}
```

If the project is already registered (matching `localPath`), skip and inform the user.

### FR-7: Summary Output

After generation, display:

```
Created .claude/reviews/config.json
Created .claude/skills/review-code/SKILL.md          <- Add your rules here
Created .claude/skills/review-followup/SKILL.md
Added "<name>" to server config

Next steps:
  1. Open .claude/skills/review-code/SKILL.md and add your review rules
  2. Configure your <Platform> webhook:
     URL: http://YOUR_SERVER:<port>/webhooks/<platform>
     Token: (from your .env <TOKEN_VAR>)
     Events: <event-type>
```

### FR-8: Non-Interactive Mode (`-y` / `--yes`)

Defaults: language=English, type=basic, platform=auto-detected. If platform cannot be auto-detected, exit with error (no interactive fallback in `-y` mode).

## Acceptance Criteria (Gherkin)

### Scenario 1: Nominal -- Basic review setup (EN)

```gherkin
Feature: init-project command

  Scenario: Initialize a project with basic review in English
    Given a git repository at "/path/to/my-app" with a GitHub remote
    And the server config exists at "~/.claude-review/config.json"
    When I run "reviewflow init-project /path/to/my-app"
    And I choose "English" for language
    And I choose "Basic" for review type
    And I confirm the detected platform "GitHub"
    Then ".claude/reviews/config.json" is created at "/path/to/my-app"
    And it contains "github": true and "gitlab": false
    And it contains "reviewSkill": "review-code"
    And it contains "reviewFollowupSkill": "review-followup"
    And it contains an empty "agents" array
    And ".claude/skills/review-code/SKILL.md" is created with English content
    And it contains sections "Architecture & Design", "Code Quality", "Testing", "Security", "Custom Rules"
    And each section contains "<!-- ADD YOUR RULES HERE -->"
    And it contains an "MCP Integration" section marked "do not modify"
    And ".claude/skills/review-followup/SKILL.md" is created
    And "my-app" is added to the server config repositories
    And the webhook URL for GitHub is displayed
```

### Scenario 2: With-agents review setup

```gherkin
  Scenario: Initialize a project with multi-agent review
    Given a git repository at "/path/to/my-api" with a GitLab remote
    And the server config exists
    When I run "reviewflow init-project /path/to/my-api"
    And I choose "English" for language
    And I choose "With Agents" for review type
    And I confirm the detected platform "GitLab"
    Then ".claude/reviews/config.json" contains 3 agents: architecture, testing, code-quality
    And ".claude/skills/review-code/SKILL.md" contains sequential agent execution blocks
    And each agent block has "[PROGRESS:<agent-name>:started]" and "[PROGRESS:<agent-name>:completed]" markers
```

### Scenario 3: French language

```gherkin
  Scenario: Initialize a project in French
    Given a git repository at "/path/to/mon-projet" with a GitLab remote
    And the server config exists
    When I run "reviewflow init-project /path/to/mon-projet"
    And I choose "French" for language
    And I choose "Basic" for review type
    And I confirm the detected platform
    Then ".claude/skills/review-code/SKILL.md" contains French section headers
    And the "<!-- ADD YOUR RULES HERE -->" markers are present (markers stay in English)
    And the MCP workflow section content matches French templates
```

### Scenario 4: Path is not a git repository

```gherkin
  Scenario: Reject non-git directory
    Given a directory at "/tmp/not-a-repo" that is NOT a git repository
    When I run "reviewflow init-project /tmp/not-a-repo"
    Then I see an error message containing "Not a git repository"
    And the exit code is 1
    And no files are created
```

### Scenario 5: Path does not exist

```gherkin
  Scenario: Reject non-existent path
    When I run "reviewflow init-project /does/not/exist"
    Then I see an error message containing "Path does not exist"
    And the exit code is 1
```

### Scenario 6: No git remote configured

```gherkin
  Scenario: Reject git repo without remote
    Given a git repository at "/path/to/local-only" with no remote configured
    When I run "reviewflow init-project /path/to/local-only"
    Then I see an error message containing "No git remote found"
    And the exit code is 1
```

### Scenario 7: Project already configured -- overwrite

```gherkin
  Scenario: Overwrite existing configuration
    Given a git repository at "/path/to/my-app" with a GitHub remote
    And ".claude/reviews/config.json" already exists at "/path/to/my-app"
    And the server config exists
    When I run "reviewflow init-project /path/to/my-app"
    Then I see a warning "Project already configured"
    And I am asked "Overwrite existing configuration?"
    When I confirm overwrite
    Then the existing files are replaced with new skeleton files
```

### Scenario 8: Project already configured -- abort

```gherkin
  Scenario: Abort when project already configured
    Given a git repository at "/path/to/my-app" with a GitHub remote
    And ".claude/reviews/config.json" already exists at "/path/to/my-app"
    And the server config exists
    When I run "reviewflow init-project /path/to/my-app"
    And I choose not to overwrite
    Then no files are modified
    And I see "Init cancelled"
```

### Scenario 9: Server config missing

```gherkin
  Scenario: Reject when server not initialized
    Given a git repository at "/path/to/my-app"
    And the server config does NOT exist at "~/.claude-review/config.json"
    When I run "reviewflow init-project /path/to/my-app"
    Then I see "ReviewFlow server is not configured. Run \"reviewflow init\" first."
    And the exit code is 1
```

### Scenario 10: Non-interactive mode

```gherkin
  Scenario: Non-interactive mode with auto-detected platform
    Given a git repository at "/path/to/my-app" with a GitHub remote
    And the server config exists
    When I run "reviewflow init-project /path/to/my-app -y"
    Then no interactive prompts are shown
    And defaults are used: language=English, type=basic, platform=auto-detected
    And all files are created
    And "my-app" is added to the server config
```

### Scenario 11: Non-interactive mode without detectable platform

```gherkin
  Scenario: Non-interactive mode fails when platform is ambiguous
    Given a git repository at "/path/to/my-app" with a remote "git@custom-host.com:team/my-app.git"
    And the server config exists
    When I run "reviewflow init-project /path/to/my-app -y"
    Then I see an error message containing "Cannot detect platform"
    And the exit code is 1
```

### Scenario 12: Project already registered in server config

```gherkin
  Scenario: Skip registration when project already in server config
    Given a git repository at "/path/to/my-app" with a GitHub remote
    And the server config exists and already contains "/path/to/my-app" in repositories
    When I run "reviewflow init-project /path/to/my-app"
    And I complete the wizard
    Then ".claude/reviews/config.json" and skill files are created
    And no duplicate entry is added to server config
    And I see "Already registered in server config"
```

### Scenario 13: Skeleton skill has correct MCP markers

```gherkin
  Scenario: Generated skill contains all required MCP markers
    Given I run "reviewflow init-project /path/to/repo" and complete the wizard
    When I open ".claude/skills/review-code/SKILL.md"
    Then the file contains "[PHASE:initializing]"
    And the file contains "[PHASE:agents-running]"
    And the file contains "[PHASE:synthesizing]"
    And the file contains "[PHASE:publishing]"
    And the file contains "[PHASE:completed]"
    And the file contains "[REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X]"
```

## Non-Functional Requirements

| NFR | Criteria |
|-----|----------|
| **Execution time** | < 3 seconds (no network calls) |
| **Idempotent registration** | Running twice with same path does not create duplicates in server config |
| **No data loss** | Overwrite prompt protects existing files; `-y` flag does NOT force overwrite of existing project config |

## Technical Design Notes

These are implementation hints, not requirements. The implementer decides architecture.

### New CLI Command

- Add `init-project` to `KNOWN_COMMANDS` in `src/cli/parseCliArgs.ts`
- New `InitProjectArgs` type with fields: `command`, `path` (positional after command), `yes`
- New `executeInitProject()` function in `src/main/cli.ts` following the same dependency injection pattern as `executeInit()`

### Use Cases to Create

| Use Case | Responsibility |
|----------|----------------|
| `validateProjectPath.usecase.ts` | Check path exists, is git repo, has remote |
| `detectPlatform.usecase.ts` | Parse git remote URL to determine github/gitlab |
| `generateSkeletonSkills.usecase.ts` | Create review-code and review-followup SKILL.md files |
| `createProjectConfig.usecase.ts` | Write `.claude/reviews/config.json` in the target project |
| `registerProject.usecase.ts` | Add project to server `~/.claude-review/config.json` (with dedup) |

### Skeleton Templates

Store templates as TypeScript string literals or files in `templates/skeleton/` (EN + FR). The MCP workflow section is identical across languages; only the user-facing rule section headers and examples change.

### Platform Detection

Reuse existing `getGitRemoteUrl()` from `src/main/cli.ts`. Add URL parsing:
- Contains `github.com` -> `github`
- Contains `gitlab` (hostname or path) -> `gitlab`
- Otherwise -> unknown (ask user or fail in `-y` mode)

### Existing Code to Reuse

| Module | Reuse |
|--------|-------|
| `getGitRemoteUrl()` in `src/main/cli.ts` | Git remote detection |
| `AddRepositoriesToConfigUseCase` | Server config registration (with dedup) |
| `@inquirer/prompts` | Interactive prompts (select, confirm) |
| `ansiColors.js` | CLI output formatting |

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `reviewflow init` | Prerequisite | Exists -- server config must be present |
| `templates/en/` and `templates/fr/` | Content source | Exists (SPEC-003 delivered) |
| `@inquirer/prompts` | Interactive prompts | Already installed |
| SPEC-003 (Skill Templates) | Superseded | This spec supersedes SPEC-003 for skeleton generation |

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | No coupling with other pending features. Requires only existing `reviewflow init` prerequisite which is already shipped. | PASS |
| **Negotiable** | Language/type/platform prompts can be adjusted. Skeleton content is negotiable. Default agent list (architecture, testing, code-quality) is negotiable. | PASS |
| **Valuable** | Eliminates the #1 onboarding friction: manual skill setup. Turns a 30-minute error-prone process into a 30-second wizard. | PASS |
| **Estimable** | CLI pattern exists (`executeInit`), templates exist, use cases are well-scoped. Estimate: 2-3 days. | PASS |
| **Small** | 1 new CLI command, 4-5 use cases, 2 template variants x 2 languages. No UI changes, no API changes, no new dependencies. | PASS |
| **Testable** | All 13 scenarios above are concrete test cases. All I/O is injectable via dependencies (same pattern as `executeInit`). | PASS |

## Definition of Done

- [ ] `reviewflow init-project <path>` command is registered and documented in `--help`
- [ ] `parseCliArgs.ts` handles `init-project` command with `path` positional arg and `-y` flag
- [ ] Path validation rejects: non-existent path, non-git directory, no remote, no server config
- [ ] Interactive prompts work: language, review type, platform confirmation
- [ ] Non-interactive mode (`-y`) works with auto-detection defaults
- [ ] Skeleton `review-code/SKILL.md` generated for all 4 variants: EN basic, EN with-agents, FR basic, FR with-agents
- [ ] Skeleton `review-followup/SKILL.md` generated for: EN, FR
- [ ] All generated skills contain required MCP markers (`[PHASE:...]`, `[PROGRESS:...]`, `[REVIEW_STATS:...]`)
- [ ] Skeleton user sections have `<!-- ADD YOUR RULES HERE -->` markers with example comments
- [ ] `.claude/reviews/config.json` created with correct platform booleans and agents array
- [ ] Project registered in server `~/.claude-review/config.json` with dedup check
- [ ] Overwrite protection works (prompt when existing + abort path)
- [ ] Webhook URL and setup instructions displayed after completion
- [ ] Unit tests cover all 13 Gherkin scenarios (Detroit school, state-based, no mocks except I/O)
- [ ] `yarn verify` passes (typecheck + lint + tests)
- [ ] No `as Type` assertions, no `any`, no relative imports

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Skeleton MCP section becomes outdated as MCP protocol evolves | Generated skills break silently | Keep MCP section in a single template source; version it; `reviewflow validate` could check skill structure in a future iteration |
| Users forget to fill in rule sections | Reviews run with zero custom rules, producing generic output | Clear `<!-- ADD YOUR RULES HERE -->` markers + summary output reminds them; consider a warning at review time in a future iteration |
| Path edge cases (symlinks, nested git repos, monorepos) | Command fails or picks wrong root | Resolve with `realpathSync`; document monorepo limitation; test with symlink scenario in v2 |
| `init-project` run before `init` | Confusing error for brand-new users | FR-2 handles this with a clear message pointing to `reviewflow init` |
