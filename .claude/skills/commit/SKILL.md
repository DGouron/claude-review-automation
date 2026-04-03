---
name: commit
description: Safe commit and push workflow. Creates a commit following conventions and pushes. Husky handles verifications (TypeScript, Biome, tests).
---

# Commit - Safe Git Workflow

## Persona

Read `.claude/roles/senior-dev.md` — adopt this profile and follow all its rules.

## Activation

This skill activates:
- On explicit request (`/commit`)
- When the user asks to commit/push code

## Husky Hooks (automatic)

The project uses Husky which automatically runs:

| Hook | Action |
|------|--------|
| `pre-commit` | TypeScript check + Biome lint (modified files) |
| `commit-msg` | commitlint (message format) |
| `pre-push` | Vitest tests (modified files since `test`) |

## Claude Code Hooks (automatic)

The project also has PreToolUse hooks that run BEFORE git commands:

| Hook | Action |
|------|--------|
| `protect-main-branch.sh` | Blocks commit on master |
| `pre-commit-gate.sh` | Runs tests before commit |
| `verify-spec-updated.sh` | Checks spec has `## Status: implemented` |
| `protect-main-push.sh` | Blocks push to master and force push |

## Workflow

### Step 0: Quality Gates (BLOCKING)

**BEFORE any commit**, run:

```bash
yarn verify
```

**If it fails**: display errors and **STOP**. Do not commit until quality gates pass.

### Step 0b: Spec & Tracker Verification

If staged files include `src/` code:
1. Check `docs/feature-tracker.md` — any feature in `implementing` status should be updated to `implemented`
2. Check corresponding spec — should have `## Status: implemented` if feature is complete
3. If missing, **WARN** the user (the hook will also catch this)

### Step 1: Analyze Changes

```bash
git status --short
```

If nothing is staged, suggest:
```bash
git add <files>
```

### Step 2: Create the Commit

#### Message Format (Conventional Commits)

```
<type>(<scope>): <description>
```

**Allowed types**:
| Type | Usage |
|------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting (no code change) |
| `refactor` | Refactoring (no new feature or fix) |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `build` | Build system changes |
| `ci` | CI/CD changes |
| `chore` | Maintenance, dependencies |
| `revert` | Revert a previous commit |

**Rules**:
- Header max **72 characters**
- Description in lowercase, no trailing period
- Scope optional in parentheses

#### Examples

```
feat(webhook): add GitHub signature validation
fix(review): resolve score calculation overflow
refactor(gateway): extract GitLab API client
test(usecase): add unit tests for track assignment
```

### Step 3: Commit

```bash
git commit -m "<type>(<scope>): <description>"
```

Husky will automatically run:
1. TypeScript check
2. Biome lint
3. commitlint

### Step 4: Push (optional)

```bash
git push origin <current-branch>
```

Husky will automatically run tests before pushing.

## Security Rules

- **NEVER** use `--force` without explicit request
- **NEVER** push to `main` or `master` directly
- **NEVER** use `--no-verify` unless explicitly requested by the user
- **ALWAYS** verify you are on a feature branch
- **NEVER** mention Claude, Anthropic, or Co-Authored-By in commits

## If Husky Fails

| Error | Solution |
|-------|----------|
| TypeScript | Fix type errors |
| Biome | `yarn lint:fix` to auto-correct |
| commitlint | Reword the commit message |
| Tests (push) | Fix failing tests |

## Output Template

```
COMMIT

Branch: <branch>
Staged files:
  - <file 1>
  - <file 2>

Message: <type>(<scope>): <description>

Verifications:
  - Husky: TypeScript / Biome / commitlint

Confirm commit? (yes/no)
```
