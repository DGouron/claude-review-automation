---
title: "SPEC-055: reviewflow validate — Configuration Validation Command"
issue: https://github.com/DGouron/review-flow/issues/55
labels: enhancement, cli, P2-important
milestone: Setup Wizard
blocked-by: "#29 (closed)"
status: DRAFT
---

# SPEC-055: `reviewflow validate` — Configuration Validation Command

## Problem Statement

After running `reviewflow init`, a developer's configuration can silently drift into an invalid state: repository paths get moved or deleted, `.env` secrets remain placeholder values, queue settings become nonsensical, or the per-project `.claude/reviews/config.json` is malformed. Today, these problems surface only at runtime -- when a webhook arrives and the review pipeline fails. There is no proactive way to verify the entire configuration stack is healthy.

The existing `ValidateConfigUseCase` covers basic structural checks (JSON parsing, required sections, port range, path existence, `.env` file presence), but leaves significant gaps:

1. **`.env` content is never inspected** -- only file existence is checked, not whether secrets are valid or still placeholder values
2. **Git remotes are not verified** -- a repository path may exist but have no `origin` remote (or the remote may be unreachable)
3. **Per-project review config is not validated** -- `.claude/reviews/config.json` inside each repository is not checked
4. **No Zod schema validation** -- the use case manually checks fields instead of using Zod (the project standard for validation)
5. **`--fix` flag is a no-op** -- the flag is parsed but no auto-fix logic exists
6. **External dependencies are not checked** -- Claude CLI, glab, gh availability is not part of validation
7. **No summary or actionable guidance** -- errors are listed but there is no remediation advice

## User Story

**As** a developer who has configured ReviewFlow,
**I want** `reviewflow validate` to perform a comprehensive health check of my entire configuration (config.json, .env secrets, repository paths, git remotes, per-project configs, and external dependencies),
**So that** I can detect and fix configuration problems before they cause runtime failures.

### Persona

**Alex** -- Senior developer who set up ReviewFlow 3 months ago. Has since reorganized project directories, added new repositories, and upgraded Claude CLI. Runs `reviewflow validate` before deploying a new webhook integration to confirm everything is still wired correctly.

## Scope

### In Scope

| # | Capability | Description |
|---|------------|-------------|
| 1 | **config.json Zod schema validation** | Replace manual field checks with a Zod schema. Report all schema violations with field paths. |
| 2 | **`.env` content validation** | Read `.env` file, verify `GITLAB_WEBHOOK_TOKEN` and `GITHUB_WEBHOOK_SECRET` exist, detect placeholder values (e.g., `your_gitlab_webhook_token_here`). |
| 3 | **Repository path accessibility** | For each repository entry, verify `localPath` exists and is a directory. |
| 4 | **Git remote verification** | For each accessible repository, verify `git remote get-url origin` succeeds and returns a URL. |
| 5 | **Per-project review config check** | For each accessible repository, check that `.claude/reviews/config.json` exists and contains required fields (`github`/`gitlab`, `defaultModel`, `reviewSkill`, `reviewFollowupSkill`). |
| 6 | **External dependency check** | Verify Claude CLI, glab, and gh are installed (reuse `dependencyChecker.ts`). Report missing ones as warnings (not errors -- the user may only use one platform). |
| 7 | **`--fix` auto-correction for fixable issues** | Auto-create missing `.env` with generated secrets. Auto-create missing queue section with defaults. |
| 8 | **Actionable error messages** | Each reported issue includes a remediation hint. |
| 9 | **Summary output** | Display a final summary: total checks, errors, warnings, and overall status (PASS / FAIL). |

### Out of Scope

| Item | Reason |
|------|--------|
| Network reachability of git remotes (`git ls-remote`) | Too slow for a local validation command; would require network access and credentials. Local `git remote get-url origin` is sufficient. |
| Webhook endpoint reachability (can GitLab/GitHub reach the server?) | Requires running the server and external network checks. Separate concern. |
| MCP server configuration validation | MCP config is in `~/.claude/settings.json` which belongs to Claude, not ReviewFlow. Separate tooling scope. |
| Port availability check (is the configured port free?) | Only relevant at `start` time, not at validation time. |
| `--fix` for all issue types | Only implement auto-fix for clearly safe, non-destructive corrections (missing `.env`, missing queue defaults). Fixing repository paths or git remotes requires user judgment. |
| Interactive fix mode (prompting user per issue) | Keep `--fix` non-interactive. Interactive repair is a future enhancement. |
| JSON output (`--json`) | Not requested in the issue. Can be added later if needed for CI integration. |

## Functional Requirements

### FR-1: Config File Resolution

The command resolves the config file using the same priority as the existing implementation:

1. `config.json` in the current working directory (if exists)
2. `config.json` in the XDG config directory (`~/.config/reviewflow/config.json`)

Same resolution for `.env`.

### FR-2: config.json Schema Validation with Zod

Define a Zod schema for `config.json` that validates:

| Field | Rule |
|-------|------|
| `server` | Required object |
| `server.port` | Required number, 1-65535 |
| `user` | Required object |
| `user.gitlabUsername` | Required string (can be empty) |
| `user.githubUsername` | Required string (can be empty) |
| `queue` | Required object |
| `queue.maxConcurrent` | Required number, >= 1 |
| `queue.deduplicationWindowMs` | Required number, >= 0 |
| `repositories` | Required array |
| `repositories[].name` | Required non-empty string |
| `repositories[].localPath` | Required non-empty string |
| `repositories[].enabled` | Required boolean |

On schema failure, each Zod issue is mapped to a `ValidationIssue` with `field` = Zod path, `message` = Zod message, `severity` = `'error'`.

### FR-3: .env Content Validation

Read the `.env` file and check:

| Check | Severity | Message |
|-------|----------|---------|
| File does not exist | error | `Missing .env file. Run 'reviewflow init' to create one.` |
| `GITLAB_WEBHOOK_TOKEN` missing or empty | error | `Missing GITLAB_WEBHOOK_TOKEN in .env.` |
| `GITHUB_WEBHOOK_SECRET` missing or empty | error | `Missing GITHUB_WEBHOOK_SECRET in .env.` |
| `GITLAB_WEBHOOK_TOKEN` is a placeholder value | warning | `GITLAB_WEBHOOK_TOKEN appears to be a placeholder. Run 'reviewflow init' to generate a real secret.` |
| `GITHUB_WEBHOOK_SECRET` is a placeholder value | warning | `GITHUB_WEBHOOK_SECRET appears to be a placeholder. Run 'reviewflow init' to generate a real secret.` |

**Placeholder detection**: a value is considered a placeholder if it contains `your_`, `_here`, `example`, `changeme`, or is not a valid 64-character hexadecimal string.

### FR-4: Repository Path Verification

For each repository entry in `config.json`:

| Check | Severity | Message |
|-------|----------|---------|
| `localPath` does not exist | error | `Repository '<name>': path does not exist: <path>` |
| `localPath` exists but is not a directory | error | `Repository '<name>': path is not a directory: <path>` |
| Repository is disabled (`enabled: false`) | -- | Skip all further checks for this repository |

### FR-5: Git Remote Verification

For each repository where the path exists:

| Check | Severity | Message |
|-------|----------|---------|
| No `.git` directory | warning | `Repository '<name>': not a git repository at <path>` |
| `git remote get-url origin` fails | warning | `Repository '<name>': no 'origin' remote configured` |

Severity is `warning` (not error) because a repository could be valid without a remote (local-only workflow).

### FR-6: Per-Project Review Config Validation

For each accessible repository, check `.claude/reviews/config.json`:

| Check | Severity | Message |
|-------|----------|---------|
| File does not exist | warning | `Repository '<name>': missing .claude/reviews/config.json. Run 'reviewflow init-project' to create one.` |
| File exists but is not valid JSON | error | `Repository '<name>': .claude/reviews/config.json is not valid JSON` |
| Missing required field | error | `Repository '<name>': .claude/reviews/config.json missing field '<field>'` |

Required fields: `github`, `gitlab`, `defaultModel`, `reviewSkill`, `reviewFollowupSkill`.

### FR-7: External Dependency Check

Reuse `checkDependency()` from `src/shared/services/dependencyChecker.ts`:

| Check | Severity | Message |
|-------|----------|---------|
| Claude CLI not installed | warning | `Claude CLI not found. Install: https://docs.anthropic.com/en/docs/claude-code/overview` |
| glab not installed | warning | `GitLab CLI (glab) not found. Install: https://gitlab.com/gitlab-org/cli#installation` |
| gh not installed | warning | `GitHub CLI (gh) not found. Install: https://cli.github.com/` |

All are warnings because the user may only use one platform.

### FR-8: --fix Auto-Correction

When `--fix` is passed, attempt to fix these issues **before** reporting:

| Fixable Issue | Fix Action | Report |
|---------------|------------|--------|
| Missing `.env` file | Generate secrets, write `.env` with `GITLAB_WEBHOOK_TOKEN` and `GITHUB_WEBHOOK_SECRET` | `FIXED: Created .env with generated webhook secrets` |
| Missing `queue` section in config.json | Add `{ "maxConcurrent": 2, "deduplicationWindowMs": 300000 }` | `FIXED: Added default queue configuration` |
| Placeholder secrets in `.env` | Replace with newly generated secrets | `FIXED: Replaced placeholder secrets with generated values` |

After applying fixes, re-run validation to show remaining (unfixable) issues.

### FR-9: Output Format

```
Validating ReviewFlow configuration...

  Config: /home/user/.config/reviewflow/config.json
  Env:    /home/user/.config/reviewflow/.env

Checks:
  [PASS] config.json schema
  [PASS] .env secrets
  [PASS] Repository "my-app" path exists
  [WARN] Repository "my-app": no .claude/reviews/config.json
  [PASS] Repository "my-api" path exists
  [PASS] Repository "my-api" git remote
  [PASS] Repository "my-api" review config
  [FAIL] Repository "old-project": path does not exist: /old/path
  [PASS] Claude CLI installed
  [WARN] GitLab CLI (glab) not found

Summary: 6 passed, 2 warnings, 1 error
Status: FAIL
```

Exit code: `0` if no errors (warnings are OK), `1` if any errors.

## Acceptance Criteria (Gherkin)

### Feature: Configuration Schema Validation

```gherkin
Feature: config.json schema validation

  Scenario: Valid configuration passes schema check
    Given a config.json with valid server, user, queue, and repositories sections
    When I run "reviewflow validate"
    Then the schema check passes
    And no schema-related issues are reported

  Scenario: Missing required section
    Given a config.json without the "user" section
    When I run "reviewflow validate"
    Then an error is reported for "user": "Required"
    And the validation status is FAIL

  Scenario: Invalid port value
    Given a config.json with server.port set to 99999
    When I run "reviewflow validate"
    Then an error is reported for "server.port"
    And the message indicates the port must be between 1 and 65535

  Scenario: Invalid JSON file
    Given a config.json containing malformed JSON
    When I run "reviewflow validate"
    Then an error is reported: "Invalid JSON format"
    And no further checks are performed

  Scenario: config.json not found
    Given no config.json exists in CWD or XDG config directory
    When I run "reviewflow validate"
    Then the output shows "No configuration found."
    And suggests running "reviewflow init"
    And the exit code is 1
```

### Feature: Environment Variable Validation

```gherkin
Feature: .env content validation

  Scenario: Valid .env with real secrets
    Given a .env file with a 64-character hex GITLAB_WEBHOOK_TOKEN
    And a 64-character hex GITHUB_WEBHOOK_SECRET
    When I run "reviewflow validate"
    Then no .env-related issues are reported

  Scenario: Missing .env file
    Given no .env file exists
    When I run "reviewflow validate"
    Then an error is reported: "Missing .env file"
    And the message suggests running "reviewflow init"

  Scenario: .env contains placeholder secrets
    Given a .env file with GITLAB_WEBHOOK_TOKEN="your_gitlab_webhook_token_here"
    When I run "reviewflow validate"
    Then a warning is reported for GITLAB_WEBHOOK_TOKEN
    And the message mentions it appears to be a placeholder

  Scenario: .env is missing one secret variable
    Given a .env file with GITLAB_WEBHOOK_TOKEN set
    And GITHUB_WEBHOOK_SECRET is not present
    When I run "reviewflow validate"
    Then an error is reported for the missing GITHUB_WEBHOOK_SECRET
```

### Feature: Repository Path Verification

```gherkin
Feature: Repository path validation

  Scenario: All repository paths exist
    Given a config.json with 2 repositories pointing to existing directories
    When I run "reviewflow validate"
    Then both repository path checks pass

  Scenario: Repository path does not exist
    Given a config.json with a repository "old-project" at "/nonexistent/path"
    When I run "reviewflow validate"
    Then an error is reported: "Repository 'old-project': path does not exist"

  Scenario: Disabled repository is skipped
    Given a config.json with a disabled repository pointing to a nonexistent path
    When I run "reviewflow validate"
    Then no error is reported for the disabled repository
```

### Feature: Git Remote Verification

```gherkin
Feature: Git remote validation

  Scenario: Repository has a valid origin remote
    Given a repository at a valid path with an "origin" remote configured
    When I run "reviewflow validate"
    Then the git remote check passes for that repository

  Scenario: Repository has no origin remote
    Given a repository at a valid path without an "origin" remote
    When I run "reviewflow validate"
    Then a warning is reported: "no 'origin' remote configured"

  Scenario: Path exists but is not a git repository
    Given a repository path pointing to a directory without .git
    When I run "reviewflow validate"
    Then a warning is reported: "not a git repository"
```

### Feature: Per-Project Review Config Validation

```gherkin
Feature: Per-project review configuration validation

  Scenario: Project has valid review config
    Given a repository with a valid .claude/reviews/config.json
    And the file contains github, gitlab, defaultModel, reviewSkill, reviewFollowupSkill
    When I run "reviewflow validate"
    Then the project config check passes

  Scenario: Project is missing review config
    Given a repository without .claude/reviews/config.json
    When I run "reviewflow validate"
    Then a warning is reported suggesting "reviewflow init-project"

  Scenario: Project review config is missing required fields
    Given a repository with .claude/reviews/config.json missing "reviewSkill"
    When I run "reviewflow validate"
    Then an error is reported for the missing field
```

### Feature: External Dependency Check

```gherkin
Feature: External dependency validation

  Scenario: All dependencies installed
    Given Claude CLI, glab, and gh are installed
    When I run "reviewflow validate"
    Then all dependency checks pass

  Scenario: Claude CLI not installed
    Given Claude CLI is not available on PATH
    When I run "reviewflow validate"
    Then a warning is reported with the install URL
    And the overall status can still be PASS (warning only)
```

### Feature: Auto-Fix

```gherkin
Feature: Auto-fix correctable issues

  Scenario: Fix missing .env file
    Given no .env file exists
    And config.json is valid
    When I run "reviewflow validate --fix"
    Then a .env file is created with generated secrets
    And the output shows "FIXED: Created .env with generated webhook secrets"
    And subsequent validation shows no .env error

  Scenario: Fix placeholder secrets
    Given a .env file with placeholder values
    When I run "reviewflow validate --fix"
    Then the placeholders are replaced with generated 64-char hex secrets
    And the output shows "FIXED: Replaced placeholder secrets with generated values"

  Scenario: Fix without --fix flag
    Given a .env file with placeholder values
    When I run "reviewflow validate" without --fix
    Then the placeholders are reported as warnings
    And no modification is made

  Scenario: Unfixable issues remain after fix
    Given a config.json with a repository pointing to a nonexistent path
    When I run "reviewflow validate --fix"
    Then the path error is still reported
    And the output shows no "FIXED" message for it
```

### Feature: Summary Output

```gherkin
Feature: Validation summary

  Scenario: All checks pass
    Given a fully valid configuration
    When I run "reviewflow validate"
    Then the summary shows "0 errors, 0 warnings"
    And the status is "PASS"
    And the exit code is 0

  Scenario: Warnings only
    Given a valid configuration but glab is not installed
    When I run "reviewflow validate"
    Then the summary shows "0 errors, 1 warning"
    And the status is "PASS"
    And the exit code is 0

  Scenario: Errors present
    Given a config.json with an invalid port
    When I run "reviewflow validate"
    Then the summary shows at least 1 error
    And the status is "FAIL"
    And the exit code is 1
```

## INVEST Validation

| Criterion | Assessment | Status |
|-----------|------------|--------|
| **Independent** | Depends only on existing config file conventions and `dependencyChecker.ts`. Blocker #29 (init wizard) is closed. No dependency on unbuilt features. | PASS |
| **Negotiable** | Output format (table vs. flat list), severity levels for specific checks (error vs. warning for missing review config), which issues are auto-fixable -- all negotiable without changing the core value. | PASS |
| **Valuable** | Prevents silent configuration drift from causing runtime failures. Gives developers confidence before deploying webhook integrations. The only way to verify config health today is to start the server and trigger a webhook. | PASS |
| **Estimable** | Existing `ValidateConfigUseCase` provides the skeleton. `dependencyChecker.ts` is reusable. Zod schema is straightforward. Estimate: 2-3 days. | PASS |
| **Small** | Extends 1 existing use case, touches 2-3 files (`validateConfig.usecase.ts`, `cli.ts`, Zod schema). No new dependencies (Zod is already installed). No architecture changes. | PASS |
| **Testable** | All 21 Gherkin scenarios above are deterministic. All I/O (filesystem, git commands, CLI dependency checks) is injectable via the existing `ValidateConfigDependencies` interface (which will be extended). | PASS |

## Definition of Done

### Use Case Layer

- [ ] Zod schema defined for `config.json` structure (in `src/entities/` or co-located with the use case)
- [ ] `ValidateConfigUseCase` refactored to use Zod schema for structural validation
- [ ] `.env` content validation: read file, check `GITLAB_WEBHOOK_TOKEN` and `GITHUB_WEBHOOK_SECRET` presence and placeholder detection
- [ ] Repository path existence check (existing, enhanced with directory check)
- [ ] Git remote verification via injectable `getGitRemoteUrl` dependency
- [ ] Per-project `.claude/reviews/config.json` validation with required field check
- [ ] External dependency check via injectable `checkDependency` dependency
- [ ] `--fix` logic: create missing `.env`, replace placeholder secrets, add missing queue defaults
- [ ] All validation results returned as `ValidationIssue[]` with field, message, severity, and optional `fixed` flag

### CLI Layer

- [ ] `executeValidate()` in `cli.ts` updated to display check-by-check output with PASS/WARN/FAIL indicators
- [ ] Summary line with counts (passed, warnings, errors)
- [ ] Exit code 0 on success (warnings OK), 1 on errors

### Testing

- [ ] Unit tests for all 21 Gherkin scenarios (Detroit school, state-based)
- [ ] Tests for Zod schema validation (valid config, each missing field, each invalid value)
- [ ] Tests for `.env` parsing (valid secrets, missing variables, placeholder detection)
- [ ] Tests for `--fix` behavior (creates `.env`, replaces placeholders, leaves unfixable issues)
- [ ] Tests use factories, never hardcoded data
- [ ] All tests in English

### Quality

- [ ] `yarn verify` passes (typecheck + lint + test:ci)
- [ ] No `as Type` assertions, no `any`, no relative imports
- [ ] All imports use `@/` alias with `.js` extension
- [ ] No new dependencies added (Zod is already in the project)

## Technical Notes

### Files to Modify

| File | Change |
|------|--------|
| `src/usecases/cli/validateConfig.usecase.ts` | Extend `ValidateConfigDependencies` with `getGitRemoteUrl`, `checkDependency`, `readProjectConfig`. Replace manual checks with Zod schema. Add `.env` content parsing, git remote checks, project config checks, dependency checks, `--fix` logic. |
| `src/main/cli.ts` | Update `executeValidate()` to wire new dependencies and display enhanced output with check-by-check results and summary. |
| `src/tests/units/usecases/cli/validateConfig.usecase.test.ts` | Extend with tests covering all new validation categories. |

### New Files (if needed)

| File | Purpose |
|------|---------|
| `src/entities/config/config.schema.ts` | Zod schema for `config.json` structure. Provides `ConfigSchema` and `type Config = z.infer<typeof ConfigSchema>`. |

### Dependencies Interface Extension

```typescript
export interface ValidateConfigDependencies {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  isDirectory: (path: string) => boolean;
  getGitRemoteUrl: (localPath: string) => string | null;
  checkDependency: (dep: { name: string; command: string }) => boolean;
  generateWebhookSecret: () => string;
  writeFileSync: (path: string, content: string) => void;
}
```

### Input Extension

```typescript
export interface ValidateConfigInput {
  configPath: string;
  envPath: string;
  fix: boolean;
}
```

### Existing Code to Reuse

| Module | Usage |
|--------|-------|
| `src/shared/services/dependencyChecker.ts` | `checkDependency()` for Claude CLI, glab, gh |
| `src/shared/services/secretGenerator.ts` | `generateWebhookSecret()`, `isValidSecret()` for `.env` fix and placeholder detection |
| `src/config/projectConfig.ts` | `loadProjectConfig()` pattern for per-project config validation |
| `src/shared/services/configDir.ts` | `getConfigDir()` for resolving config paths |

### Placeholder Detection Logic

A secret value is considered a placeholder if any of these conditions are true:
- Contains the substring `your_` (case-insensitive)
- Contains the substring `_here` (case-insensitive)
- Contains the substring `example` (case-insensitive)
- Contains the substring `changeme` (case-insensitive)
- Is not a valid 64-character hexadecimal string (using `isValidSecret()` from `secretGenerator.ts`)

### Validation Execution Order

1. Resolve config and env file paths
2. Check config.json existence (abort early if not found)
3. Parse JSON (abort early if malformed)
4. Validate against Zod schema
5. If `--fix`, apply fixable corrections now
6. Validate `.env` content
7. For each enabled repository:
   a. Check path exists and is directory
   b. Check git remote
   c. Check per-project review config
8. Check external dependencies
9. Aggregate results and display summary
