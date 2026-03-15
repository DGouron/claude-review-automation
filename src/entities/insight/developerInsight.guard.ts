import { createGuard } from '@/shared/foundation/guard.base.js';
import { developerInsightSchema } from '@/entities/insight/developerInsight.schema.js';
import type { DeveloperInsight } from '@/entities/insight/developerInsight.js';

export const developerInsightGuard = createGuard(developerInsightSchema);

export function parseDeveloperInsight(data: unknown): DeveloperInsight {
  return developerInsightGuard.parse(data);
}

export function safeParseDeveloperInsight(data: unknown) {
  return developerInsightGuard.safeParse(data);
}

export function isValidDeveloperInsight(data: unknown): data is DeveloperInsight {
  return developerInsightGuard.isValid(data);
}
