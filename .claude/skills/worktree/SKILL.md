---
name: worktree
description: Git worktree management for working on multiple branches in parallel. Create, list, remove, and synchronize worktrees. Protects against direct pushes to master.
---

# Command /worktree - Git Worktree Management

Manages Git worktrees for working on multiple branches in parallel across different Claude Code sessions.

## Absolute Security Rules

```
NEVER push directly to `master`!
NEVER commit directly to `master`!
Only allowed action on `master`: git pull origin master
Always create a PR to merge into `master`
```

---

## Configuration

| Parameter | Value |
|-----------|-------|
| Worktrees directory | `.claude/worktrees/` |
| Main branch | `master` |
| Default `--from` branch | `master` |

---

## Subcommands

### `/worktree` or `/worktree list`
Lists all existing worktrees with their branch and status.

### `/worktree add <name> [--from <branch>]`
Creates a new worktree with a "home-base" branch.
- By default, based on `master`
- Path: `.claude/worktrees/<name>`

### `/worktree remove <name>`
Removes a worktree (asks for confirmation if not clean).

### `/worktree sync [name]`
Synchronizes the worktree with `master` (pull only).

### `/worktree connect <name>`
Changes the current session's working directory to the specified worktree.
- Verifies the worktree exists
- Moves into `<worktree_path>`
- Displays the worktree's git status

---

## Worktree Architecture

```
claude-review-automation/             <- Main worktree (master)
├── src/
├── .claude/
│   └── worktrees/
│       ├── refactor/                 <- Refactor worktree
│       │   ├── src/
│       │   └── ...
│       ├── debug/                    <- Debug worktree
│       │   ├── src/
│       │   └── ...
│       └── feature-x/               <- Feature worktree
│           ├── src/
│           └── ...
└── ...
```

---

## Concept: "Home-Base" Branches

Each worktree has a "home-base" branch that serves as a starting point.

| Branch | Role |
|--------|------|
| `refactor`, `debug`, etc. | Worktree home-base (synced with `master`) |
| `feat/xxx-*`, `fix/xxx-*` | Working branches |

**Workflow inside a worktree:**

```bash
# 1. You are on the home-base (e.g., refactor)
git status  # On the refactor branch

# 2. Create a feature branch for your ticket
git checkout -b feat/xxx-description

# 3. Work, commit...
git add .
git commit -m "feat(scope): description"

# 4. Push the feature branch (NEVER the home-base)
git push origin feat/xxx-description

# 5. Create a PR to master (via gh CLI)

# 6. Once merged, return to home-base and sync
git checkout refactor
git pull origin master
```

---

## Synchronization Commands

### Sync a worktree with master

```bash
# Inside the relevant worktree
git checkout <home-base>  # refactor, debug...
git fetch origin
git reset --hard origin/master
```

**WARNING**: This command overwrites the local home-base branch. This is intentional because it should never contain direct work.

---

## Output Templates

### Worktree List

```
WORKTREES

Repo: claude-review-automation

| Usage | Path | Home-base | Current Branch |
|-------|------|-----------|----------------|
| main | .../claude-review-automation | - | master |
| refactor | .../.claude/worktrees/refactor | refactor | refactor |

Tip - Open a session:
   cd <path> && claude

Sync with master:
   git checkout <home-base> && git pull origin master
```

### Worktree Creation

```
WORKTREE CREATED

Name      : <name>
Path      : <path>
Home-base : <name> (based on master)

Warning - Install dependencies:
   cd <path> && yarn install

Tip - Start a session:
   cd <path> && claude

Reminder: NEVER push to master, always create a PR!
```

### Worktree Connection

```
CONNECTED TO WORKTREE

Worktree : <name>
Path     : <path>
Branch   : <current_branch>
Status   : <clean|modified>

You are now in the <name> worktree

Sync with master: git pull origin master
Reminder: NEVER push to master, always create a PR!
```

---

## Rules

- **NEVER** push directly to `master`
- **NEVER** commit on `master`
- **ALWAYS** create a PR to merge into `master`
- **ONLY** allowed action on `master`: `git pull origin master`
- **ALWAYS** create worktrees in `.claude/worktrees/`
- **ALWAYS** use absolute paths in displayed commands
- **ALWAYS** remind to run `yarn install` after creation
- **VERIFY** that the branch is not already checked out in another worktree
