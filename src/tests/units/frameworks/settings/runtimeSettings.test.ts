import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configureSettingsPath,
  loadSettingsFromDisk,
  getDefaultLanguage,
  setDefaultLanguage,
  getModel,
  setModel,
  getSettings,
  resetSettingsForTesting,
} from '@/frameworks/settings/runtimeSettings.js';

describe('runtimeSettings', () => {
  describe('in-memory API (no path configured)', () => {
    beforeEach(() => {
      resetSettingsForTesting();
    });

    it('defaults language to "en"', () => {
      expect(getDefaultLanguage()).toBe('en');
    });

    it('changes language to "fr"', async () => {
      await setDefaultLanguage('fr');
      expect(getDefaultLanguage()).toBe('fr');
    });

    it('includes language in getSettings()', async () => {
      await setDefaultLanguage('fr');
      expect(getSettings().language).toBe('fr');
    });
  });

  describe('persistence', () => {
    let directory: string;
    let settingsPath: string;

    beforeEach(() => {
      directory = mkdtempSync(join(tmpdir(), 'reviewflow-settings-'));
      settingsPath = join(directory, 'settings.json');
      resetSettingsForTesting();
      configureSettingsPath(settingsPath);
    });

    afterEach(() => {
      resetSettingsForTesting();
      rmSync(directory, { recursive: true, force: true });
    });

    describe('loadSettingsFromDisk', () => {
      it('restores language and model from existing file', async () => {
        writeFileSync(settingsPath, JSON.stringify({ language: 'fr', model: 'sonnet' }));

        await loadSettingsFromDisk();

        expect(getDefaultLanguage()).toBe('fr');
        expect(getModel()).toBe('sonnet');
      });

      it('creates the file with defaults when it does not exist', async () => {
        await loadSettingsFromDisk();

        expect(existsSync(settingsPath)).toBe(true);
        const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        expect(written).toEqual({ language: 'en', model: 'opus' });
      });

      it('falls back to defaults silently when file is malformed JSON', async () => {
        writeFileSync(settingsPath, '{ this is not valid json');

        await loadSettingsFromDisk();

        expect(getDefaultLanguage()).toBe('en');
        expect(getModel()).toBe('opus');
      });

      it('falls back to defaults silently when language is unknown', async () => {
        writeFileSync(settingsPath, JSON.stringify({ language: 'es', model: 'opus' }));

        await loadSettingsFromDisk();

        expect(getDefaultLanguage()).toBe('en');
      });

      it('falls back to defaults silently when model is unknown', async () => {
        writeFileSync(settingsPath, JSON.stringify({ language: 'fr', model: 'gpt-5' }));

        await loadSettingsFromDisk();

        expect(getModel()).toBe('opus');
      });
    });

    describe('persistence on set', () => {
      it('persists language to disk after setDefaultLanguage', async () => {
        await loadSettingsFromDisk();

        await setDefaultLanguage('fr');

        const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        expect(written.language).toBe('fr');
      });

      it('persists model to disk after setModel', async () => {
        await loadSettingsFromDisk();

        await setModel('sonnet');

        const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        expect(written.model).toBe('sonnet');
      });

      it('survives a simulated process restart', async () => {
        await loadSettingsFromDisk();
        await setDefaultLanguage('fr');
        await setModel('sonnet');

        resetSettingsForTesting();
        configureSettingsPath(settingsPath);
        await loadSettingsFromDisk();

        expect(getDefaultLanguage()).toBe('fr');
        expect(getModel()).toBe('sonnet');
      });
    });
  });
});
