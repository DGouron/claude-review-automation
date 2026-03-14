# Anti-patterns — Claude Code Agents

## 1. Generic persona

```
❌ "You are a senior full-stack developer"
✅ "You are an Architecture audit agent for ReviewFlow Clean Architecture Fastify/TypeScript"
```

**Why**: A generic persona doesn't guide decisions. The agent wastes time guessing context.

## 2. Inline prompt instead of agent file

```
❌ Store prompt in references/planner-prompt.md → copied into Agent(prompt=...) each call
✅ Create .claude/agents/feature-planner.md → skills preloaded, YAML config, reusable
```

**Why**: An agent file is the source of truth. It centralizes prompt + config + skills.

## 3. No preloaded skills

```
❌ "Read .claude/skills/tdd/SKILL.md before starting"
   → Agent may forget, wrong path, or not read

✅ skills: [tdd] in YAML frontmatter
   → Content injected automatically, zero tool calls, guaranteed
```

**Why**: `skills:` is a guaranteed import. "Read this file" is an optional import.

## 4. Too much context in prompt

```
❌ Copy 200 lines of CLAUDE.md into agent prompt
✅ Preload the architecture skill via YAML + point to coding-standards.md (1 Read)
```

**Why**: Context window is shared. Preloaded skills replace inline context.

## 5. Omniscient agent (scope too large)

```
❌ "Read ALL project files and produce a complete report"
✅ "Read the 10 files in src/usecases/ and verify dependency rule"
✅ Split into parallel agents with targeted scopes
```

**Why**: An agent reading > 20 files saturates its context. Analysis quality degrades.

## 6. No defined output format

```
❌ "Analyze the code and tell me what you find"
✅ "Produce FINDING blocks with SEVERITY, SCOPE, EVIDENCE, RECOMMENDATION"
```

**Why**: Without format, the agent produces free text that's hard to exploit.

## 7. Sequential mission in a parallelizable agent

```
❌ One agent does Architecture THEN Testing THEN Security
✅ 3 parallel agents with run_in_background: true
```

**Why**: Parallel agents each have their own context window. 3x faster.

## 8. Wrong permission mode

```
❌ Launch an implementation agent in default mode → blocked on every Write/Bash
✅ permissionMode: bypassPermissions for agents that write
✅ permissionMode: default for read-only agents
```

## 9. Duplicate work between agent and main conversation

```
❌ Launch an Explore agent then do the same Grep/Read in the main conversation
✅ Wait for agent result, work on non-overlapping files meanwhile
```

## 10. Agent without proof of execution

```
❌ Agent creates code but doesn't run tests
✅ Agent runs yarn test:ci and includes output
✅ Every finding has an EVIDENCE field with code snippet or path
```

## 11. Implementation agent without self-review

```
❌ Agent codes → returns result → done
✅ Phase 2: SELF-REVIEW → full test suite → reread vs coding-standards → fix loop (max 3)
```

**Why**: The agent has the best context to self-review — it just created everything.

## 12. Skipping the planning phase

```
❌ "Create a new review module" (no plan)
✅ First a Planner agent (read-only) → then an Implementer that executes the validated plan
```

**Why**: A plan costs 5 min. A rework costs 30+ min.

## 13. Too many preloaded skills

```
❌ skills: [tdd, architecture, typescript, solid, anti-overengineering, ddd]
   → 6 skills × ~4k tokens = ~24k consumed before starting

✅ skills: [tdd, clean-architecture]
   → 2 essential + point to coding-standards.md for the rest
```

**Why**: Each preloaded skill consumes context. 3 skills max.
