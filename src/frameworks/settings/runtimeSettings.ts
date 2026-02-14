/**
 * Runtime settings that can be changed without restart
 */

import type { Language } from '@/entities/language/language.schema.js';

export type ClaudeModel = 'sonnet' | 'opus';

interface RuntimeSettings {
  model: ClaudeModel;
  language: Language;
}

const settings: RuntimeSettings = {
  model: 'opus',
  language: 'en',
};

export function getModel(): ClaudeModel {
  return settings.model;
}

export function setModel(model: ClaudeModel): void {
  if (model !== 'sonnet' && model !== 'opus') {
    throw new Error(`Invalid model: ${model}`);
  }
  settings.model = model;
}

export function getDefaultLanguage(): Language {
  return settings.language;
}

export function setDefaultLanguage(language: Language): void {
  settings.language = language;
}

export function getSettings(): RuntimeSettings {
  return { ...settings };
}
