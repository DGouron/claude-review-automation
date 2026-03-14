# RICE Calibration — ReviewFlow

## Formula

```
Score = (Reach x Impact x Confidence) / Effort
```

## Calibrated Scales

| Criteria | Scale | Calibration for ReviewFlow |
|----------|-------|---------------------------|
| **Reach** | 1-10 | 1=1 file, 3=1 layer (entities or usecases), 5=cross-layer (entity→usecase→controller), 7=cross-module (webhook+MCP+dashboard), 10=entire platform |
| **Impact** | 0.25-3 | 0.25=cosmetic, 0.5=minor, 1=medium, 2=high (affects reviews), 3=critical (blocks reviews or loses data) |
| **Confidence** | 50%-100% | 50%=theoretical, 80%=analyzed on code, 100%=measured/proven (bug reproduced, failing test) |
| **Effort** | Story points | Fibonacci estimation (1, 2, 3, 5, 8, 13) |

## Interpretation Grid

| Score | Priority | GitHub Label | Color |
|-------|----------|-------------|-------|
| > 3.0 | Critical — treat as priority | `RICE: Critical` | Red |
| 1.5 - 3.0 | Important — plan soon | `RICE: Important` | Orange |
| 0.5 - 1.5 | Moderate — integrate over time | `RICE: Moderate` | Yellow |
| < 0.5 | Low — can wait | `RICE: Low` | Green |

## Output Template

```markdown
## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | X | [modules/features impacted] |
| Impact | X | [level + explanation] |
| Confidence | X% | [source of certainty] |
| Effort | X pts | [story points estimation] |
| **Score** | **X.XX** | |

Priority: [Critical/Important/Moderate/Low]
```

## Rules

- **Consistent RICE**: use the same calibration on all tickets so scores are comparable
- **Honest confidence**: never overestimate confidence to inflate the score
- **Realistic effort**: include tests, review, and deployment in the estimation
- **Code-driven reach**: use `Grep` and `Glob` to measure actual impact in the codebase, not guesses
