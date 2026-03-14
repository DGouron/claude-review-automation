---
name: security
description: Code scan to detect secrets before commit. Use before git add/commit/push or on demand. Checks for tokens, API keys, credentials, and other sensitive data.
---

# Security - Secret Detection

## Persona

Read `.claude/roles/code-reviewer.md` — adopt this profile and follow all its rules.

## Activation

This skill activates:
- Before a `git commit` or `git push`
- On explicit request (`/security`)
- Via the CLI command `flux security-scan` (full repo scan)

## Detected Patterns

### Tokens & API Keys

| Pattern | Example | Regex |
|---------|---------|-------|
| GitLab PAT | `glpat-xxxx` | `glpat-[a-zA-Z0-9_-]{20,}` |
| GitHub PAT | `ghp_xxxx` | `gh[ps]_[a-zA-Z0-9]{36,}` |
| GitHub OAuth | `gho_xxxx` | `gho_[a-zA-Z0-9]{36,}` |
| OpenAI | `sk-xxxx` | `sk-[a-zA-Z0-9]{32,}` |
| Anthropic | `sk-ant-xxxx` | `sk-ant-[a-zA-Z0-9-]{32,}` |
| AWS Access Key | `AKIA...` | `AKIA[0-9A-Z]{16}` |
| AWS Secret | - | `[a-zA-Z0-9/+=]{40}` (AWS context) |
| Slack Token | `xox[baprs]-` | `xox[baprs]-[a-zA-Z0-9-]+` |
| Discord Token | - | `[MN][a-zA-Z0-9]{23,}\.[a-zA-Z0-9-_]{6}\.[a-zA-Z0-9-_]{27}` |

### Generic Credentials

| Pattern | Context |
|---------|---------|
| `password\s*=\s*["'][^"']+["']` | Hardcoded passwords |
| `secret\s*=\s*["'][^"']+["']` | Hardcoded secrets |
| `token\s*=\s*["'][^"']+["']` | Hardcoded tokens |
| `api[_-]?key\s*=\s*["'][^"']+["']` | Hardcoded API keys |
| `Bearer [a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+` | JWT tokens |

### Suspicious Files

| File | Risk |
|------|------|
| `.env` | Environment variables (often secrets) |
| `*.pem`, `*.key` | Private keys |
| `secrets.*`, `credentials.*` | Secret files |
| `config.toml` with `[secrets]` section | Config with embedded secrets |
| `id_rsa`, `id_ed25519` | Private SSH keys |

## Workflow

### Pre-commit scan (git diff --staged)

```
SECURITY - Pre-commit Scan

Analyzing staged diff...

Result:
- Files scanned: X
- Secrets detected: Y

[If secrets found]
WARNING: Secrets detected!

File: src/config.ts
Line 42: token = "glpat-..." (GitLab PAT)

Action: Fix before committing.
Suggestions:
- Use an environment variable
- Move to a secure configuration file
```

### Full repo scan (flux security-scan)

```
SECURITY - Full Scan

Scanning entire repository...

Result:
- Files scanned: X
- Files ignored (.gitignore): Y
- Secrets detected: Z

[List of files with secrets]
```

## Commands

### Git diff staged

```bash
git diff --cached --name-only  # List of staged files
git diff --cached              # Diff content
```

### Scan patterns

```bash
# Example with grep (the skill uses more advanced tools)
git diff --cached | grep -E "(glpat-|ghp_|sk-|password\s*=)"
```

## False Positives

Ignore if:
- In a test file with dummy values (`test_token`, `fake_key`)
- In documentation (examples with `xxxx` or `your-token-here`)
- Pattern in a comment explaining the expected format

## CLAUDE.md Integration

This skill applies the security rule:
> **Absolute rule**: Never store tokens, API keys, or secrets in plain text in code or versioned files.

## Report

The scan produces a report with:
1. Overall status (OK / WARNING)
2. Number of files scanned
3. List of detected secrets (file, line, type)
4. Correction suggestions
