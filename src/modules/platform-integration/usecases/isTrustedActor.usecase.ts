import type { MemberAccessGateway } from '@/modules/platform-integration/entities/memberAccess/memberAccess.gateway.js';
import { isDeveloperOrAbove } from '@/modules/platform-integration/entities/memberAccess/memberAccess.js';

export interface IsTrustedActorInput {
  username: string;
  projectPath: string;
}

/**
 * Decides whether the trigger actor is a trusted (Developer+) member of the target
 * project (SPEC-197). Consumes the fail-closed MemberAccessGateway: any resolution
 * failure or sub-Developer level collapses to non-trusted, so a thrown lookup never
 * widens trust.
 */
export class IsTrustedActorUseCase {
  constructor(private readonly memberAccessGateway: MemberAccessGateway) {}

  async execute(input: IsTrustedActorInput): Promise<boolean> {
    try {
      const accessLevel = await this.memberAccessGateway.resolve(input.projectPath, input.username);
      return isDeveloperOrAbove(accessLevel);
    } catch {
      return false;
    }
  }
}
