import type { BillingStateGateway } from '@/modules/claude-invocation/entities/billingState/billingState.gateway.js';
import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import type { SupervisorHealthGateway } from '@/modules/claude-invocation/entities/supervisorHealth/supervisorHealth.gateway.js';
import { auditBilling } from '@/modules/claude-invocation/usecases/auditBilling.usecase.js';
import { checkSupervisorHealth } from '@/modules/claude-invocation/usecases/checkSupervisorHealth.usecase.js';

export interface ClaudeInvocationTimersInput {
  sessionGateway: ClaudeSessionGateway;
  supervisorHealthGateway: SupervisorHealthGateway;
  billingStateGateway: BillingStateGateway;
  now: () => Date;
  supervisorIntervalMs: number;
  billingIntervalMs: number;
}

export type StopTimers = () => void;

export function startClaudeInvocationTimers(input: ClaudeInvocationTimersInput): StopTimers {
  const supervisorTimer = setInterval(() => {
    void checkSupervisorHealth({
      sessionGateway: input.sessionGateway,
      supervisorHealthGateway: input.supervisorHealthGateway,
      now: input.now,
    });
  }, input.supervisorIntervalMs);

  const billingTimer = setInterval(() => {
    void auditBilling({
      sessionGateway: input.sessionGateway,
      billingStateGateway: input.billingStateGateway,
      now: input.now,
    });
  }, input.billingIntervalMs);

  return () => {
    clearInterval(supervisorTimer);
    clearInterval(billingTimer);
  };
}
