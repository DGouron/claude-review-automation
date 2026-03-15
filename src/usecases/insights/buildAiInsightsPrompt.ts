import type { ReviewStats } from '@/services/statsService.js';
import type { TrackedMr } from '@/entities/tracking/trackedMr.js';
import type { Language } from '@/entities/language/language.schema.js';

interface DeveloperData {
  name: string;
  reviews: ReviewStats[];
  trackedMrs: TrackedMr[];
}

interface BuildAiInsightsPromptInput {
  reviews: ReviewStats[];
  reviewContents: Map<string, string>;
  trackedMrs: TrackedMr[];
  language: Language;
}

const FULL_CONTENT_LIMIT = 3;
const SUMMARY_CONTENT_LIMIT = 5;
const SUMMARY_CHAR_LIMIT = 500;

function groupReviewsByDeveloper(reviews: ReviewStats[]): Map<string, ReviewStats[]> {
  const grouped = new Map<string, ReviewStats[]>();

  for (const review of reviews) {
    if (!review.assignedBy) continue;

    const existing = grouped.get(review.assignedBy);
    if (existing) {
      existing.push(review);
    } else {
      grouped.set(review.assignedBy, [review]);
    }
  }

  return grouped;
}

function groupTrackedMrsByDeveloper(trackedMrs: TrackedMr[]): Map<string, TrackedMr[]> {
  const grouped = new Map<string, TrackedMr[]>();

  for (const trackedMr of trackedMrs) {
    const username = trackedMr.assignment.username;
    const existing = grouped.get(username);
    if (existing) {
      existing.push(trackedMr);
    } else {
      grouped.set(username, [trackedMr]);
    }
  }

  return grouped;
}

function computeAverageScore(reviews: ReviewStats[]): string {
  const scored = reviews.filter((review) => review.score !== null);
  if (scored.length === 0) return 'N/A';
  const average = scored.reduce((sum, review) => sum + (review.score ?? 0), 0) / scored.length;
  return average.toFixed(1);
}

function computeAverageBlocking(reviews: ReviewStats[]): string {
  if (reviews.length === 0) return '0';
  const average = reviews.reduce((sum, review) => sum + review.blocking, 0) / reviews.length;
  return average.toFixed(1);
}

function computeAverageWarnings(reviews: ReviewStats[]): string {
  if (reviews.length === 0) return '0';
  const average = reviews.reduce((sum, review) => sum + review.warnings, 0) / reviews.length;
  return average.toFixed(1);
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}min`;
}

function computeFirstPassQualityRate(reviews: ReviewStats[]): string {
  const scored = reviews.filter((review) => review.score !== null);
  if (scored.length === 0) return 'N/A';
  const highQuality = scored.filter((review) => (review.score ?? 0) >= 7);
  const rate = (highQuality.length / scored.length) * 100;
  return `${rate.toFixed(0)}%`;
}

function extractReviewContent(
  content: string,
  full: boolean,
): string {
  if (full) return content;
  return content.substring(0, SUMMARY_CHAR_LIMIT);
}

function buildDeveloperSection(
  developer: DeveloperData,
  reviewContents: Map<string, string>,
): string {
  const { name, reviews, trackedMrs } = developer;

  const sortedReviews = [...reviews].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const averageScore = computeAverageScore(reviews);
  const averageBlocking = computeAverageBlocking(reviews);
  const averageWarnings = computeAverageWarnings(reviews);
  const averageDuration = reviews.length > 0
    ? formatDuration(reviews.reduce((sum, review) => sum + review.duration, 0) / reviews.length)
    : 'N/A';
  const firstPassRate = computeFirstPassQualityRate(reviews);
  const totalAdditions = reviews.reduce(
    (sum, review) => sum + (review.diffStats?.additions ?? 0), 0,
  );
  const totalDeletions = reviews.reduce(
    (sum, review) => sum + (review.diffStats?.deletions ?? 0), 0,
  );

  let section = `### Developer: ${name} (${reviews.length} reviews)\n`;
  section += `- Average score: ${averageScore}/10\n`;
  section += `- Average blocking issues: ${averageBlocking}/review\n`;
  section += `- Average warnings: ${averageWarnings}/review\n`;
  section += `- Average review duration: ${averageDuration}\n`;
  section += `- First-pass quality rate: ${firstPassRate} (reviews scoring >= 7 on first try)\n`;
  section += `- Total additions: ${totalAdditions}, deletions: ${totalDeletions}\n`;

  const reviewExcerpts: string[] = [];
  for (let index = 0; index < Math.min(sortedReviews.length, FULL_CONTENT_LIMIT + SUMMARY_CONTENT_LIMIT); index++) {
    const review = sortedReviews[index];
    const mrKey = String(review.mrNumber);
    const content = reviewContents.get(mrKey);
    if (content) {
      const isFull = index < FULL_CONTENT_LIMIT;
      const excerpt = extractReviewContent(content, isFull);
      reviewExcerpts.push(`--- MR ${review.mrNumber} (score: ${review.score ?? 'N/A'}) ---\n${excerpt}`);
    }
  }

  if (reviewExcerpts.length > 0) {
    section += `\nRecent review excerpts:\n${reviewExcerpts.join('\n\n')}\n`;
  }

  if (trackedMrs.length > 0) {
    const totalMrReviews = trackedMrs.reduce((sum, mr) => sum + mr.totalReviews, 0);
    const totalFollowups = trackedMrs.reduce((sum, mr) => sum + mr.totalFollowups, 0);
    const approvedFirst = trackedMrs.filter((mr) => mr.totalReviews <= 1 && mr.state === 'approved').length;

    section += `\n### MR Lifecycle for ${name}:\n`;
    section += `- Total MRs: ${trackedMrs.length}\n`;
    section += `- Total reviews across MRs: ${totalMrReviews}\n`;
    section += `- Total followups: ${totalFollowups}\n`;
    section += `- MRs approved on first review: ${approvedFirst}\n`;
  }

  return section;
}

function buildTeamSection(reviews: ReviewStats[], developerCount: number): string {
  const averageScore = computeAverageScore(reviews);
  const averageBlocking = computeAverageBlocking(reviews);

  let section = '### Team Statistics:\n';
  section += `- Team average score: ${averageScore}/10\n`;
  section += `- Team average blocking: ${averageBlocking}/review\n`;
  section += `- Total reviews: ${reviews.length}\n`;
  section += `- Developers: ${developerCount}\n`;

  return section;
}

export function buildAiInsightsPrompt(input: BuildAiInsightsPromptInput): string {
  const { reviews, reviewContents, trackedMrs, language } = input;

  const reviewsByDeveloper = groupReviewsByDeveloper(reviews);
  const trackedMrsByDeveloper = groupTrackedMrsByDeveloper(trackedMrs);

  const developerSections: string[] = [];

  for (const [name, developerReviews] of reviewsByDeveloper) {
    const developerTrackedMrs = trackedMrsByDeveloper.get(name) ?? [];
    const section = buildDeveloperSection(
      { name, reviews: developerReviews, trackedMrs: developerTrackedMrs },
      reviewContents,
    );
    developerSections.push(section);
  }

  const teamSection = buildTeamSection(reviews, reviewsByDeveloper.size);

  const prompt = `You are a senior engineering manager analyzing code review data for a development team.
Generate rich, contextual insights about each developer and the team overall.

## Data

${developerSections.join('\n\n')}

${teamSection}

## Instructions

Analyze this data and return a JSON object with this EXACT structure:
{
  "developers": [
    {
      "developerName": "exact username",
      "title": "A creative, fun title in ${language} reflecting their coding personality",
      "titleExplanation": "One sentence explaining why this title fits",
      "strengths": ["Concrete strength 1 with data reference", "..."],
      "weaknesses": ["Concrete weakness 1 with data reference", "..."],
      "recommendations": ["Actionable recommendation 1", "..."],
      "summary": "2-3 sentences profiling this developer's coding style and quality"
    }
  ],
  "team": {
    "summary": "2-3 sentences about team dynamics and overall quality",
    "strengths": ["Team strength 1", "..."],
    "weaknesses": ["Team weakness 1", "..."],
    "recommendations": ["Team recommendation 1", "..."],
    "dynamics": "Analysis of team balance, who complements whom, knowledge gaps"
  }
}

IMPORTANT:
- Use ${language} for ALL text
- Reference specific data points (scores, percentages, trends)
- Be direct and honest -- do not sugarcoat weaknesses
- Titles should be creative and memorable, not generic
- Recommendations must be actionable (not "improve code quality" but "focus on reducing blocking issues by reviewing architecture before implementation")
- Each developer MUST appear in the output

Return ONLY valid JSON, no markdown fences, no explanation.`;

  return prompt;
}
