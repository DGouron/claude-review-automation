import type { MemberAccessGateway } from '@/modules/platform-integration/entities/memberAccess/memberAccess.gateway.js';
import type { ResolvedAccessLevel } from '@/modules/platform-integration/entities/memberAccess/memberAccess.js';

export interface MemberAccessResolveCall {
  projectPath: string;
  username: string;
}

/**
 * Recording stub for MemberAccessGateway (Detroit style — no vi.fn).
 *
 * Returns a fixed access level per username via `setAccess`. Unknown usernames
 * resolve fail-closed to `null`. `setShouldFail(true)` makes every resolve throw,
 * exercising the fail-closed boundary (SPEC-197 AC4). All calls are recorded so
 * tests can assert call counts and args (AC6: gateway never called when the token
 * verifier rejects).
 */
export class StubMemberAccessGateway implements MemberAccessGateway {
  public readonly calls: MemberAccessResolveCall[] = [];
  private accessByUsername = new Map<string, ResolvedAccessLevel>();
  private shouldFail = false;

  setAccess(username: string, accessLevel: ResolvedAccessLevel): void {
    this.accessByUsername.set(username, accessLevel);
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  async resolve(projectPath: string, username: string): Promise<ResolvedAccessLevel> {
    this.calls.push({ projectPath, username });
    if (this.shouldFail) {
      throw new Error('Membership lookup failed (stub)');
    }
    return this.accessByUsername.get(username) ?? null;
  }
}
