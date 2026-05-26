import type {
  ApprovalRevocationGateway,
  ApprovalRevocationInput,
} from '@/modules/platform-integration/entities/approvalRevocation/approvalRevocation.gateway.js';

export class StubApprovalRevocationGateway implements ApprovalRevocationGateway {
  readonly calls: ApprovalRevocationInput[] = [];
  shouldThrow = false;

  async revoke(input: ApprovalRevocationInput): Promise<void> {
    this.calls.push(input);
    if (this.shouldThrow) {
      throw new Error('Stub configured to throw on revoke');
    }
  }
}
