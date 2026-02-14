import { describe, it, expect, beforeEach } from 'vitest';
import { getDefaultLanguage, setDefaultLanguage, getSettings } from '@/frameworks/settings/runtimeSettings.js';

describe('runtimeSettings language', () => {
  beforeEach(() => {
    setDefaultLanguage('en');
  });

  it('should default language to "en"', () => {
    expect(getDefaultLanguage()).toBe('en');
  });

  it('should change language to "fr"', () => {
    setDefaultLanguage('fr');
    expect(getDefaultLanguage()).toBe('fr');
  });

  it('should include language in getSettings()', () => {
    setDefaultLanguage('fr');
    const settings = getSettings();
    expect(settings.language).toBe('fr');
  });
});
