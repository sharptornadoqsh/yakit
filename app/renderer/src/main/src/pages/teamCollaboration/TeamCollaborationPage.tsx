import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import { YakitEmpty } from '@/components/yakitUI/YakitEmpty/YakitEmpty'
import { YakitInput } from '@/components/yakitUI/YakitInput/YakitInput'
import { YakitModal } from '@/components/yakitUI/YakitModal/YakitModal'
import { YakitSelect } from '@/components/yakitUI/YakitSelect/YakitSelect'
import { YakitSpin } from '@/components/yakitUI/YakitSpin/YakitSpin'
import { YakitTag } from '@/components/yakitUI/YakitTag/YakitTag'
import {
  createTeamProject,
  createTestData,
  createTestResult,
  getMe,
  getProjectSync,
  getTestData,
  getTestResult,
  listAuditLogs,
  listProjectMembers,
  listTeamMembers,
  listTeamProjects,
  listTeams,
  listTestData,
  listTestResults,
  type CollaborationTeam,
  type CurrentCollaborationUser,
  updateProjectSnapshot,
} from '@/services/teamCollaboration'
import { publishTeamProjectBundle, restoreTeamProjectBundle, type ProjectBundleProgress } from './teamProjectBundle'
import { createDefaultTeamProjectBundleDependencies } from './teamProjectBundleRuntime'
import {
  acceptTeamPermissionMemberVersion,
  buildTeamPermissionSnapshots,
  hasExactTeamPermission,
  invalidateTeamPermissionSnapshots,
  isCurrentTeamPermissionResponse,
  mergeTeamMemberships,
  subscribeTeamAuthenticationInvalidation,
  subscribeTeamPermissionInvalidation,
  synchronizeTeamPermissionSession,
  type TeamPermissionRequestIdentity,
  type TeamPermissionSnapshot,
} from './teamPermissionContext'
import { ParsedSharedHTTPFlow, parseSharedHTTPFlow, parseSharedRisk } from './sharedRecordAdapters'
import {
  SharedHTTPFlowDetail,
  TEAM_SHARED_RECORDS_REFRESH_EVENT,
  type TeamSharedRecordsRefreshDetail,
} from './SharedHTTPFlowDetail'
import styles from './TeamCollaborationPage.module.css'

type ApiEntity = Record<string, any>
type ApiFunction = (...args: any[]) => Promise<any>
type SharedRecordKind = 'test-data' | 'test-result'

interface SharedRecordDraft {
  type: string
  status: string
  severity: string
  testDataId: string
  metadata: string
  content: string
}

interface SharedRecordContext {
  teamId: string
  projectId: string
}

interface SharedRecordSaveRequest {
  requestId: number
  kind: SharedRecordKind
  context: SharedRecordContext
}

interface ParsedSharedHTTPRecord {
  record: ApiEntity
  parsed: ParsedSharedHTTPFlow
}

interface SharedHTTPIndexBuild {
  requestId: number
  completion: Promise<void>
}

const HTTP_FLOW_DEDUPLICATION_PATTERN = /^http-flow:([a-f0-9]{64})$/
const RISK_DEDUPLICATION_PATTERN = /^risk:([a-f0-9]{64})$/

const hasExactRemoteRecordIdentity = (
  record: ApiEntity,
  recordId: string,
  teamId: string,
  projectId: string,
): boolean =>
  Number.isSafeInteger(record.id) &&
  record.id > 0 &&
  record.id === Number(recordId) &&
  record.team_id === Number(teamId) &&
  record.project_id === Number(projectId)

const getRemoteSharedHTTPFlowKey = (record: ApiEntity, recordId: string, teamId: string, projectId: string): string => {
  if (
    !hasExactRemoteRecordIdentity(record, recordId, teamId, projectId) ||
    record.data_type !== 'http_flow' ||
    record.status !== 'active'
  ) {
    throw new Error('共享 HTTP Flow 记录身份无效')
  }
  const deduplication = HTTP_FLOW_DEDUPLICATION_PATTERN.exec(record.deduplication_key)
  if (!deduplication) throw new Error('共享 HTTP Flow 去重标识无效')
  return deduplication[1]
}

const parseRemoteSharedHTTPRecord = async (
  record: ApiEntity,
  recordId: string,
  teamId: string,
  projectId: string,
): Promise<ParsedSharedHTTPFlow> => {
  const expectedFlowKey = getRemoteSharedHTTPFlowKey(record, recordId, teamId, projectId)
  if (typeof record.content !== 'string' || !record.content) {
    throw new Error('共享 HTTP Flow 记录身份无效')
  }
  const parsed = await parseSharedHTTPFlow(record.content)
  if (expectedFlowKey !== parsed.flowKey) throw new Error('共享 HTTP Flow 去重标识不匹配')
  return parsed
}

const isSameRecordContext = (current: SharedRecordContext, expected: SharedRecordContext): boolean =>
  current.teamId === expected.teamId && current.projectId === expected.projectId

const createSharedRecordDraft = (kind: SharedRecordKind): SharedRecordDraft => ({
  type: 'manual',
  status: kind === 'test-data' ? 'active' : 'pending',
  severity: 'info',
  testDataId: '',
  metadata: '{}',
  content: '',
})

const getValue = (record: ApiEntity | undefined, keys: string[], fallback: any = ''): any => {
  if (!record) return fallback
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return fallback
}

const getSyncedProject = (syncInfo?: ApiEntity): ApiEntity | undefined => {
  const project = syncInfo?.project
  return project && !Array.isArray(project) && typeof project === 'object' ? project : syncInfo
}

const getId = (record: ApiEntity | undefined): string => `${getValue(record, ['id', 'ID', 'uuid', 'UUID'])}`

const getList = (response: any, keys: string[] = []): ApiEntity[] => {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.data)) return response.data
  for (const key of [...keys, 'items', 'list', 'results', 'records']) {
    if (Array.isArray(response?.[key])) return response[key]
    if (Array.isArray(response?.data?.[key])) return response.data[key]
  }
  return []
}

const mergeSyncedRecords = (
  current: ApiEntity[],
  changed: ApiEntity[] = [],
  tombstones: ApiEntity[] = [],
): ApiEntity[] => {
  const records = new Map<string, ApiEntity>()
  current.forEach((record) => {
    const id = getId(record)
    if (id) records.set(id, record)
  })
  changed.forEach((record) => {
    const id = getId(record)
    if (id) records.set(id, record)
  })
  tombstones.forEach((record) => {
    const id = getId(record)
    if (id) records.delete(id)
  })
  return Array.from(records.values())
}

const getErrorStatus = (error: any): number =>
  Number(error?.response?.status || error?.status || error?.response?.data?.code || error?.code || 0)

const getErrorMessage = (error: any): string =>
  `${error?.response?.data?.message || error?.message || error || '请求失败'}`

const formatTime = (value: any): string => {
  if (!value) return '暂无同步记录'
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? `${value}` : time.toLocaleString('zh-CN', { hour12: false })
}

const toPositiveTeamId = (value: string | number | null | undefined): number | null => {
  const teamId = Number(value)
  return Number.isSafeInteger(teamId) && teamId > 0 ? teamId : null
}

const getStableFirstTeamId = (teams: readonly CollaborationTeam[]): number | null => {
  const teamIds = teams.map((team) => team.id).filter((teamId) => toPositiveTeamId(teamId) !== null)
  return teamIds.length > 0 ? Math.min(...teamIds) : null
}

const roleText = (record?: ApiEntity): string => {
  const directRole = `${getValue(record, ['role_name', 'roleName', 'role', 'current_user_role'], '')}`.trim()
  if (directRole) return directRole
  const roles = getValue(record, ['roles'], [])
  if (!Array.isArray(roles)) return '成员'
  const names = roles.map((role) => `${getValue(role, ['name', 'code'], '')}`.trim()).filter(Boolean)
  return names.join('、') || '成员'
}

const userText = (record?: ApiEntity): string => {
  const directName = `${getValue(record, ['user_name', 'userName', 'username', 'name', 'nickname'], '')}`.trim()
  if (directName) return directName
  const user = getValue(record, ['user'], undefined)
  return `${getValue(user, ['name', 'nick_name', 'email', 'uid'], '未命名成员')}`
}

const getUserId = (record?: ApiEntity): string => {
  const user = getValue(record, ['user'], undefined)
  return `${getValue(record, ['user_id', 'userId'], getValue(user, ['id', 'ID']))}`
}

const callApi = (fn: ApiFunction, ...args: any[]) => fn(...args)

const getLocalProjectName = (project?: ApiEntity): string => `${getValue(project, ['ProjectName', 'name'])}`

const parseMetadata = (value: string): Record<string, unknown> => {
  const parsed = value.trim() ? JSON.parse(value) : {}
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('invalid')
  return parsed
}

const formatMetadata = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '{}'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return `${value}`
  }
}

const formatProjectSnapshot = (value: unknown): string | undefined => {
  let snapshot = value
  if (typeof snapshot === 'string') {
    try {
      snapshot = JSON.parse(snapshot)
    } catch {
      return undefined
    }
  }
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object') return undefined
  return JSON.stringify(snapshot, null, 2)
}

const getRecordContentPreview = (record: ApiEntity, fallbackKeys: string[] = []): string => {
  const content = `${getValue(record, ['content'], '')}`
  if (content) return content
  const fallback = `${getValue(record, fallbackKeys, '')}`
  if (fallback) return fallback
  const fileSize = Number(getValue(record, ['file_size', 'fileSize'], 0))
  const contentHash = `${getValue(record, ['content_hash', 'contentHash'], '')}`.trim()
  return fileSize > 0 || contentHash ? '正文已存储，请在详情中查看' : '暂无正文'
}

export const createAvailableLocalProjectCopyName = (projectName: string, localProjects: ApiEntity[]): string => {
  const names = new Set(localProjects.map((project) => getLocalProjectName(project)))
  const baseName = `${projectName}-本地副本`
  if (!names.has(baseName)) return baseName
  for (let index = 2; index <= localProjects.length + 2; index += 1) {
    const candidate = `${baseName}-${index}`
    if (!names.has(candidate)) return candidate
  }
  return `${baseName}-${localProjects.length + 3}`
}

export const TeamCollaborationPage: React.FC = React.memo(() => {
  const userInfo = useStore((state) => state.userInfo)
  const authenticatedUserId = Number(userInfo.user_id)
  const authenticationSessionKey = `${
    userInfo.isLogin ? 'authenticated' : 'logged-out'
  }\u0000${authenticatedUserId}\u0000${userInfo.token}`
  synchronizeTeamPermissionSession(authenticationSessionKey)
  const [teams, setTeams] = useState<ApiEntity[]>([])
  const [permissionSnapshots, setPermissionSnapshots] = useState<ReadonlyMap<number, TeamPermissionSnapshot>>(
    () => new Map(),
  )
  const [permissionSnapshotsAuthenticationSessionKey, setPermissionSnapshotsAuthenticationSessionKey] =
    useState(authenticationSessionKey)
  const [teamMembers, setTeamMembers] = useState<ApiEntity[]>([])
  const [projects, setProjects] = useState<ApiEntity[]>([])
  const [projectMembers, setProjectMembers] = useState<ApiEntity[]>([])
  const [testData, setTestData] = useState<ApiEntity[]>([])
  const [testResults, setTestResults] = useState<ApiEntity[]>([])
  const [auditLogs, setAuditLogs] = useState<ApiEntity[]>([])
  const [syncInfo, setSyncInfo] = useState<ApiEntity>()
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [localProjects, setLocalProjects] = useState<ApiEntity[]>([])
  const [selectedLocalProjectId, setSelectedLocalProjectId] = useState('')
  const [localCopyName, setLocalCopyName] = useState('')
  const [bundleMessage, setBundleMessage] = useState('')
  const [localProjectConflict, setLocalProjectConflict] = useState<ApiEntity>()
  const [conflictCopyName, setConflictCopyName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [testDataName, setTestDataName] = useState('')
  const [testResultName, setTestResultName] = useState('')
  const [recordEditorKind, setRecordEditorKind] = useState<SharedRecordKind>()
  const [recordDraft, setRecordDraft] = useState<SharedRecordDraft>(() => createSharedRecordDraft('test-data'))
  const [recordEditorError, setRecordEditorError] = useState('')
  const [recordDetailKind, setRecordDetailKind] = useState<SharedRecordKind>()
  const [recordDetail, setRecordDetail] = useState<ApiEntity>()
  const [sharedHTTPDetailContent, setSharedHTTPDetailContent] = useState('')
  const [sharedRiskDetailContent, setSharedRiskDetailContent] = useState('')
  const [recordDetailLoading, setRecordDetailLoading] = useState(false)
  const [recordDetailError, setRecordDetailError] = useState('')
  const recordDetailRequestId = useRef(0)
  const sharedHTTPIndexRequestId = useRef(0)
  const sharedHTTPIndexBuildRef = useRef<SharedHTTPIndexBuild>({
    requestId: 0,
    completion: Promise.resolve(),
  })

  useEffect(
    () => () => {
      recordDetailRequestId.current += 1
    },
    [],
  )
  const sharedHTTPRecordsRef = useRef<ParsedSharedHTTPRecord[]>([])
  const [sharedHTTPRecords, setSharedHTTPRecords] = useState<ParsedSharedHTTPRecord[]>([])
  const [recordSavingKind, setRecordSavingKind] = useState<SharedRecordKind>()
  const recordSaveRequestId = useRef(0)
  const activeRecordSave = useRef<SharedRecordSaveRequest>()
  const teamContextRequestId = useRef(0)
  const projectContextRequestId = useRef(0)
  const syncRequestId = useRef(0)
  const snapshotRequestId = useRef(0)
  const [snapshotText, setSnapshotText] = useState('{}')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [snapshotReady, setSnapshotReady] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [syncConflict, setSyncConflict] = useState(false)
  const selectedTeamIdRef = useRef('')
  const permissionSnapshotsRef = useRef<ReadonlyMap<number, TeamPermissionSnapshot>>(new Map())
  const permissionSnapshotsAuthenticationSessionKeyRef = useRef(authenticationSessionKey)
  const permissionRequestSequence = useRef(0)
  const currentPermissionRequest = useRef<TeamPermissionRequestIdentity>()
  const authenticationSessionKeyRef = useRef(authenticationSessionKey)
  const appliedAuthenticationSessionKeyRef = useRef(authenticationSessionKey)
  authenticationSessionKeyRef.current = authenticationSessionKey

  const recordContext = useMemo<SharedRecordContext>(
    () => ({ teamId: selectedTeamId, projectId: selectedProjectId }),
    [selectedProjectId, selectedTeamId],
  )
  const recordContextRef = useRef(recordContext)
  recordContextRef.current = recordContext
  selectedTeamIdRef.current = selectedTeamId

  const selectedProject = useMemo(
    () => projects.find((project) => getId(project) === selectedProjectId),
    [projects, selectedProjectId],
  )
  const selectedLocalProject = useMemo(
    () => localProjects.find((project) => getId(project) === selectedLocalProjectId),
    [localProjects, selectedLocalProjectId],
  )
  const teamMemberByUserId = useMemo(() => {
    const index = new Map<string, ApiEntity>()
    teamMembers.forEach((member) => {
      const userId = getUserId(member)
      if (userId) index.set(userId, member)
    })
    return index
  }, [teamMembers])
  const sharedHTTPRecordById = useMemo(
    () => new Map(sharedHTTPRecords.map((entry) => [getId(entry.record), entry])),
    [sharedHTTPRecords],
  )
  const selectedTeamPermission = useMemo(() => {
    if (permissionSnapshotsAuthenticationSessionKey !== authenticationSessionKey) return undefined
    const teamId = toPositiveTeamId(selectedTeamId)
    return teamId === null ? undefined : permissionSnapshots.get(teamId)
  }, [authenticationSessionKey, permissionSnapshots, permissionSnapshotsAuthenticationSessionKey, selectedTeamId])
  const canReadMembers = hasExactTeamPermission(selectedTeamPermission, 'member.read')
  const canReadProject = hasExactTeamPermission(selectedTeamPermission, 'project.read')
  const canReadProjectMembers = hasExactTeamPermission(selectedTeamPermission, 'project_member.read')
  const canReadTestData = hasExactTeamPermission(selectedTeamPermission, 'test_data.read')
  const canReadTestResult = hasExactTeamPermission(selectedTeamPermission, 'test_result.read')
  const canReadAudit = hasExactTeamPermission(selectedTeamPermission, 'audit.read')
  const canManageProject = hasExactTeamPermission(selectedTeamPermission, 'project.manage')
  const canWriteTestData = hasExactTeamPermission(selectedTeamPermission, 'test_data.write')
  const canWriteTestResult = hasExactTeamPermission(selectedTeamPermission, 'test_result.write')
  const canPublishProject = canManageProject && canWriteTestData
  const canWrite = canManageProject || canWriteTestData || canWriteTestResult

  const commitPermissionSnapshots = useCallback(
    (
      next: ReadonlyMap<number, TeamPermissionSnapshot>,
      boundAuthenticationSessionKey = authenticationSessionKeyRef.current,
    ) => {
      permissionSnapshotsAuthenticationSessionKeyRef.current = boundAuthenticationSessionKey
      permissionSnapshotsRef.current = next
      setPermissionSnapshotsAuthenticationSessionKey(boundAuthenticationSessionKey)
      setPermissionSnapshots(next)
    },
    [],
  )

  const invalidatePermissionSnapshot = useCallback(
    (teamId: number) => {
      const next = invalidateTeamPermissionSnapshots(
        permissionSnapshotsRef.current,
        permissionSnapshotsAuthenticationSessionKeyRef.current,
        authenticationSessionKeyRef.current,
        teamId,
      )
      commitPermissionSnapshots(next.snapshots, next.authenticationSessionKey)
    },
    [commitPermissionSnapshots],
  )

  const hasActiveTeamPermission = useCallback((code: string): boolean => {
    if (permissionSnapshotsAuthenticationSessionKeyRef.current !== authenticationSessionKeyRef.current) {
      return false
    }
    const teamId = toPositiveTeamId(selectedTeamIdRef.current)
    return teamId !== null && hasExactTeamPermission(permissionSnapshotsRef.current.get(teamId), code)
  }, [])

  const loadTeams = useCallback(
    async (requestedTeamId: number | null) => {
      if (!userInfo.isLogin || !Number.isSafeInteger(authenticatedUserId) || authenticatedUserId <= 0) {
        currentPermissionRequest.current = undefined
        commitPermissionSnapshots(new Map(), authenticationSessionKey)
        setTeams([])
        selectedTeamIdRef.current = ''
        setSelectedTeamId('')
        setLoading(false)
        return
      }

      const requestIdentity: TeamPermissionRequestIdentity = {
        userId: authenticatedUserId,
        teamId: requestedTeamId,
        requestSequence: permissionRequestSequence.current + 1,
      }
      permissionRequestSequence.current = requestIdentity.requestSequence
      currentPermissionRequest.current = requestIdentity
      if (requestedTeamId === null) {
        commitPermissionSnapshots(new Map(), authenticationSessionKey)
      } else {
        invalidatePermissionSnapshot(requestedTeamId)
      }
      setLoading(true)
      setErrorMessage('')
      try {
        const [teamResponse, currentUserResponse] = await Promise.all([
          callApi(listTeams as ApiFunction),
          callApi(getMe as ApiFunction),
        ])
        if (
          !currentPermissionRequest.current ||
          !isCurrentTeamPermissionResponse(currentPermissionRequest.current, requestIdentity) ||
          authenticationSessionKeyRef.current !== authenticationSessionKey
        ) {
          return
        }

        const currentUser = (currentUserResponse?.data || currentUserResponse) as CurrentCollaborationUser
        if (
          !currentUser?.user ||
          currentUser.user.id !== authenticatedUserId ||
          !Array.isArray(currentUser.memberships)
        ) {
          commitPermissionSnapshots(new Map(), authenticationSessionKey)
          throw new Error('团队权限响应用户不匹配')
        }

        const nextTeams = mergeTeamMemberships(
          getList(teamResponse, ['teams']) as CollaborationTeam[],
          currentUser.memberships,
        )
        const responseSnapshots = buildTeamPermissionSnapshots(currentUser)
        let activeTeamId = requestedTeamId
        if (requestedTeamId === null) {
          if (selectedTeamIdRef.current) return
          activeTeamId = getStableFirstTeamId(nextTeams)
        } else if (selectedTeamIdRef.current !== `${requestedTeamId}`) {
          return
        }

        if (activeTeamId !== null && !nextTeams.some((team) => team.id === activeTeamId)) {
          activeTeamId = null
        }
        setTeams(nextTeams)
        selectedTeamIdRef.current = activeTeamId === null ? '' : `${activeTeamId}`
        setSelectedTeamId(selectedTeamIdRef.current)
        commitPermissionSnapshots(new Map(), authenticationSessionKey)
        if (activeTeamId === null) return

        const snapshot = responseSnapshots.get(activeTeamId)
        if (!snapshot) return
        if (
          !acceptTeamPermissionMemberVersion(
            authenticationSessionKey,
            snapshot.userId,
            snapshot.teamId,
            snapshot.memberVersion,
          )
        ) {
          return
        }
        commitPermissionSnapshots(new Map([[activeTeamId, snapshot]]), authenticationSessionKey)
      } catch (error) {
        if (
          !currentPermissionRequest.current ||
          !isCurrentTeamPermissionResponse(currentPermissionRequest.current, requestIdentity) ||
          authenticationSessionKeyRef.current !== authenticationSessionKey
        ) {
          return
        }
        setErrorMessage(getErrorMessage(error))
        commitPermissionSnapshots(new Map(), authenticationSessionKey)
        setTeams([])
        selectedTeamIdRef.current = ''
        setSelectedTeamId('')
      } finally {
        if (
          currentPermissionRequest.current &&
          isCurrentTeamPermissionResponse(currentPermissionRequest.current, requestIdentity) &&
          authenticationSessionKeyRef.current === authenticationSessionKey
        ) {
          setLoading(false)
        }
      }
    },
    [
      authenticatedUserId,
      authenticationSessionKey,
      commitPermissionSnapshots,
      invalidatePermissionSnapshot,
      userInfo.isLogin,
    ],
  )

  const loadTeamContext = useCallback(
    async (teamId: string) => {
      const memberReadable = canReadMembers && hasActiveTeamPermission('member.read')
      const projectReadable = canReadProject && hasActiveTeamPermission('project.read')
      if (!teamId || (!memberReadable && !projectReadable)) {
        teamContextRequestId.current += 1
        setTeamMembers([])
        setProjects([])
        setSelectedProjectId('')
        setDetailLoading(false)
        return
      }
      if (recordContextRef.current.teamId !== teamId) return
      const requestId = teamContextRequestId.current + 1
      teamContextRequestId.current = requestId
      setTeamMembers([])
      setProjects([])
      setDetailLoading(true)
      setErrorMessage('')
      const [memberResult, projectResult] = await Promise.allSettled([
        memberReadable ? callApi(listTeamMembers as ApiFunction, teamId) : Promise.resolve([]),
        projectReadable ? callApi(listTeamProjects as ApiFunction, teamId) : Promise.resolve([]),
      ])
      if (teamContextRequestId.current !== requestId || recordContextRef.current.teamId !== teamId) return
      if (memberResult.status === 'fulfilled') {
        setTeamMembers(getList(memberResult.value, ['members']))
      } else {
        setTeamMembers([])
        setErrorMessage(getErrorMessage(memberResult.reason))
      }
      if (projectResult.status === 'fulfilled') {
        const nextProjects = getList(projectResult.value, ['projects'])
        setProjects(nextProjects)
        setSelectedProjectId((current) => {
          if (nextProjects.some((project) => getId(project) === current)) return current
          return getId(nextProjects[0])
        })
      } else {
        setProjects([])
        setSelectedProjectId('')
        setErrorMessage(getErrorMessage(projectResult.reason))
      }
      setDetailLoading(false)
    },
    [canReadMembers, canReadProject, hasActiveTeamPermission],
  )

  const loadSync = useCallback(
    async (teamId: string, projectId: string) => {
      if (
        !teamId ||
        !projectId ||
        !canReadProject ||
        !hasActiveTeamPermission('project.read') ||
        recordContextRef.current.teamId !== teamId ||
        recordContextRef.current.projectId !== projectId
      ) {
        return
      }
      const requestId = syncRequestId.current + 1
      syncRequestId.current = requestId
      const isCurrentRequest = () =>
        syncRequestId.current === requestId &&
        recordContextRef.current.teamId === teamId &&
        recordContextRef.current.projectId === projectId
      setSyncLoading(true)
      setSnapshotReady(false)
      setSyncConflict(false)
      try {
        const response = await callApi(getProjectSync as ApiFunction, teamId, projectId)
        if (!isCurrentRequest()) return
        const nextSync = (response?.data || response) as ApiEntity
        setSyncInfo(nextSync)
        const tombstones: ApiEntity = nextSync.tombstones ?? {}
        const syncedProjectMembers = Array.isArray(nextSync.project_members) ? nextSync.project_members : undefined
        const syncedTestData = Array.isArray(nextSync.test_data) ? nextSync.test_data : undefined
        const syncedTestResults = Array.isArray(nextSync.test_results) ? nextSync.test_results : undefined
        const deletedProjectMembers = Array.isArray(tombstones?.project_members) ? tombstones.project_members : []
        const deletedTestData = Array.isArray(tombstones?.test_data) ? tombstones.test_data : []
        const deletedTestResults = Array.isArray(tombstones?.test_results) ? tombstones.test_results : []
        if (syncedProjectMembers || deletedProjectMembers.length) {
          setProjectMembers((current) => mergeSyncedRecords(current, syncedProjectMembers, deletedProjectMembers))
        }
        if (syncedTestData || deletedTestData.length) {
          setTestData((current) => mergeSyncedRecords(current, syncedTestData, deletedTestData))
        }
        if (syncedTestResults || deletedTestResults.length) {
          setTestResults((current) => mergeSyncedRecords(current, syncedTestResults, deletedTestResults))
        }
        const nextSnapshot = Object.prototype.hasOwnProperty.call(nextSync, 'snapshot')
          ? nextSync.snapshot
          : nextSync.project?.snapshot
        const nextSnapshotText = formatProjectSnapshot(nextSnapshot)
        if (nextSnapshotText !== undefined) setSnapshotText(nextSnapshotText)
        setSnapshotReady(nextSnapshotText !== undefined)
      } catch (error) {
        if (!isCurrentRequest()) return
        if (getErrorStatus(error) === 409 || getErrorMessage(error).includes('version_conflict')) {
          setSyncConflict(true)
        } else {
          setErrorMessage(getErrorMessage(error))
        }
      } finally {
        if (isCurrentRequest()) setSyncLoading(false)
      }
    },
    [canReadProject, hasActiveTeamPermission],
  )

  const loadProjectContext = useCallback(
    async (teamId: string, projectId: string) => {
      const projectMembersReadable = canReadProjectMembers && hasActiveTeamPermission('project_member.read')
      const testDataReadable = canReadTestData && hasActiveTeamPermission('test_data.read')
      const testResultReadable = canReadTestResult && hasActiveTeamPermission('test_result.read')
      const auditReadable = canReadAudit && hasActiveTeamPermission('audit.read')
      if (!teamId || !projectId) {
        projectContextRequestId.current += 1
        setProjectMembers([])
        setTestData([])
        setTestResults([])
        setAuditLogs([])
        setDetailLoading(false)
        return
      }
      if (recordContextRef.current.teamId !== teamId || recordContextRef.current.projectId !== projectId) return
      recordDetailRequestId.current += 1
      setRecordDetailKind(undefined)
      setRecordDetail(undefined)
      setSharedHTTPDetailContent('')
      setSharedRiskDetailContent('')
      setRecordDetailLoading(false)
      setRecordDetailError('')
      if (!projectMembersReadable && !testDataReadable && !testResultReadable && !auditReadable) {
        projectContextRequestId.current += 1
        setProjectMembers([])
        setTestData([])
        setTestResults([])
        setAuditLogs([])
        setDetailLoading(false)
        await loadSync(teamId, projectId)
        return
      }
      const requestId = projectContextRequestId.current + 1
      projectContextRequestId.current = requestId
      setProjectMembers([])
      setTestData([])
      setTestResults([])
      setAuditLogs([])
      setDetailLoading(true)
      setErrorMessage('')
      const auditRequest = auditReadable
        ? callApi(listAuditLogs as ApiFunction, teamId, { project_id: projectId })
        : Promise.resolve([])
      const [memberResult, dataResult, resultResult, auditResult] = await Promise.allSettled([
        projectMembersReadable ? callApi(listProjectMembers as ApiFunction, teamId, projectId) : Promise.resolve([]),
        testDataReadable ? callApi(listTestData as ApiFunction, teamId, projectId) : Promise.resolve([]),
        testResultReadable ? callApi(listTestResults as ApiFunction, teamId, projectId) : Promise.resolve([]),
        auditRequest,
      ])
      if (
        projectContextRequestId.current !== requestId ||
        recordContextRef.current.teamId !== teamId ||
        recordContextRef.current.projectId !== projectId
      ) {
        return
      }
      setProjectMembers(memberResult.status === 'fulfilled' ? getList(memberResult.value, ['members']) : [])
      setTestData(dataResult.status === 'fulfilled' ? getList(dataResult.value, ['test_data', 'testData']) : [])
      setTestResults(
        resultResult.status === 'fulfilled' ? getList(resultResult.value, ['test_results', 'testResults']) : [],
      )
      setAuditLogs(auditResult.status === 'fulfilled' ? getList(auditResult.value, ['audit_logs', 'auditLogs']) : [])
      const failedResult = [memberResult, dataResult, resultResult, auditResult].find(
        (result) => result.status === 'rejected',
      )
      if (failedResult?.status === 'rejected') setErrorMessage(getErrorMessage(failedResult.reason))
      setDetailLoading(false)
      await loadSync(teamId, projectId)
    },
    [canReadAudit, canReadProjectMembers, canReadTestData, canReadTestResult, hasActiveTeamPermission, loadSync],
  )

  const loadLocalProjects = useCallback(async () => {
    if (typeof window.require !== 'function') return
    try {
      const { ipcRenderer } = window.require('electron')
      const response = await ipcRenderer.invoke('GetProjects', {
        Type: 'all',
        Pagination: { Page: 1, Limit: 1000, Order: 'desc', OrderBy: 'updated_at' },
      })
      const nextProjects = (Array.isArray(response?.Projects) ? response.Projects : []).filter(
        (project: ApiEntity) => getValue(project, ['Type', 'type']) !== 'file',
      )
      setLocalProjects(nextProjects)
      setSelectedLocalProjectId((current) => {
        if (nextProjects.some((project: ApiEntity) => getId(project) === current)) return current
        return getId(nextProjects[0])
      })
    } catch (error) {
      setLocalProjects([])
      setSelectedLocalProjectId('')
      setErrorMessage(getErrorMessage(error))
    }
  }, [])

  const refreshCurrentContext = useCallback(async () => {
    const teamId = toPositiveTeamId(selectedTeamIdRef.current)
    const currentContext = recordContextRef.current
    await loadTeams(teamId)
    if (teamId !== null && selectedTeamIdRef.current === String(teamId)) {
      await loadTeamContext(String(teamId))
      if (
        currentContext.teamId === String(teamId) &&
        currentContext.projectId &&
        recordContextRef.current.teamId === currentContext.teamId &&
        recordContextRef.current.projectId === currentContext.projectId
      ) {
        await loadProjectContext(currentContext.teamId, currentContext.projectId)
      }
    }
    await loadLocalProjects()
  }, [loadLocalProjects, loadProjectContext, loadTeamContext, loadTeams])

  const handleTeamChange = useCallback(
    (value: string | number) => {
      const teamId = toPositiveTeamId(value)
      commitPermissionSnapshots(new Map())
      selectedTeamIdRef.current = teamId === null ? '' : `${teamId}`
      setSelectedTeamId(selectedTeamIdRef.current)
      if (teamId === null) {
        permissionRequestSequence.current += 1
        currentPermissionRequest.current = undefined
        return
      }
      void loadTeams(teamId)
    },
    [commitPermissionSnapshots, loadTeams],
  )

  const invalidateAuthenticationSession = useCallback(() => {
    permissionRequestSequence.current += 1
    currentPermissionRequest.current = undefined
    teamContextRequestId.current += 1
    projectContextRequestId.current += 1
    syncRequestId.current += 1
    snapshotRequestId.current += 1
    recordDetailRequestId.current += 1
    recordSaveRequestId.current += 1
    activeRecordSave.current = undefined
    commitPermissionSnapshots(new Map(), authenticationSessionKeyRef.current)
    setTeams([])
    selectedTeamIdRef.current = ''
    setSelectedTeamId('')
    setTeamMembers([])
    setProjects([])
    setSelectedProjectId('')
    setProjectMembers([])
    setTestData([])
    setTestResults([])
    setAuditLogs([])
    setSyncInfo(undefined)
    setLoading(false)
    setDetailLoading(false)
    setSyncLoading(false)
    setSnapshotLoading(false)
    setRecordSavingKind(undefined)
    setRecordEditorKind(undefined)
    setRecordDraft(createSharedRecordDraft('test-data'))
    setRecordEditorError('')
    setTestDataName('')
    setTestResultName('')
    sharedHTTPIndexRequestId.current += 1
    sharedHTTPIndexBuildRef.current = {
      requestId: sharedHTTPIndexRequestId.current,
      completion: Promise.resolve(),
    }
    sharedHTTPRecordsRef.current = []
    setSharedHTTPRecords([])
    setRecordDetailKind(undefined)
    setRecordDetail(undefined)
    setSharedHTTPDetailContent('')
    setSharedRiskDetailContent('')
    setRecordDetailLoading(false)
    setRecordDetailError('')
  }, [commitPermissionSnapshots])

  useEffect(() => {
    if (appliedAuthenticationSessionKeyRef.current === authenticationSessionKey) return
    appliedAuthenticationSessionKeyRef.current = authenticationSessionKey
    invalidateAuthenticationSession()
  }, [authenticationSessionKey, invalidateAuthenticationSession])

  useEffect(() => {
    const unsubscribePermissionInvalidation = subscribeTeamPermissionInvalidation((teamId) => {
      invalidatePermissionSnapshot(teamId)
      if (toPositiveTeamId(selectedTeamIdRef.current) === teamId) {
        recordDetailRequestId.current += 1
        setRecordDetailKind(undefined)
        setRecordDetail(undefined)
        setSharedHTTPDetailContent('')
        setSharedRiskDetailContent('')
        setRecordDetailLoading(false)
        setRecordDetailError('')
        void loadTeams(teamId)
      }
    })
    const unsubscribeAuthenticationInvalidation = subscribeTeamAuthenticationInvalidation(
      invalidateAuthenticationSession,
    )
    return () => {
      unsubscribePermissionInvalidation()
      unsubscribeAuthenticationInvalidation()
    }
  }, [invalidateAuthenticationSession, invalidatePermissionSnapshot, loadTeams])

  useEffect(() => {
    void loadTeams(toPositiveTeamId(selectedTeamIdRef.current))
    void loadLocalProjects()
  }, [loadLocalProjects, loadTeams])

  useEffect(() => {
    setSelectedProjectId('')
    setSyncInfo(undefined)
    setSyncConflict(false)
    loadTeamContext(selectedTeamId)
  }, [loadTeamContext, selectedTeamId])

  useEffect(() => {
    syncRequestId.current += 1
    snapshotRequestId.current += 1
    setSyncLoading(false)
    setSnapshotLoading(false)
    setSnapshotReady(false)
    setSyncInfo(undefined)
    setSyncConflict(false)
    setSnapshotText('{}')
    setBundleMessage('')
    setLocalProjectConflict(undefined)
    setConflictCopyName('')
    setRecordEditorKind(undefined)
    setRecordDetailKind(undefined)
    setRecordDetail(undefined)
    setSharedHTTPDetailContent('')
    setSharedRiskDetailContent('')
    setRecordDetailLoading(false)
    recordDetailRequestId.current += 1
  }, [selectedProjectId, selectedTeamId])

  useEffect(() => {
    loadProjectContext(selectedTeamId, selectedProjectId)
  }, [loadProjectContext, selectedProjectId, selectedTeamId])

  useEffect(() => {
    const requestId = sharedHTTPIndexRequestId.current + 1
    sharedHTTPIndexRequestId.current = requestId
    sharedHTTPRecordsRef.current = []
    setSharedHTTPRecords([])
    let resolveCompletion = () => {}
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve
    })
    sharedHTTPIndexBuildRef.current = { requestId, completion }

    const buildIndex = async () => {
      try {
        if (!canReadTestData || !hasActiveTeamPermission('test_data.read')) return
        const parsedRecords = await Promise.all(
          testData.map(async (record): Promise<ParsedSharedHTTPRecord | undefined> => {
            const recordId = getId(record)
            try {
              let recordWithContent = record
              if (record.content === undefined || record.content === '') {
                getRemoteSharedHTTPFlowKey(record, recordId, selectedTeamId, selectedProjectId)
                const response = await callApi(getTestData as ApiFunction, selectedTeamId, selectedProjectId, recordId)
                recordWithContent = (response?.data || response) as ApiEntity
              }
              const parsed = await parseRemoteSharedHTTPRecord(
                recordWithContent,
                recordId,
                selectedTeamId,
                selectedProjectId,
              )
              return { record, parsed }
            } catch {
              return undefined
            }
          }),
        )
        if (
          sharedHTTPIndexRequestId.current !== requestId ||
          recordContextRef.current.teamId !== selectedTeamId ||
          recordContextRef.current.projectId !== selectedProjectId ||
          !hasActiveTeamPermission('test_data.read')
        ) {
          return
        }
        const next = parsedRecords.filter((record): record is ParsedSharedHTTPRecord => Boolean(record))
        sharedHTTPRecordsRef.current = next
        setSharedHTTPRecords(next)
      } finally {
        resolveCompletion()
      }
    }

    void buildIndex()
    return () => {
      if (sharedHTTPIndexRequestId.current === requestId) sharedHTTPIndexRequestId.current += 1
      resolveCompletion()
    }
  }, [canReadTestData, hasActiveTeamPermission, selectedProjectId, selectedTeamId, testData])

  useEffect(() => {
    const refreshSharedRecords = (event: CustomEvent<TeamSharedRecordsRefreshDetail>) => {
      const detail: unknown = event.detail
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return
      const teamId = Reflect.get(detail, 'teamId')
      const projectId = Reflect.get(detail, 'projectId')
      if (
        !Number.isSafeInteger(teamId) ||
        teamId <= 0 ||
        !Number.isSafeInteger(projectId) ||
        projectId <= 0 ||
        recordContextRef.current.teamId !== String(teamId) ||
        recordContextRef.current.projectId !== String(projectId)
      ) {
        return
      }
      void loadProjectContext(String(teamId), String(projectId))
    }
    window.addEventListener(TEAM_SHARED_RECORDS_REFRESH_EVENT, refreshSharedRecords)
    return () => {
      window.removeEventListener(TEAM_SHARED_RECORDS_REFRESH_EVENT, refreshSharedRecords)
    }
  }, [loadProjectContext])

  useEffect(() => {
    const name = getValue(selectedProject, ['name', 'project_name', 'projectName'], '')
    setLocalCopyName(name ? `${name}-本地副本` : '')
  }, [selectedProject])

  const updateBundleProgress = useCallback((progress: ProjectBundleProgress) => {
    const labels = { export: '导出本地项目', upload: '上传项目归档', download: '下载项目归档', import: '导入本地副本' }
    setBundleMessage(`${labels[progress.stage]}：${progress.completed}/${progress.total}`)
  }, [])

  const publishLocalProject = useCallback(async () => {
    if (
      !selectedTeamId ||
      !selectedProjectId ||
      !selectedLocalProject ||
      !canPublishProject ||
      !hasActiveTeamPermission('project.manage') ||
      !hasActiveTeamPermission('test_data.write')
    ) {
      return
    }
    setActionLoading('publish-project-bundle')
    setErrorMessage('')
    setBundleMessage('')
    try {
      const result = await publishTeamProjectBundle(
        {
          teamId: selectedTeamId,
          projectId: selectedProjectId,
          localProject: {
            id: getValue(selectedLocalProject, ['Id', 'id']),
            name: getValue(selectedLocalProject, ['ProjectName', 'name']),
          },
          onProgress: updateBundleProgress,
        },
        createDefaultTeamProjectBundleDependencies(),
      )
      setBundleMessage(`项目归档已发布，共 ${result.manifest.chunk_count} 个分块`)
      await loadTeamContext(selectedTeamId)
      await loadProjectContext(selectedTeamId, selectedProjectId)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setActionLoading('')
    }
  }, [
    canPublishProject,
    hasActiveTeamPermission,
    loadProjectContext,
    loadTeamContext,
    selectedLocalProject,
    selectedProjectId,
    selectedTeamId,
    updateBundleProgress,
  ])

  const executeProjectDownload = useCallback(
    async (name: string, overwriteProject?: ApiEntity) => {
      if (
        !selectedTeamId ||
        !selectedProjectId ||
        !name ||
        !canReadProject ||
        !hasActiveTeamPermission('project.read')
      ) {
        return false
      }
      setActionLoading('download-project-bundle')
      setErrorMessage('')
      setBundleMessage('')
      try {
        const remoteVersion = getValue(getSyncedProject(syncInfo), ['version', 'Version'], undefined)
        const result = await restoreTeamProjectBundle(
          {
            teamId: selectedTeamId,
            projectId: selectedProjectId,
            localProjectName: name,
            overwriteLocalProject: overwriteProject
              ? {
                  id: getValue(overwriteProject, ['Id', 'id']),
                  name: getLocalProjectName(overwriteProject),
                  type: getValue(overwriteProject, ['Type', 'type']),
                }
              : undefined,
            onlineProjectVersion:
              remoteVersion !== undefined && Number.isSafeInteger(Number(remoteVersion))
                ? Number(remoteVersion)
                : undefined,
            onProgress: updateBundleProgress,
          },
          createDefaultTeamProjectBundleDependencies(),
        )
        setBundleMessage(
          result.localProject.backupPath
            ? `本地项目已覆盖，原项目备份保留在：${result.localProject.backupPath}`
            : `本地副本已创建：${result.localProject.name}`,
        )
        await loadLocalProjects()
        return true
      } catch (error) {
        setErrorMessage(getErrorMessage(error))
        return false
      } finally {
        setActionLoading('')
      }
    },
    [
      canReadProject,
      hasActiveTeamPermission,
      loadLocalProjects,
      selectedProjectId,
      selectedTeamId,
      syncInfo,
      updateBundleProgress,
    ],
  )

  const downloadLocalProject = useCallback(async () => {
    const name = localCopyName.trim()
    if (!name) return
    const sameNameProject = localProjects.find((project) => getLocalProjectName(project) === name)
    if (sameNameProject) {
      setLocalProjectConflict(sameNameProject)
      setConflictCopyName(createAvailableLocalProjectCopyName(name, localProjects))
      return
    }
    await executeProjectDownload(name)
  }, [executeProjectDownload, localCopyName, localProjects])

  const downloadConflictAsCopy = useCallback(async () => {
    const name = conflictCopyName.trim()
    if (!name || localProjects.some((project) => getLocalProjectName(project) === name)) return
    if (await executeProjectDownload(name)) {
      setLocalProjectConflict(undefined)
      setConflictCopyName('')
    }
  }, [conflictCopyName, executeProjectDownload, localProjects])

  const overwriteConflictProject = useCallback(async () => {
    if (!localProjectConflict) return
    if (await executeProjectDownload(getLocalProjectName(localProjectConflict), localProjectConflict)) {
      setLocalProjectConflict(undefined)
      setConflictCopyName('')
    }
  }, [executeProjectDownload, localProjectConflict])

  const createProject = useCallback(async () => {
    const name = projectName.trim()
    if (!selectedTeamId || !canManageProject || !hasActiveTeamPermission('project.manage') || !name) return
    setActionLoading('create-project')
    setErrorMessage('')
    try {
      await callApi(createTeamProject as ApiFunction, selectedTeamId, { name })
      setProjectName('')
      await loadTeamContext(selectedTeamId)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setActionLoading('')
    }
  }, [canManageProject, hasActiveTeamPermission, loadTeamContext, projectName, selectedTeamId])

  const updateSnapshot = useCallback(async () => {
    const { teamId, projectId } = recordContext
    if (!teamId || !projectId || !canManageProject || !hasActiveTeamPermission('project.manage') || !snapshotReady) {
      return
    }
    let snapshot: ApiEntity
    try {
      snapshot = JSON.parse(snapshotText)
      if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object') throw new Error('invalid')
    } catch {
      setErrorMessage('快照必须是 JSON 对象')
      return
    }
    const requestId = snapshotRequestId.current + 1
    snapshotRequestId.current = requestId
    const isCurrentRequest = () =>
      snapshotRequestId.current === requestId && isSameRecordContext(recordContextRef.current, recordContext)
    setSnapshotLoading(true)
    setErrorMessage('')
    setSyncConflict(false)
    try {
      await callApi(updateProjectSnapshot as ApiFunction, teamId, projectId, {
        snapshot,
        version: Number(getValue(getSyncedProject(syncInfo) || selectedProject, ['version', 'Version'], 0)),
      })
      if (!isCurrentRequest()) return
      await loadSync(teamId, projectId)
    } catch (error) {
      if (!isCurrentRequest()) return
      if (getErrorStatus(error) === 409 || getErrorMessage(error).includes('version_conflict')) {
        setSyncConflict(true)
      } else {
        setErrorMessage(getErrorMessage(error))
      }
    } finally {
      if (isCurrentRequest()) setSnapshotLoading(false)
    }
  }, [
    canManageProject,
    hasActiveTeamPermission,
    loadSync,
    recordContext,
    selectedProject,
    snapshotReady,
    snapshotText,
    syncInfo,
  ])

  const openRecordEditor = useCallback((kind: SharedRecordKind) => {
    setRecordEditorKind(kind)
    setRecordDraft(createSharedRecordDraft(kind))
    setRecordEditorError('')
  }, [])

  const closeRecordEditor = useCallback(() => {
    setRecordEditorKind(undefined)
    setRecordEditorError('')
  }, [])

  const addTestData = useCallback(async () => {
    const name = testDataName.trim()
    const type = recordDraft.type.trim()
    const { teamId, projectId } = recordContext
    if (
      !teamId ||
      !projectId ||
      !canWriteTestData ||
      !hasActiveTeamPermission('test_data.write') ||
      !name ||
      !type ||
      !recordDraft.content.trim()
    ) {
      return
    }
    let metadata: Record<string, unknown>
    try {
      metadata = parseMetadata(recordDraft.metadata)
    } catch {
      setRecordEditorError('测试数据元数据必须是 JSON 对象')
      return
    }
    if (activeRecordSave.current) return
    const requestId = recordSaveRequestId.current + 1
    recordSaveRequestId.current = requestId
    activeRecordSave.current = { requestId, kind: 'test-data', context: recordContext }
    setRecordSavingKind('test-data')
    setRecordEditorError('')
    try {
      const createdResponse = await callApi(createTestData as ApiFunction, teamId, projectId, {
        name,
        type,
        deduplication_key: `manual-data:${Date.now()}`,
        status: recordDraft.status,
        metadata,
        content: recordDraft.content,
      })
      if (recordSaveRequestId.current !== requestId || !isSameRecordContext(recordContextRef.current, recordContext)) {
        return
      }
      const created = (createdResponse?.data || createdResponse) as ApiEntity
      if (getId(created)) {
        setTestData((current) => [created, ...current.filter((item) => getId(item) !== getId(created))])
      }
      setTestDataName('')
      setRecordEditorKind(undefined)
      if (recordSaveRequestId.current === requestId) {
        activeRecordSave.current = undefined
        setRecordSavingKind(undefined)
      }
      try {
        if (!hasActiveTeamPermission('test_data.read')) return
        const response = await callApi(listTestData as ApiFunction, teamId, projectId)
        if (
          recordSaveRequestId.current !== requestId ||
          !isSameRecordContext(recordContextRef.current, recordContext)
        ) {
          return
        }
        setTestData(getList(response, ['test_data', 'testData']))
        setErrorMessage('')
      } catch (error) {
        if (recordSaveRequestId.current === requestId && isSameRecordContext(recordContextRef.current, recordContext)) {
          setErrorMessage(getErrorMessage(error))
        }
      }
    } catch (error) {
      if (recordSaveRequestId.current === requestId && isSameRecordContext(recordContextRef.current, recordContext)) {
        setRecordEditorError(getErrorMessage(error))
      }
    } finally {
      if (recordSaveRequestId.current === requestId) {
        activeRecordSave.current = undefined
        setRecordSavingKind(undefined)
      }
    }
  }, [canWriteTestData, hasActiveTeamPermission, recordContext, recordDraft, testDataName])

  const addTestResult = useCallback(async () => {
    const name = testResultName.trim()
    const type = recordDraft.type.trim()
    const { teamId, projectId } = recordContext
    if (
      !teamId ||
      !projectId ||
      !canWriteTestResult ||
      !hasActiveTeamPermission('test_result.write') ||
      !name ||
      !type ||
      !recordDraft.content.trim()
    ) {
      return
    }
    let metadata: Record<string, unknown>
    try {
      metadata = parseMetadata(recordDraft.metadata)
    } catch {
      setRecordEditorError('测试结果元数据必须是 JSON 对象')
      return
    }
    const testDataId = Number(recordDraft.testDataId)
    if (activeRecordSave.current) return
    const requestId = recordSaveRequestId.current + 1
    recordSaveRequestId.current = requestId
    activeRecordSave.current = { requestId, kind: 'test-result', context: recordContext }
    setRecordSavingKind('test-result')
    setRecordEditorError('')
    try {
      const createdResponse = await callApi(createTestResult as ApiFunction, teamId, projectId, {
        name,
        type,
        deduplication_key: `manual-result:${Date.now()}`,
        status: recordDraft.status,
        severity: recordDraft.severity,
        metadata,
        content: recordDraft.content,
        ...(Number.isSafeInteger(testDataId) && testDataId > 0 ? { test_data_id: testDataId } : {}),
      })
      if (recordSaveRequestId.current !== requestId || !isSameRecordContext(recordContextRef.current, recordContext)) {
        return
      }
      const created = (createdResponse?.data || createdResponse) as ApiEntity
      if (getId(created)) {
        setTestResults((current) => [created, ...current.filter((item) => getId(item) !== getId(created))])
      }
      setTestResultName('')
      setRecordEditorKind(undefined)
      if (recordSaveRequestId.current === requestId) {
        activeRecordSave.current = undefined
        setRecordSavingKind(undefined)
      }
      try {
        if (!hasActiveTeamPermission('test_result.read')) return
        const response = await callApi(listTestResults as ApiFunction, teamId, projectId)
        if (
          recordSaveRequestId.current !== requestId ||
          !isSameRecordContext(recordContextRef.current, recordContext)
        ) {
          return
        }
        setTestResults(getList(response, ['test_results', 'testResults']))
        setErrorMessage('')
      } catch (error) {
        if (recordSaveRequestId.current === requestId && isSameRecordContext(recordContextRef.current, recordContext)) {
          setErrorMessage(getErrorMessage(error))
        }
      }
    } catch (error) {
      if (recordSaveRequestId.current === requestId && isSameRecordContext(recordContextRef.current, recordContext)) {
        setRecordEditorError(getErrorMessage(error))
      }
    } finally {
      if (recordSaveRequestId.current === requestId) {
        activeRecordSave.current = undefined
        setRecordSavingKind(undefined)
      }
    }
  }, [canWriteTestResult, hasActiveTeamPermission, recordContext, recordDraft, testResultName])

  const waitForCurrentSharedHTTPIndex = useCallback(async (isCurrentRequest: () => boolean): Promise<boolean> => {
    while (isCurrentRequest()) {
      const build = sharedHTTPIndexBuildRef.current
      await build.completion
      if (!isCurrentRequest()) return false
      if (
        sharedHTTPIndexBuildRef.current.requestId === build.requestId &&
        sharedHTTPIndexRequestId.current === build.requestId
      ) {
        return true
      }
      if (sharedHTTPIndexBuildRef.current === build) return false
    }
    return false
  }, [])

  const openRecordDetail = useCallback(
    async (kind: SharedRecordKind, item: ApiEntity) => {
      const permissionCode = kind === 'test-data' ? 'test_data.read' : 'test_result.read'
      const recordId = getId(item)
      if (!selectedTeamId || !selectedProjectId || !recordId || !hasActiveTeamPermission(permissionCode)) {
        return
      }
      const context = { teamId: selectedTeamId, projectId: selectedProjectId }
      const sharedHTTP = kind === 'test-data' && item.data_type === 'http_flow'
      const sharedRisk = kind === 'test-result' && item.result_type === 'risk'
      const requestId = recordDetailRequestId.current + 1
      recordDetailRequestId.current = requestId
      const isCurrentRequest = () =>
        recordDetailRequestId.current === requestId &&
        isSameRecordContext(recordContextRef.current, context) &&
        hasActiveTeamPermission(permissionCode)
      setRecordDetailKind(kind)
      setRecordDetail(sharedHTTP || sharedRisk ? { name: item.name } : item)
      setSharedHTTPDetailContent('')
      setSharedRiskDetailContent('')
      setRecordDetailError('')
      setRecordDetailLoading(true)
      try {
        const response = await callApi(
          (kind === 'test-data' ? getTestData : getTestResult) as ApiFunction,
          context.teamId,
          context.projectId,
          recordId,
        )
        if (!isCurrentRequest()) return
        const freshRecord = (response?.data || response) as ApiEntity

        if (sharedHTTP) {
          await parseRemoteSharedHTTPRecord(freshRecord, recordId, context.teamId, context.projectId)
          if (!isCurrentRequest()) return
          setRecordDetail(freshRecord)
          setSharedHTTPDetailContent(freshRecord.content)
          return
        }

        if (sharedRisk) {
          if (
            !hasExactRemoteRecordIdentity(freshRecord, recordId, context.teamId, context.projectId) ||
            freshRecord.result_type !== 'risk' ||
            freshRecord.status !== 'active' ||
            typeof freshRecord.content !== 'string' ||
            !freshRecord.content
          ) {
            throw new Error('共享 Risk 记录身份无效')
          }
          const deduplication = RISK_DEDUPLICATION_PATTERN.exec(freshRecord.deduplication_key)
          if (!deduplication) throw new Error('共享 Risk 去重标识无效')
          const parsedRisk = await parseSharedRisk(freshRecord.content)
          if (!isCurrentRequest()) return
          if (deduplication[1] !== parsedRisk.riskKey) throw new Error('共享 Risk 去重标识不匹配')
          if (!(await waitForCurrentSharedHTTPIndex(isCurrentRequest))) return

          const linkedRecords = sharedHTTPRecordsRef.current.filter(
            (entry) => entry.parsed.flowKey === parsedRisk.flowKey,
          )
          if (linkedRecords.length === 0) throw new Error('关联流量尚未同步')
          if (linkedRecords.length > 1) throw new Error('关联流量记录不唯一')
          const sharedHTTPIndexSequence = sharedHTTPIndexRequestId.current
          const linkedRecordId = getId(linkedRecords[0].record)
          const linkedResponse = await callApi(
            getTestData as ApiFunction,
            context.teamId,
            context.projectId,
            linkedRecordId,
          )
          if (!isCurrentRequest()) return
          if (sharedHTTPIndexRequestId.current !== sharedHTTPIndexSequence) {
            throw new Error('关联流量索引已更新，请重试')
          }
          const freshHTTPRecord = (linkedResponse?.data || linkedResponse) as ApiEntity
          const parsedHTTP = await parseRemoteSharedHTTPRecord(
            freshHTTPRecord,
            linkedRecordId,
            context.teamId,
            context.projectId,
          )
          if (!isCurrentRequest()) return
          if (sharedHTTPIndexRequestId.current !== sharedHTTPIndexSequence) {
            throw new Error('关联流量索引已更新，请重试')
          }
          if (parsedHTTP.flowKey !== parsedRisk.flowKey) throw new Error('Risk 关联的 HTTP Flow 不匹配')
          setRecordDetail(freshRecord)
          setSharedHTTPDetailContent(freshHTTPRecord.content)
          setSharedRiskDetailContent(freshRecord.content)
          return
        }

        setRecordDetail(freshRecord)
      } catch (error) {
        if (!isCurrentRequest()) return
        setRecordDetailError(getErrorMessage(error))
      } finally {
        if (isCurrentRequest()) setRecordDetailLoading(false)
      }
    },
    [hasActiveTeamPermission, selectedProjectId, selectedTeamId, waitForCurrentSharedHTTPIndex],
  )

  const closeRecordDetail = useCallback(() => {
    recordDetailRequestId.current += 1
    setRecordDetailKind(undefined)
    setRecordDetail(undefined)
    setSharedHTTPDetailContent('')
    setSharedRiskDetailContent('')
    setRecordDetailLoading(false)
    setRecordDetailError('')
  }, [])

  const recordEditorName = recordEditorKind === 'test-data' ? testDataName : testResultName
  const recordEditorSaving = Boolean(recordEditorKind) && recordSavingKind === recordEditorKind
  const canWriteEditedRecord =
    (recordEditorKind === 'test-data' && canWriteTestData) || (recordEditorKind === 'test-result' && canWriteTestResult)
  const canSaveRecord =
    canWriteEditedRecord &&
    Boolean(selectedTeamId) &&
    Boolean(selectedProjectId) &&
    Boolean(recordEditorName.trim()) &&
    Boolean(recordDraft.type.trim()) &&
    Boolean(recordDraft.content.trim())
  const recordDetailContent = `${getValue(recordDetail, ['content'], '')}`
  const recordDetailMetadata = formatMetadata(getValue(recordDetail, ['metadata'], {}))

  return (
    <div className={styles['page']} data-testid="team-collaboration-page">
      <header className={styles['header']}>
        <div>
          <h1>团队协作</h1>
          <p>集中管理团队项目、成员权限、共享测试资料、同步状态与审计记录。</p>
        </div>
        <div className={styles['team-selector']}>
          <span>当前团队</span>
          <YakitSelect
            data-testid="team-selector"
            style={{ flex: 1 }}
            value={selectedTeamId || undefined}
            placeholder="请选择团队"
            onChange={handleTeamChange}
            disabled={teams.length === 0}
          >
            {teams.map((team) => (
              <YakitSelect.Option key={getId(team)} value={getId(team)}>
                {getValue(team, ['name', 'team_name', 'teamName'], '未命名团队')}
              </YakitSelect.Option>
            ))}
          </YakitSelect>
          <YakitTag color={canWrite ? 'green' : 'blue'}>{canWrite ? '可编辑' : '只读'}</YakitTag>
          <YakitButton type="outline1" onClick={() => void refreshCurrentContext()} loading={loading}>
            刷新
          </YakitButton>
        </div>
      </header>

      {errorMessage && <div className={styles['error-banner']}>{errorMessage}</div>}

      <YakitSpin spinning={loading} wrapperClassName={styles['page-loading']}>
        {teams.length === 0 && !loading ? (
          <YakitEmpty title="暂无团队" description="登录团队服务后可查看协作项目" />
        ) : (
          <div className={styles['workspace']}>
            <aside className={styles['sidebar']}>
              <section className={styles['panel']}>
                <div className={styles['panel-title']}>
                  <h2>成员与角色</h2>
                  <span>{teamMembers.length}</span>
                </div>
                <div className={styles['compact-list']}>
                  {teamMembers.length === 0 ? (
                    <YakitEmpty title="暂无成员" />
                  ) : (
                    teamMembers.map((member) => (
                      <div className={styles['member-row']} key={getId(member)}>
                        <span>{userText(member)}</span>
                        <YakitTag>{roleText(member)}</YakitTag>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className={styles['panel']}>
                <div className={styles['panel-title']}>
                  <h2>团队项目</h2>
                  <span>{projects.length}</span>
                </div>
                <div className={styles['create-row']}>
                  <YakitInput
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="输入项目名称"
                    disabled={!canManageProject}
                  />
                  <YakitButton
                    onClick={createProject}
                    disabled={!canManageProject || !projectName.trim()}
                    loading={actionLoading === 'create-project'}
                  >
                    创建团队项目
                  </YakitButton>
                </div>
                <div className={styles['project-list']}>
                  {projects.length === 0 ? (
                    <YakitEmpty title="暂无团队项目" />
                  ) : (
                    projects.map((project) => {
                      const projectId = getId(project)
                      const selected = projectId === selectedProjectId
                      return (
                        <div
                          className={selected ? styles['project-row-active'] : styles['project-row']}
                          key={projectId}
                        >
                          <button type="button" onClick={() => setSelectedProjectId(projectId)}>
                            <strong>{getValue(project, ['name', 'project_name', 'projectName'], '未命名项目')}</strong>
                            <span>版本 {getValue(project, ['version', 'Version'], 0)}</span>
                          </button>
                          <YakitButton
                            type="text"
                            size="small"
                            onClick={() => setSelectedProjectId(projectId)}
                            disabled={selected}
                          >
                            {selected ? '已打开' : '打开'}
                          </YakitButton>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>
            </aside>

            <main className={styles['content']}>
              {!selectedProject ? (
                <YakitEmpty title="请选择团队项目" description="选择项目后查看同步、权限和协作资料" />
              ) : (
                <YakitSpin spinning={detailLoading} wrapperClassName={styles['detail-loading']}>
                  <div className={styles['project-heading']}>
                    <div>
                      <h2>
                        项目详情 · {getValue(selectedProject, ['name', 'project_name', 'projectName'], '未命名项目')}
                      </h2>
                      <span>
                        项目版本 {getValue(getSyncedProject(syncInfo) || selectedProject, ['version', 'Version'], 0)}
                      </span>
                    </div>
                    <YakitTag color={canWrite ? 'green' : 'blue'}>{canWrite ? '写入权限' : '只读权限'}</YakitTag>
                  </div>

                  <section className={`${styles['panel']} ${styles['bundle-panel']}`}>
                    <div className={styles['panel-title']}>
                      <h2>本地项目归档</h2>
                      <span>{bundleMessage || '在线项目保存权威共享版本，本地项目保存工作副本'}</span>
                    </div>
                    <div className={styles['bundle-grid']}>
                      <div className={styles['create-row']}>
                        <YakitSelect
                          value={selectedLocalProjectId || undefined}
                          placeholder="选择本地项目"
                          onChange={(value) => setSelectedLocalProjectId(`${value}`)}
                          disabled={!canPublishProject || localProjects.length === 0}
                        >
                          {localProjects.map((project) => (
                            <YakitSelect.Option key={getId(project)} value={getId(project)}>
                              {getValue(project, ['ProjectName', 'name'], '未命名本地项目')}
                            </YakitSelect.Option>
                          ))}
                        </YakitSelect>
                        <YakitButton
                          onClick={publishLocalProject}
                          disabled={!canPublishProject || !selectedLocalProject}
                          loading={actionLoading === 'publish-project-bundle'}
                        >
                          发布本地项目
                        </YakitButton>
                      </div>
                      <div className={styles['create-row']}>
                        <YakitInput
                          value={localCopyName}
                          placeholder="本地副本名称"
                          onChange={(event) => setLocalCopyName(event.target.value)}
                          disabled={!canReadProject}
                        />
                        <YakitButton
                          type="outline1"
                          onClick={downloadLocalProject}
                          disabled={!canReadProject || !localCopyName.trim()}
                          loading={actionLoading === 'download-project-bundle'}
                        >
                          下载为本地副本
                        </YakitButton>
                      </div>
                    </div>
                  </section>

                  <section className={`${styles['panel']} ${styles['sync-panel']}`}>
                    <div className={styles['panel-title']}>
                      <h2>快照与同步</h2>
                      <span>
                        最近同步：
                        {formatTime(
                          getValue(syncInfo, ['server_time', 'last_sync_at', 'lastSyncAt', 'synced_at', 'updated_at']),
                        )}
                      </span>
                    </div>
                    {syncConflict && (
                      <div className={styles['conflict-banner']} role="alert">
                        <div>
                          <strong>检测到 409 版本冲突</strong>
                          <span>远端项目版本已变化，请重新同步后再提交快照。</span>
                        </div>
                        <YakitButton
                          type="outline1"
                          onClick={() => loadSync(selectedTeamId, selectedProjectId)}
                          loading={syncLoading}
                          disabled={!canReadProject}
                        >
                          重试同步
                        </YakitButton>
                      </div>
                    )}
                    <YakitInput.TextArea
                      rows={5}
                      value={snapshotText}
                      onChange={(event) => setSnapshotText(event.target.value)}
                      disabled={!canManageProject || !snapshotReady}
                      aria-label="项目快照"
                    />
                    <div className={styles['actions']}>
                      <YakitButton
                        type="outline1"
                        onClick={() => loadSync(selectedTeamId, selectedProjectId)}
                        loading={syncLoading}
                        disabled={!canReadProject}
                      >
                        同步项目
                      </YakitButton>
                      <YakitButton
                        onClick={updateSnapshot}
                        disabled={!canManageProject || !snapshotReady}
                        loading={snapshotLoading}
                      >
                        更新快照
                      </YakitButton>
                    </div>
                  </section>

                  <div className={styles['detail-grid']}>
                    <EntityPanel title="项目成员权限" items={projectMembers} empty="暂无项目成员">
                      {(member) => (
                        <div className={styles['entity-row']} key={getId(member)}>
                          <span>{userText(teamMemberByUserId.get(getUserId(member)) || member)}</span>
                          <YakitTag>{getValue(member, ['access_level', 'accessLevel', 'permission'], 'read')}</YakitTag>
                        </div>
                      )}
                    </EntityPanel>

                    <EntityPanel
                      title="共享测试数据"
                      items={testData}
                      empty="暂无测试数据"
                      extra={
                        <InlineCreate
                          value={testDataName}
                          placeholder="测试数据名称"
                          buttonText="新增数据"
                          disabled={!canWriteTestData || Boolean(recordSavingKind)}
                          loading={recordSavingKind === 'test-data'}
                          onChange={setTestDataName}
                          onCreate={() => openRecordEditor('test-data')}
                        />
                      }
                    >
                      {(item) => (
                        <div
                          className={styles['result-row']}
                          key={getId(item)}
                          data-testid={
                            sharedHTTPRecordById.has(getId(item))
                              ? `team-test-data-row-${sharedHTTPRecordById.get(getId(item))?.parsed.flowKey}`
                              : undefined
                          }
                        >
                          <div>
                            <YakitButton
                              type="text"
                              size="small"
                              onClick={() => openRecordDetail('test-data', item)}
                              disabled={!canReadTestData}
                            >
                              {getValue(item, ['name', 'title'], '未命名数据')}
                            </YakitButton>
                            <small>{getRecordContentPreview(item)}</small>
                          </div>
                          <YakitTag>版本 {getValue(item, ['version', 'Version'], 1)}</YakitTag>
                        </div>
                      )}
                    </EntityPanel>

                    <EntityPanel
                      title="共享测试结果"
                      items={testResults}
                      empty="暂无测试结果"
                      extra={
                        <InlineCreate
                          value={testResultName}
                          placeholder="测试结果名称"
                          buttonText="新增结果"
                          disabled={!canWriteTestResult || Boolean(recordSavingKind)}
                          loading={recordSavingKind === 'test-result'}
                          onChange={setTestResultName}
                          onCreate={() => openRecordEditor('test-result')}
                        />
                      }
                    >
                      {(item) => (
                        <div className={styles['result-row']} key={getId(item)}>
                          <div>
                            <YakitButton
                              type="text"
                              size="small"
                              onClick={() => openRecordDetail('test-result', item)}
                              disabled={!canReadTestResult}
                            >
                              {getValue(item, ['name', 'title'], '未命名结果')}
                            </YakitButton>
                            <small>{getRecordContentPreview(item, ['summary', 'message'])}</small>
                          </div>
                          <YakitTag color={getValue(item, ['status']) === 'passed' ? 'green' : 'blue'}>
                            {getValue(item, ['status'], 'pending')}
                          </YakitTag>
                        </div>
                      )}
                    </EntityPanel>

                    <EntityPanel title="项目审计记录" items={auditLogs} empty="暂无审计记录">
                      {(log) => (
                        <div className={styles['audit-row']} key={getId(log)}>
                          <strong>{getValue(log, ['action', 'operation'], 'unknown')}</strong>
                          <span>
                            {userText({ ...log, name: getValue(log, ['operator_name', 'operatorName'], '系统') })}
                          </span>
                          <time>{formatTime(getValue(log, ['created_at', 'createdAt', 'timestamp']))}</time>
                        </div>
                      )}
                    </EntityPanel>
                  </div>
                </YakitSpin>
              )}
            </main>
          </div>
        )}
      </YakitSpin>
      <YakitModal
        visible={Boolean(recordEditorKind)}
        title={recordEditorKind === 'test-data' ? '新增共享测试数据' : '新增共享测试结果'}
        width={640}
        closable={!recordEditorSaving}
        keyboard={!recordEditorSaving}
        maskClosable={false}
        onCancel={closeRecordEditor}
        footer={[
          <YakitButton key="cancel-record" type="outline1" disabled={recordEditorSaving} onClick={closeRecordEditor}>
            取消
          </YakitButton>,
          <YakitButton
            key="save-record"
            type="primary"
            disabled={!canSaveRecord}
            loading={recordEditorSaving}
            onClick={recordEditorKind === 'test-data' ? addTestData : addTestResult}
          >
            {recordEditorKind === 'test-data' ? '保存测试数据' : '保存测试结果'}
          </YakitButton>,
        ]}
      >
        <div className={styles['project-conflict-form']}>
          <label>
            <span>名称</span>
            <YakitInput
              aria-label={recordEditorKind === 'test-data' ? '测试数据名称' : '测试结果名称'}
              value={recordEditorName}
              onChange={(event) =>
                recordEditorKind === 'test-data'
                  ? setTestDataName(event.target.value)
                  : setTestResultName(event.target.value)
              }
            />
          </label>
          <label>
            <span>类型</span>
            <YakitInput
              aria-label={recordEditorKind === 'test-data' ? '测试数据类型' : '测试结果类型'}
              value={recordDraft.type}
              onChange={(event) => setRecordDraft((current) => ({ ...current, type: event.target.value }))}
            />
          </label>
          <label>
            <span>状态</span>
            <YakitSelect
              aria-label={recordEditorKind === 'test-data' ? '测试数据状态' : '测试结果状态'}
              value={recordDraft.status}
              onChange={(value) => setRecordDraft((current) => ({ ...current, status: `${value}` }))}
            >
              {(recordEditorKind === 'test-data'
                ? [
                    ['active', '有效'],
                    ['draft', '草稿'],
                    ['archived', '已归档'],
                  ]
                : [
                    ['pending', '待处理'],
                    ['passed', '通过'],
                    ['failed', '失败'],
                    ['skipped', '已跳过'],
                  ]
              ).map(([value, label]) => (
                <YakitSelect.Option key={value} value={value}>
                  {label}
                </YakitSelect.Option>
              ))}
            </YakitSelect>
          </label>
          {recordEditorKind === 'test-result' && (
            <>
              <label>
                <span>严重级别</span>
                <YakitSelect
                  aria-label="测试结果严重级别"
                  value={recordDraft.severity}
                  onChange={(value) => setRecordDraft((current) => ({ ...current, severity: `${value}` }))}
                >
                  {['info', 'low', 'medium', 'high', 'critical'].map((severity) => (
                    <YakitSelect.Option key={severity} value={severity}>
                      {severity}
                    </YakitSelect.Option>
                  ))}
                </YakitSelect>
              </label>
              <label>
                <span>关联测试数据</span>
                <YakitSelect
                  aria-label="关联测试数据"
                  allowClear
                  value={recordDraft.testDataId || undefined}
                  placeholder="可选"
                  onChange={(value) => setRecordDraft((current) => ({ ...current, testDataId: `${value || ''}` }))}
                >
                  {testData.map((item) => (
                    <YakitSelect.Option key={getId(item)} value={getId(item)}>
                      {getValue(item, ['name', 'title'], '未命名数据')}
                    </YakitSelect.Option>
                  ))}
                </YakitSelect>
              </label>
            </>
          )}
          <label>
            <span>元数据</span>
            <YakitInput.TextArea
              aria-label={recordEditorKind === 'test-data' ? '测试数据元数据' : '测试结果元数据'}
              rows={4}
              value={recordDraft.metadata}
              onChange={(event) => setRecordDraft((current) => ({ ...current, metadata: event.target.value }))}
            />
          </label>
          <label>
            <span>正文</span>
            <YakitInput.TextArea
              aria-label={recordEditorKind === 'test-data' ? '测试数据正文' : '测试结果正文'}
              rows={10}
              value={recordDraft.content}
              onChange={(event) => setRecordDraft((current) => ({ ...current, content: event.target.value }))}
            />
          </label>
          {recordEditorError && <div role="alert">{recordEditorError}</div>}
        </div>
      </YakitModal>
      <YakitModal
        visible={Boolean(recordDetailKind)}
        title={recordDetailKind === 'test-data' ? '测试数据详情' : '测试结果详情'}
        width={680}
        onCancel={closeRecordDetail}
        footer={[
          <YakitButton key="close-record-detail" type="outline1" onClick={closeRecordDetail}>
            关闭详情
          </YakitButton>,
        ]}
      >
        <YakitSpin spinning={recordDetailLoading}>
          <div className={styles['project-conflict-form']}>
            {recordDetailError ? (
              <div role="alert">{recordDetailError}</div>
            ) : (
              <>
                <strong>{getValue(recordDetail, ['name', 'title'], '未命名记录')}</strong>
                <span>
                  类型：
                  {getValue(
                    recordDetail,
                    recordDetailKind === 'test-data' ? ['data_type', 'type'] : ['result_type', 'type'],
                    '未设置',
                  )}
                </span>
                <span>状态：{getValue(recordDetail, ['status'], '未设置')}</span>
                {recordDetailKind === 'test-result' && (
                  <span>严重级别：{getValue(recordDetail, ['severity'], '未设置')}</span>
                )}
                <label>
                  <span>元数据</span>
                  <YakitInput.TextArea
                    aria-label={recordDetailKind === 'test-data' ? '测试数据元数据详情' : '测试结果元数据详情'}
                    rows={4}
                    value={recordDetailMetadata}
                    readOnly
                  />
                </label>
                {sharedHTTPDetailContent ? (
                  <SharedHTTPFlowDetail
                    httpContent={sharedHTTPDetailContent}
                    riskContent={sharedRiskDetailContent || undefined}
                  />
                ) : recordDetailContent ? (
                  <label>
                    <span>正文</span>
                    <YakitInput.TextArea
                      aria-label={recordDetailKind === 'test-data' ? '测试数据正文详情' : '测试结果正文详情'}
                      rows={12}
                      value={recordDetailContent}
                      readOnly
                    />
                  </label>
                ) : (
                  <YakitEmpty title="暂无正文" />
                )}
              </>
            )}
          </div>
        </YakitSpin>
      </YakitModal>
      <YakitModal
        visible={Boolean(localProjectConflict)}
        title="本地存在同名项目"
        width={520}
        closable={false}
        keyboard={false}
        maskClosable={false}
        footer={[
          <YakitButton
            key="cancel"
            type="outline1"
            disabled={actionLoading === 'download-project-bundle'}
            onClick={() => {
              setLocalProjectConflict(undefined)
              setConflictCopyName('')
            }}
          >
            取消
          </YakitButton>,
          <YakitButton
            key="overwrite"
            type="outline1"
            loading={actionLoading === 'download-project-bundle'}
            disabled={!canReadProject}
            onClick={overwriteConflictProject}
          >
            覆盖本地副本
          </YakitButton>,
          <YakitButton
            key="copy"
            type="primary"
            loading={actionLoading === 'download-project-bundle'}
            disabled={
              !canReadProject ||
              !conflictCopyName.trim() ||
              localProjects.some((project) => getLocalProjectName(project) === conflictCopyName.trim())
            }
            onClick={downloadConflictAsCopy}
          >
            创建副本
          </YakitButton>,
        ]}
      >
        <div className={styles['project-conflict-form']}>
          <span>同名项目：{getLocalProjectName(localProjectConflict)}</span>
          <YakitInput
            aria-label="本地项目副本名称"
            value={conflictCopyName}
            onChange={(event) => setConflictCopyName(event.target.value)}
          />
          <small>覆盖操作会先导出原项目备份；创建副本为默认选项。</small>
        </div>
      </YakitModal>
    </div>
  )
})

interface EntityPanelProps {
  title: string
  items: ApiEntity[]
  empty: string
  extra?: React.ReactNode
  children: (item: ApiEntity) => React.ReactNode
}

const EntityPanel: React.FC<EntityPanelProps> = React.memo(({ title, items, empty, extra, children }) => (
  <section className={styles['panel']}>
    <div className={styles['panel-title']}>
      <h2>{title}</h2>
      <span>{items.length}</span>
    </div>
    {extra}
    <div className={styles['entity-list']}>
      {items.length === 0 ? <YakitEmpty title={empty} /> : items.map(children)}
    </div>
  </section>
))

interface InlineCreateProps {
  value: string
  placeholder: string
  buttonText: string
  disabled: boolean
  loading: boolean
  onChange: (value: string) => void
  onCreate: () => void
}

const InlineCreate: React.FC<InlineCreateProps> = React.memo((props) => {
  const { value, placeholder, buttonText, disabled, loading, onChange, onCreate } = props
  return (
    <div className={styles['create-row']}>
      <YakitInput
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <YakitButton onClick={onCreate} disabled={disabled || !value.trim()} loading={loading}>
        {buttonText}
      </YakitButton>
    </div>
  )
})

export default TeamCollaborationPage
