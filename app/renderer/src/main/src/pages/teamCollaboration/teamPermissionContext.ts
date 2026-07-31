import type {
  CollaborationRole,
  CollaborationTeam,
  CurrentCollaborationUser,
  CurrentMembership,
  TeamMember,
} from '@/services/teamCollaboration'

export interface TeamPermissionSnapshot {
  userId: number
  teamId: number
  memberVersion: number
  permissions: ReadonlySet<string>
}

export interface TeamPermissionRequestIdentity {
  userId: number
  teamId: number | null
  requestSequence: number
}

export interface TeamPermissionSnapshotIdentity {
  userId: number
  teamId: number
  requestSequence: number
  memberVersion: number
}

export interface TeamWithCurrentMembership extends CollaborationTeam {
  current_member: TeamMember
  current_user_roles: CollaborationRole[]
}

const isPositiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0

const isActiveMembership = (membership: CurrentMembership): boolean =>
  membership.member.status === 'active' &&
  isPositiveInteger(membership.member.team_id) &&
  isPositiveInteger(membership.team.id) &&
  membership.member.team_id === membership.team.id

export const mergeTeamMemberships = (
  teams: readonly CollaborationTeam[],
  memberships: readonly CurrentMembership[],
): TeamWithCurrentMembership[] => {
  const membershipByTeamId = new Map(
    memberships.filter(isActiveMembership).map((membership) => [membership.team.id, membership] as const),
  )

  return teams.flatMap((team) => {
    const membership = membershipByTeamId.get(team.id)
    if (!membership) return []
    return [
      {
        ...team,
        current_member: membership.member,
        current_user_roles: membership.roles,
      },
    ]
  })
}

export const buildTeamPermissionSnapshots = (
  currentUser: CurrentCollaborationUser,
): ReadonlyMap<number, TeamPermissionSnapshot> => {
  if (!isPositiveInteger(currentUser.user.id)) return new Map()

  const snapshots = new Map<number, TeamPermissionSnapshot>()
  currentUser.memberships.forEach((membership) => {
    const { member, team } = membership
    if (
      !isActiveMembership(membership) ||
      member.user_id !== currentUser.user.id ||
      !isPositiveInteger(member.version)
    ) {
      return
    }
    snapshots.set(team.id, {
      userId: currentUser.user.id,
      teamId: team.id,
      memberVersion: member.version,
      permissions: new Set(membership.permissions.filter((permission) => typeof permission === 'string' && permission)),
    })
  })
  return snapshots
}

export const hasExactTeamPermission = (snapshot: TeamPermissionSnapshot | undefined, code: string): boolean =>
  Boolean(snapshot && code && snapshot.permissions.has(code))

export const invalidateTeamPermissionSnapshots = (
  snapshots: ReadonlyMap<number, TeamPermissionSnapshot>,
  boundAuthenticationSessionKey: string,
  currentAuthenticationSessionKey: string,
  teamId: number,
): { authenticationSessionKey: string; snapshots: ReadonlyMap<number, TeamPermissionSnapshot> } => {
  if (boundAuthenticationSessionKey !== currentAuthenticationSessionKey) {
    return { authenticationSessionKey: boundAuthenticationSessionKey, snapshots: new Map() }
  }
  const next = new Map(snapshots)
  next.delete(teamId)
  return { authenticationSessionKey: boundAuthenticationSessionKey, snapshots: next }
}

export const isCurrentTeamPermissionResponse = (
  current: TeamPermissionRequestIdentity,
  response: TeamPermissionRequestIdentity,
): boolean =>
  current.userId === response.userId &&
  current.teamId === response.teamId &&
  current.requestSequence === response.requestSequence

export type TeamPermissionInvalidationListener = (teamId: number) => void
export type TeamAuthenticationInvalidationListener = () => void

const invalidationListeners = new Set<TeamPermissionInvalidationListener>()
const authenticationInvalidationListeners = new Set<TeamAuthenticationInvalidationListener>()
const permissionVersionWatermarks = new Map<string, number>()
let permissionAuthenticationSessionKey = ''

const getPermissionVersionWatermarkKey = (authenticationSessionKey: string, userId: number, teamId: number): string =>
  `${authenticationSessionKey}\u0000${userId}\u0000${teamId}`

export const synchronizeTeamPermissionSession = (authenticationSessionKey: string): void => {
  if (permissionAuthenticationSessionKey === authenticationSessionKey) return
  permissionAuthenticationSessionKey = authenticationSessionKey
  permissionVersionWatermarks.clear()
}

export const acceptTeamPermissionMemberVersion = (
  authenticationSessionKey: string,
  userId: number,
  teamId: number,
  memberVersion: number,
): boolean => {
  if (
    permissionAuthenticationSessionKey !== authenticationSessionKey ||
    !isPositiveInteger(userId) ||
    !isPositiveInteger(teamId) ||
    !isPositiveInteger(memberVersion)
  ) {
    return false
  }

  const watermarkKey = getPermissionVersionWatermarkKey(authenticationSessionKey, userId, teamId)
  const watermark = permissionVersionWatermarks.get(watermarkKey)
  if (watermark !== undefined && memberVersion < watermark) return false
  permissionVersionWatermarks.set(watermarkKey, Math.max(watermark || 0, memberVersion))
  return true
}

export const subscribeTeamPermissionInvalidation = (listener: TeamPermissionInvalidationListener): (() => void) => {
  invalidationListeners.add(listener)
  return () => {
    invalidationListeners.delete(listener)
  }
}

export const publishTeamPermissionInvalidation = (teamId: number): void => {
  if (!isPositiveInteger(teamId)) return
  invalidationListeners.forEach((listener) => listener(teamId))
}

export const subscribeTeamAuthenticationInvalidation = (
  listener: TeamAuthenticationInvalidationListener,
): (() => void) => {
  authenticationInvalidationListeners.add(listener)
  return () => {
    authenticationInvalidationListeners.delete(listener)
  }
}

export const publishTeamAuthenticationInvalidation = (): void => {
  permissionVersionWatermarks.clear()
  authenticationInvalidationListeners.forEach((listener) => listener())
}
