---
name: ship
description: Ship — commit and push in one command. Chains quality gates, conventional commit, push, and optional PR creation + merge. Use when the user says "ship", "commit and push", "/ship", or wants to finalize a branch.
user-invocable: true
allowed-tools: Bash, Read
---

# Ship — Commit & Push

## Activation

This skill activates with `/ship`. It chains verification, commit, push, and optionally PR creation and merge.

## Optional arguments

```
/ship                   # Commit + push (no PR)
/ship pr                # Commit + push + gh pr create
/ship pr merge          # Commit + push + gh pr create + gh pr merge --admin --squash
```

## Workflow

### Step 0: Quality Gates (BLOCKING)

**BEFORE any commit**, run:

```bash
yarn verify
```

`yarn verify` runs: TypeScript check + Biome lint + Vitest tests.

**If it fails**: display the errors and **STOP**. Do not proceed until all quality gates pass.

---

### Step 1: Analysis

```bash
git status --short
git branch --show-current
git log --oneline -5
```

**Guards**:
- If branch = `master`: **STOP** — the `protect-main-push.sh` hook blocks push to master. Create a feature branch first.
- If nothing to commit: inform and stop.

---

### Step 2: Staging

- If files are not staged, list them and add them **by name** (never `git add -A` or `git add .`)
- **NEVER** include `.env`, credentials, secrets, or lock files unless explicitly requested
- **NEVER** include files unrelated to the current change

Preferred pattern:
```bash
git add src/usecases/foo.usecase.ts src/tests/units/usecases/foo.usecase.test.ts
```

---

### Step 3: Commit

Infer the message from the staged changes. Follow Conventional Commits:

```
<type>(<scope>): <description>
```

| Type | Usage |
|------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Refactoring (no feature or fix) |
| `test` | Tests only |
| `docs` | Documentation only |
| `chore` | Maintenance, dependencies |
| `style` | Formatting (no logic change) |
| `perf` | Performance improvement |
| `ci` | CI/CD changes |

**Rules**:
- Header max **72 characters**
- Description in lowercase, no trailing period
- Scope optional in parentheses, must match bounded context name when applicable

**Commit via heredoc** (preserves formatting):
```bash
git commit -m "$(cat <<'EOF'
feat(webhook): add GitHub signature validation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

The `pre-commit-gate.sh` and `verify-spec-updated.sh` hooks run automatically. If they fail, **fix the issue and retry** — never use `--no-verify`.

---

### Step 4: Push

```bash
git push -u origin <branch>
```

The `protect-main-push.sh` hook blocks push to `master` and force push. If it triggers, verify you are on a feature branch.

---

### Step 5 (if `pr` or `pr merge`): Create PR

```bash
gh pr create --title "<type>(<scope>): <description>" --body "$(cat <<'EOF'
## Summary
- <bullet point 1>
- <bullet point 2>

## Test plan
- [ ] yarn verify passes
- [ ] Acceptance tests green

🤖 Generated with Claude Code
EOF
)"
```

Base branch: `master`.

---

### Step 6 (if `pr merge` only and user explicitly requested): Merge PR

```bash
gh pr merge --admin --squash
```

**ONLY if the user explicitly asked for merge**. Never merge without explicit confirmation.

---

### Step 7: Summary

```
SHIP

Branch  : <branch>
Commit  : <type>(<scope>): <description>
Push    : origin/<branch>
Gates   : yarn verify — green
PR      : <url or "not created">
Merge   : <squash merged or "not merged">
```

---

## Security Rules

- **NEVER** use `--force` push
- **NEVER** push to `master` directly (hook enforces this)
- **NEVER** use `--no-verify` or bypass hooks
- **NEVER** commit `.env`, credentials, or secrets
- **NEVER** stage with `git add -A` or `git add .`
- **ALWAYS** verify you are on a feature branch before pushing
