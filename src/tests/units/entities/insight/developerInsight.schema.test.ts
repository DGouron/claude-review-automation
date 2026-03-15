import { describe, it, expect } from 'vitest';
import { developerInsightSchema } from '@/entities/insight/developerInsight.schema.js';
import { DeveloperInsightFactory } from '@/tests/factories/developerInsight.factory.js';

describe('DeveloperInsight schema', () => {
  it('should validate a complete developer insight', () => {
    const insight = DeveloperInsightFactory.create();

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(true);
  });

  it('should require a developer name', () => {
    const insight = DeveloperInsightFactory.create();
    const { developerName: _, ...withoutName } = insight;

    const result = developerInsightSchema.safeParse(withoutName);

    expect(result.success).toBe(false);
  });

  it('should validate category levels are between 1 and 10', () => {
    const insight = DeveloperInsightFactory.create({
      categoryLevels: {
        quality: { level: 11, trend: 'stable' },
        responsiveness: { level: 5, trend: 'stable' },
        codeVolume: { level: 5, trend: 'stable' },
        iteration: { level: 5, trend: 'stable' },
      },
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(false);
  });

  it('should validate category levels minimum is 1', () => {
    const insight = DeveloperInsightFactory.create({
      categoryLevels: {
        quality: { level: 0, trend: 'stable' },
        responsiveness: { level: 5, trend: 'stable' },
        codeVolume: { level: 5, trend: 'stable' },
        iteration: { level: 5, trend: 'stable' },
      },
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(false);
  });

  it('should validate trend values', () => {
    const insight = DeveloperInsightFactory.create({
      categoryLevels: {
        quality: { level: 5, trend: 'invalid' },
        responsiveness: { level: 5, trend: 'stable' },
        codeVolume: { level: 5, trend: 'stable' },
        iteration: { level: 5, trend: 'stable' },
      },
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(false);
  });

  it('should validate title is a known developer title', () => {
    const insight = DeveloperInsightFactory.create({
      title: 'unknown',
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(false);
  });

  it('should accept insights with empty strengths and weaknesses', () => {
    const insight = DeveloperInsightFactory.create({
      strengths: [],
      weaknesses: [],
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(true);
  });

  it('should validate overall level is between 1 and 10', () => {
    const insight = DeveloperInsightFactory.create({
      overallLevel: 11,
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(false);
  });

  it('should require review count', () => {
    const insight = DeveloperInsightFactory.create();
    const { reviewCount: _, ...withoutCount } = insight;

    const result = developerInsightSchema.safeParse(withoutCount);

    expect(result.success).toBe(false);
  });

  it('should accept null for top priority', () => {
    const insight = DeveloperInsightFactory.create({
      topPriority: null,
    });

    const result = developerInsightSchema.safeParse(insight);

    expect(result.success).toBe(true);
  });
});
