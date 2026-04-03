# INVEST Criteria

Each spec must pass all 6 INVEST criteria before being considered ready.

| Criterion | Question | Threshold |
|-----------|----------|-----------|
| **I** — Independent | Can this spec be implemented without depending on another in-flight spec? | Yes = OK |
| **N** — Negotiable | Is the "how" free? Only the "what" is fixed? | No imposed code = OK |
| **V** — Valuable | Does the end user get a direct benefit? | Identifiable benefit = OK |
| **E** — Estimable | Can we estimate complexity without ambiguity? | No grey zones = OK |
| **S** — Small | Implementable in 1-3 TDD sessions? | Less than 15 files = OK |
| **T** — Testable | Does each rule have an associated scenario? | 100% covered = OK |

## How to Evaluate

For each criterion, answer with:
- **OK**: criterion is satisfied
- **WARN**: criterion is borderline, needs monitoring
- **KO**: criterion is NOT satisfied — block and fix

## Expected Output

```
INVEST Evaluation:
  I — Independent : OK
  N — Negotiable  : OK
  V — Valuable    : OK
  E — Estimable   : WARN — scope of score calculation unclear
  S — Small       : OK
  T — Testable    : OK

Verdict: READY (or BLOCK if any KO)
```

A single **KO** = the spec goes back to clarification.
