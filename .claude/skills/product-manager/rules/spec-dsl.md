# ReviewFlow Spec DSL

## Why a Custom DSL

- Better signal/token ratio than Gherkin (~40% more compact)
- No binding layer (Cucumber) needed
- Directly translatable to tests without ambiguity
- Human-readable AND agent-parseable

## Scenario Structure

```
- <label>: {<inputs>} → <outputs>
```

- **label**: short scenario name (e.g., `valid`, `no reviewer`, `invalid URL`)
- **inputs**: entry data in object notation
- **outputs**: expected result (status, returned value, error)

## Conventions

- `→ reject "message"`: the system refuses with this error message (in French)
- `→ status "<value>"`: the resulting entity has this status
- `→ <property> "<value>"`: the resulting entity has this property
- `+` to combine multiple outputs: `→ status "pending" + jobId "RV-*"`
- `*` as wildcard in values

## Complete Example

```markdown
# Create a Review Job

## Context
The reviewer must be able to create a review job from a merge request.

## Rules
- review requires: merge request URL, reviewer assignment
- new review status: "pending"
- job ID format: "RV-XXXXXXXX"
- reviewer is mandatory

## Scenarios
- valid: {mergeRequestUrl: "https://gitlab.com/mr/42", reviewer: "alice"} → status "pending" + jobId "RV-*"
- no reviewer: {mergeRequestUrl: "https://gitlab.com/mr/42"} → reject "Le reviewer est obligatoire"
- invalid URL: {mergeRequestUrl: "", reviewer: "alice"} → reject "L'URL de la merge request est invalide"

## Out of Scope
- Automatic reviewer assignment
- Multi-reviewer support
```

## Rules

- **Rules** = business invariants (what the business-rules-extractor will find in the code)
- **Scenarios** = concrete examples (what the tests will verify)
- One scenario = one behavior. No mega-scenarios
- Minimum 1 nominal + 1 edge case
- Error messages always in French
- No technical jargon in rules or scenarios
