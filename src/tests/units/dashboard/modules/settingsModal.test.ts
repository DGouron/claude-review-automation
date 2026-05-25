import { describe, expect, it } from 'vitest';
import {
  buildSettingsViewModel,
  renderSettingsModalHtml,
  validateExternalLink,
  extractFormPayload,
} from '@/dashboard/modules/settingsModal.js';

describe('settingsModal — buildSettingsViewModel', () => {
  it('populates the five editable fields plus projectName', () => {
    const viewModel = buildSettingsViewModel({
      config: {
        github: false,
        gitlab: true,
        defaultModel: 'opus',
        reviewSkill: 'review-back',
        reviewFollowupSkill: 'review-followup',
        language: 'en',
        retentionDays: 14,
        externalLink: 'https://notion.so/x',
      },
      projectName: 'A',
    });

    expect(viewModel.language).toBe('en');
    expect(viewModel.defaultModel).toBe('opus');
    expect(viewModel.reviewSkill).toBe('review-back');
    expect(viewModel.reviewFollowupSkill).toBe('review-followup');
    expect(viewModel.externalLink).toBe('https://notion.so/x');
    expect(viewModel.projectName).toBe('A');
  });

  it('exposes an empty externalLink when the config has no link', () => {
    const viewModel = buildSettingsViewModel({
      config: {
        github: false,
        gitlab: true,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        language: 'fr',
        retentionDays: 14,
      },
      projectName: 'B',
    });

    expect(viewModel.externalLink).toBe('');
  });

  it('falls back to "—" when projectName is missing', () => {
    const viewModel = buildSettingsViewModel({
      config: {
        github: false,
        gitlab: true,
        defaultModel: 'sonnet',
        reviewSkill: 'review-front',
        reviewFollowupSkill: 'review-followup',
        language: 'fr',
        retentionDays: 14,
      },
    });

    expect(viewModel.projectName).toBe('—');
  });
});

describe('settingsModal — renderSettingsModalHtml', () => {
  it('renders fr/en radios with the current language pre-checked', () => {
    const html = renderSettingsModalHtml({
      language: 'fr',
      defaultModel: 'sonnet',
      reviewSkill: 'review-front',
      reviewFollowupSkill: 'review-followup',
      externalLink: '',
      projectName: 'A',
    });

    expect(html).toMatch(/<input[^>]+name="language"[^>]+value="fr"[^>]+checked/);
    expect(html).toMatch(/<input[^>]+name="language"[^>]+value="en"(?![^>]*checked)/);
  });

  it('renders the three model options with the current value selected', () => {
    const html = renderSettingsModalHtml({
      language: 'en',
      defaultModel: 'opus',
      reviewSkill: 'review-back',
      reviewFollowupSkill: 'review-followup',
      externalLink: '',
      projectName: 'A',
    });

    expect(html).toMatch(/<option[^>]+value="haiku"/);
    expect(html).toMatch(/<option[^>]+value="sonnet"/);
    expect(html).toMatch(/<option[^>]+value="opus"[^>]+selected/);
  });

  it('renders the externalLink input pre-filled with the current value', () => {
    const html = renderSettingsModalHtml({
      language: 'fr',
      defaultModel: 'sonnet',
      reviewSkill: 'review-front',
      reviewFollowupSkill: 'review-followup',
      externalLink: 'https://notion.so/x',
      projectName: 'A',
    });

    expect(html).toContain('https://notion.so/x');
    expect(html).toMatch(/name="externalLink"/);
  });

  it('exposes a title with the project name', () => {
    const html = renderSettingsModalHtml({
      language: 'fr',
      defaultModel: 'sonnet',
      reviewSkill: 'review-front',
      reviewFollowupSkill: 'review-followup',
      externalLink: '',
      projectName: 'frontend',
    });

    expect(html).toContain('frontend');
    expect(html).toContain('settings-modal__title');
  });

  it('contains an error placeholder element for inline messages', () => {
    const html = renderSettingsModalHtml({
      language: 'fr',
      defaultModel: 'sonnet',
      reviewSkill: 'review-front',
      reviewFollowupSkill: 'review-followup',
      externalLink: '',
      projectName: 'A',
    });

    expect(html).toContain('settings-modal__error');
  });
});

describe('settingsModal — validateExternalLink', () => {
  it('accepts an empty string', () => {
    expect(validateExternalLink('')).toEqual({ ok: true });
  });

  it('accepts an https url', () => {
    expect(validateExternalLink('https://example.com')).toEqual({ ok: true });
  });

  it('rejects http with the French HTTPS message', () => {
    expect(validateExternalLink('http://example.com')).toEqual({
      ok: false,
      message: 'Le lien doit être en HTTPS',
    });
  });

  it('rejects javascript: with "URL invalide"', () => {
    expect(validateExternalLink('javascript:alert(1)')).toEqual({
      ok: false,
      message: 'URL invalide',
    });
  });

  it('rejects free text with "URL invalide"', () => {
    expect(validateExternalLink('not a url')).toEqual({
      ok: false,
      message: 'URL invalide',
    });
  });
});

describe('settingsModal — extractFormPayload', () => {
  it('returns only the 5 whitelisted keys from a FormData-like object', () => {
    const fakeForm = new Map<string, string>([
      ['language', 'en'],
      ['defaultModel', 'sonnet'],
      ['reviewSkill', 'review-front'],
      ['reviewFollowupSkill', 'review-followup'],
      ['externalLink', 'https://notion.so/x'],
      ['agents', '[{"name":"evil"}]'],
      ['retentionDays', '999'],
    ]);

    const payload = extractFormPayload(fakeForm);

    expect(Object.keys(payload).sort()).toEqual([
      'defaultModel',
      'externalLink',
      'language',
      'reviewFollowupSkill',
      'reviewSkill',
    ]);
    expect(payload.language).toBe('en');
    expect(payload.externalLink).toBe('https://notion.so/x');
  });
});
