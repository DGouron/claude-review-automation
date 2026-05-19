# Event Storming — Statistics & Insights

*Date: 2026-03-22*
*Scope: Review statistics aggregation, developer performance insights, AI-generated narratives*

## Domain Events (🟧)

| Event | Trigger | Source file |
|-------|---------|-------------|
| StatsRecalculated | Manual recalculate via API | `usecases/stats/recalculateProjectStats.usecase.ts` |
| DiffStatsBackfilled | Backfill batch completed for missing diff stats | `usecases/stats/backfillDiffStats.usecase.ts` |
| BackfillProgressUpdated | Batch progress callback during backfill | `usecases/stats/backfillDiffStats.usecase.ts` |
| DeveloperInsightsComputed | Developer metrics calculated from review stats | `usecases/insights/computeDeveloperInsights.usecase.ts` |
| TeamInsightComputed | Team aggregation completed from developer insights | `usecases/insights/computeTeamInsights.usecase.ts` |
| AiInsightsGenerated | Claude produces narrative insights from review data | `usecases/insights/generateAiInsights.usecase.ts` |
| InsightsPersisted | Computed insights saved with rolling window | `usecases/insights/computeInsightsWithPersistence.usecase.ts` |

## Commands / Use Cases (🟦)

| Command | Actor | Event produced | Source file |
|---------|-------|----------------|-------------|
| RecalculateProjectStats | User (API) | StatsRecalculated | `usecases/stats/recalculateProjectStats.usecase.ts` |
| BackfillDiffStats | User (API) | DiffStatsBackfilled | `usecases/stats/backfillDiffStats.usecase.ts` |
| RecalculateWithBackfill | User (API) | DiffStatsBackfilled, StatsRecalculated | `usecases/stats/recalculateWithBackfill.usecase.ts` |
| ComputeDeveloperInsights | System (dashboard request) | DeveloperInsightsComputed | `usecases/insights/computeDeveloperInsights.usecase.ts` |
| ComputeTeamInsights | System | TeamInsightComputed | `usecases/insights/computeTeamInsights.usecase.ts` |
| ComputeInsightsWithPersistence | System | InsightsPersisted | `usecases/insights/computeInsightsWithPersistence.usecase.ts` |
| GenerateAiInsights | User (dashboard button) | AiInsightsGenerated | `usecases/insights/generateAiInsights.usecase.ts` |
| GetInsightsWithAiStatus | System (dashboard) | — (query) | `usecases/insights/getInsightsWithAiStatus.usecase.ts` |

## Entities (🟨)

| Entity | Responsibility | Files |
|--------|----------------|-------|
| ProjectStats | Aggregated review metrics for a project: totalReviews, averageScore, totalBlocking, totalWarnings, diffStats aggregates | `entities/stats/projectStats.ts` |
| ReviewStats | Individual review metrics within ProjectStats | `entities/stats/projectStats.ts` |
| DiffStats | Commit count, additions, deletions, changed files | `entities/diffStats/diffStats.ts` |
| BackfillProgress | Batch progress: total, completed, failed, status | `entities/backfill/backfillProgress.ts` |
| DeveloperInsight | Per-developer performance: title, overallLevel, categoryLevels, strengths, weaknesses, trend | `entities/insight/developerInsight.ts`, `developerInsight.schema.ts` |
| TeamInsight | Team aggregation: averageLevels, strengths, weaknesses, tips | `entities/insight/teamInsight.ts`, `teamInsight.schema.ts` |
| AiInsight | AI-generated narrative from Claude: developer analysis, team recommendations | `entities/insight/aiInsight.ts`, `aiInsight.schema.ts` |
| PersistedInsightsData | Rolling window of processed review IDs + cached metrics | `entities/insight/persistedInsightsData.ts`, `persistedInsightsData.schema.ts` |
| InsightCategory | Enum: quality, responsiveness, codeVolume, iteration | `entities/insight/insightCategory.ts` |
| InsightTrend | Enum: improving, stable, declining | `entities/insight/insightTrend.ts` |
| DeveloperTitle | Enum: architect, firefighter, workhorse, sentinel, balanced, risingStar | `entities/insight/developerTitle.ts` |

## Policies and Business Rules (🟪)

| Rule | Description | Source file |
|------|-------------|-------------|
| Minimum reviews threshold | Developer insights only computed for developers with enough reviews | `usecases/insights/computeDeveloperInsights.usecase.ts` |
| Rolling 20-review window | Persisted insights track last 20 reviews to detect trends | `usecases/insights/computeInsightsWithPersistence.usecase.ts` |
| Batch delay | Backfill uses configurable batch size and delay to avoid API rate limits | `usecases/stats/backfillDiffStats.usecase.ts` |
| Developer title assignment | Title based on strongest category: quality→architect, responsiveness→firefighter, codeVolume→workhorse, iteration→sentinel | `usecases/insights/computeDeveloperInsights.usecase.ts` |
| Trend computation | Comparing current vs previous window averages → improving/stable/declining | `usecases/insights/computeDeveloperInsights.usecase.ts` |
| AI insights staleness | `hasNewReviewsSinceAiGeneration` flag indicates when AI insights need refresh | `usecases/insights/getInsightsWithAiStatus.usecase.ts` |

## Presenters (🟩)

| Presenter | Data exposed | File |
|-----------|-------------|------|
| InsightsPresenter | Formatted insights data for dashboard UI | `interface-adapters/presenters/insights.presenter.ts` |
| ProjectStatsCalculator | Aggregated stats computations | `interface-adapters/presenters/projectStats.calculator.ts` |

## Gateways and External Systems (⬜)

| System | Interaction | Gateway contract | Implementation |
|--------|-------------|-----------------|----------------|
| File System | Persist project stats JSON | `entities/stats/stats.gateway.ts` | `interface-adapters/gateways/stats.gateway.ts` |
| File System | Persist insights data | `entities/insight/insights.gateway.ts` | `interface-adapters/gateways/insights.gateway.ts` |
| GitLab CLI | Fetch diff stats (additions, deletions, commits) | `entities/diffStats/diffStatsFetch.gateway.ts` | `interface-adapters/gateways/diffStatsFetch.gitlab.gateway.ts` |
| GitHub CLI | Fetch diff stats | `entities/diffStats/diffStatsFetch.gateway.ts` | `interface-adapters/gateways/diffStatsFetch.github.gateway.ts` |
| Claude | Generate AI narrative insights | (callback in generateAiInsights) | `frameworks/claude/claudeInvoker.ts` |
| File System | Read review files for AI analysis | `entities/review/reviewFile.gateway.ts` | `interface-adapters/gateways/reviewFile.gateway.ts` |

## Relations with other Bounded Contexts

| Related BC | Pattern (Vaughn Vernon) | Direction | Detail |
|-----------|------------------------|-----------|--------|
| Tracking | Customer-Supplier | Tracking → Stats | Stats consumes TrackedMr data and ReviewEvents for aggregation |
| Review Execution | Published Language | Review → Stats | ReviewScore and review files consumed for analysis |
| Shared Kernel | Shared Kernel | Stats ↔ Tracking | `DiffStats` type shared between both BCs |
| Platform Integration | Customer-Supplier | Platform → Stats | DiffStatsFetchGateway implementations are platform-specific |

## Ubiquitous Language

| Term | Definition in this BC | Equivalent term in other BCs |
|------|----------------------|------------------------------|
| ProjectStats | Aggregated metrics for all reviews in a project | MrTrackingData.stats in Tracking (partial overlap) |
| ReviewStats | Individual review metrics (score, duration, issues) | ReviewEvent in Tracking (different shape) |
| DeveloperInsight | Computed performance profile for one developer | — |
| TeamInsight | Aggregated team performance with tips | — |
| AiInsight | Claude-generated narrative analysis | — |
| Backfill | Retroactive fetching of missing diff statistics | — |

## Hot Spots (🩷)

| Problem | Severity | Detail |
|---------|----------|--------|
| Claude invocation as callback | 🟡 | `generateAiInsights` receives a `claudeInvoker` callback rather than using a gateway contract — inconsistent with other external integrations |
| Stats aggregation duplication | 🟡 | `ProjectStatsCalculator` (presenter) and `recalculateProjectStats` (use case) both compute stats — unclear separation |
| DiffStats as Shared Kernel | 🟡 | `DiffStats` type is imported by both stats and tracking domains — small but real coupling point |
| Insight computation chain | 🟡 | `computeInsightsWithPersistence` → `computeTeamInsights` → `computeDeveloperInsights` — deep call chain could be simplified |
