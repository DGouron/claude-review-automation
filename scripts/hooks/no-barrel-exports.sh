#!/usr/bin/env bash
set -euo pipefail

# Blocks creation or editing of barrel export files (index.ts).
# Used as PreToolUse hook on Write|Edit.
# Exit 0 = allow, Exit 2 = block with feedback to Claude.

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" tool_input.file_path)

is_barrel_export() {
  local filename
  filename=$(basename "$FILE_PATH")
  [[ "$filename" == "index.ts" || "$filename" == "index.js" ]]
}

if is_barrel_export; then
  echo "Barrel exports are forbidden. Import directly from the source file instead of using index.ts." >&2
  exit 2
fi

exit 0
