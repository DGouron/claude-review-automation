#!/usr/bin/env bash
set -euo pipefail

# Blocks git commit if tests fail.
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

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." && pwd)}"

cd "$PROJECT_DIR"

if yarn test:ci 2>&1; then
  exit 0
else
  echo "Tests failed. Fix them before committing." >&2
  exit 2
fi
