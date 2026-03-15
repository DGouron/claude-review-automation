import { describe, expect, it } from 'vitest';
import { renderTeamTab } from '@/interface-adapters/views/dashboard/modules/teamTab.js';

function createTranslate() {
  return (key: string, params?: Record<string, string | number>) => {
    let value = key;
    if (params) {
      for (const [param, replacement] of Object.entries(params)) {
        value = value.replaceAll(`{{${param}}}`, String(replacement));
      }
    }
    return value;
  };
}

function createDeveloperViewModel(overrides = {}) {
  return {
    developerName: 'alice',
    title: 'architect',
    overallLevel: 7,
    categoryLevels: {
      quality: { level: 8, trend: 'improving' },
      responsiveness: { level: 6, trend: 'stable' },
      codeVolume: { level: 7, trend: 'stable' },
      iteration: { level: 5, trend: 'declining' },
    },
    strengths: ['quality'],
    weaknesses: ['iteration'],
    topPriority: 'iteration',
    reviewCount: 12,
    ...overrides,
  };
}

function createTeamViewModel(overrides = {}) {
  return {
    developerCount: 2,
    totalReviewCount: 24,
    averageLevels: { quality: 7, responsiveness: 6, codeVolume: 5, iteration: 6 },
    strengths: ['quality'],
    weaknesses: ['codeVolume'],
    tips: ['Focus on code volume reduction'],
    ...overrides,
  };
}

function createInsightsData(overrides = {}) {
  return {
    isEmpty: false,
    developers: [createDeveloperViewModel()],
    team: createTeamViewModel(),
    ...overrides,
  };
}

describe('renderTeamTab', () => {
  const translate = createTranslate();

  it('should render empty state when data is empty', () => {
    const data = createInsightsData({ isEmpty: true, developers: [] });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('team.noData');
    expect(html).toContain('empty-state');
  });

  it('should render developer cards when data has developers', () => {
    const data = createInsightsData({
      developers: [
        createDeveloperViewModel({ developerName: 'alice' }),
        createDeveloperViewModel({ developerName: 'bob', title: 'firefighter', overallLevel: 5 }),
      ],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('alice');
    expect(html).toContain('bob');
    expect(html).toContain('dev-card');
    expect(html).toContain('team-grid');
  });

  it('should render team insights section with strengths and weaknesses', () => {
    const data = createInsightsData();

    const html = renderTeamTab(data, translate);

    expect(html).toContain('team-insights');
    expect(html).toContain('team.strengths');
    expect(html).toContain('team.weaknesses');
  });

  it('should render stat bars for each category', () => {
    const data = createInsightsData();

    const html = renderTeamTab(data, translate);

    expect(html).toContain('stat-bar');
    expect(html).toContain('category.quality');
    expect(html).toContain('category.responsiveness');
    expect(html).toContain('category.codeVolume');
    expect(html).toContain('category.iteration');
  });

  it('should render developer title translation key', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ title: 'sentinel' })],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('title.sentinel');
  });

  it('should render overall level for each developer', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ overallLevel: 9 })],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('dev-overall-level');
    expect(html).toContain('9');
  });

  it('should render review count for each developer', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ reviewCount: 15 })],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('team.reviews');
    expect(html).toContain('dev-review-count');
  });

  it('should include onclick handler to open developer sheet', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({ developerName: 'alice' })],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('openDevSheet');
    expect(html).toContain('alice');
  });

  it('should render team tips when present', () => {
    const data = createInsightsData({
      team: createTeamViewModel({ tips: ['Improve iteration speed', 'Add more tests'] }),
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('team.tips');
    expect(html).toContain('Improve iteration speed');
    expect(html).toContain('Add more tests');
  });

  it('should render trend indicators on stat bars', () => {
    const data = createInsightsData({
      developers: [createDeveloperViewModel({
        categoryLevels: {
          quality: { level: 8, trend: 'improving' },
          responsiveness: { level: 6, trend: 'declining' },
          codeVolume: { level: 7, trend: 'stable' },
          iteration: { level: 5, trend: 'improving' },
        },
      })],
    });

    const html = renderTeamTab(data, translate);

    expect(html).toContain('trend-improving');
    expect(html).toContain('trend-declining');
    expect(html).toContain('trend-stable');
  });
});
