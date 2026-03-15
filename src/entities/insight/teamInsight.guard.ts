import { createGuard } from '@/shared/foundation/guard.base.js';
import { teamInsightSchema } from '@/entities/insight/teamInsight.schema.js';
import type { TeamInsight } from '@/entities/insight/teamInsight.js';

export const teamInsightGuard = createGuard(teamInsightSchema);

export function parseTeamInsight(data: unknown): TeamInsight {
  return teamInsightGuard.parse(data);
}

export function safeParseTeamInsight(data: unknown) {
  return teamInsightGuard.safeParse(data);
}

export function isValidTeamInsight(data: unknown): data is TeamInsight {
  return teamInsightGuard.isValid(data);
}
