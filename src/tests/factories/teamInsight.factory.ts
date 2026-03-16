import type { TeamInsight } from '@/entities/insight/teamInsight.js';

export class TeamInsightFactory {
  static create(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const defaults: TeamInsight = {
      developerCount: 3,
      totalReviewCount: 30,
      averageLevels: {
        quality: 6,
        responsiveness: 5,
        codeVolume: 7,
        iteration: 5,
      },
      strengths: ['codeVolume'],
      weaknesses: [],
      tips: ['Consider pair programming to share quality practices'],
    };

    return { ...defaults, ...overrides };
  }

  static createValid(overrides: Partial<TeamInsight> = {}): TeamInsight {
    return {
      developerCount: 3,
      totalReviewCount: 30,
      averageLevels: {
        quality: 6,
        responsiveness: 5,
        codeVolume: 7,
        iteration: 5,
      },
      strengths: ['codeVolume'],
      weaknesses: [],
      tips: ['Consider pair programming to share quality practices'],
      ...overrides,
    };
  }
}
