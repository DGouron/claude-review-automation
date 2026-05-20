import { createGuard } from '@/shared/foundation/guard.base.js';
import { teamInsightSchema } from '@/modules/statistics-insights/entities/insight/teamInsight.schema.js';
import type { TeamInsight } from '@/modules/statistics-insights/entities/insight/teamInsight.js';

export const teamInsightGuard = createGuard(teamInsightSchema, 'teamInsight');

export function parseTeamInsight(data: unknown): TeamInsight {
  return teamInsightGuard.parse(data);
}

export function safeParseTeamInsight(data: unknown) {
  return teamInsightGuard.safeParse(data);
}

export function isValidTeamInsight(data: unknown): data is TeamInsight {
  return teamInsightGuard.isValid(data);
}
