import type { AgentDefinition } from './agentDefinition.type.js';
import { DEFAULT_AGENTS } from './agentDefinition.type.js';
import type { AgentStatus, ReviewProgress } from './progress.type.js';

export function createInitialProgress(customAgents?: AgentDefinition[]): ReviewProgress {
  const agents = customAgents ?? DEFAULT_AGENTS;
  return {
    agents: agents.map(agent => ({
      name: agent.name,
      displayName: agent.displayName,
      status: 'pending' as AgentStatus,
    })),
    currentPhase: 'initializing',
    overallProgress: 0,
    lastUpdate: new Date(),
  };
}
