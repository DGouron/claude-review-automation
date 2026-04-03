#!/usr/bin/env bash
set -euo pipefail

# Test runner for Claude Code hook scripts.
# Run: bash scripts/hooks/tests/run-tests.sh

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASSED=0
FAILED=0
TOTAL=0

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red() { printf "\033[31m%s\033[0m\n" "$1"; }
bold() { printf "\033[1m%s\033[0m\n" "$1"; }

assert_exit() {
  local test_name="$1"
  local expected_exit="$2"
  local actual_exit="$3"
  TOTAL=$((TOTAL + 1))

  if [[ "$actual_exit" -eq "$expected_exit" ]]; then
    green "  PASS: $test_name (exit $actual_exit)"
    PASSED=$((PASSED + 1))
  else
    red "  FAIL: $test_name (expected exit $expected_exit, got $actual_exit)"
    FAILED=$((FAILED + 1))
  fi
}

assert_stderr_contains() {
  local test_name="$1"
  local pattern="$2"
  local stderr_output="$3"
  TOTAL=$((TOTAL + 1))

  if echo "$stderr_output" | grep -q "$pattern"; then
    green "  PASS: $test_name (stderr contains '$pattern')"
    PASSED=$((PASSED + 1))
  else
    red "  FAIL: $test_name (stderr missing '$pattern')"
    red "    actual stderr: $stderr_output"
    FAILED=$((FAILED + 1))
  fi
}

# ─────────────────────────────────────────────
bold "=== parse-json.sh ==="

OUTPUT=$(echo '{"tool_input":{"command":"git commit -m test"}}' | "$HOOK_DIR/parse-json.sh" tool_input.command)
TOTAL=$((TOTAL + 1))
if [[ "$OUTPUT" == "git commit -m test" ]]; then
  green "  PASS: extracts nested value"
  PASSED=$((PASSED + 1))
else
  red "  FAIL: extracts nested value (got: $OUTPUT)"
  FAILED=$((FAILED + 1))
fi

OUTPUT=$(echo '{"tool_input":{"command":"test"}}' | "$HOOK_DIR/parse-json.sh" tool_input.missing_key)
TOTAL=$((TOTAL + 1))
if [[ -z "$OUTPUT" ]]; then
  green "  PASS: returns empty for missing key"
  PASSED=$((PASSED + 1))
else
  red "  FAIL: returns empty for missing key (got: $OUTPUT)"
  FAILED=$((FAILED + 1))
fi

# ─────────────────────────────────────────────
bold "=== no-barrel-exports.sh ==="

echo '{"tool_input":{"file_path":"/src/entities/index.ts"}}' | "$HOOK_DIR/no-barrel-exports.sh" > /dev/null 2>&1 || true
EXIT_CODE=$(echo '{"tool_input":{"file_path":"/src/entities/index.ts"}}' | "$HOOK_DIR/no-barrel-exports.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "blocks index.ts" 2 "$EXIT_CODE"

STDERR=$(echo '{"tool_input":{"file_path":"/src/entities/index.ts"}}' | "$HOOK_DIR/no-barrel-exports.sh" 2>&1 > /dev/null || true)
assert_stderr_contains "error message mentions barrel" "Barrel exports" "$STDERR"

EXIT_CODE=$(echo '{"tool_input":{"file_path":"/src/entities/review.ts"}}' | "$HOOK_DIR/no-barrel-exports.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "allows normal .ts file" 0 "$EXIT_CODE"

EXIT_CODE=$(echo '{"tool_input":{"file_path":"/src/entities/index.js"}}' | "$HOOK_DIR/no-barrel-exports.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "blocks index.js" 2 "$EXIT_CODE"

# ─────────────────────────────────────────────
bold "=== protect-main-branch.sh ==="

# Create temp git repo to test
TEMP_REPO=$(mktemp -d)
cd "$TEMP_REPO"
git init -q
git checkout -q -b master

EXIT_CODE=$(echo '{"tool_input":{"command":"git commit -m test"}}' | CLAUDE_PROJECT_DIR="$TEMP_REPO" "$HOOK_DIR/protect-main-branch.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "blocks commit on master" 2 "$EXIT_CODE"

STDERR=$(echo '{"tool_input":{"command":"git commit -m test"}}' | CLAUDE_PROJECT_DIR="$TEMP_REPO" "$HOOK_DIR/protect-main-branch.sh" 2>&1 > /dev/null || true)
assert_stderr_contains "mentions master" "master" "$STDERR"

git checkout -q -b feat/test
EXIT_CODE=$(echo '{"tool_input":{"command":"git commit -m test"}}' | CLAUDE_PROJECT_DIR="$TEMP_REPO" "$HOOK_DIR/protect-main-branch.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "allows commit on feature branch" 0 "$EXIT_CODE"

EXIT_CODE=$(echo '{"tool_input":{"command":"ls -la"}}' | CLAUDE_PROJECT_DIR="$TEMP_REPO" "$HOOK_DIR/protect-main-branch.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "ignores non-commit commands" 0 "$EXIT_CODE"

rm -rf "$TEMP_REPO"

# ─────────────────────────────────────────────
bold "=== protect-main-push.sh ==="

EXIT_CODE=$(echo '{"tool_input":{"command":"git push origin master"}}' | "$HOOK_DIR/protect-main-push.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "blocks push to master" 2 "$EXIT_CODE"

EXIT_CODE=$(echo '{"tool_input":{"command":"git push origin main"}}' | "$HOOK_DIR/protect-main-push.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "blocks push to main" 2 "$EXIT_CODE"

EXIT_CODE=$(echo '{"tool_input":{"command":"git push --force origin feat/test"}}' | "$HOOK_DIR/protect-main-push.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "blocks force push" 2 "$EXIT_CODE"

EXIT_CODE=$(echo '{"tool_input":{"command":"git push origin feat/test"}}' | "$HOOK_DIR/protect-main-push.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "allows push to feature branch" 0 "$EXIT_CODE"

EXIT_CODE=$(echo '{"tool_input":{"command":"ls -la"}}' | "$HOOK_DIR/protect-main-push.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "ignores non-push commands" 0 "$EXIT_CODE"

# ─────────────────────────────────────────────
bold "=== require-spec.sh ==="

PROJECT_DIR="$HOOK_DIR/../.."

# Test: no spec reference → block
EXIT_CODE=$(echo '{"tool_input":{"prompt":"implement the feature-implementer for login"}}' | CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$HOOK_DIR/require-spec.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "blocks agent without spec reference" 2 "$EXIT_CODE"

STDERR=$(echo '{"tool_input":{"prompt":"implement the feature-implementer for login"}}' | CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$HOOK_DIR/require-spec.sh" 2>&1 > /dev/null || true)
assert_stderr_contains "suggests /product-manager" "product-manager" "$STDERR"

# Test: non-feature agent → allow
EXIT_CODE=$(echo '{"tool_input":{"prompt":"review the code in src/entities"}}' | CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$HOOK_DIR/require-spec.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "allows non-feature agents" 0 "$EXIT_CODE"

# Test: valid spec reference with existing file
EXIT_CODE=$(echo '{"tool_input":{"prompt":"run feature-planner with docs/specs/44-zod-guard-gitlab-webhook.md"}}' | CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$HOOK_DIR/require-spec.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "allows with valid spec reference" 0 "$EXIT_CODE"

# Test: spec file does not exist
EXIT_CODE=$(echo '{"tool_input":{"prompt":"run feature-implementer with docs/specs/999-nonexistent.md"}}' | CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$HOOK_DIR/require-spec.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "blocks with nonexistent spec" 2 "$EXIT_CODE"

# ─────────────────────────────────────────────
bold "=== session-context.sh ==="

EXIT_CODE=$(CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$HOOK_DIR/session-context.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "runs without error" 0 "$EXIT_CODE"

OUTPUT=$(CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$HOOK_DIR/session-context.sh" 2>/dev/null || true)
TOTAL=$((TOTAL + 1))
if echo "$OUTPUT" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
  green "  PASS: outputs valid JSON"
  PASSED=$((PASSED + 1))
else
  red "  FAIL: outputs valid JSON (got: $OUTPUT)"
  FAILED=$((FAILED + 1))
fi

TOTAL=$((TOTAL + 1))
if echo "$OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'additionalContext' in d" 2>/dev/null; then
  green "  PASS: JSON contains additionalContext"
  PASSED=$((PASSED + 1))
else
  red "  FAIL: JSON contains additionalContext (got: $OUTPUT)"
  FAILED=$((FAILED + 1))
fi

# ─────────────────────────────────────────────
echo ""
bold "=== RESULTS ==="
echo "Total: $TOTAL | Passed: $PASSED | Failed: $FAILED"

if [[ "$FAILED" -gt 0 ]]; then
  red "SOME TESTS FAILED"
  exit 1
else
  green "ALL TESTS PASSED"
  exit 0
fi
