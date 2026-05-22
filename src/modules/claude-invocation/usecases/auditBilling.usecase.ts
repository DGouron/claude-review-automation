import type { BillingStateGateway } from '@/modules/claude-invocation/entities/billingState/billingState.gateway.js';
import type { ClaudeSessionGateway } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';

export interface AuditBillingDependencies {
  sessionGateway: ClaudeSessionGateway;
  billingStateGateway: BillingStateGateway;
  now: () => Date;
}

export type AuditBillingResult =
  | { regression: false }
  | { regression: true; reason: string };

export async function auditBilling(
  deps: AuditBillingDependencies,
): Promise<AuditBillingResult> {
  const report = await deps.sessionGateway.usage();
  const auditedAt = deps.now().toISOString();

  if (report.usesApiPool) {
    const reason = `API pool consumption detected: ${report.raw}`;
    deps.billingStateGateway.pause(reason, auditedAt);
    return { regression: true, reason };
  }

  deps.billingStateGateway.recordHealthy(auditedAt);
  return { regression: false };
}
