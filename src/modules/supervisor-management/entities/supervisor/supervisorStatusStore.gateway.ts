import type { SupervisorStatus } from '@/modules/supervisor-management/entities/supervisor/supervisorStatus.schema.js';

export interface SupervisorStatusStore {
  read(): SupervisorStatus;
  set(status: SupervisorStatus): void;
}
