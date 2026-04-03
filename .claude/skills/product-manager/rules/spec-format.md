# Spec Format

Each spec in `docs/specs/` follows this format:

```markdown
# [Title — action verb + object]

## Context

[Why this feature exists — the user problem, 2-3 sentences max]

## Rules

- [business invariant 1]
- [business invariant 2]
- ...

## Scenarios

- [nominal]: {inputs} → outputs
- [edge case 1]: {inputs} → reject "message"
- [edge case 2]: {inputs} → outputs
- ...

## Out of Scope

- [what we do NOT do]

## Glossary

| Term | Definition |
|------|------------|
| [domain term] | [precise meaning in this context] |
```

## Rules

- **Title**: action verb + object (e.g., "Create a review job", "Validate webhook payload")
- **Context**: max 3 sentences, centered on the user problem
- **Rules**: business invariants in natural language, no technical terms
- **Scenarios**: minimum 1 nominal + 1 edge case, compact DSL format (see `rules/spec-dsl.md`)
- **Out of Scope**: mandatory — frames what we do NOT do
- **Glossary**: mandatory if domain-specific terms exist
- **No code** in the spec — never class names, file paths, or technical patterns

## Legacy Support

Existing specs may use Gherkin format (`## Acceptance Criteria` with Given/When/Then blocks). These remain valid. New specs MUST use the DSL format above.
