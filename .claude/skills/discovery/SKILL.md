---
name: discovery
description: Business discovery before technical specs. Use to explore a problem, define personas, clarify the value proposition. Produces Lean Canvas, Personas, and Problem Statements in /docs/business/.
---

# Discovery - Business Exploration

## Persona

Read `.claude/roles/specifier.md` — adopt this profile and follow all its rules.

## Philosophy

Discovery comes BEFORE specs. We explore:
- **The problem** — not the solution
- **The users** — their pain points, not their requests
- **The value** — the benefit, not the feature

> "Fall in love with the problem, not the solution." — Uri Levine

---

## Activation

This skill activates when the user wants to explore:
- "I want to explore...", "What problem are we solving?"
- "Who are the users?", "Discovery on..."
- "What is the value proposition?"
- "Lean canvas for...", "Persona of..."

---

## Produced artifacts

| Artifact | File | When to use |
|----------|------|-------------|
| **Problem Statement** | `docs/business/problems/<name>.md` | Define the problem precisely |
| **Persona** | `docs/business/personas/<name>.md` | Understand who has the problem |
| **Lean Canvas** | `docs/business/canvas/<name>.md` | Overview of an opportunity |

---

## Workflow

### Entry point

```
DISCOVERY - Start

You want to explore: [subject]

Where do we begin?
1. Problem Statement — What problem exactly?
2. Persona — Who has this problem?
3. Lean Canvas — Overview of the opportunity?

Choose your entry point, or tell me what you already know.
```

---

## Problem Statement

### Construction dialogue

```
PROBLEM STATEMENT - Exploration

I see: [vague description of the problem]

Let's dig deeper:
1. Who exactly has this problem?
2. When/where does it manifest?
3. What do they do today to work around it?
4. What is the consequence if we don't solve it?

Answer what resonates, we'll iterate.
```

### Output template

File: `docs/business/problems/<name>.md`

```markdown
# Problem Statement: [Explicit title]

## The problem

[Persona] encounters [problem] when [context/trigger].

Today, [persona] [current behavior / workaround].

This causes [negative consequence] and [measurable impact].

## Frequency and severity

| Dimension | Assessment |
|-----------|------------|
| Frequency | [daily/weekly/monthly/occasional] |
| Severity | [blocking/hindering/irritating] |
| Affected population | [estimate] |

## Hypotheses to validate

- [ ] [Hypothesis about the existence of the problem]
- [ ] [Hypothesis about frequency]
- [ ] [Hypothesis about impact]

## What the problem is NOT

- [Red herring 1 — why it's a red herring]
- [Red herring 2]

## Research questions

- [Open question to explore]
```

---

## Persona

### Construction dialogue

```
PERSONA - Construction

I'm going to ask you questions to define this persona.

1. Who is this person? (role, context, environment)
2. What are they trying to accomplish? (goals)
3. What frustrates them today? (pain points)
4. How do they handle the problem currently? (workarounds)

Start by describing this person as if you were introducing them to me.
```

### Output template

File: `docs/business/personas/<name>.md`

```markdown
# Persona: [Descriptive name]

## Identity

| Attribute | Description |
|-----------|-------------|
| Role | [role in the usage context] |
| Context | [environment, constraints, resources] |
| Experience | [expertise level on the subject] |

## Goals

What this person wants to accomplish:

1. **[Primary goal]** — [why it matters to them]
2. **[Secondary goal]** — [why it matters]

## Frustrations (Pain Points)

What blocks or irritates them today:

1. **[Frustration 1]** — Impact: [concrete consequence]
2. **[Frustration 2]** — Impact: [concrete consequence]

## Current behaviors

How they handle the problem today:

- [Workaround 1] — [limitations of this solution]
- [Workaround 2] — [limitations]

## Typical quote

> "[A sentence this person would say, capturing their mindset]"

## Success criteria

How do they know their problem is solved?

- [Measurable criterion 1]
- [Measurable criterion 2]

## Anti-persona

This persona is NOT:
- [Profile not to confuse with — why]
```

---

## Lean Canvas

### Construction dialogue

```
LEAN CANVAS - Construction

We're going to build the canvas block by block.

Let's start with the most important:
1. What is the main problem? (not 10, just 1-3)
2. For whom? (priority segment)

Once we have that, we continue with the value proposition.
```

### Output template

File: `docs/business/canvas/<name>.md`

```markdown
# Lean Canvas: [Product/feature name]

## 1. Problem

The 3 main problems:

1. **[Problem 1]**
2. **[Problem 2]**
3. **[Problem 3]**

### Existing alternatives

How users solve these problems today:

- [Current solution 1] — [limitations]
- [Current solution 2] — [limitations]

---

## 2. User segments

| Segment | Characteristics | Priority |
|---------|-----------------|----------|
| Early Adopters | [who will adopt first and why] | Target |
| Main market | [who represents the volume] | Later |

---

## 3. Unique value proposition

> [One sentence explaining why it's different and why it's worth it]

### High-Level Concept

"It's like [known analogy] for [specific context]"

---

## 4. Solution

The 3 key features:

| Feature | Solves |
|---------|--------|
| [Feature 1] | Problem 1 |
| [Feature 2] | Problem 2 |
| [Feature 3] | Problem 3 |

---

## 5. Channels

How to reach users:

- **Acquisition**: [how they discover]
- **Activation**: [how they start using]
- **Retention**: [how they come back]

---

## 6. Revenue streams

- [Revenue source 1] — [model: subscription, one-shot, freemium...]
- [Revenue source 2]

---

## 7. Cost structure

| Type | Cost | Recurrence |
|------|------|------------|
| [Fixed cost] | [amount] | [monthly/yearly] |
| [Variable cost] | [amount/unit] | [per usage] |

---

## 8. Key metrics

| Metric | Target | Why this metric |
|--------|--------|-----------------|
| [Metric 1] | [target] | [what it measures] |
| [Metric 2] | [target] | [what it measures] |

---

## 9. Competitive advantage

What cannot be easily copied:

- [Advantage 1] — [why it's defensible]
- [Advantage 2]

---

## Hypotheses to validate

| Hypothesis | Risk if wrong | How to validate | Status |
|------------|---------------|-----------------|--------|
| [Hypothesis 1] | [impact] | [method] | Pending |
| [Hypothesis 2] | [impact] | [method] | Pending |
```

---

## Anti-patterns to block

| Anti-pattern | Example | Reaction |
|--------------|---------|----------|
| Jumping to solutions | "We'll build a mobile app" | Go back to the problem |
| Generic persona | "Users want..." | Ask who exactly |
| Problem without impact | "It's not optimal" | Ask for the consequence |
| Canvas without hypotheses | "We know that..." | Challenge the certainties |
| Confusing request/need | "They want a button" | Dig into the why |

---

## Challenge examples

**Request**: "We want to add a gamification feature"

```
DISCOVERY - Challenge

"Gamification" is a solution, not a problem.

Questions:
1. What user behavior do you want to encourage?
2. Why don't users do it naturally?
3. How do you know gamification will work?

Let's go back to the problem before discussing solutions.
```

**Request**: "Our users want an Excel export"

```
DISCOVERY - Challenge

Warning: what users ask for is not always what they need.

Questions:
1. What do they do with that Excel once exported?
2. If we gave them the end result directly, would that work?
3. Who is asking for this exactly? (persona)

Maybe the real need is a dashboard, not an export.
```

---

## Integration with other skills

After discovery:
- `/pm` to turn insights into actionable specs
- `/ddd` if a new bounded context emerges
