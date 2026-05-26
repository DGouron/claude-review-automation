import type {
  ApprovalRevocationGateway,
  ApprovalRevocationInput,
} from '@/modules/platform-integration/entities/approvalRevocation/approvalRevocation.gateway.js';
import type { CommandExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';

export class GitLabApprovalRevocationCliGateway implements ApprovalRevocationGateway {
  constructor(private readonly executor: CommandExecutor) {}

  async revoke(input: ApprovalRevocationInput): Promise<void> {
    const encodedProject = input.projectPath.replace(/\//g, '%2F');
    const command = `glab api --method POST projects/${encodedProject}/merge_requests/${input.mrNumber}/approvals/unapprove`;
    this.executor(command);
  }
}
