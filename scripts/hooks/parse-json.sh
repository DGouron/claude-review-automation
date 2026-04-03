#!/usr/bin/env bash

# Extracts a value from JSON on stdin using a dot-separated path.
# Usage: echo '{"a":{"b":"c"}}' | parse-json.sh a.b
# Returns empty string if path not found. No external dependencies beyond python3.

python3 -c "
import json, sys
data = json.load(sys.stdin)
path = sys.argv[1].split('.')
for key in path:
    if isinstance(data, dict) and key in data:
        data = data[key]
    else:
        sys.exit(0)
print(data if data is not None else '')
" "$1"
