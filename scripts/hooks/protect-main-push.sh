#!/usr/bin/env bash
set -euo pipefail

# Blocks git push to main/master branch and force pushes.
# Used as PreToolUse hook on Bash(git push *).
# Exit 0 = allow, Exit 2 = block with feedback to Claude.

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" tool_input.command)

is_push_command() {
  echo "$COMMAND" | grep -qE "git push"
}

if ! is_push_command; then
  exit 0
fi

is_force_push() {
  # Match --force, --force-with-lease, etc., or -f as standalone short flag.
  # Requires whitespace/start before and whitespace/end after to avoid matching
  # substrings inside paths or words (e.g. "review-flow", "-foo").
  echo "$COMMAND" | grep -qE "(^|[[:space:]])(--force[a-z-]*|-f)([[:space:]]|$)"
}

if is_force_push; then
  echo "Force push is forbidden. Push normally to your feature branch instead." >&2
  exit 2
fi

pushes_to_protected_branch() {
  echo "$COMMAND" | grep -qE "git push.*(origin\s+(main|master)|origin/main|origin/master)"
}

if pushes_to_protected_branch; then
  echo "Push to main/master is forbidden. Push to your feature branch instead." >&2
  exit 2
fi

exit 0
