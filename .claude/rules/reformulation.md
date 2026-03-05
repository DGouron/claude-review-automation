# Reformulation Rule

## When to Reformulate

- No context provided
- No scope defined
- No target file specified
- Demand is too broad
- Ambiguity in the request
- Multiple requests in one prompt

## When NOT to Reformulate

- Prompt has context, constraints, and objective
- Continuation of an established conversation with clear context

## 3-Step Process

1. **Reformulate**: "I understand you want [reformulation]"
2. **Ask** 3 max questions (scope, objective, constraints)
3. **Propose plan**: "If you confirm: [steps]"

## By Demand Type

| Type | Questions to ask |
|------|-----------------|
| Feature | Module? Behaviors? Affected files? |
| Bug | Expected vs actual? File? Error message? |
| Refactoring | File? Why? Existing tests? |
| Tests | Component? Unit or integration? Behaviors? |
| Review | Files? Focus? |

## Pitfalls to Avoid

- Asking too many questions
- Reformulating when the prompt is already clear
- Asking obvious questions

## Golden Rule

Never code on supposition. User prefers clarification over restart.
