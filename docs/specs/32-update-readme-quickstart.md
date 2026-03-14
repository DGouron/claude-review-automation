---
title: "SPEC-032: Update README and Quick-Start for npm install Flow"
issue: https://github.com/DGouron/review-flow/issues/32
labels: documentation, dx
milestone: Setup Wizard
status: READY
blocked_by: "#30 (init-project), #55 (config validation)"
---

# SPEC-032: Update README and Quick-Start for `npm install -g reviewflow` Flow

## Problem Statement

The issue was opened when the README and quick-start still described a `git clone` + `yarn install` contributor flow as the primary onboarding path. Since then, both documents have been updated to show `npm install -g reviewflow` as the hero command. However, three gaps remain:

1. **Missing `init-project` step** -- The Quick Start shows `init -> start` but skips `init-project`, which is the step where a user actually wires a specific repository for reviews. Without it, a new user runs `reviewflow start` and has no configured projects to review.

2. **Incomplete CLI reference table** -- The README CLI table lists 6 commands but omits `discover` and the future `init-project`. There is no dedicated CLI reference page in the docs site.

3. **No `docs/reference/cli.md`** -- Every command's full flag list, defaults, and usage examples live only in `--help` output. There is no browsable web reference.

### Why this matters

A developer who runs `npm install -g reviewflow && reviewflow init && reviewflow start` today gets a running server with zero configured projects. The 4-step flow (`install -> init -> init-project -> start`) closes this gap and makes the "time to first review" path self-evident.

## User Story

**As** a developer discovering ReviewFlow for the first time,
**I want** the README and Quick Start to show a clear 4-step flow (`npm install -g reviewflow` -> `reviewflow init` -> `reviewflow init-project <path>` -> `reviewflow start`),
**So that** I can go from zero to my first AI review in under 5 minutes without reading architecture docs.

### Persona

**Alex** -- Full-stack developer, 4 years experience. Found ReviewFlow on GitHub. Wants to set it up on their team's repo during a lunch break. Reads the README for 30 seconds, follows the Quick Start, expects it to work. Will not read architecture or MCP docs before getting started.

## Preconditions

- Issue #30 (`reviewflow init-project`) is implemented and merged
- Issue #55 (`reviewflow validate`) is implemented and merged (or at minimum, `validate` is already functional in CLI -- verified it is)
- All CLI commands referenced in the spec exist and are testable

## Scope

### In Scope

| # | Deliverable | Description |
|---|-------------|-------------|
| 1 | **README.md -- Quick Start section** | Update to 4-step flow: install -> init -> init-project -> start. Add `init-project` step between init and start. |
| 2 | **README.md -- CLI reference table** | Add `init-project`, `discover`, `followup-importants` to the table. Add a link to the full CLI reference page. |
| 3 | **docs/guide/quick-start.md** | Add `reviewflow init-project` step between init and start. Update flow to 5 steps (install -> init -> init-project -> webhook -> start). |
| 4 | **docs/reference/cli.md** (new) | Full CLI reference: every command, every flag, defaults, usage examples, exit codes. |
| 5 | **docs/.vitepress/config sidebar** | Add `cli.md` entry to the Reference section in the VitePress sidebar. |

### Out of Scope

| Item | Reason |
|------|--------|
| Translating docs to French | Documentation language is English per project rules |
| Video tutorials or animated GIFs | Separate effort; not needed for text-based docs |
| Architecture documentation updates | Unrelated scope; own issue if needed |
| Updating `--help` output in `cli.ts` | Already accurate; `--help` is the source, docs reflect it |
| Documenting MCP tools or review skills | Already have dedicated pages (`reference/mcp-tools`, `guide/review-skills`) |
| Writing content for `init-project` that doesn't exist yet | Blocked by #30; this spec documents what to write once it ships |

## Functional Requirements

### FR-1: README Quick Start -- 4-Step Flow

The Quick Start section of `README.md` must present exactly 4 numbered steps:

```
### 1. Install
npm install -g reviewflow

### 2. Initialize
reviewflow init

### 3. Set up a project
reviewflow init-project /path/to/my-repo

### 4. Start
reviewflow start
```

- Step 1 keeps the existing `npm install -g reviewflow` command
- Step 2 keeps the existing `reviewflow init` description (interactive wizard)
- Step 3 is new: explains `init-project` generates review skills and wires the project
- Step 4 keeps the existing `reviewflow start` with dashboard URL
- The `reviewflow validate` mention stays after step 4 as a verification step
- The "configure webhook" instruction moves into step 3's output (since `init-project` displays it)

### FR-2: README CLI Reference Table -- Complete

The CLI reference table must list all user-facing commands:

| Command | Description |
|---------|-------------|
| `reviewflow init` | Interactive setup wizard |
| `reviewflow init-project <path>` | Set up a repository for reviews |
| `reviewflow start` | Start the review server |
| `reviewflow stop` | Stop the running daemon |
| `reviewflow status` | Show server status |
| `reviewflow logs` | Show daemon logs |
| `reviewflow validate` | Validate configuration |
| `reviewflow discover` | Scan and add repositories |

The `followup-importants` command is an advanced/internal command and may be omitted from the README table but must appear in `docs/reference/cli.md`.

A link to the full CLI reference (`docs/reference/cli.md`) must follow the table.

### FR-3: Quick-Start Guide -- Add init-project Step

`docs/guide/quick-start.md` must add a new section between "2. Initialize" and the current "3. Configure webhook":

- Section title: "3. Set up your first project"
- Shows `reviewflow init-project /path/to/my-repo`
- Explains the wizard asks for language, review type, and platform
- Mentions that webhook URL is displayed at the end
- The webhook configuration section becomes step 4
- Start & verify becomes step 5

### FR-4: CLI Reference Page -- Complete Documentation

Create `docs/reference/cli.md` with:

1. **Global options**: `--version`, `--help`
2. **Each command** as a subsection with:
   - Synopsis: `reviewflow <command> [flags]`
   - Description (1-2 sentences)
   - Flags table: flag, short form, type, default, description
   - Example usage (1-2 examples per command)
   - Exit codes (0 = success, 1 = error, with specifics)
3. **Commands to document**: `init`, `init-project`, `start`, `stop`, `status`, `logs`, `validate`, `discover`, `followup-importants`

Source of truth for flags: `src/cli/parseCliArgs.ts` and `printHelp()` in `src/main/cli.ts`.

### FR-5: VitePress Sidebar Update

Add `cli.md` to the VitePress sidebar config under the "Reference" group, between "Configuration" and "MCP Tools".

## Acceptance Criteria (Gherkin)

### Scenario 1: New user reads README Quick Start

```gherkin
Feature: README Quick Start reflects npm install flow

  Scenario: README shows 4-step flow with init-project
    Given I open README.md
    When I read the "Quick Start" section
    Then I see 4 numbered steps
    And step 1 is "Install" with "npm install -g reviewflow"
    And step 2 is "Initialize" with "reviewflow init"
    And step 3 is "Set up a project" with "reviewflow init-project"
    And step 4 is "Start" with "reviewflow start"
    And I do not see "git clone" in the Quick Start section
    And I do not see "yarn install" in the Quick Start section
```

### Scenario 2: README CLI table is complete

```gherkin
  Scenario: CLI reference table lists all commands
    Given I open README.md
    When I read the "CLI Reference" section
    Then the table contains "reviewflow init"
    And the table contains "reviewflow init-project <path>"
    And the table contains "reviewflow start"
    And the table contains "reviewflow stop"
    And the table contains "reviewflow status"
    And the table contains "reviewflow logs"
    And the table contains "reviewflow validate"
    And the table contains "reviewflow discover"
    And a link to the full CLI reference page follows the table
```

### Scenario 3: Quick-Start guide includes init-project step

```gherkin
  Scenario: Quick-Start guide has init-project between init and webhook
    Given I open docs/guide/quick-start.md
    When I read the numbered steps
    Then "Set up your first project" appears after "Initialize"
    And "Set up your first project" appears before "Configure webhook"
    And it shows the command "reviewflow init-project /path/to/my-repo"
    And it mentions the wizard prompts for language and review type
```

### Scenario 4: CLI reference page documents every command

```gherkin
  Scenario: CLI reference has all commands with flags
    Given I open docs/reference/cli.md
    When I look for the "init" command section
    Then I see flags: --yes, --skip-mcp, --show-secrets, --scan-path
    And each flag has a description and default value

    When I look for the "start" command section
    Then I see flags: --daemon, --port, --open, --skip-dependency-check
    And each flag has a description and default value

    When I look for the "init-project" command section
    Then I see the path positional argument documented
    And I see the --yes flag documented
```

### Scenario 5: CLI reference page is in VitePress sidebar

```gherkin
  Scenario: Sidebar includes CLI reference link
    Given I open the VitePress config
    When I look at the "Reference" sidebar group
    Then "CLI Reference" appears as an entry
    And it links to "/reference/cli"
```

### Scenario 6: No stale git-clone instructions in user-facing docs

```gherkin
  Scenario: git clone is only in contributor section
    Given I open README.md
    When I search for "git clone"
    Then it appears only in the "Development" section
    And it does NOT appear in "Quick Start" or "CLI Reference"

    Given I open docs/guide/quick-start.md
    When I search for "git clone"
    Then it appears only in the "As a contributor" subsection
    And it does NOT appear in the primary install flow
```

### Scenario 7: Contributor flow is preserved

```gherkin
  Scenario: README still has contributor/development section
    Given I open README.md
    When I read the "Development" section
    Then it shows "npm run dev", "npm test", "npm run verify"
    And it links to CONTRIBUTING.md
```

## Non-Functional Requirements

| NFR | Criteria |
|-----|----------|
| **Consistency** | All command names and flags match `--help` output exactly |
| **Accuracy** | Every flag's default value matches `parseCliArgs.ts` |
| **VitePress build** | `yarn docs:build` succeeds with the new page |
| **No broken links** | All internal doc links resolve correctly |

## Technical Notes

These are implementation hints, not requirements.

### Files to modify

| File | Change |
|------|--------|
| `README.md` | Update Quick Start (add step 3), update CLI table |
| `docs/guide/quick-start.md` | Add init-project step, renumber subsequent steps |
| `docs/reference/cli.md` | Create from scratch |
| `docs/.vitepress/config.ts` (or `.mts`) | Add sidebar entry |

### Content sources

- **Flag definitions**: `src/cli/parseCliArgs.ts` (lines 25-58 for types, lines 60-191 for parsing)
- **Help text**: `printHelp()` in `src/main/cli.ts` (lines 44-96)
- **Existing README**: Already has most of the structure; changes are surgical

### Writing guidelines

- Documentation language is English (per project rules)
- Self-documenting: command names and flags should be self-explanatory
- Each example should be copy-pasteable
- Use VitePress `::: tip` / `::: info` blocks for callouts

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| #29 (`reviewflow init`) | Prerequisite | CLOSED -- shipped |
| #30 (`reviewflow init-project`) | **Blocker** | OPEN -- must ship before this issue |
| #53 (repository discovery) | Prerequisite | CLOSED -- shipped |
| #55 (config validation) | Soft blocker | OPEN -- `validate` command exists in code but issue is open |

**Implementation order**: This issue should be done LAST in the Setup Wizard milestone, after #30 and #55 are merged.

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | Depends on #30 (init-project) being merged first. Cannot start the init-project documentation until the command exists. All other content (CLI reference, discover docs) can be written independently. | PASS (with dependency noted) |
| **Negotiable** | The exact wording, number of examples, and level of detail in CLI reference are negotiable. The 4-step flow structure is fixed by the issue requirements. | PASS |
| **Valuable** | Directly improves first-time user experience. A developer reading the README should understand the full setup path in 30 seconds. The CLI reference eliminates the need to run `--help` for every command. | PASS |
| **Estimable** | Pure documentation work: 3 file edits + 1 new file + 1 sidebar config. Estimate: 2-4 hours. | PASS |
| **Small** | No production code changes. 5 files touched, all documentation. Single commit. | PASS |
| **Testable** | All 7 Gherkin scenarios are verifiable by reading the resulting files. VitePress build success is a mechanical check. | PASS |

## Definition of Done

- [ ] `README.md` Quick Start shows 4-step flow: install -> init -> init-project -> start
- [ ] `README.md` CLI reference table includes all 8 user-facing commands
- [ ] `README.md` CLI reference table links to full CLI reference page
- [ ] `README.md` does not show `git clone` in Quick Start (only in Development section)
- [ ] `docs/guide/quick-start.md` includes `reviewflow init-project` step between init and webhook
- [ ] `docs/guide/quick-start.md` renumbers steps correctly (5 steps total)
- [ ] `docs/reference/cli.md` created with all 9 commands documented
- [ ] `docs/reference/cli.md` documents every flag with short form, type, default, and description
- [ ] `docs/reference/cli.md` includes at least 1 usage example per command
- [ ] VitePress sidebar config includes CLI Reference entry in Reference group
- [ ] `yarn docs:build` succeeds
- [ ] All internal links resolve (no broken links)
- [ ] Flag names and defaults match `parseCliArgs.ts` and `printHelp()` exactly
- [ ] No `git clone` or `yarn install` in user-facing getting-started flow (contributor section only)
