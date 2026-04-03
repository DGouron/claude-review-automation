#!/usr/bin/env bash
set -euo pipefail

# Blocks feature-implementer agent if no spec file exists or spec is incomplete.
# Used as PreToolUse hook on Agent.
# Exit 0 = allow, Exit 2 = block with feedback to Claude.

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | "$HOOK_DIR/parse-json.sh" tool_input.prompt)

is_feature_agent() {
  echo "$PROMPT" | grep -qi "feature-implementer\|feature-planner"
}

if ! is_feature_agent; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." && pwd)}"

spec_file_referenced() {
  echo "$PROMPT" | grep -oP 'docs/specs/[a-z0-9-]+\.md' | head -1 || true
}

SPEC_REF=$(spec_file_referenced || true)

if [[ -z "$SPEC_REF" ]]; then
  echo "No spec file referenced in the prompt. Create a spec first with /product-manager." >&2
  exit 2
fi

if [[ ! -f "$PROJECT_DIR/$SPEC_REF" ]]; then
  echo "Spec file '$SPEC_REF' does not exist. Create it first with /product-manager." >&2
  exit 2
fi

SPEC_CONTENT=$(cat "$PROJECT_DIR/$SPEC_REF")

has_rules_section() {
  echo "$SPEC_CONTENT" | grep -qE "^## (Rules|Business Rules|Remaining Scope|Functional Requirements)"
}

has_scenarios_section() {
  echo "$SPEC_CONTENT" | grep -qE "^## (Scenarios|Acceptance Criteria|Gherkin Scenarios)"
}

if ! has_rules_section; then
  echo "Spec '$SPEC_REF' is missing the '## Rules' (or '## Business Rules') section. Fix it before implementing." >&2
  exit 2
fi

if ! has_scenarios_section; then
  echo "Spec '$SPEC_REF' is missing the '## Scenarios' (or '## Acceptance Criteria') section. Fix it before implementing." >&2
  exit 2
fi

exit 0
