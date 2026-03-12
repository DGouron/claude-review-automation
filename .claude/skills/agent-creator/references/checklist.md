# Agent Validation Checklist

Validate each point before publishing an agent.

## Agent file

- [ ] File created in `.claude/agents/<name>.md` (not in references/)
- [ ] YAML frontmatter with `name` and `description`
- [ ] `description` is precise — Claude matches on this field for delegation
- [ ] `name` in lowercase + hyphens

## YAML configuration

- [ ] `model` appropriate (`sonnet` for read-only, `opus` for code)
- [ ] `permissionMode` correct (`bypassPermissions` if writing, `default` if read-only)
- [ ] `maxTurns` sized (15 for explore, 50-100 for implementation)
- [ ] `tools` explicit allowlist (not all tools if unnecessary)
- [ ] `skills` preloaded (max 3, most relevant)

## Skills preloading

- [ ] Relevant skills identified (no more than 3)
- [ ] Skills preloaded via `skills:` in YAML (not "read this file")
- [ ] Coding standards referenced (`Read .claude/rules/coding-standards.md`)
- [ ] No duplication between preloaded skills and inline prompt

## Prompt

- [ ] Specific persona (not generic) — max 3 lines
- [ ] Light project context — max 10 lines (the bulk comes from preloaded skills)
- [ ] Numbered mission — max 7 steps
- [ ] Explicit constraints — max 10 rules
- [ ] Defined output format — template or example
- [ ] File scope defined — not "entire project"

## Self-review (if agent creates code)

- [ ] SELF-REVIEW phase present after implementation
- [ ] Full test suite launched (`yarn test:ci`)
- [ ] Each file reread vs coding standards
- [ ] Fix loop with max iterations defined (recommended: 3)
- [ ] Escalation documented if blocked (list issues + diagnosis)

## ReviewFlow specifics

- [ ] Respects Clean Architecture (dependency rule, 5 layers)
- [ ] Naming conventions recalled (full words, camelCase .ts, @/ aliases + .js)
- [ ] Correct language (code/tests English, user-facing French)
- [ ] TDD mentioned if agent creates code
- [ ] Factories and stubs for tests (not vi.fn() for gateways)

## Output

- [ ] Structured format (no free text)
- [ ] Evidence required (tests, evidence, snippets)
- [ ] Reasonable output size (< 500 lines)
- [ ] "Do NOT commit" if agent creates files

## Post-execution

- [ ] Result matches expectations?
- [ ] Context window not saturated? (check tool call count)
- [ ] Preloaded skills were the right ones?
- [ ] Self-review caught real problems?
- [ ] Prompt to adjust for next time?
- [ ] Reusable pattern → document in agent-patterns.md
