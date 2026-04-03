#!/usr/bin/env bash
set -euo pipefail

# Injects feature tracker status into session context on startup.
# Used as SessionStart hook.
# Outputs JSON with additionalContext field.

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." && pwd)}"
TRACKER="$PROJECT_DIR/docs/feature-tracker.md"

if [[ ! -f "$TRACKER" ]]; then
  exit 0
fi

FEATURE_COUNT=$(tail -n +3 "$TRACKER" | grep -c '|' || true)

if [[ "$FEATURE_COUNT" -eq 0 ]]; then
  exit 0
fi

IMPLEMENTING=$(tail -n +3 "$TRACKER" | grep -c "| implementing |" || true)
IMPLEMENTED=$(tail -n +3 "$TRACKER" | grep -c "| implemented |" || true)
DRAFTED=$(tail -n +3 "$TRACKER" | grep -c "| drafted |" || true)
PLANNED=$(tail -n +3 "$TRACKER" | grep -c "| planned |" || true)

CONTEXT="Feature tracker: ${FEATURE_COUNT} features total"

if [[ "$IMPLEMENTING" -gt 0 ]]; then
  CONTEXT="$CONTEXT, ${IMPLEMENTING} in progress"
fi
if [[ "$PLANNED" -gt 0 ]]; then
  CONTEXT="$CONTEXT, ${PLANNED} planned"
fi
if [[ "$DRAFTED" -gt 0 ]]; then
  CONTEXT="$CONTEXT, ${DRAFTED} drafted"
fi
if [[ "$IMPLEMENTED" -gt 0 ]]; then
  CONTEXT="$CONTEXT, ${IMPLEMENTED} implemented"
fi

CONTEXT="$CONTEXT. See docs/feature-tracker.md for details."

python3 -c "
import json, sys
print(json.dumps({'additionalContext': sys.argv[1]}))
" "$CONTEXT"
