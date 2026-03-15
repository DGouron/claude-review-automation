import type { Presenter } from '@/shared/foundation/presenter.base.js';
import type { DeveloperInsight, CategoryLevels, DeveloperMetrics, InsightDescription } from '@/entities/insight/developerInsight.js';
import type { TeamInsight, AverageLevels } from '@/entities/insight/teamInsight.js';
import type { DeveloperTitle } from '@/entities/insight/developerTitle.js';
import type { InsightCategory } from '@/entities/insight/insightCategory.js';

export interface DeveloperInsightViewModel {
  developerName: string;
  title: DeveloperTitle;
  overallLevel: number;
  categoryLevels: CategoryLevels;
  strengths: InsightCategory[];
  weaknesses: InsightCategory[];
  topPriority: InsightCategory | null;
  reviewCount: number;
  metrics: DeveloperMetrics;
  insightDescriptions: InsightDescription[];
}

export interface TeamInsightViewModel {
  developerCount: number;
  totalReviewCount: number;
  averageLevels: AverageLevels;
  strengths: InsightCategory[];
  weaknesses: InsightCategory[];
  tips: string[];
}

export interface InsightsViewModel {
  isEmpty: boolean;
  developers: DeveloperInsightViewModel[];
  team: TeamInsightViewModel;
}

interface InsightsPresenterInput {
  developerInsights: DeveloperInsight[];
  teamInsight: TeamInsight;
}

export class InsightsPresenter implements Presenter<InsightsPresenterInput, InsightsViewModel> {
  present(data: InsightsPresenterInput): InsightsViewModel {
    const { developerInsights, teamInsight } = data;

    const sortedDevelopers = [...developerInsights].sort(
      (a, b) => b.overallLevel - a.overallLevel,
    );

    return {
      isEmpty: developerInsights.length === 0,
      developers: sortedDevelopers.map((insight) => this.presentDeveloper(insight)),
      team: this.presentTeam(teamInsight),
    };
  }

  private presentDeveloper(insight: DeveloperInsight): DeveloperInsightViewModel {
    return {
      developerName: insight.developerName,
      title: insight.title,
      overallLevel: insight.overallLevel,
      categoryLevels: insight.categoryLevels,
      strengths: insight.strengths,
      weaknesses: insight.weaknesses,
      topPriority: insight.topPriority,
      reviewCount: insight.reviewCount,
      metrics: insight.metrics,
      insightDescriptions: insight.insightDescriptions,
    };
  }

  private presentTeam(teamInsight: TeamInsight): TeamInsightViewModel {
    return {
      developerCount: teamInsight.developerCount,
      totalReviewCount: teamInsight.totalReviewCount,
      averageLevels: teamInsight.averageLevels,
      strengths: teamInsight.strengths,
      weaknesses: teamInsight.weaknesses,
      tips: teamInsight.tips,
    };
  }
}
