import { describe, expect, test, vi } from 'vitest'
import type { CollaborationTeam, CurrentCollaborationUser, CurrentMembership } from '@/services/teamCollaboration'
import {
  acceptTeamPermissionMemberVersion,
  buildTeamPermissionSnapshots,
  hasExactTeamPermission,
  invalidateTeamPermissionSnapshots,
  isCurrentTeamPermissionResponse,
  mergeTeamMemberships,
  publishTeamPermissionInvalidation,
  subscribeTeamPermissionInvalidation,
  synchronizeTeamPermissionSession,
} from '../teamPermissionContext'

const createMembership = (overrides: Partial<CurrentMembership> = {}): CurrentMembership =>
  ({
    member: {
      id: 11,
      team_id: 1,
      user_id: 7,
      status: 'active',
      version: 5,
    },
    team: {
      id: 1,
      name: '蓝队',
      status: 'active',
    },
    roles: [{ id: 3, team_id: 1, code: 'administrator', name: '管理员', status: 'active' }],
    permissions: ['test_data.write'],
    projects: [],
    ...overrides,
  }) as CurrentMembership

const createCurrentUser = (memberships: CurrentMembership[]): CurrentCollaborationUser =>
  ({
    user: { id: 7, status: 'active' },
    memberships,
  }) as CurrentCollaborationUser

describe('团队权限快照纯函数', () => {
  test('只接受服务端精确权限码，角色名、can_write 和通配符均不扩权', () => {
    const membership = createMembership({
      team: {
        ...(createMembership().team as CollaborationTeam),
        can_write: true,
      } as CollaborationTeam,
      permissions: ['*', 'test_data.write'],
    })

    const snapshots = buildTeamPermissionSnapshots(createCurrentUser([membership]))
    const snapshot = snapshots.get(1)

    expect(hasExactTeamPermission(snapshot, 'test_data.write')).toBe(true)
    expect(hasExactTeamPermission(snapshot, 'project.manage')).toBe(false)
    expect(hasExactTeamPermission(snapshot, '*')).toBe(true)
  })

  test.each([
    ['停用成员', { status: 'disabled', version: 5 }],
    ['缺失版本', { status: 'active' }],
    ['零版本', { status: 'active', version: 0 }],
    ['负版本', { status: 'active', version: -1 }],
    ['小数版本', { status: 'active', version: 1.5 }],
  ])('%s 不建立权限快照', (_name, member) => {
    const membership = createMembership({
      member: {
        id: 11,
        team_id: 1,
        user_id: 7,
        ...member,
      } as CurrentMembership['member'],
    })

    expect(buildTeamPermissionSnapshots(createCurrentUser([membership])).size).toBe(0)
  })

  test('成员用户与当前用户不一致时失败关闭', () => {
    const membership = createMembership({
      member: {
        ...createMembership().member,
        user_id: 8,
      },
    })

    expect(buildTeamPermissionSnapshots(createCurrentUser([membership])).size).toBe(0)
  })

  test('请求身份必须同时匹配用户、可空团队和请求序号', () => {
    const current = { userId: 7, teamId: null, requestSequence: 3 }

    expect(isCurrentTeamPermissionResponse(current, { ...current })).toBe(true)
    expect(isCurrentTeamPermissionResponse(current, { ...current, teamId: 1 })).toBe(false)
    expect(isCurrentTeamPermissionResponse(current, { ...current, userId: 8 })).toBe(false)
    expect(isCurrentTeamPermissionResponse(current, { ...current, requestSequence: 2 })).toBe(false)
  })

  test('团队合并只保留活动成员可访问的团队', () => {
    const active = createMembership()
    const disabled = createMembership({
      member: {
        ...createMembership().member,
        id: 12,
        team_id: 2,
        status: 'disabled',
      },
      team: {
        ...(createMembership().team as CollaborationTeam),
        id: 2,
        name: '红队',
      },
    })
    const teams = [
      { id: 1, name: '蓝队' },
      { id: 2, name: '红队' },
    ] as CollaborationTeam[]

    const merged = mergeTeamMemberships(teams, [active, disabled])

    expect(merged.map((team) => team.id)).toEqual([1])
    expect(merged[0].current_member).toEqual(active.member)
  })

  test('失效事件携带精确团队且退订幂等', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTeamPermissionInvalidation(listener)

    publishTeamPermissionInvalidation(3)
    publishTeamPermissionInvalidation(7)
    unsubscribe()
    unsubscribe()
    publishTeamPermissionInvalidation(9)

    expect(listener.mock.calls).toEqual([[3], [7]])
  })

  test('认证切换期间的团队失效不会把旧权限快照重新绑定到新会话', () => {
    const secondMembership = createMembership({
      member: {
        ...createMembership().member,
        id: 12,
        team_id: 2,
      },
      team: {
        ...(createMembership().team as CollaborationTeam),
        id: 2,
      },
    })
    const snapshots = buildTeamPermissionSnapshots(createCurrentUser([createMembership(), secondMembership]))
    synchronizeTeamPermissionSession('session-a')
    expect(acceptTeamPermissionMemberVersion('session-a', 7, 1, 5)).toBe(true)

    const mismatched = invalidateTeamPermissionSnapshots(snapshots, 'session-a', 'session-b', 2)
    expect(mismatched.authenticationSessionKey).toBe('session-a')
    expect(mismatched.snapshots.size).toBe(0)
    expect(acceptTeamPermissionMemberVersion('session-a', 7, 1, 4)).toBe(false)

    const current = invalidateTeamPermissionSnapshots(snapshots, 'session-a', 'session-a', 2)
    expect(current.authenticationSessionKey).toBe('session-a')
    expect(current.snapshots.size).toBe(1)
    expect(current.snapshots.get(1)).toBe(snapshots.get(1))
    expect(current.snapshots.has(2)).toBe(false)
  })
})
