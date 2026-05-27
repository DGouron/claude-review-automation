import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { languageSchema, type Language } from '@/modules/shared-kernel/entities/language/language.schema.js';

export type ClaudeModel = 'haiku' | 'sonnet' | 'opus';

const claudeModelSchema = z.enum(['haiku', 'sonnet', 'opus']);

const runtimeSettingsSchema = z.object({
  language: languageSchema,
  model: claudeModelSchema,
});

interface RuntimeSettings {
  model: ClaudeModel;
  language: Language;
}

const DEFAULT_SETTINGS: RuntimeSettings = {
  model: 'opus',
  language: 'en',
};

let settings: RuntimeSettings = { ...DEFAULT_SETTINGS };
let settingsPath: string | null = null;

export function getDefaultSettingsPath(): string {
  return join(homedir(), '.claude-review', 'settings.json');
}

export function configureSettingsPath(path: string): void {
  settingsPath = path;
}

export async function loadSettingsFromDisk(): Promise<void> {
  if (!settingsPath) return;

  if (!existsSync(settingsPath)) {
    settings = { ...DEFAULT_SETTINGS };
    await persistAsync();
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    console.warn(`[runtimeSettings] malformed JSON at ${settingsPath}, using defaults`);
    settings = { ...DEFAULT_SETTINGS };
    return;
  }

  const result = runtimeSettingsSchema.safeParse(parsed);
  if (!result.success) {
    console.warn(`[runtimeSettings] invalid settings at ${settingsPath}, using defaults`);
    settings = { ...DEFAULT_SETTINGS };
    return;
  }

  settings = result.data;
}

async function persistAsync(): Promise<void> {
  if (!settingsPath) return;
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

export function getModel(): ClaudeModel {
  return settings.model;
}

export async function setModel(model: ClaudeModel): Promise<void> {
  const result = claudeModelSchema.safeParse(model);
  if (!result.success) {
    throw new Error(`Invalid model: ${model}`);
  }
  settings.model = result.data;
  await persistAsync();
}

export function getDefaultLanguage(): Language {
  return settings.language;
}

export async function setDefaultLanguage(language: Language): Promise<void> {
  settings.language = language;
  await persistAsync();
}

export function getSettings(): RuntimeSettings {
  return { ...settings };
}

export function resetSettingsForTesting(): void {
  settings = { ...DEFAULT_SETTINGS };
  settingsPath = null;
}
