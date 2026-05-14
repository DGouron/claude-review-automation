#!/usr/bin/env bash
set -euo pipefail

# Tests for the 3 Clean Architecture enforcement hooks.
# Run: bash scripts/hooks/tests/test-architecture-hooks.sh

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASSED=0
FAILED=0
TOTAL=0

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
bold()  { printf "\033[1m%s\033[0m\n" "$1"; }

assert_exit() {
  local name="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [[ "$actual" -eq "$expected" ]]; then
    green "  PASS: $name (exit $actual)"
    PASSED=$((PASSED + 1))
  else
    red "  FAIL: $name (expected exit $expected, got $actual)"
    FAILED=$((FAILED + 1))
  fi
}

payload() {
  python3 -c "
import json, sys
print(json.dumps({'tool_input': {'file_path': sys.argv[1], 'content': sys.argv[2], 'new_string': ''}}))
" "$1" "$2"
}

# ─────────────────────────────────────────────────────────────
bold "=== enforce-dependency-rule.sh ==="

# Entity importing interface-adapters → blocked
EXIT=$(payload "/project/src/entities/foo/foo.gateway.ts" \
  "import type { Bar } from '@/interface-adapters/gateways/bar.js'" \
  | "$HOOK_DIR/enforce-dependency-rule.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "entity cannot import interface-adapters" 2 "$EXIT"

# Entity importing usecases → blocked
EXIT=$(payload "/project/src/entities/foo/foo.ts" \
  "import type { Usecase } from '@/usecases/something.usecase.js'" \
  | "$HOOK_DIR/enforce-dependency-rule.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "entity cannot import usecases" 2 "$EXIT"

# Entity importing frameworks → blocked
EXIT=$(payload "/project/src/entities/foo/foo.ts" \
  "import type { Queue } from '@/frameworks/queue/pQueueAdapter.js'" \
  | "$HOOK_DIR/enforce-dependency-rule.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "entity cannot import frameworks" 2 "$EXIT"

# Entity importing within entities → allowed
EXIT=$(payload "/project/src/entities/foo/foo.ts" \
  "import type { Bar } from '@/entities/bar/bar.js'" \
  | "$HOOK_DIR/enforce-dependency-rule.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "entity can import other entities" 0 "$EXIT"

# Usecase importing interface-adapters → blocked
EXIT=$(payload "/project/src/usecases/doSomething.usecase.ts" \
  "import type { SomeGateway } from '@/interface-adapters/gateways/some.gateway.js'" \
  | "$HOOK_DIR/enforce-dependency-rule.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "usecase cannot import interface-adapters" 2 "$EXIT"

# Usecase importing frameworks → blocked
EXIT=$(payload "/project/src/usecases/doSomething.usecase.ts" \
  "import type { ReviewJob } from '@/frameworks/queue/pQueueAdapter.js'" \
  | "$HOOK_DIR/enforce-dependency-rule.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "usecase cannot import frameworks" 2 "$EXIT"

# Usecase importing entities (valid) → allowed
EXIT=$(payload "/project/src/usecases/doSomething.usecase.ts" \
  "import type { ReviewContextGateway } from '@/entities/reviewContext/reviewContext.gateway.js'" \
  | "$HOOK_DIR/enforce-dependency-rule.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "usecase can import entities" 0 "$EXIT"

# File outside src/ → always allowed
EXIT=$(payload "/project/scripts/build.ts" \
  "import type { Foo } from '@/interface-adapters/gateways/foo.js'" \
  | "$HOOK_DIR/enforce-dependency-rule.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "non-src file always allowed" 0 "$EXIT"

# ─────────────────────────────────────────────────────────────
bold "=== enforce-gateway-port-purity.sh ==="

# Entity gateway with interface → allowed
EXIT=$(payload "/project/src/entities/review/reviewContext.gateway.ts" \
  "export interface ReviewContextGateway { create(): void }" \
  | "$HOOK_DIR/enforce-gateway-port-purity.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "entity gateway with interface is allowed" 0 "$EXIT"

# Entity gateway with abstract class → allowed
EXIT=$(payload "/project/src/entities/review/reviewContext.gateway.ts" \
  "export abstract class ReviewContextGateway { abstract create(): void }" \
  | "$HOOK_DIR/enforce-gateway-port-purity.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "entity gateway with abstract class is allowed" 0 "$EXIT"

# Entity gateway with plain class → blocked
EXIT=$(payload "/project/src/entities/review/reviewContext.gateway.ts" \
  "export class ReviewContextGateway { create(): void {} }" \
  | "$HOOK_DIR/enforce-gateway-port-purity.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "entity gateway with plain class is blocked" 2 "$EXIT"

# Implementation in interface-adapters with plain class → allowed (not in entities/)
EXIT=$(payload "/project/src/interface-adapters/gateways/reviewContext.fileSystem.gateway.ts" \
  "export class ReviewContextFileSystemGateway implements ReviewContextGateway {}" \
  | "$HOOK_DIR/enforce-gateway-port-purity.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "gateway impl in interface-adapters with plain class is allowed" 0 "$EXIT"

# Non-gateway entity file → not checked
EXIT=$(payload "/project/src/entities/review/reviewContext.ts" \
  "export class ReviewContext { private constructor() {} }" \
  | "$HOOK_DIR/enforce-gateway-port-purity.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "non-gateway entity file not checked" 0 "$EXIT"

# ─────────────────────────────────────────────────────────────
bold "=== enforce-presenter-class.sh ==="

# Presenter with class ending in Presenter → allowed
EXIT=$(payload "/project/src/interface-adapters/presenters/jobStatus.presenter.ts" \
  "export class JobStatusPresenter { present(input: unknown) { return {} } }" \
  | "$HOOK_DIR/enforce-presenter-class.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "presenter class *Presenter is allowed" 0 "$EXIT"

# Presenter with class ending in Calculator → allowed
EXIT=$(payload "/project/src/interface-adapters/presenters/score.presenter.ts" \
  "export class ScoreCalculator { compute(input: unknown) { return 0 } }" \
  | "$HOOK_DIR/enforce-presenter-class.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "presenter class *Calculator is allowed" 0 "$EXIT"

# Presenter with function export → blocked
EXIT=$(payload "/project/src/interface-adapters/presenters/jobStatus.presenter.ts" \
  "export function presentJobStatus(input: unknown) { return {} }" \
  | "$HOOK_DIR/enforce-presenter-class.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "presenter function export is blocked" 2 "$EXIT"

# Non-presenter .ts file → not checked
EXIT=$(payload "/project/src/interface-adapters/controllers/webhook.controller.ts" \
  "export function handleWebhook() {}" \
  | "$HOOK_DIR/enforce-presenter-class.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "non-presenter file not checked" 0 "$EXIT"

# presenter.ts outside interface-adapters/presenters/ → not checked
EXIT=$(payload "/project/src/entities/foo/foo.presenter.ts" \
  "export function fooPresenter() {}" \
  | "$HOOK_DIR/enforce-presenter-class.sh" > /dev/null 2>&1; echo $?) || true
assert_exit "presenter outside interface-adapters/presenters/ not checked" 0 "$EXIT"

# ─────────────────────────────────────────────────────────────
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
