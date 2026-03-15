import { describe, expect, it } from 'vitest';
import { renderDeveloperSheetContent } from '@/interface-adapters/views/dashboard/modules/developerSheet.js';

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

describe('renderDeveloperSheetContent', () => {
  const translate = createTranslate();

  it('should render close button and developer name', () => {
    const developer = createDeveloperViewModel();

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('sheet-close');
    expect(html).toContain('closeDevSheet');
    expect(html).toContain('alice');
  });

  it('should render developer title', () => {
    const developer = createDeveloperViewModel({ title: 'sentinel' });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('title.sentinel');
  });

  it('should render overall level prominently', () => {
    const developer = createDeveloperViewModel({ overallLevel: 9 });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('dev-sheet-level');
    expect(html).toContain('9');
  });

  it('should render radar chart canvas', () => {
    const developer = createDeveloperViewModel();

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('canvas');
    expect(html).toContain('dev-radar-canvas');
  });

  it('should render stat bars for all four categories', () => {
    const developer = createDeveloperViewModel();

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('category.quality');
    expect(html).toContain('category.responsiveness');
    expect(html).toContain('category.codeVolume');
    expect(html).toContain('category.iteration');
    expect(html).toContain('stat-bar');
  });

  it('should render strengths list', () => {
    const developer = createDeveloperViewModel({ strengths: ['quality', 'responsiveness'] });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('devSheet.strengths');
    expect(html).toContain('category.quality');
    expect(html).toContain('category.responsiveness');
  });

  it('should render weaknesses list', () => {
    const developer = createDeveloperViewModel({ weaknesses: ['iteration', 'codeVolume'] });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('devSheet.weaknesses');
    expect(html).toContain('category.iteration');
    expect(html).toContain('category.codeVolume');
  });

  it('should render top priority when present', () => {
    const developer = createDeveloperViewModel({ topPriority: 'iteration' });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('devSheet.topPriority');
    expect(html).toContain('category.iteration');
  });

  it('should render no priority message when topPriority is null', () => {
    const developer = createDeveloperViewModel({ topPriority: null });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('devSheet.noTopPriority');
  });

  it('should render review count badge', () => {
    const developer = createDeveloperViewModel({ reviewCount: 25 });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('devSheet.reviewCount');
  });

  it('should render avatar placeholder with initial', () => {
    const developer = createDeveloperViewModel({ developerName: 'bob' });

    const html = renderDeveloperSheetContent(developer, translate);

    expect(html).toContain('dev-sheet-avatar');
    expect(html).toContain('B');
  });
});
