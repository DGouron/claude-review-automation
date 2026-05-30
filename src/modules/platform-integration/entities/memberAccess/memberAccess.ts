/**
 * GitLab project membership access levels, mirroring the numeric scale returned by
 * the GitLab Members API. Only the ordering matters for trust decisions: Developer
 * and above is trusted, everything below is not.
 *
 * See SPEC-197: trust = access level >= Developer.
 */
export const MEMBER_ACCESS_LEVELS = {
  noAccess: 0,
  minimalAccess: 5,
  guest: 10,
  reporter: 20,
  developer: 30,
  maintainer: 40,
  owner: 50,
} as const;

export type MemberAccessLevel = (typeof MEMBER_ACCESS_LEVELS)[keyof typeof MEMBER_ACCESS_LEVELS];

export const DEVELOPER_ACCESS_LEVEL: MemberAccessLevel = MEMBER_ACCESS_LEVELS.developer;

/**
 * A resolved access level (the actor is a member at some level) or `null` when the
 * actor could not be resolved as a trusted member. Per SPEC-197 the gateway is
 * fail-closed: lookup error / timeout / ambiguous / unknown username all collapse
 * to `null` (non-trusted).
 */
export type ResolvedAccessLevel = MemberAccessLevel | null;

export function isDeveloperOrAbove(accessLevel: ResolvedAccessLevel): boolean {
  return accessLevel !== null && accessLevel >= DEVELOPER_ACCESS_LEVEL;
}
