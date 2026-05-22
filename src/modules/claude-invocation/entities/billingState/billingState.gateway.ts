import type { BillingState } from '@/modules/claude-invocation/entities/billingState/billingState.schema.js';

export interface BillingStateGateway {
  read(): BillingState;
  pause(reason: string, auditedAt: string): void;
  resume(auditedAt: string): void;
  recordHealthy(auditedAt: string): void;
}
