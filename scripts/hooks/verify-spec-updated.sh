#!/usr/bin/env bash
set -euo pipefail

# Blocks git commit if staged files include src/ code but the corresponding
# spec does not have "## Status: implemented" and the feature-tracker is stale.
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

STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)

if [[ -z "$STAGED_FILES" ]]; then
  exit 0
fi

has_source_code() {
  echo "$STAGED_FILES" | grep -q "^src/" 2>/dev/null
}

if ! has_source_code; then
  exit 0
fi

TRACKER="$PROJECT_DIR/docs/feature-tracker.md"
SPECS_DIR="$PROJECT_DIR/docs/specs"

ERRORS=""

if [[ -f "$TRACKER" ]]; then
  DRAFTS_IN_TRACKER=$(grep -c "| drafted |" "$TRACKER" || true)
  STAGED_HAS_TRACKER=$(echo "$STAGED_FILES" | grep -c "docs/feature-tracker.md" || true)

  if [[ "$DRAFTS_IN_TRACKER" -gt 0 && "$STAGED_HAS_TRACKER" -eq 0 ]]; then
    IMPLEMENTING=$(grep -c "| implementing |" "$TRACKER" || true)
    if [[ "$IMPLEMENTING" -gt 0 ]]; then
      ERRORS="${ERRORS}Feature tracker has features in 'implementing' status. Update docs/feature-tracker.md before committing.\n"
    fi
  fi
fi

if [[ -d "$SPECS_DIR" ]]; then
  for SPEC_FILE in "$SPECS_DIR"/*.md; do
    [[ -f "$SPEC_FILE" ]] || continue
    SPEC_NAME=$(basename "$SPEC_FILE")

    if grep -q "^## Status: implemented" "$SPEC_FILE" 2>/dev/null; then
      continue
    fi

    if echo "$STAGED_FILES" | grep -q "$SPEC_NAME" 2>/dev/null; then
      continue
    fi
  done
fi

if [[ -n "$ERRORS" ]]; then
  echo -e "$ERRORS" >&2
  exit 2
fi

exit 0
