# /test — Complete Test Verification

**Read-only. No fixes.**

## 1. Run All Tests

```bash
yarn test:ci --reporter=verbose
```

## 2. Failed Tests

Grep for FAIL / Error in output. List each with file and test name.

## 3. Files Without Tests

Find `*.ts` files under `src/` that have no matching `*.test.ts` in `src/tests/units/`.

Exclude: type definitions, index files, config files.

## 4. Test Quality

### Tests without assertions

Search for test blocks missing `expect` / `assert` / `toBe` / `toEqual`.

### Tests with excessive mocks

Search for tests with > 3 mocks (`vi.fn` / `vi.mock` / `vi.spyOn`).

## 5. History

- Last 10 test-related commits (`git log --oneline --all --grep="test"`)
- Tests added this week (`git diff --stat HEAD~7 -- "src/tests/"`)

## 6. Synthesis

| Metric | Value |
|--------|-------|
| Total tests | X |
| Passed | X |
| Failed | X |
| Statements coverage | X% |
| Branches coverage | X% |

**Untested files** (prioritized):

| Priority | File | Reason |
|----------|------|--------|
| BLOCKING | Business logic files | Core domain untested |
| Important | Adapter files | Interface layer untested |
| Acceptable | Types / config | Low risk |

**Actions list** or "All good"

## Rules

- Read-only — don't fix anything
- Prioritize untested business logic files
- Report facts, not interpretation
