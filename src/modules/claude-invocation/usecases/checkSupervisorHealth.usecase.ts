import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { SupervisorHealthGateway } from '@/modules/claude-invocation/entities/supervisorHealth/supervisorHealth.gateway.js';
import type { SupervisorHealth } from '@/modules/claude-invocation/entities/supervisorHealth/supervisorHealth.schema.js';

export interface CheckSupervisorHealthDependencies {
  sessionGateway: ClaudeSessionGateway;
  supervisorHealthGateway: SupervisorHealthGateway;
  now: () => Date;
}

export async function checkSupervisorHealth(
  deps: CheckSupervisorHealthDependencies,
): Promise<SupervisorHealth> {
  const status = await deps.sessionGateway.daemonStatus();
  const checkedAt = deps.now().toISOString();

  if (status.reachable) {
    deps.supervisorHealthGateway.update('up', null, checkedAt);
  } else {
    deps.supervisorHealthGateway.update('down', status.reason, checkedAt);
  }

  return deps.supervisorHealthGateway.read();
}
