# Spec #125 — Developer & Team Insights Dashboard

**Issue**: [#125](https://github.com/DGouron/review-flow/issues/125)
**Labels**: enhancement, P2-important, dashboard
**Date**: 2026-03-15

---

## Problem Statement

Users managing code reviews with ReviewFlow can see raw statistics (scores, blocking/warnings counts, durations) but have no way to quickly understand **per-developer strengths and areas for improvement**, or **team-wide patterns and actionable recommendations**. The data exists — `assignedBy` is tracked per review — but no analysis layer transforms these numbers into insights.

**User impact**: A tech lead reviewing team performance must mentally aggregate numbers across developers, guess at trends, and form their own conclusions. This defeats the purpose of an automated review tool.

---

## User Story

**As** a tech lead or developer using ReviewFlow,
**I want** to see per-developer insights (strengths, weaknesses, progression) and team-wide analysis with actionable tips,
**So that** I can identify areas of improvement for each developer and the team, and take targeted action to improve code quality.

---

## Design Direction

### RPG-Inspired Modern UI

The Team tab uses a **modern RPG character sheet** aesthetic:
- **Developer cards** styled like character cards: avatar (from GitHub/GitLab), username, and a **generated title** based on dominant strengths (e.g., "The Architect", "The Firefighter", "The Sentinel")
- **Stat bars** with levels (like video game stat bars) for each analysis category
- **Radar/spider chart** per developer showing category balance
- Design is **modern and elegant** (Persona 5 aesthetic — typographically bold, data-driven) — not pixel art or fantasy

### Developer Titles (examples)

| Dominant Trait | Title (EN) | Title (FR) |
|---|---|---|
| High score, low blocking | The Architect | L'Architecte |
| Fast followup resolution | The Firefighter | Le Pompier |
| Low warnings trend | The Sentinel | La Sentinelle |
| High code volume, good score | The Workhorse | Le Bosseur |
| Improving trend | The Rising Star | L'Étoile Montante |
| Consistently good across all | The Polyvalent | Le Polyvalent |

Title generation is deterministic based on metrics — not AI-generated.

---

## Business Rules

### Data Requirements
- **Minimum reviews threshold**: 5 reviews per developer before showing insights. Below this, show a clear message indicating insufficient data with progress toward threshold.
- **Comparison model**: Dual — both **vs team average** and **vs developer's own historical trend** (last 10 vs previous 10 reviews).
- **Language**: All user-facing text follows the project's selected language (i18n `currentLanguage`), not hardcoded.

### Analysis Categories (4 axes)

| Category | Metrics Used | Insight Examples |
|---|---|---|
| **Quality** | score, blocking count, warnings count | "Score au-dessus de la moyenne équipe", "Tendance bloquants en hausse" |
| **Responsiveness** | review duration, time between review and followup | "Durée de review 30% sous la moyenne", "Itérations rapides" |
| **Code Volume** | diffStats.additions, diffStats.deletions | "Gros volumes de code avec bon score", "Petits changements, beaucoup de bloquants" |
| **Iteration** | review→followup ratio, threadsClosed vs threadsOpened | "Résolution efficace des threads", "Ratio followup/review élevé" |

### Stat Levels

Each category produces a level from 1 to 10 (integer), computed as:
- **Relative component** (60% weight): developer metric vs team average, normalized
- **Trend component** (40% weight): developer's recent performance vs their own history

### Insights Generation

For each developer:
- **Strengths**: Categories where level >= 7 OR trend is improving AND level >= 5
- **Areas to improve**: Categories where level <= 4 OR trend is declining AND level <= 6
- **Top priority**: Single most impactful area to work on (lowest level with declining trend, or lowest absolute level)

For team:
- **Pros**: Categories where team average level >= 7
- **Cons**: Categories where team average level <= 4
- **Tips**: Actionable recommendations derived from team-wide patterns (e.g., "Blocking issues concentrated on 2 developers — consider pair programming")

### Developer Sheet

Clicking a developer card opens the **existing sheet pattern** (same as MR sheet — slide panel) with:
- Full stat bars for all 4 categories
- Radar chart
- Review history filtered for this developer
- Score trend chart filtered for this developer
- Detailed strengths/weaknesses with explanations
- Tip for top priority area

---

## Acceptance Criteria

### Scenario: Team tab displays developer cards with RPG styling

```gherkin
Given a project with at least 2 developers having 5+ reviews each
When the user navigates to the "Team" tab in the dashboard
Then each developer is displayed as a card with:
  | Element          | Source                                      |
  | Avatar           | GitHub/GitLab avatar URL from assignment     |
  | Username         | assignment.username                          |
  | Title            | Generated from dominant strength category    |
  | 4 stat bars      | Quality, Responsiveness, Code Volume, Iteration |
  | Overall level    | Weighted average of 4 categories             |
And the cards are sorted by overall level descending
```

### Scenario: Developer with insufficient data shows progress message

```gherkin
Given a developer "alice" with only 3 reviews
When the Team tab is displayed
Then alice's card shows a message "3/5 reviews — more data needed"
And the stat bars are greyed out / not displayed
And no insights are generated for alice
```

### Scenario: Developer stat levels computed with dual comparison

```gherkin
Given developer "bob" with 15 reviews
And the team average score is 6.5
And bob's average score is 8.2
And bob's last 10 reviews average score is 8.5
And bob's previous 10 reviews average score is 7.8
When insights are computed for bob
Then the Quality level reflects both:
  | Component  | Weight | Signal                              |
  | Relative   | 60%    | bob (8.2) vs team (6.5) → above avg |
  | Trend      | 40%    | 8.5 vs 7.8 → improving              |
And the Quality level is >= 8
```

### Scenario: Developer sheet opens with full details

```gherkin
Given developer "charlie" has 10+ reviews with insights computed
When the user clicks on charlie's developer card
Then a sheet panel slides open (same pattern as MR sheet)
And the sheet displays:
  - Full radar chart for 4 categories
  - Stat bars with numeric levels
  - Strengths list with explanations
  - Areas to improve list with explanations
  - Top priority recommendation
  - Score trend chart filtered for charlie
  - Review history table filtered for charlie
```

### Scenario: Team-level insights are displayed

```gherkin
Given a project with 3+ developers having 5+ reviews each
When the Team tab is displayed
Then a "Team Insights" section shows:
  - Team strengths (categories with avg level >= 7)
  - Team weaknesses (categories with avg level <= 4)
  - Actionable tips based on team patterns
And tips reference specific data points (not generic advice)
```

### Scenario: Developer title is generated from dominant strength

```gherkin
Given developer "dana" has:
  - Quality level: 9
  - Responsiveness level: 5
  - Code Volume level: 6
  - Iteration level: 6
When the title is computed for dana
Then the title is "The Architect" (EN) or "L'Architecte" (FR)
Because Quality is the dominant category (highest level)
```

### Scenario: All text follows project language setting

```gherkin
Given the project language is set to "fr"
When the Team tab and developer sheets are displayed
Then all labels, titles, insights, and tips are displayed in French
And when the language is switched to "en"
Then all text updates to English
```

### Scenario: Empty team state

```gherkin
Given a project with no review data
When the user navigates to the Team tab
Then a clear empty state is shown: "No review data yet. Reviews will appear here once the first review is completed."
```

### Scenario: Single developer team

```gherkin
Given a project with only 1 developer having 5+ reviews
When insights are computed
Then relative comparison uses absolute benchmarks instead of team average
And the developer card and sheet still display correctly
And team insights section shows "Not enough developers for team comparison"
```

---

## Architecture Layers (Clean Architecture)

| Layer | Component | Responsibility |
|---|---|---|
| **Entity** | `DeveloperInsight` type | Developer insight data shape (levels, strengths, weaknesses, title) |
| **Entity** | `TeamInsight` type | Team insight data shape (pros, cons, tips) |
| **Entity** | `InsightCategory` type | Category enum + level computation rules |
| **Use Case** | `ComputeDeveloperInsights` | Aggregates ReviewStats by developer, computes levels and insights |
| **Use Case** | `ComputeTeamInsights` | Aggregates developer insights into team-level analysis |
| **Presenter** | `DeveloperInsightsPresenter` | Transforms domain insights → view model for dashboard |
| **View** | `teamTab.js` | Renders team tab with developer cards (humble object) |
| **View** | `developerSheet.js` | Renders developer detail sheet (humble object) |
| **i18n** | Translation keys | All insight/tip text as i18n keys in both EN and FR |

---

## Implementation Phases

### Phase A: Developer Insights Engine (domain + use case)
- Entity types (`DeveloperInsight`, `TeamInsight`, `InsightCategory`)
- `ComputeDeveloperInsights` use case with full level computation
- `ComputeTeamInsights` use case
- Unit tests with factories
- API endpoint `GET /api/insights?path=<projectPath>`

### Phase B: Team Tab UI (developer cards)
- Team tab in dashboard navigation
- Developer cards with RPG styling (avatar, title, stat bars)
- Insufficient data state
- Empty states
- i18n keys (EN + FR)

### Phase C: Developer Sheet + Team Insights Panel
- Developer sheet (slide panel with radar chart, history, details)
- Team insights section (pros, cons, tips)
- Score trend chart integration per developer

---

## Out of Scope

What is NOT included in this ticket:
- **AI-generated insights**: All insights are rule-based, derived from metrics — no LLM calls
- **Historical snapshots**: No storing insight history over time — computed live from current stats
- **Gamification beyond titles**: No XP, no achievements, no leaderboards — just titles and levels
- **Custom thresholds**: Levels and benchmarks are hardcoded — no user configuration in v1
- **Cross-project insights**: Insights are per-project only — no aggregation across repositories
- **Avatar upload/customization**: Uses GitHub/GitLab avatar only
- **Notification on insight changes**: No alerts when a developer's level changes

---

## Open Questions

No blocking questions remain. Non-blocking design decisions to finalize during implementation:

1. **Radar chart library**: Canvas-based (consistent with existing charts) or SVG? Recommend canvas for consistency.
2. **Title mapping exhaustiveness**: The title list may need expansion as edge cases emerge — fine to iterate.
3. **Stat bar animation**: Animate on tab open or static? Recommend subtle animation for RPG feel.

---

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | ✅ | Depends only on existing ReviewStats data and dashboard infrastructure |
| Negotiable | ✅ | RPG theme intensity, number of categories, level computation can be adjusted |
| Valuable | ✅ | Transforms raw data into actionable developer and team insights |
| Estimable | ✅ | 3 clear phases, each estimable (A: 1-2d, B: 1-2d, C: 1-2d) |
| Small | ⚠️ | Total ~4-6 days — mitigated by 3 independently shippable phases |
| Testable | ✅ | Gherkin scenarios cover all cases including edge cases |

---

## Definition of Done

- [ ] Code implemented and fulfills the user story
- [ ] Unit tests cover Gherkin scenarios
- [ ] CI green (tests + lint + typecheck)
- [ ] Code review approved
- [ ] Documentation updated (if applicable)
- [ ] Deployed to test environment
- [ ] Acceptance criteria validated by QA/PO
- [ ] No e2e regression
- [ ] No untracked technical debt
