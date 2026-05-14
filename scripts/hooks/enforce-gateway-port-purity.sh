#!/usr/bin/env bash
set -euo pipefail

# Enforces gateway port purity for ReviewFlow.
# Gateway contracts live in src/entities/**/*.gateway.ts and must be interfaces or abstract classes.
# A plain 'export class' in a port file means the contract has leaked an implementation.
# Implementation gateway files (in interface-adapters/gateways/) are excluded.
# Used as PreToolUse hook on Write|Edit.
# Exit 0 = allow, Exit 2 = block with feedback to Claude.

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" tool_input.file_path)

is_gateway_port() {
  local filename
  filename=$(basename "$FILE_PATH")
  [[ "$FILE_PATH" == */src/entities/* ]] \
    && [[ "$filename" == *.gateway.ts ]]
}

if ! is_gateway_port; then
  exit 0
fi

CONTENT=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" tool_input.content)
NEW_STRING=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" tool_input.new_string)
TEXT_TO_CHECK="${CONTENT}${NEW_STRING}"

if echo "$TEXT_TO_CHECK" | grep -qE "^\s*export\s+class\s+"; then
  echo "Gateway port violation in $FILE_PATH: port files in entities/ must use 'interface' or 'abstract class'. A plain 'export class' belongs in interface-adapters/gateways/, not in the entities layer." >&2
  exit 2
fi

exit 0
