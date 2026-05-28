import { describe, it, expect } from 'vitest';
import { buildEmberSystemPrompt } from '@/modules/ember-chat/services/emberSystemPrompt.js';

describe('buildEmberSystemPrompt', () => {
  const prompt = buildEmberSystemPrompt();

  it('names the four review-data read sources as the only data sources', () => {
    expect(prompt).toContain('reviewScores');
    expect(prompt).toContain('insights');
    expect(prompt).toContain('jobHistory');
    expect(prompt).toContain('worktrees');
  });

  it('instructs to decline rather than invent when asked outside review data', () => {
    expect(prompt.toLowerCase()).toContain('review');
    expect(prompt).toMatch(/ne sait répondre|ne sais pas|reviews/i);
  });

  it('instructs that writing arrives in Phase B and to perform no writes', () => {
    expect(prompt).toContain('Phase B');
    expect(prompt.toLowerCase()).toContain('lecture seule');
  });

  it('identifies the assistant as Ember', () => {
    expect(prompt).toContain('Ember');
  });
});
