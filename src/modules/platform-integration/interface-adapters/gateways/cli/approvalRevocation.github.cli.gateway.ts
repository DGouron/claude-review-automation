import type {
  ApprovalRevocationGateway,
  ApprovalRevocationInput,
} from '@/modules/platform-integration/entities/approvalRevocation/approvalRevocation.gateway.js';
import type { CommandExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.js';

export class GitHubApprovalRevocationCliGateway implements ApprovalRevocationGateway {
  constructor(private readonly executor: CommandExecutor) {}

  async revoke(input: ApprovalRevocationInput): Promise<void> {
    if (input.reviewId === undefined) {
      throw new Error('GitHub approval revocation requires a reviewId');
    }
    const message = input.dismissalMessage ?? 'Quality gate not satisfied';
    const command = `gh api --method PUT repos/${input.projectPath}/pulls/${input.mrNumber}/reviews/${input.reviewId}/dismissals --field message=${JSON.stringify(message)}`;
    this.executor(command);
  }
}
