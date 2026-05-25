import type { RepositoryConfig } from '@/frameworks/config/configLoader.js';
import type { ReviewFileInfo } from '@/modules/review-execution/entities/review/reviewFile.gateway.js';
import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import { Duration } from '@/modules/shared-kernel/entities/shared/duration.valueObject.js';

export interface OverviewProjectStatsSummary {
  totalReviews: number;
  averageScore: number | null;
  averageDuration: number;
  totalBlocking: number;
  totalWarnings: number;
}

export interface OverviewProjectStatsEntry {
  project: string;
  path: string;
  stats: ProjectStats;
  summary: OverviewProjectStatsSummary;
}

const SPARKLINE_MAX_POINTS = 10;
const RECENT_FEED_MAX_ITEMS = 10;
const EMPTY_ELAPSED_LABEL = '—';
const EMPTY_PROJECT_LABEL = '—';
const EMPTY_SCORE_LABEL = '-';

export interface OverviewActiveJobInput {
  id: string;
  mrNumber: number;
  project: string;
  mrUrl: string;
  status: string;
  startedAt?: string;
  title?: string;
  jobType?: 'review' | 'followup';
}

export interface OverviewPresenterInput {
  repositories: RepositoryConfig[];
  activeJobs: OverviewActiveJobInput[];
  projectStats: OverviewProjectStatsEntry[];
  recentReviews: ReviewFileInfo[];
}

export interface OverviewActiveReviewItem {
  jobId: string;
  projectName: string;
  projectPath: string;
  mrPrefix: 'MR' | 'PR';
  mrNumber: number;
  mrUrl: string;
  elapsedLabel: string;
  jobType: 'review' | 'followup';
}

export interface OverviewActiveReviewsSection {
  items: OverviewActiveReviewItem[];
  isEmpty: boolean;
  emptyMessage: string;
}

export interface OverviewProjectCardItem {
  projectName: string;
  projectPath: string;
  platform: 'gitlab' | 'github';
  totalReviews: number;
  averageScoreLabel: string;
  sparklinePoints: number[];
  isEmptyHistory: boolean;
}

export interface OverviewProjectCardsSection {
  items: OverviewProjectCardItem[];
  isEmpty: boolean;
  emptyMessage: string;
}

export interface OverviewRecentReviewItem {
  filename: string;
  projectName: string;
  mrPrefix: 'MR' | 'PR';
  mrNumber: string;
  title: string;
  mtime: string;
}

export interface OverviewRecentReviewsFeedSection {
  items: OverviewRecentReviewItem[];
  isEmpty: boolean;
  emptyMessage: string;
}

export interface OverviewViewModel {
  activeReviews: OverviewActiveReviewsSection;
  projectCards: OverviewProjectCardsSection;
  recentReviewsFeed: OverviewRecentReviewsFeedSection;
}

export interface OverviewPresenterDependencies {
  now?: () => Date;
}

function resolveProjectName(repositories: RepositoryConfig[], localPath: string): string | null {
  const match = repositories.find((repository) => repository.localPath === localPath);
  return match ? match.name : null;
}

function resolveProjectNameFromFilePath(repositories: RepositoryConfig[], filePath: string): string | null {
  const match = repositories.find((repository) => filePath.startsWith(`${repository.localPath}/`));
  return match ? match.name : null;
}

function resolvePlatformForProject(
  repositories: RepositoryConfig[],
  localPath: string,
): 'gitlab' | 'github' {
  const match = repositories.find((repository) => repository.localPath === localPath);
  return match ? match.platform : 'gitlab';
}

function formatElapsed(now: Date, startedAt: string | undefined): string {
  if (!startedAt) return EMPTY_ELAPSED_LABEL;
  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) return EMPTY_ELAPSED_LABEL;
  const elapsedMs = Math.max(0, now.getTime() - startedMs);
  return Duration.fromMilliseconds(elapsedMs).formatted;
}

function formatAverageScore(averageScore: number | null): string {
  if (averageScore === null) return EMPTY_SCORE_LABEL;
  return averageScore.toFixed(1);
}

function buildSparklinePoints(reviews: OverviewProjectStatsEntry['stats']['reviews']): number[] {
  const sorted = [...reviews].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const lastTen = sorted.slice(-SPARKLINE_MAX_POINTS);
  return lastTen
    .filter((review): review is typeof review & { score: number } => review.score !== null && review.score !== undefined)
    .map((review) => review.score);
}

function buildActiveReviewItem(
  job: OverviewActiveJobInput,
  repositories: RepositoryConfig[],
  now: Date,
): OverviewActiveReviewItem {
  const projectName = resolveProjectName(repositories, job.project) ?? EMPTY_PROJECT_LABEL;
  const platform = resolvePlatformForProject(repositories, job.project);
  return {
    jobId: job.id,
    projectName,
    projectPath: job.project,
    mrPrefix: platform === 'github' ? 'PR' : 'MR',
    mrNumber: job.mrNumber,
    mrUrl: job.mrUrl,
    elapsedLabel: formatElapsed(now, job.startedAt),
    jobType: job.jobType ?? 'review',
  };
}

function buildProjectCard(
  repository: RepositoryConfig,
  statsByPath: Map<string, OverviewProjectStatsEntry>,
): OverviewProjectCardItem {
  const statsEntry = statsByPath.get(repository.localPath) ?? null;
  if (statsEntry === null) {
    return {
      projectName: repository.name,
      projectPath: repository.localPath,
      platform: repository.platform,
      totalReviews: 0,
      averageScoreLabel: EMPTY_SCORE_LABEL,
      sparklinePoints: [],
      isEmptyHistory: true,
    };
  }
  const sparklinePoints = buildSparklinePoints(statsEntry.stats.reviews);
  return {
    projectName: repository.name,
    projectPath: repository.localPath,
    platform: repository.platform,
    totalReviews: statsEntry.summary.totalReviews,
    averageScoreLabel: formatAverageScore(statsEntry.summary.averageScore),
    sparklinePoints,
    isEmptyHistory: statsEntry.summary.totalReviews === 0,
  };
}

function buildRecentReviewItem(
  review: ReviewFileInfo,
  repositories: RepositoryConfig[],
): OverviewRecentReviewItem {
  const projectName = resolveProjectNameFromFilePath(repositories, review.path) ?? EMPTY_PROJECT_LABEL;
  const mrPrefix: 'MR' | 'PR' = review.type === 'PR' ? 'PR' : 'MR';
  return {
    filename: review.filename,
    projectName,
    mrPrefix,
    mrNumber: review.mrNumber,
    title: review.title ?? '',
    mtime: review.mtime,
  };
}

export class OverviewPresenter {
  private readonly now: () => Date;

  constructor(dependencies: OverviewPresenterDependencies = {}) {
    this.now = dependencies.now ?? (() => new Date());
  }

  present(input: OverviewPresenterInput): OverviewViewModel {
    const now = this.now();

    const activeItems = [...input.activeJobs]
      .map((job) => ({ job, startedAtMs: job.startedAt ? new Date(job.startedAt).getTime() : 0 }))
      .sort((left, right) => right.startedAtMs - left.startedAtMs)
      .map(({ job }) => buildActiveReviewItem(job, input.repositories, now));

    const statsByPath = new Map<string, OverviewProjectStatsEntry>();
    for (const entry of input.projectStats) {
      statsByPath.set(entry.path, entry);
    }
    const cardItems = input.repositories.map((repository) => buildProjectCard(repository, statsByPath));

    const recentItems = [...input.recentReviews]
      .sort((left, right) => right.mtime.localeCompare(left.mtime))
      .slice(0, RECENT_FEED_MAX_ITEMS)
      .map((review) => buildRecentReviewItem(review, input.repositories));

    return {
      activeReviews: {
        items: activeItems,
        isEmpty: activeItems.length === 0,
        emptyMessage: 'Aucune review en cours',
      },
      projectCards: {
        items: cardItems,
        isEmpty: cardItems.length === 0,
        emptyMessage: 'Aucun projet configuré',
      },
      recentReviewsFeed: {
        items: recentItems,
        isEmpty: recentItems.length === 0,
        emptyMessage: 'Aucune review récente',
      },
    };
  }
}
