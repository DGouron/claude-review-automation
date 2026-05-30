import type { ResolvedAccessLevel } from '@/modules/platform-integration/entities/memberAccess/memberAccess.js';

/**
 * Resolves a GitLab actor's access level on a target project, keyed by username.
 *
 * Implementations MUST be fail-closed (SPEC-197 AC4): any lookup error, timeout,
 * ambiguous result, or unknown username resolves to `null` (non-trusted). The
 * resolution keys on `username` (the only identity exposed by the parsed webhook
 * guards) and never widens trust across usernames (AC5).
 */
export interface MemberAccessGateway {
  resolve(projectPath: string, username: string): Promise<ResolvedAccessLevel>;
}
