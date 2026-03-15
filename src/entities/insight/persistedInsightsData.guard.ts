import { createGuard } from '@/shared/foundation/guard.base.js';
import { persistedInsightsDataSchema } from '@/entities/insight/persistedInsightsData.schema.js';
import type { PersistedInsightsData } from '@/entities/insight/persistedInsightsData.js';

export const persistedInsightsDataGuard = createGuard(persistedInsightsDataSchema);

export function parsePersistedInsightsData(data: unknown): PersistedInsightsData {
  return persistedInsightsDataGuard.parse(data);
}

export function safeParsePersistedInsightsData(data: unknown) {
  return persistedInsightsDataGuard.safeParse(data);
}

export function isValidPersistedInsightsData(data: unknown): data is PersistedInsightsData {
  return persistedInsightsDataGuard.isValid(data);
}
