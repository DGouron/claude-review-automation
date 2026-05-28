import { describe, it, expect } from 'vitest';
import { buildEmberSystemPrompt } from '@/modules/ember-chat/services/emberSystemPrompt.js';
import type { EmberGrounding } from '@/modules/ember-chat/services/emberSystemPrompt.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';

const EMPTY_GROUNDING: EmberGrounding = {
  reviewScores: null,
  insights: null,
  jobHistory: null,
  worktrees: [],
};

describe('buildEmberSystemPrompt', () => {
  it('names the four review-data sources as the only data sources', () => {
    const prompt = buildEmberSystemPrompt(EMPTY_GROUNDING);
    expect(prompt).toContain('reviewScores');
    expect(prompt).toContain('insights');
    expect(prompt).toContain('jobHistory');
    expect(prompt).toContain('worktrees');
  });

  it('instructs to decline rather than invent when asked outside review data', () => {
    const prompt = buildEmberSystemPrompt(EMPTY_GROUNDING);
    expect(prompt.toLowerCase()).toContain('review');
    expect(prompt).toMatch(/ne sait répondre|ne sais pas|reviews/i);
  });

  it('instructs that writing arrives in Phase B and to perform no writes', () => {
    const prompt = buildEmberSystemPrompt(EMPTY_GROUNDING);
    expect(prompt).toContain('Phase B');
    expect(prompt.toLowerCase()).toContain('lecture seule');
  });

  it('identifies the assistant as Ember', () => {
    expect(buildEmberSystemPrompt(EMPTY_GROUNDING)).toContain('Ember');
  });

  it('embeds the actual review data so the answer is grounded in it', () => {
    const grounding: EmberGrounding = {
      ...EMPTY_GROUNDING,
      reviewScores: ProjectStatsFactory.withReviews([
        ReviewStatsFactory.create({ mrNumber: 42, score: 3, blocking: 4, warnings: 1 }),
      ]),
    };

    expect(buildEmberSystemPrompt(grounding)).toContain('42');
  });
});
