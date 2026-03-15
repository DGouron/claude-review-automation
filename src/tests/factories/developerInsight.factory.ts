import type { DeveloperInsight } from '@/entities/insight/developerInsight.js';

export class DeveloperInsightFactory {
  static create(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const defaults: DeveloperInsight = {
      developerName: 'alice',
      title: 'architect',
      overallLevel: 7,
      categoryLevels: {
        quality: { level: 8, trend: 'improving' },
        responsiveness: { level: 6, trend: 'stable' },
        codeVolume: { level: 7, trend: 'stable' },
        iteration: { level: 6, trend: 'declining' },
      },
      strengths: ['quality'],
      weaknesses: ['iteration'],
      topPriority: 'iteration',
      reviewCount: 10,
    };

    return { ...defaults, ...overrides };
  }

  static createValid(overrides: Partial<DeveloperInsight> = {}): DeveloperInsight {
    return {
      developerName: 'alice',
      title: 'architect',
      overallLevel: 7,
      categoryLevels: {
        quality: { level: 8, trend: 'improving' },
        responsiveness: { level: 6, trend: 'stable' },
        codeVolume: { level: 7, trend: 'stable' },
        iteration: { level: 6, trend: 'declining' },
      },
      strengths: ['quality'],
      weaknesses: ['iteration'],
      topPriority: 'iteration',
      reviewCount: 10,
      ...overrides,
    };
  }
}
