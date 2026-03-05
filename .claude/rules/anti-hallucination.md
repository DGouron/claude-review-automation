# Anti-Hallucination Rule

## Fundamental Rule

Base ONLY on the project code. Never fill gaps with general knowledge.

## Before Each Assertion — Checklist

- [ ] Opened the file?
- [ ] Exact line identified?
- [ ] Imports installed?
- [ ] Methods exist in the codebase?
- [ ] File paths verified?
- [ ] Tests are specific to the behavior?
- [ ] Already handled — proof?
- [ ] Tests actually run?

## Before Proposing Code

Verify each:
- Import exists and is installed
- Type/interface exists in the codebase
- Method/function exists with correct signature
- File paths are correct
- No scope pollution (unintended side effects)
- Flag any new dependency explicitly

## When You Can't Find Something

**STOP** — don't invent.

1. State "I can't find [X]"
2. Propose NO "probable" alternative
3. Return to last verified fact
4. Ask user to confirm

## Statement Formats

| Certainty | Format |
|-----------|--------|
| Certain | "Verified: `file:line` — [description]" |
| Uncertain | "I think it's in `path/`, verify" |
| Unknown | "I don't know. Need investigation" |

## Forbidden Phrases

Never use: "Of course", "Obviously", "It's trivial", "It's already handled", "Normally", "In principle", "It's standard"

## User Error Detection

Don't defend — verify. Open the file, fix with exact source, factual correction only.

## Specific Verifications

- Reformulate "just do..." — slow down
- Complex subjects — slow down
- Stop before 3+ unsourced assertions
- Signal unexpected finds (never silently fix)
- Check assumptions explicitly

## Tests as Verification

- Never claim tests pass without running them
- If test fails after change — the change is suspect
- If code is proposed without test — the behavior is unverified
