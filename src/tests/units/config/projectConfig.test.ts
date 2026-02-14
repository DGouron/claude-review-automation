import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { loadProjectConfig, getProjectLanguage } from '@/config/projectConfig.js';

vi.mock('node:fs');

describe('loadProjectConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should default language to "en" when not specified', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.language).toBe('en');
  });

  it('should use "fr" when explicitly specified in config', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        language: 'fr',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.language).toBe('fr');
  });

  it('should fall back to "en" for an invalid language value', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        language: 'de',
      }),
    );

    const config = loadProjectConfig('/fake/path');

    expect(config?.language).toBe('en');
  });
});

describe('getProjectLanguage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return language from project config', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        github: true,
        gitlab: false,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        language: 'fr',
      }),
    );

    expect(getProjectLanguage('/fake/path')).toBe('fr');
  });

  it('should default to "en" when config does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(getProjectLanguage('/nonexistent')).toBe('en');
  });
});
