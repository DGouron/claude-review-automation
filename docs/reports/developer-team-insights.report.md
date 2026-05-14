# Developer & Team Insights

**Spec**: [docs/specs/125-developer-team-insights.md](../specs/125-developer-team-insights.md)
**Merged**: 2026-04-01
**Issue**: [#125](https://github.com/DGouron/review-flow/issues/125)

---

## Scope

- Per-developer insight engine: 4 analysis categories (Quality, Responsiveness, Code Volume, Iteration), dual comparison (vs team average + own historical trend), stat levels 1–10
- RPG-inspired developer cards in a new "Team" tab: avatar, generated title (The Architect, The Firefighter, etc.), stat bars
- Team-wide analysis panel: pros, cons, actionable tips
- Developer sheet (slide panel): radar chart, review history, strengths/weaknesses, top-priority recommendation
- Minimum threshold: 5 reviews per developer before showing insights
- Full i18n (EN/FR) for all titles, labels, and tips

---

## Outcome

Implemented in 3 phases (domain engine → Team tab UI → Developer sheet + Team insights panel). All business rules are deterministic — no LLM calls for insight generation. Title generation is computed from dominant category level.

---

## Tests / Verification

Unit tests cover all Gherkin scenarios: level computation with dual-weight formula, insufficient-data guard, title generation mapping, single-developer edge case (absolute benchmarks), empty-team state. CI green at merge.

---

## Outstanding / Follow-ups

- Cross-project insights (currently per-project only) — explicitly deferred in spec
- Historical insight snapshots — deferred in spec
- Custom thresholds (levels and benchmarks hardcoded in v1) — deferred in spec
