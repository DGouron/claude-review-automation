import { describe, it, expect } from 'vitest';
import { auditBilling } from '@/modules/claude-invocation/usecases/auditBilling.usecase.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';
import { StubBillingStateGateway } from '@/tests/stubs/billingState.stub.js';

describe('auditBilling use case', () => {
  it('returns no regression when usage report is subscription-only', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setUsage({ usesApiPool: false, raw: 'subscription pool' });
    const billingStateGateway = new StubBillingStateGateway();

    const result = await auditBilling({
      sessionGateway,
      billingStateGateway,
      now: () => new Date('2026-05-22T10:00:00Z'),
    });

    expect(result.regression).toBe(false);
    expect(billingStateGateway.read().dispatchPaused).toBe(false);
    expect(billingStateGateway.read().lastAuditAt).toBe('2026-05-22T10:00:00.000Z');
  });

  it('pauses dispatching when usage indicates API pool consumption', async () => {
    const sessionGateway = new StubClaudeSessionGateway();
    sessionGateway.setUsage({ usesApiPool: true, raw: 'API tokens used: 12345' });
    const billingStateGateway = new StubBillingStateGateway();

    const result = await auditBilling({
      sessionGateway,
      billingStateGateway,
      now: () => new Date('2026-05-22T10:00:00Z'),
    });

    expect(result.regression).toBe(true);
    expect(billingStateGateway.read().dispatchPaused).toBe(true);
    expect(billingStateGateway.read().lastRegressionReason).toContain('API tokens used: 12345');
  });
});
