---
title: "SPEC-052: Automated Webhook Secret Generation"
status: in-progress
issue: "#52"
blocked-by: "#29 (closed)"
milestone: "Setup Wizard"
---

# SPEC-052: Automated Webhook Secret Generation

## User Story

As a developer installing ReviewFlow for the first time,
I want `reviewflow init` to automatically generate cryptographically secure webhook secrets,
so I can configure my GitLab/GitHub webhooks without manually generating tokens and without risking weak secrets.

## Context

### Problem

Webhook secrets authenticate incoming webhook requests from GitLab/GitHub. Without them, anyone who knows the server URL could forge fake webhook events and trigger unauthorized reviews. Manually generating secrets is error-prone: developers copy placeholder values, use weak strings, or skip the step entirely.

### How it works today

The `reviewflow init` wizard generates secrets and writes them to configuration files. The server reads these secrets at startup and uses them to verify every incoming webhook request.

**Generation flow** (`src/main/cli.ts` -> `executeInit`):
1. `generateWebhookSecret()` is called twice (one per platform)
2. Secrets are displayed masked or in full depending on `--show-secrets`
3. `writeConfig()` writes both `config.json` and `.env`

**Runtime verification** (`src/security/verifier.ts`):
- GitLab: secret compared via timing-safe equality against `X-Gitlab-Token` header
- GitHub: HMAC-SHA256 computed over request body, compared against `X-Hub-Signature-256` header

**Secret storage**: `.env` file in the XDG config directory (`~/.config/reviewflow/.env`) with two variables: `GITLAB_WEBHOOK_TOKEN` and `GITHUB_WEBHOOK_SECRET`.

### Implementation status

| Acceptance Criterion (from issue) | Status | Location |
|-----------------------------------|--------|----------|
| Generate 32-byte hex secrets per platform | DONE | `src/shared/services/secretGenerator.ts` |
| Masked display by default | DONE | `src/main/cli.ts:386-389` |
| `--show-secrets` flag reveals full value | DONE | `src/main/cli.ts:383-385` |
| Secrets written to `.env` file | DONE | `src/usecases/cli/writeInitConfig.usecase.ts:57-63` |
| Warn if `.env` not in `.gitignore` | **MISSING** | Not implemented anywhere |

### What remains to build

1. **`.gitignore` safety check**: after writing `.env`, check whether it is protected from accidental commits
2. **Secret rotation warning**: when re-running `init` and overwriting existing secrets, warn the user to update platform webhook settings
3. **Placeholder detection in `reviewflow validate`**: detect `.env` files still containing the example values from `.env.example`

## Gherkin Scenarios

### Feature: Secret Generation

```gherkin
Feature: Cryptographic webhook secret generation

  Scenario: Secrets are generated during init
    Given the user runs "reviewflow init"
    When the wizard reaches the secret generation step
    Then a GitLab webhook secret is generated
    And a GitHub webhook secret is generated
    And both secrets are 64-character hexadecimal strings (32 bytes)
    And the two secrets are distinct values

  Scenario: Secrets use cryptographically secure randomness
    Given the secret generator is invoked
    When generateWebhookSecret() is called
    Then it uses crypto.randomBytes as the entropy source (CSPRNG)
    And the output passes the isValidSecret check (64 hex chars)

  Scenario: Each invocation produces a unique secret
    Given the secret generator is invoked multiple times
    When 100 secrets are generated
    Then all 100 are distinct
```

### Feature: Secret Display

```gherkin
Feature: Secret display during init

  Scenario: Secrets are masked by default
    Given the user runs "reviewflow init" without --show-secrets
    When secrets are displayed
    Then the GitLab secret shows the first 16 characters followed by "..."
    And the GitHub secret shows the first 16 characters followed by "..."
    And a hint is displayed: "Use --show-secrets to display full values"

  Scenario: Full secrets displayed with --show-secrets flag
    Given the user runs "reviewflow init --show-secrets"
    When secrets are displayed
    Then the GitLab secret is shown in full (64 characters)
    And the GitHub secret is shown in full (64 characters)
    And no truncation hint is displayed

  Scenario: Secrets are always generated for both platforms
    Given the user selects "GitLab" as the only platform
    When the wizard generates secrets
    Then both GitLab and GitHub secrets are generated
    And both are written to .env
```

### Feature: Secret Persistence

```gherkin
Feature: Secrets written to .env file

  Scenario: .env file is created with generated secrets
    Given the user completes the init wizard
    When the configuration is written
    Then a .env file is created in the config directory
    And it contains GITLAB_WEBHOOK_TOKEN=<generated-secret>
    And it contains GITHUB_WEBHOOK_SECRET=<generated-secret>
    And neither value is a placeholder string

  Scenario: Non-interactive mode writes secrets
    Given the user runs "reviewflow init --yes"
    When the wizard completes without prompting
    Then secrets are generated and written to .env
    And both secrets are valid 64-character hex strings
```

### Feature: .gitignore Safety Check

**Status: NOT YET IMPLEMENTED**

```gherkin
Feature: .gitignore safety check for webhook secrets

  Scenario: .env is inside a git repo without .gitignore protection
    Given the config directory is inside a git repository
    And the repository does not have ".env" listed in any .gitignore
    When the init wizard writes the .env file
    Then a warning is displayed: "WARNING: .env is not in .gitignore — your webhook secrets could be committed to version control."
    And the wizard suggests: "Add '.env' to your .gitignore file."
    And the init still completes successfully (warning, not blocking)

  Scenario: .env is protected by .gitignore
    Given the config directory is inside a git repository
    And the repository .gitignore contains a pattern matching ".env"
    When the init wizard writes the .env file
    Then no .gitignore warning is displayed

  Scenario: .env is protected by a nested .gitignore
    Given the config directory is inside a git repository
    And a .gitignore file in the config directory or a parent contains ".env"
    When the init wizard writes the .env file
    Then no .gitignore warning is displayed

  Scenario: Config directory is not inside a git repository
    Given the config directory is outside any git repository
    When the init wizard writes the .env file
    Then no .gitignore warning is displayed
    And no error is thrown

  Scenario: git command is not available
    Given the system does not have git installed
    When the init wizard attempts the .gitignore check
    Then the check is silently skipped
    And no error is thrown
    And init completes normally
```

### Feature: Secret Rotation on Re-Init

**Status: NOT YET IMPLEMENTED**

```gherkin
Feature: Secret rotation awareness when re-running init

  Scenario: Re-init with existing secrets (interactive)
    Given an existing .env file with valid webhook secrets
    And an existing config.json
    When the user runs "reviewflow init" and confirms overwrite
    Then new secrets are generated (different from the old ones)
    And a warning is displayed: "New webhook secrets generated. Update your GitLab/GitHub webhook configuration with the new values."
    And the old .env is overwritten with the new secrets

  Scenario: Re-init with existing secrets (non-interactive)
    Given an existing .env file with valid webhook secrets
    When the user runs "reviewflow init --yes"
    Then new secrets are generated without prompting
    And the rotation warning is displayed

  Scenario: User declines overwrite
    Given an existing config.json
    When the user runs "reviewflow init" and declines the overwrite prompt
    Then the .env file is not modified
    And the existing secrets are preserved
    And no rotation warning is displayed

  Scenario: Existing .env with placeholder values
    Given an existing .env file with placeholder values (e.g., "your_gitlab_webhook_token_here")
    When the user runs "reviewflow init" and confirms overwrite
    Then new real secrets are generated
    And no rotation warning is displayed (placeholders are not real secrets)
```

### Feature: Placeholder Detection in Validate

**Status: NOT YET IMPLEMENTED**

```gherkin
Feature: Secret validation in reviewflow validate

  Scenario: .env contains placeholder secrets
    Given a .env file with GITLAB_WEBHOOK_TOKEN="your_gitlab_webhook_token_here"
    When the user runs "reviewflow validate"
    Then a warning is reported: "Webhook secrets appear to be placeholder values. Run 'reviewflow init' to generate real secrets."
    And the validation status is "invalid"

  Scenario: .env contains valid generated secrets
    Given a .env file with a 64-character hex GITLAB_WEBHOOK_TOKEN
    And a 64-character hex GITHUB_WEBHOOK_SECRET
    When the user runs "reviewflow validate"
    Then no secret-related warnings are reported

  Scenario: .env is missing one secret
    Given a .env file with GITLAB_WEBHOOK_TOKEN set
    And GITHUB_WEBHOOK_SECRET is missing
    When the user runs "reviewflow validate"
    Then an error is reported for the missing secret

  Scenario: .env file does not exist
    Given no .env file in the config directory
    When the user runs "reviewflow validate"
    Then an error is reported: "Missing .env file"
```

### Feature: Runtime Secret Verification

```gherkin
Feature: Webhook signature verification at runtime

  Scenario: Valid GitLab webhook with correct token
    Given the server is running with a configured GITLAB_WEBHOOK_TOKEN
    When a GitLab webhook arrives with a matching X-Gitlab-Token header
    Then the request is accepted

  Scenario: GitLab webhook with wrong token
    Given the server is running with a configured GITLAB_WEBHOOK_TOKEN
    When a GitLab webhook arrives with an incorrect X-Gitlab-Token header
    Then the request is rejected with "Token invalide"

  Scenario: GitLab webhook with missing token header
    Given the server is running
    When a GitLab webhook arrives without the X-Gitlab-Token header
    Then the request is rejected with "Header X-Gitlab-Token manquant"

  Scenario: Valid GitHub webhook with correct HMAC signature
    Given the server is running with a configured GITHUB_WEBHOOK_SECRET
    When a GitHub webhook arrives with a valid X-Hub-Signature-256 header
    Then the HMAC-SHA256 of the request body matches the signature
    And the request is accepted

  Scenario: GitHub webhook with invalid HMAC signature
    Given the server is running with a configured GITHUB_WEBHOOK_SECRET
    When a GitHub webhook arrives with an incorrect X-Hub-Signature-256 header
    Then the request is rejected with "Signature invalide"

  Scenario: Timing-safe comparison prevents timing attacks
    Given a webhook arrives with an incorrect secret
    When the server compares the provided value to the expected value
    Then timingSafeEqual is used (constant-time comparison)
    And the comparison time does not leak information about the expected value
```

## Out of Scope

- **Secret management integration** (Vault, AWS Secrets Manager, etc.) -- `.env` plaintext is standard for local dev tools
- **Automatic webhook creation via platform API** -- the user must paste the secret into GitLab/GitHub settings manually
- **Secret encryption at rest** -- security relies on filesystem permissions and `.gitignore`
- **Per-repository secrets** -- one secret per platform, not per repository
- **Dedicated `reviewflow rotate-secrets` command** -- rotation only happens via re-init; a standalone command is a separate feature
- **Automatic `.gitignore` modification** -- the wizard warns but does not write to `.gitignore`
- **Tunnel setup** (Cloudflare, ngrok) for exposing the webhook endpoint

## INVEST Validation

| Criterion | Pass | Rationale |
|-----------|------|-----------|
| **Independent** | Yes | Only touches `executeInit` flow and `validateConfig`. No coupling to server runtime or other CLI commands. |
| **Negotiable** | Yes | The `.gitignore` check could be a warning or a blocking error. Placeholder detection severity is negotiable. Rotation warning wording is flexible. |
| **Valuable** | Yes | Prevents accidental secret leaks to version control. Prevents silent secret rotation confusion. Catches forgotten placeholder values before they cause runtime failures. |
| **Estimable** | Yes | Remaining work is ~2-3 hours: gitignore check function, init integration, validate integration, tests. |
| **Small** | Yes | 3-5 files modified, no new dependencies, no architecture changes. All changes follow existing patterns. |
| **Testable** | Yes | Every scenario is deterministic. All external I/O is injectable via the existing `InitDependencies` and `ValidateConfigDependencies` interfaces. |

## Definition of Done

### Existing functionality (verified by existing tests)

- [x] `generateWebhookSecret()` produces 64-char hex strings using `crypto.randomBytes(32)`
- [x] `truncateSecret()` masks secrets for display
- [x] `isValidSecret()` validates the 64-char hex format
- [x] `executeInit` generates two distinct secrets per run
- [x] `executeInit` displays masked secrets by default, full with `--show-secrets`
- [x] `WriteInitConfigUseCase` writes secrets to `.env` file
- [x] `verifyGitLabSignature` validates `X-Gitlab-Token` with timing-safe comparison
- [x] `verifyGitHubSignature` validates `X-Hub-Signature-256` HMAC with timing-safe comparison

### Remaining work

- [ ] `.gitignore` check function implemented (pure, injectable deps)
- [ ] `.gitignore` check integrated into `executeInit` after config is written
- [ ] Secret rotation warning displayed when re-init overwrites existing secrets
- [ ] No rotation warning when overwriting placeholder values
- [ ] `ValidateConfigUseCase` detects placeholder secret values and reports a warning
- [ ] `ValidateConfigUseCase` detects missing individual secret variables
- [ ] Unit tests: `.gitignore` check — inside git repo with protection, without protection, outside git repo, git unavailable
- [ ] Unit tests: rotation warning — existing real secrets, existing placeholders, declined overwrite
- [ ] Unit tests: placeholder detection in validate — placeholders, valid secrets, missing secrets
- [ ] All tests in English
- [ ] `yarn verify` passes (typecheck + lint + test:ci)
- [ ] No new dependencies added

## Technical Notes

### Files to modify

| File | Change |
|------|--------|
| `src/shared/services/secretGenerator.ts` | Add `isPlaceholderSecret(value: string): boolean` — returns true for known placeholder patterns |
| `src/main/cli.ts` | Add `checkGitignoreProtection` to `InitDependencies`. Call it after `writeConfig()`. Add rotation warning when `.env` exists with real secrets before overwrite. |
| `src/usecases/cli/validateConfig.usecase.ts` | In `validateEnv()`, read `.env` content, check each secret with `isValidSecret()` and `isPlaceholderSecret()`, report warnings. |
| `src/tests/units/shared/services/secretGenerator.test.ts` | Add tests for `isPlaceholderSecret()` |
| `src/tests/units/main/executeInit.test.ts` | Add tests for gitignore warning and rotation warning |
| `src/tests/units/usecases/cli/validateConfig.usecase.test.ts` | Add tests for placeholder/missing secret detection |

### Implementation approach

**1. Gitignore check** — new injectable function added to `InitDependencies`:

```
checkGitignoreProtection(envPath: string): 'protected' | 'unprotected' | 'not-git-repo'
```

Implementation uses `git check-ignore <envPath>` which returns exit code 0 if the file is ignored, 1 if not, 128 if not in a git repo. This is more reliable than parsing `.gitignore` manually (handles nested gitignore files, global gitignore, negation patterns).

**2. Rotation warning** — in `executeInit`, check if `.env` already exists with real secrets (not placeholders) before overwriting. The check uses the existing `existsSync` dependency plus a new `readExistingEnvSecrets` dependency.

**3. Placeholder detection** — `isPlaceholderSecret()` checks for common placeholder patterns: contains "your_", contains "here", contains "token", is not a valid 64-char hex string. Used by both the rotation logic and `ValidateConfigUseCase`.

### Existing code to reuse

- `generateWebhookSecret()`, `truncateSecret()`, `isValidSecret()` from `src/shared/services/secretGenerator.ts`
- `InitDependencies` interface pattern for injectable deps
- `ValidateConfigDependencies` and `ValidationIssue[]` pattern for reporting
- Existing test factories and dep-creation helpers (`createFakeInitDeps`)
