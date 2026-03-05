# /status — Complete Project Diagnostic

**Read-only. No modifications.**

## 1. Technical Health

Run and report results:

```bash
yarn typecheck          # TypeScript validation
yarn lint               # Biome linting
yarn test:ci            # Tests
yarn coverage           # Coverage report
```

## 2. Structure by Module

For each directory under `src/`:
- File count
- Test count (matching files in `src/tests/units/`)

## 3. Technical Debt

- Files > 200 lines (list with line count)
- `TODO` / `FIXME` / `HACK` / `WORKAROUND` grep (count + locations)

## 4. Git

- Current branch
- Last 10 commits (`git log --oneline -10`)
- Uncommitted files (`git status`)

## 5. Outdated Dependencies

```bash
yarn outdated
```

## 6. .claude/ Coherence

- Structure files present (rules/, roles/, agents/, skills/, commands/)
- Agents → Roles mapping verified (each agent references a valid role)

## 7. Synthesis

| Check | Status |
|-------|--------|
| Types | PASS / FAIL |
| Lint | PASS / FAIL |
| Tests | PASS / FAIL |
| Coverage | X% statements, X% branches |

**Debt metrics**: Files > 200 lines, TODO count, outdated deps

**Problems list** or "All good"

## Rules

- Read-only — do not modify anything
- If a command fails, note the error and continue
- Report facts, not interpretation
