#!/usr/bin/env bash
set -euo pipefail

# Blocks git commit on main/master branch.
# Used as PreToolUse hook on Bash(git commit *).
# Exit 0 = allow, Exit 2 = block with feedback to Claude.

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" tool_input.command)

is_commit_command() {
  echo "$COMMAND" | grep -qE "git commit"
}

if ! is_commit_command; then
  exit 0
fi

# Check the branch of the cwd where the git command is being run.
# In worktree mode, $CLAUDE_PROJECT_DIR points to the main repo (potentially on master)
# while the user's actual session is in a worktree on a feature branch.
CWD=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" cwd)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." && pwd)}"
BRANCH_DIR="${CWD:-$PROJECT_DIR}"
CURRENT_BRANCH=$(cd "$BRANCH_DIR" && git branch --show-current 2>/dev/null || true)

if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]]; then
  echo "You are on '$CURRENT_BRANCH'. Create a feature branch or use /worktree add <name> first." >&2
  exit 2
fi

exit 0
