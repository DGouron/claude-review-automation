import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { languageSchema, type Language } from '@/modules/shared-kernel/entities/language/language.schema.js';

export const claudeModelSchema = z.enum(['haiku', 'sonnet', 'opus']);
export type ClaudeModel = z.infer<typeof claudeModelSchema>;

const runtimeSettingsSchema = z.object({
  language: languageSchema,
  model: claudeModelSchema,
});

type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;

type SettingsLogger = {
  warn: (message: string) => void;
};

const DEFAULT_SETTINGS: RuntimeSettings = {
  model: 'opus',
  language: 'en',
};

let settings: RuntimeSettings = { ...DEFAULT_SETTINGS };
let settingsPath: string | null = null;
let logger: SettingsLogger = { warn: (message) => console.warn(message) };
let writeQueue: Promise<void> = Promise.resolve();

export function getDefaultSettingsPath(): string {
  return join(homedir(), '.claude-review', 'settings.json');
}

export function configureSettingsPath(path: string): void {
  settingsPath = path;
}

export function configureSettingsLogger(injected: SettingsLogger): void {
  logger = injected;
}

export async function loadSettingsFromDisk(): Promise<void> {
  if (!settingsPath) return;

  if (!existsSync(settingsPath)) {
    settings = { ...DEFAULT_SETTINGS };
    await persistAsync();
    return;
  }

  let raw: string;
  try {
    raw = readFileSync(settingsPath, 'utf-8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(`[runtimeSettings] failed to read settings file at ${settingsPath}: ${reason}; using defaults`);
    settings = { ...DEFAULT_SETTINGS };
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.warn(`[runtimeSettings] malformed JSON at ${settingsPath}; using defaults`);
    settings = { ...DEFAULT_SETTINGS };
    return;
  }

  const result = runtimeSettingsSchema.safeParse(parsed);
  if (!result.success) {
    logger.warn(`[runtimeSettings] invalid settings at ${settingsPath}; using defaults`);
    settings = { ...DEFAULT_SETTINGS };
    return;
  }

  settings = result.data;
}

async function writeAtomically(path: string, payload: string): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, payload, 'utf-8');
  await rename(temporaryPath, path);
}

function persistAsync(): Promise<void> {
  if (!settingsPath) return Promise.resolve();
  const path = settingsPath;
  const enqueue = writeQueue.then(
    () => writeAtomically(path, JSON.stringify(settings, null, 2)),
    () => writeAtomically(path, JSON.stringify(settings, null, 2)),
  );
  writeQueue = enqueue;
  return enqueue;
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
  const result = languageSchema.safeParse(language);
  if (!result.success) {
    throw new Error(`Invalid language: ${language}`);
  }
  settings.language = result.data;
  await persistAsync();
}

export function getSettings(): RuntimeSettings {
  return { ...settings };
}

/**
 * Test-only helper. Resets module-level state (settings, path, logger, write queue).
 * Exposed because this module owns module-level mutable state; production code must
 * never call this. A proper fix would extract a SettingsRepository class with
 * constructor-injected dependencies; see PR #221 review for context.
 */
export function __resetForTestsOnly(): void {
  settings = { ...DEFAULT_SETTINGS };
  settingsPath = null;
  logger = { warn: (message) => console.warn(message) };
  writeQueue = Promise.resolve();
}
