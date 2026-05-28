import type { Language } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

export interface SkillTemplateGateway {
  writeSkill(projectPath: string, skillName: string, language: Language): void;
  writeMcpJson(projectPath: string): void;
}
