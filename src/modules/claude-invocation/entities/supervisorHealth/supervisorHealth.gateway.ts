import type {
  SupervisorHealth,
  SupervisorHealthStatus,
} from '@/modules/claude-invocation/entities/supervisorHealth/supervisorHealth.schema.js';

export interface SupervisorHealthGateway {
  read(): SupervisorHealth;
  update(status: SupervisorHealthStatus, reason: string | null, checkedAt: string): void;
}
