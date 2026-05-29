import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { PersistedInsightsData } from '@/modules/statistics-insights/entities/insight/persistedInsightsData.js';
import type { MrTrackingData } from '@/modules/tracking/entities/tracking/mrTrackingData.js';
import type { WorktreeEntry } from '@/modules/worktree-management/entities/worktree/worktree.schema.js';

export interface EmberGrounding {
  reviewScores: ProjectStats | null;
  insights: PersistedInsightsData | null;
  jobHistory: MrTrackingData | null;
  worktrees: WorktreeEntry[];
}

const MAX_RECENT_REVIEWS = 20;
const MAX_RECENT_MRS = 20;
const MAX_DEVELOPERS = 10;
const MAX_DEVELOPER_RECENT_REVIEWS = 5;
const MAX_WORKTREES = 20;

function boundReviewScores(stats: ProjectStats | null): ProjectStats | null {
  if (stats === null) {
    return null;
  }
  return { ...stats, reviews: mostRecent(stats.reviews, MAX_RECENT_REVIEWS) };
}

function boundJobHistory(jobHistory: MrTrackingData | null): MrTrackingData | null {
  if (jobHistory === null) {
    return null;
  }
  return { ...jobHistory, mrs: mostRecent(jobHistory.mrs, MAX_RECENT_MRS) };
}

function boundInsights(insights: PersistedInsightsData | null): PersistedInsightsData | null {
  if (insights === null) {
    return null;
  }
  return {
    ...insights,
    developers: mostRecent(insights.developers, MAX_DEVELOPERS).map((developer) => ({
      ...developer,
      recentReviews: mostRecent(developer.recentReviews, MAX_DEVELOPER_RECENT_REVIEWS),
    })),
    processedReviewIds: mostRecent(insights.processedReviewIds, MAX_RECENT_REVIEWS),
  };
}

function mostRecent<Item>(items: ReadonlyArray<Item>, limit: number): Item[] {
  return items.slice(Math.max(0, items.length - limit));
}

function reviewCountSummary(stats: ProjectStats | null): string {
  if (stats === null || stats.reviews.length <= MAX_RECENT_REVIEWS) {
    return '';
  }
  const olderCount = stats.reviews.length - MAX_RECENT_REVIEWS;
  return `… et ${olderCount} reviews plus anciennes (résumé agrégé seulement).`;
}

export function buildEmberSystemPrompt(grounding: EmberGrounding): string {
  const reviewScores = boundReviewScores(grounding.reviewScores);
  const olderReviewsNote = reviewCountSummary(grounding.reviewScores);
  return [
    "Tu es Ember, l'assistant conversationnel du tableau de bord ReviewFlow.",
    '',
    'TES SEULES SOURCES DE DONNÉES sont ces données de review du projet, fournies ci-dessous.',
    "Tu n'as aucun autre accès : ni système de fichiers, ni outil, ni réseau.",
    '',
    'reviewScores (scores et statistiques de review) :',
    JSON.stringify(reviewScores),
    olderReviewsNote,
    '',
    'insights (insights développeur et équipe) :',
    JSON.stringify(boundInsights(grounding.insights)),
    '',
    'jobHistory (historique des jobs de review) :',
    JSON.stringify(boundJobHistory(grounding.jobHistory)),
    '',
    'worktrees (état des worktrees) :',
    JSON.stringify(mostRecent(grounding.worktrees, MAX_WORKTREES)),
    '',
    'GROUNDING : réponds uniquement à partir de ces données de review.',
    "Si la question sort de ces données, dis que tu ne sais répondre qu'à propos des reviews",
    "plutôt que d'inventer une réponse. N'invente jamais.",
    '',
    'LECTURE SEULE : tu ne modifies, ne crées et ne supprimes rien. Si on te demande',
    "d'écrire, de créer ou de modifier quelque chose (par exemple un quality gate),",
    "explique que cela arrivera en Phase B et n'effectue aucune écriture.",
  ].join('\n');
}
