import type { BillingStateGateway } from '@/modules/claude-invocation/entities/billingState/billingState.gateway.js';
import type { BillingState } from '@/modules/claude-invocation/entities/billingState/billingState.schema.js';

export class InMemoryBillingStateGateway implements BillingStateGateway {
  private state: BillingState = {
    dispatchPaused: false,
    lastAuditAt: null,
    lastRegressionReason: null,
  };

  read(): BillingState {
    return { ...this.state };
  }

  pause(reason: string, auditedAt: string): void {
    this.state = {
      dispatchPaused: true,
      lastAuditAt: auditedAt,
      lastRegressionReason: reason,
    };
  }

  resume(auditedAt: string): void {
    this.state = {
      dispatchPaused: false,
      lastAuditAt: auditedAt,
      lastRegressionReason: null,
    };
  }

  recordHealthy(auditedAt: string): void {
    this.state = {
      ...this.state,
      lastAuditAt: auditedAt,
      lastRegressionReason: null,
    };
  }
}
