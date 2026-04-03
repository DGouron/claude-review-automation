# Definition of Done (DoD)

A feature is "done" when it satisfies ALL the following criteria:

## Checklist

- [ ] **All spec scenarios covered** by passing tests
- [ ] **TDD respected**: each behavior has a test written BEFORE the code
- [ ] **Tests green**: `yarn test:ci` passes without error
- [ ] **Zero architecture violations**: dependency rule respected
- [ ] **Zero `any`, `as`, `!`** in the code
- [ ] **Full words**: no abbreviations
- [ ] **Imports**: `@/` alias + `.js` extension everywhere
- [ ] **Error messages in French** for the end user
- [ ] **Tests in English**
- [ ] **Code review**: self-review or pair-review done
- [ ] **Acceptance test GREEN**: outer loop proves spec is satisfied

## Rules

- A non-done feature MUST NOT be shipped
- If a criterion fails, fix before declaring "done"
- The DoD is a quality contract, not a suggestion
