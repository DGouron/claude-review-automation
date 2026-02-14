import type { Language } from '@/entities/language/language.schema.js';

const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  fr: 'French',
};

export function buildLanguageDirective(language: Language): string {
  const label = LANGUAGE_LABELS[language];
  return `## MANDATORY OUTPUT LANGUAGE\n\nCRITICAL: WRITE YOUR ENTIRE REVIEW IN ${label.toUpperCase()}. Every comment, analysis, recommendation, and report section MUST be written in ${label}. This is NON-NEGOTIABLE.`;
}
