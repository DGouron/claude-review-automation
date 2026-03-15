import { describe, it, expect, beforeEach } from 'vitest';
import { generateAiInsights } from '@/usecases/insights/generateAiInsights.usecase.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';
import { InMemoryReviewFileGateway } from '@/tests/stubs/reviewFile.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';
import { createStubLogger } from '@/tests/stubs/logger.stub.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { TrackedMrFactory, MrTrackingDataFactory } from '@/tests/factories/trackedMr.factory.js';
import type { AiInsightsResult } from '@/entities/insight/aiInsight.js';
import type { ClaudeInvoker } from '@/usecases/insights/generateAiInsights.usecase.js';

function createSuccessfulClaudeInvoker(result: AiInsightsResult): ClaudeInvoker {
  return async () => JSON.stringify(result);
}

function createFailingClaudeInvoker(errorMessage: string): ClaudeInvoker {
  return async () => { throw new Error(errorMessage); };
}

const validAiResult: AiInsightsResult = {
  developers: [
    {
      developerName: 'alice',
      title: 'Le Chirurgien du Code',
      titleExplanation: 'Precise and methodical',
      strengths: ['Excellent test coverage'],
      weaknesses: ['Slow review turnaround'],
      recommendations: ['Automate repetitive checks'],
      summary: 'Alice is a meticulous developer.',
    },
  ],
  team: {
    summary: 'A well-balanced team.',
    strengths: ['Strong testing culture'],
    weaknesses: ['Documentation gaps'],
    recommendations: ['Establish review guidelines'],
    dynamics: 'Good team dynamics.',
  },
  generatedAt: '2026-03-15T10:00:00Z',
};

describe('generateAiInsights', () => {
  let statsGateway: InMemoryStatsGateway;
  let reviewFileGateway: InMemoryReviewFileGateway;
  let reviewRequestTrackingGateway: InMemoryReviewRequestTrackingGateway;

  beforeEach(() => {
    statsGateway = new InMemoryStatsGateway();
    reviewFileGateway = new InMemoryReviewFileGateway();
    reviewRequestTrackingGateway = new InMemoryReviewRequestTrackingGateway();
  });

  it('should return AI insights when Claude returns valid JSON', async () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    const result = await generateAiInsights({
      projectPath: '/test/project',
      statsGateway,
      reviewFileGateway,
      reviewRequestTrackingGateway,
      logger: createStubLogger(),
      claudeInvoker: createSuccessfulClaudeInvoker(validAiResult),
      language: 'fr',
    });

    expect(result.developers).toHaveLength(1);
    expect(result.developers[0].developerName).toBe('alice');
    expect(result.team.summary).toBe('A well-balanced team.');
    expect(result.generatedAt).toBeDefined();
  });

  it('should throw when Claude invocation fails', async () => {
    const reviews = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    await expect(
      generateAiInsights({
        projectPath: '/test/project',
        statsGateway,
        reviewFileGateway,
        reviewRequestTrackingGateway,
        logger: createStubLogger(),
        claudeInvoker: createFailingClaudeInvoker('Claude CLI not found'),
        language: 'fr',
      }),
    ).rejects.toThrow();
  });

  it('should throw when Claude returns invalid JSON', async () => {
    const reviews = [
      ReviewStatsFactory.create({ assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    const invalidJsonInvoker: ClaudeInvoker = async () => 'this is not JSON';

    await expect(
      generateAiInsights({
        projectPath: '/test/project',
        statsGateway,
        reviewFileGateway,
        reviewRequestTrackingGateway,
        logger: createStubLogger(),
        claudeInvoker: invalidJsonInvoker,
        language: 'fr',
      }),
    ).rejects.toThrow();
  });

  it('should throw when no stats exist for the project', async () => {
    await expect(
      generateAiInsights({
        projectPath: '/empty/project',
        statsGateway,
        reviewFileGateway,
        reviewRequestTrackingGateway,
        logger: createStubLogger(),
        claudeInvoker: createSuccessfulClaudeInvoker(validAiResult),
        language: 'fr',
      }),
    ).rejects.toThrow();
  });

  it('should include review file content in the prompt sent to Claude', async () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 42, score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));
    const reviewContent = '# Code Review - MR !42\n\n## Synthèse Exécutive\n\n| Audit | Score |\n|---|---|\n| Testing | 9/10 |\n\n**Score Global : 8/10**\n\n## Constats Positifs\n\n### 1. Great test coverage\n';
    reviewFileGateway.addReview('/test/project', '2026-03-13-MR-42-review.md', reviewContent);

    let capturedPrompt = '';
    const capturingInvoker: ClaudeInvoker = async (prompt: string) => {
      capturedPrompt = prompt;
      return JSON.stringify(validAiResult);
    };

    await generateAiInsights({
      projectPath: '/test/project',
      statsGateway,
      reviewFileGateway,
      reviewRequestTrackingGateway,
      logger: createStubLogger(),
      claudeInvoker: capturingInvoker,
      language: 'fr',
    });

    expect(capturedPrompt).toContain('Synthèse Exécutive');
    expect(capturedPrompt).toContain('Score Global');
    expect(capturedPrompt).toContain('Great test coverage');
  });

  it('should include tracked MR data in the prompt', async () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    const trackedMr = TrackedMrFactory.create({
      assignment: { username: 'alice', assignedAt: '2024-01-15T10:00:00Z' },
      totalReviews: 5,
    });
    reviewRequestTrackingGateway.saveTracking('/test/project', MrTrackingDataFactory.withMrs([trackedMr]));

    let capturedPrompt = '';
    const capturingInvoker: ClaudeInvoker = async (prompt: string) => {
      capturedPrompt = prompt;
      return JSON.stringify(validAiResult);
    };

    await generateAiInsights({
      projectPath: '/test/project',
      statsGateway,
      reviewFileGateway,
      reviewRequestTrackingGateway,
      logger: createStubLogger(),
      claudeInvoker: capturingInvoker,
      language: 'fr',
    });

    expect(capturedPrompt).toContain('alice');
  });

  it('should set generatedAt in the result', async () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    const result = await generateAiInsights({
      projectPath: '/test/project',
      statsGateway,
      reviewFileGateway,
      reviewRequestTrackingGateway,
      logger: createStubLogger(),
      claudeInvoker: createSuccessfulClaudeInvoker(validAiResult),
      language: 'fr',
    });

    expect(result.generatedAt).toBeDefined();
    expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
  });

  it('should handle Claude response with markdown fences around JSON', async () => {
    const reviews = [
      ReviewStatsFactory.create({ id: 'r1', assignedBy: 'alice', mrNumber: 1, score: 8 }),
    ];
    statsGateway.saveProjectStats('/test/project', ProjectStatsFactory.withReviews(reviews));

    const fencedInvoker: ClaudeInvoker = async () =>
      '```json\n' + JSON.stringify(validAiResult) + '\n```';

    const result = await generateAiInsights({
      projectPath: '/test/project',
      statsGateway,
      reviewFileGateway,
      reviewRequestTrackingGateway,
      logger: createStubLogger(),
      claudeInvoker: fencedInvoker,
      language: 'fr',
    });

    expect(result.developers).toHaveLength(1);
  });
});
