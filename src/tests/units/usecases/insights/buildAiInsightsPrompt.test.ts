import { describe, it, expect } from 'vitest';
import { buildAiInsightsPrompt } from '@/usecases/insights/buildAiInsightsPrompt.js';
import { ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import type { ReviewStats } from '@/services/statsService.js';
import type { TrackedMr } from '@/entities/tracking/trackedMr.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';

function createReviewContent(mrNumber: number, score: number): string {
  return `# Code Review - MR !${mrNumber} (feature: something)

## Executive Summary

| Audit | Score |
|-------|-------|
| Clean Architecture | ${score}/10 |

**Score Global : ${score}/10** -- Good review.

## Corrections Bloquantes

### 1. Missing error handling

Some blocking issue description.

## Constats Positifs

| Aspect | Note |
|--------|------|
| Testing | 9/10 |
`;
}

describe('buildAiInsightsPrompt', () => {
  it('should include developer name in the prompt', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt).toContain('alice');
  });

  it('should include average score for each developer', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'alice', mrNumber: 2, score: 6 }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt).toContain('7');
  });

  it('should include review content for recent reviews', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 42, score: 8 }),
    ];

    const reviewContents = new Map<string, string>();
    reviewContents.set('42', createReviewContent(42, 8));

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents,
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt).toContain('Missing error handling');
  });

  it('should include tracked MR lifecycle data', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];

    const trackedMrs: TrackedMr[] = [
      TrackedMrFactory.create({
        assignment: { username: 'alice', assignedAt: '2024-01-15T10:00:00Z' },
        totalReviews: 3,
        totalFollowups: 1,
      }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs,
      language: 'fr',
    });

    expect(prompt).toContain('alice');
    expect(prompt).toMatch(/total.*reviews|reviews.*total/i);
  });

  it('should specify the output language', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];

    const promptFr = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'fr',
    });

    expect(promptFr).toContain('French');

    const promptEn = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'en',
    });

    expect(promptEn).toContain('English');
  });

  it('should request JSON output format', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt).toContain('JSON');
    expect(prompt).toContain('developerName');
    expect(prompt).toContain('titleExplanation');
  });

  it('should handle multiple developers', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'bob', mrNumber: 2, score: 6 }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt).toContain('alice');
    expect(prompt).toContain('bob');
  });

  it('should skip reviews without assignedBy', () => {
    const reviews: ReviewStats[] = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: undefined, mrNumber: 1, score: 8 }),
      ReviewStatsFactory.create({ id: 'r2', assignedBy: 'alice', mrNumber: 2, score: 7 }),
    ];

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents: new Map(),
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt).toContain('alice');
    expect(prompt).not.toContain('Developer: unknown');
  });

  it('should truncate review content for older reviews', () => {
    const reviews: ReviewStats[] = Array.from({ length: 10 }, (_, index) =>
      ReviewStatsFactory.create({
        id: `r${index}`,
        assignedBy: 'alice',
        mrNumber: index + 1,
        score: 7,
        timestamp: new Date(2026, 0, index + 1).toISOString(),
      }),
    );

    const reviewContents = new Map<string, string>();
    for (let index = 1; index <= 10; index++) {
      reviewContents.set(String(index), createReviewContent(index, 7));
    }

    const prompt = buildAiInsightsPrompt({
      reviews,
      reviewContents,
      trackedMrs: [],
      language: 'fr',
    });

    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt.length).toBeLessThan(200000);
  });
});
