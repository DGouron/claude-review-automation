#!/usr/bin/env bash
set -euo pipefail

# Enforces that presenter files export a class named *Presenter or *Calculator.
# Applies to *.presenter.ts files under src/interface-adapters/presenters/.
# Functions or plain objects are not allowed — presenters must be classes for testability.
# Used as PreToolUse hook on Write (full file content only).
# Exit 0 = allow, Exit 2 = block with feedback to Claude.

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" tool_input.file_path)

is_presenter_file() {
  [[ "$FILE_PATH" == *.presenter.ts ]] \
    && [[ "$FILE_PATH" == */interface-adapters/presenters/* ]]
}

if ! is_presenter_file; then
  exit 0
fi

CONTENT=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" tool_input.content)

if [[ -z "$CONTENT" ]]; then
  exit 0
fi

if ! echo "$CONTENT" | grep -qE "class\s+\w*(Presenter|Calculator)\b"; then
  echo "Presenter convention violation in $FILE_PATH: .presenter.ts files must export a class ending with 'Presenter' (or 'Calculator' for pure computation presenters). Export a function is not allowed." >&2
  exit 2
fi

exit 0
