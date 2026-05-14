#!/usr/bin/env bash
set -euo pipefail

# Enforces the Clean Architecture Dependency Rule.
# entities/ must not import from usecases/, interface-adapters/, or frameworks/.
# usecases/ must not import from interface-adapters/ or frameworks/.
# Applies to all files under src/.
# Used as PreToolUse hook on Write|Edit.
# Exit 0 = allow, Exit 2 = block with feedback to Claude.

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" tool_input.file_path)

is_in_src() {
  [[ "$FILE_PATH" == */src/* ]]
}

if ! is_in_src; then
  exit 0
fi

CONTENT=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" tool_input.content)
NEW_STRING=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" tool_input.new_string)
TEXT_TO_CHECK="${CONTENT}${NEW_STRING}"

is_entity_file() {
  [[ "$FILE_PATH" == */src/entities/* ]]
}

is_usecase_file() {
  [[ "$FILE_PATH" == */src/usecases/* ]]
}

if is_entity_file; then
  if echo "$TEXT_TO_CHECK" | grep -qE "from\s*['\"][^'\"]*@/interface-adapters/|from\s*['\"][^'\"]*[./]interface-adapters/"; then
    echo "Dependency Rule violation in $FILE_PATH: entities/ must not import from interface-adapters/. Inner layers are framework-agnostic." >&2
    exit 2
  fi
  if echo "$TEXT_TO_CHECK" | grep -qE "from\s*['\"][^'\"]*@/usecases/|from\s*['\"][^'\"]*[./]usecases/"; then
    echo "Dependency Rule violation in $FILE_PATH: entities/ must not import from usecases/. Dependencies point inward only." >&2
    exit 2
  fi
  if echo "$TEXT_TO_CHECK" | grep -qE "from\s*['\"][^'\"]*@/frameworks/|from\s*['\"][^'\"]*[./]frameworks/"; then
    echo "Dependency Rule violation in $FILE_PATH: entities/ must not import from frameworks/. Inner layers are framework-agnostic." >&2
    exit 2
  fi
fi

if is_usecase_file; then
  if echo "$TEXT_TO_CHECK" | grep -qE "from\s*['\"][^'\"]*@/interface-adapters/|from\s*['\"][^'\"]*[./]interface-adapters/"; then
    echo "Dependency Rule violation in $FILE_PATH: usecases/ must not import from interface-adapters/. Depend on gateway contracts (under entities/), not implementations." >&2
    exit 2
  fi
  if echo "$TEXT_TO_CHECK" | grep -qE "from\s*['\"][^'\"]*@/frameworks/|from\s*['\"][^'\"]*[./]frameworks/"; then
    echo "Dependency Rule violation in $FILE_PATH: usecases/ must not import from frameworks/. Depend on gateway contracts (under entities/), not infrastructure." >&2
    exit 2
  fi
fi

exit 0
