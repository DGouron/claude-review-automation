import type { Language } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

const HEADERS: Record<Language, { goal: string; sections: string[] }> = {
  en: {
    goal: '# Goal',
    sections: ['## Inputs', '## Outputs', '## Steps'],
  },
  fr: {
    goal: '# Objectif',
    sections: ['## Entrées', '## Sorties', '## Étapes'],
  },
};

export function renderSkill(skillName: string, language: Language): string {
  const header = HEADERS[language];
  return [
    `# Skill: ${skillName}`,
    '',
    header.goal,
    '',
    ...header.sections.flatMap((section) => [section, '']),
  ].join('\n');
}
