import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Select, Switch, Table, Tag, Upload } from 'antd'
import { useMemoizedFn } from 'ahooks'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import { YakitInput } from '@/components/yakitUI/YakitInput/YakitInput'
import { YakitModal } from '@/components/yakitUI/YakitModal/YakitModal'
import { useStore } from '@/store'
import { success, yakitFailed } from '@/utils/notification'
import * as teamCollaboration from '@/services/teamCollaboration'
import { apiFetchSaveYakScriptGroupLocal, apiQueryYakScriptBase } from '@/pages/plugins/utils'
import { getRemoteValue, setRemoteValue } from '@/utils/kv'
import { getRemoteHttpSettingGV } from '@/utils/envfile'
import { yakitEngine } from '@/services/electronBridge'
import { compareEngineVersions } from '@/components/layout/engineUpdate'
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
} from '@/pages/teamCollaboration/teamPermissionContext'
import {
  buildTeamPluginQuery,
  summarizeTeamPluginImportResults,
  type TeamPluginImportResult,
  type TeamPluginQueryState,
  type TeamPluginVisibility,
} from './teamPluginData'
import {
  installTeamPluginDownload,
  type LocalPluginRecord,
  type TeamPluginDownloadContent,
  type TeamPluginInstallRecord,
  type TeamPluginLocalConflictResolution,
  type TeamPluginLocalMapping,
} from './teamPluginInstall'
import {
  buildTeamPluginUploadEntries,
  type LocalPluginUploadSource,
  type TeamPluginUploadOptions,
} from './teamPluginUpload'
import styles from './HubListTeam.module.scss'

const { ipcRenderer } = window.require('electron')

interface TeamPluginRecord {
  id: number
  script_name: string
  type?: string
  content?: string
  description?: string
  category_id?: number
  category_name?: string
  group_ids?: number[]
  group_names?: string[]
  visibility: TeamPluginVisibility
  version: number
  revision: number
  uuid?: string
  file_hash?: string
  tags?: string[]
  enabled?: boolean
  updated_at?: string
}

interface ManagedFilterRecord {
  id: number
  name: string
  description: string
  sort_order: number
  status: string
}

interface TeamPluginDraft {
  scriptName: string
  type: string
  content: string
  description: string
  tags: string
  categoryId?: number
  groupIds: number[]
  visibility: TeamPluginVisibility
  enabled: boolean
  changeNote: string
}

interface RefreshErrorState {
  plugins?: string
  filters?: string
}

type ManagedFilterKind = 'category' | 'group'

const getManagedFilterPermission = (kind: ManagedFilterKind) =>
  kind === 'category' ? 'plugin.manage' : 'plugin_group.manage'

interface HubListTeamProps {
  onInstall?: (content: string) => void
}

interface PluginVersionPicker {
  teamId: number
  plugin: TeamPluginRecord
  versions: teamCollaboration.TeamPluginVersion[]
  selectedVersion: number
}

const service = teamCollaboration
const sha256Pattern = /^[0-9a-f]{64}$/
const buildVersionDownloadURL = (teamId: number, pluginId: number, version: number) =>
  `/api/v2/teams/${teamId}/plugins/${pluginId}/versions/${version}/download`

const assertManifestEngineCompatibility = async (manifest: teamCollaboration.OfflinePluginManifestItem) => {
  if (!manifest.engine_min_version && !manifest.engine_max_version) return
  const currentVersion = await yakitEngine.getCurrentYak()
  if (
    !currentVersion ||
    (manifest.engine_min_version && compareEngineVersions(currentVersion, manifest.engine_min_version) < 0) ||
    (manifest.engine_max_version && compareEngineVersions(currentVersion, manifest.engine_max_version) > 0)
  ) {
    throw new Error('当前引擎版本不满足离线插件兼容范围')
  }
}

const unwrapData = <T,>(response: any): T => (response?.data?.data ?? response?.data ?? response) as T

const unwrapItems = <T,>(response: any, keys: string[] = []): T[] => {
  const data = unwrapData<any>(response)
  if (Array.isArray(data)) return data
  for (const key of [...keys, 'items', 'list', 'data']) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

const getTotal = (response: any, fallback: number) => {
  const data = unwrapData<any>(response)
  const candidates = [
    response?.paging?.total,
    response?.pagination?.total,
    response?.pagemeta?.total,
    response?.total,
    response?.data?.paging?.total,
    response?.data?.pagination?.total,
    response?.data?.pagemeta?.total,
    response?.data?.total,
    data?.paging?.total,
    data?.pagination?.total,
    data?.pagemeta?.total,
    data?.total,
  ]
  const total = candidates.map(Number).find((value) => Number.isFinite(value) && value >= 0)
  return total ?? fallback
}

const normalizeTeamPlugin = (item: any): TeamPluginRecord => {
  const groups = Array.isArray(item.groups) ? item.groups : []
  const groupIds = (Array.isArray(item.group_ids) ? item.group_ids : groups.map((group) => group.id ?? group.ID))
    .map(Number)
    .filter((groupId) => Number.isFinite(groupId) && groupId > 0)
  const categoryId = item.category_id ?? item.category?.id ?? item.category?.ID
  return {
    ...item,
    id: Number(item.id ?? item.ID),
    script_name: item.script_name ?? item.name ?? item.ScriptName ?? `#${item.id ?? item.ID}`,
    category_id: categoryId === undefined || categoryId === null ? undefined : Number(categoryId),
    group_ids: groupIds,
    visibility: item.visibility ?? (item.is_private ? 'private' : 'team'),
    version: Number(item.version),
    revision: Number(item.revision ?? 1),
    uuid: item.uuid ?? item.UUID,
    file_hash: item.file_hash ?? item.fileHash,
    tags: Array.isArray(item.tags)
      ? item.tags
      : String(item.tags || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
    group_names: item.group_names ?? groups.map((group) => group.name),
  }
}

const readError = (error: any) => ({
  status: Number(error?.status ?? error?.response?.status),
  code: error?.code ?? error?.response?.data?.code ?? error?.response?.data?.error?.code,
  message: error?.message ?? error?.response?.data?.message ?? String(error),
})

const notifyOperationError = (action: string, error: unknown) => {
  const detail = readError(error)
  if (detail.status === 403 || detail.code === 'permission_denied' || detail.code === 'forbidden') {
    yakitFailed(`${action}失败：当前团队角色无权执行此操作`)
    return
  }
  if (detail.code === 'plugin_in_use') {
    yakitFailed(`${action}失败：插件仍被分组引用，请编辑插件并清空分组后重试`)
    return
  }
  if (detail.code === 'category_not_empty') {
    yakitFailed(`${action}失败：分类仍包含插件，请先编辑相关插件并清空分类`)
    return
  }
  if (detail.code === 'group_in_use') {
    yakitFailed(`${action}失败：分组仍被插件引用，请先编辑相关插件并清空分组`)
    return
  }
  if (detail.status === 409 || detail.code === 'version_conflict' || detail.code === 'revision_conflict') {
    yakitFailed(`${action}失败：插件修订已变更，请刷新后重试`)
    return
  }
  yakitFailed(`${action}失败：${detail.message}`)
}

const createEmptyPluginDraft = (): TeamPluginDraft => ({
  scriptName: '',
  type: 'yak',
  content: '',
  description: '',
  tags: '',
  groupIds: [],
  visibility: 'team',
  enabled: true,
  changeNote: '',
})

const getOnlineBaseUrl = async () => {
  const setting = await getRemoteValue(getRemoteHttpSettingGV())
  if (!setting) return ''
  try {
    return String(JSON.parse(setting)?.BaseUrl || '')
  } catch {
    return ''
  }
}

const saveTeamPluginMapping = async (mapping: TeamPluginLocalMapping): Promise<void> => {
  const serverKey = encodeURIComponent(mapping.onlineBaseUrl || 'current')
  const key = `team-plugin-mapping:${serverKey}:${mapping.teamId || 0}:${mapping.teamPluginId}`
  await setRemoteValue(key, JSON.stringify(mapping))
}

export const HubListTeam: React.FC<HubListTeamProps> = memo(({ onInstall }) => {
  const userInfo = useStore((state) => state.userInfo)
  const authenticatedUserId = Number(userInfo.user_id)
  const authenticationSessionKey = `${
    userInfo.isLogin ? 'authenticated' : 'logged-out'
  }\u0000${authenticatedUserId}\u0000${userInfo.token}`
  synchronizeTeamPermissionSession(authenticationSessionKey)
  const [permissionSnapshots, setPermissionSnapshots] = useState<ReadonlyMap<number, TeamPermissionSnapshot>>(
    () => new Map(),
  )
  const [permissionSnapshotsAuthenticationSessionKey, setPermissionSnapshotsAuthenticationSessionKey] =
    useState(authenticationSessionKey)
  const [loading, setLoading] = useState(false)
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([])
  const [teamId, setTeamId] = useState<number>()
  const activeTeamIdRef = useRef<number>()
  const permissionSnapshotsRef = useRef<ReadonlyMap<number, TeamPermissionSnapshot>>(new Map())
  const permissionSnapshotsAuthenticationSessionKeyRef = useRef(authenticationSessionKey)
  const authenticationSessionKeyRef = useRef(authenticationSessionKey)
  const appliedAuthenticationSessionKeyRef = useRef(authenticationSessionKey)
  const permissionRequestSequence = useRef(0)
  const currentPermissionRequest = useRef<TeamPermissionRequestIdentity>()
  const pluginRequestId = useRef(0)
  const filterRequestId = useRef(0)
  const versionRequestId = useRef(0)
  authenticationSessionKeyRef.current = authenticationSessionKey
  const [categories, setCategories] = useState<ManagedFilterRecord[]>([])
  const [groups, setGroups] = useState<ManagedFilterRecord[]>([])
  const [plugins, setPlugins] = useState<TeamPluginRecord[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState<TeamPluginQueryState>({ keyword: '', page: 1, limit: 20 })
  const queryRef = useRef(query)
  const [importResults, setImportResults] = useState<TeamPluginImportResult[]>([])
  const [uploadVisible, setUploadVisible] = useState(false)
  const [localPlugins, setLocalPlugins] = useState<LocalPluginUploadSource[]>([])
  const [selectedLocalPluginIds, setSelectedLocalPluginIds] = useState<number[]>([])
  const [uploadVisibility, setUploadVisibility] = useState<TeamPluginVisibility>('team')
  const [uploadCategoryId, setUploadCategoryId] = useState<number>()
  const [uploadGroupIds, setUploadGroupIds] = useState<number[]>([])
  const [uploadOverwrite, setUploadOverwrite] = useState(false)
  const [selectedPluginIds, setSelectedPluginIds] = useState<number[]>([])
  const [operationMessage, setOperationMessage] = useState('')
  const [refreshError, setRefreshError] = useState<RefreshErrorState>()
  const [installConflict, setInstallConflict] = useState<{
    plugin: TeamPluginInstallRecord
    existing: LocalPluginRecord
    resolve: (resolution: TeamPluginLocalConflictResolution) => void
  }>()
  const [conflictCopyName, setConflictCopyName] = useState('')
  const [pluginEditor, setPluginEditor] = useState<{ mode: 'create' | 'edit'; plugin?: TeamPluginRecord }>()
  const [pluginDraft, setPluginDraft] = useState<TeamPluginDraft>(createEmptyPluginDraft)
  const [pluginToDelete, setPluginToDelete] = useState<TeamPluginRecord>()
  const [filterManagerVisible, setFilterManagerVisible] = useState(false)
  const [filterEditor, setFilterEditor] = useState<{ kind: ManagedFilterKind; item?: ManagedFilterRecord }>()
  const [filterDraft, setFilterDraft] = useState({
    name: '',
    description: '',
    sortOrder: 0,
    status: 'active',
  })
  const [filterToDelete, setFilterToDelete] = useState<{
    kind: ManagedFilterKind
    item: ManagedFilterRecord
  }>()
  const [pluginVersionPicker, setPluginVersionPicker] = useState<PluginVersionPicker>()

  const importSummary = useMemo(() => summarizeTeamPluginImportResults(importResults), [importResults])
  const selectedTeamPermission = useMemo(() => {
    if (permissionSnapshotsAuthenticationSessionKey !== authenticationSessionKey || !teamId) return undefined
    return permissionSnapshots.get(teamId)
  }, [authenticationSessionKey, permissionSnapshots, permissionSnapshotsAuthenticationSessionKey, teamId])
  const canReadPlugins = hasExactTeamPermission(selectedTeamPermission, 'plugin.read')
  const canManagePlugins = hasExactTeamPermission(selectedTeamPermission, 'plugin.manage')
  const canImportPlugins = hasExactTeamPermission(selectedTeamPermission, 'plugin.import')
  const canReadPluginGroups = hasExactTeamPermission(selectedTeamPermission, 'plugin_group.read')
  const canManagePluginGroups = hasExactTeamPermission(selectedTeamPermission, 'plugin_group.manage')
  const refreshErrorMessage = useMemo(() => {
    if (!refreshError) return ''
    if (refreshError.plugins && refreshError.filters) {
      if (refreshError.plugins === refreshError.filters) {
        return `${refreshError.plugins}已提交，但页面数据刷新失败，请重新打开管理窗口刷新分类与分组，并使用刷新按钮读取插件列表`
      }
      return `${refreshError.plugins}已提交，但插件列表刷新失败；${refreshError.filters}已提交，但分类与分组刷新失败，请分别读取最新状态`
    }
    if (refreshError.plugins) {
      return `${refreshError.plugins}已提交，但插件列表刷新失败，请使用刷新按钮读取最新状态`
    }
    return `${refreshError.filters}已提交，但分类与分组刷新失败，请重新打开管理窗口读取最新状态`
  }, [refreshError])
  const statusMessage = operationMessage || refreshErrorMessage

  const resolveRefreshError = useMemoizedFn((domain: 'plugins' | 'filters') => {
    setRefreshError((current) => {
      if (!current || !current[domain]) return current
      const next: RefreshErrorState = { ...current, [domain]: undefined }
      return next.plugins || next.filters ? next : undefined
    })
  })

  const markRefreshError = useMemoizedFn((action: string, domain: 'plugins' | 'filters') => {
    setRefreshError((current) => ({ ...current, [domain]: action }))
  })

  const commitPermissionSnapshots = useMemoizedFn(
    (
      next: ReadonlyMap<number, TeamPermissionSnapshot>,
      boundAuthenticationSessionKey = authenticationSessionKeyRef.current,
    ) => {
      permissionSnapshotsAuthenticationSessionKeyRef.current = boundAuthenticationSessionKey
      permissionSnapshotsRef.current = next
      setPermissionSnapshotsAuthenticationSessionKey(boundAuthenticationSessionKey)
      setPermissionSnapshots(next)
    },
  )

  const hasTeamPermission = useMemoizedFn((targetTeamId: number, code: string): boolean => {
    if (permissionSnapshotsAuthenticationSessionKeyRef.current !== authenticationSessionKeyRef.current) return false
    return hasExactTeamPermission(permissionSnapshotsRef.current.get(targetTeamId), code)
  })

  const hasActiveTeamPermission = useMemoizedFn((code: string): boolean => {
    const currentTeamId = activeTeamIdRef.current
    return Boolean(currentTeamId && hasTeamPermission(currentTeamId, code))
  })

  const closeProtectedEditors = useMemoizedFn(() => {
    versionRequestId.current += 1
    setPluginVersionPicker(undefined)
    setPluginEditor(undefined)
    setPluginToDelete(undefined)
    setUploadVisible(false)
    setFilterManagerVisible(false)
    setFilterEditor(undefined)
    setFilterToDelete(undefined)
    setInstallConflict((current) => {
      current?.resolve({ action: 'skip' })
      return undefined
    })
  })

  const clearTeamData = useMemoizedFn(() => {
    pluginRequestId.current += 1
    filterRequestId.current += 1
    closeProtectedEditors()
    setCategories([])
    setGroups([])
    setPlugins([])
    setTotal(0)
    setImportResults([])
    setSelectedPluginIds([])
    setSelectedLocalPluginIds([])
    setUploadVisibility('team')
    setUploadCategoryId(undefined)
    setUploadGroupIds([])
    setUploadOverwrite(false)
    setOperationMessage('')
    setRefreshError(undefined)
  })

  const invalidatePermissionSnapshot = useMemoizedFn((invalidatedTeamId: number) => {
    const next = invalidateTeamPermissionSnapshots(
      permissionSnapshotsRef.current,
      permissionSnapshotsAuthenticationSessionKeyRef.current,
      authenticationSessionKeyRef.current,
      invalidatedTeamId,
    )
    commitPermissionSnapshots(next.snapshots, next.authenticationSessionKey)
    if (activeTeamIdRef.current === invalidatedTeamId) closeProtectedEditors()
  })

  const invalidateAuthenticationSession = useMemoizedFn(() => {
    permissionRequestSequence.current += 1
    currentPermissionRequest.current = undefined
    activeTeamIdRef.current = undefined
    commitPermissionSnapshots(new Map(), authenticationSessionKeyRef.current)
    clearTeamData()
    setTeams([])
    setTeamId(undefined)
    setLoading(false)
  })

  const loadPlugins = useMemoizedFn(
    async (nextTeamId = teamId, nextQuery = queryRef.current, refreshAction?: string): Promise<boolean | undefined> => {
      if (nextTeamId && activeTeamIdRef.current !== nextTeamId) return undefined
      const requestId = pluginRequestId.current + 1
      pluginRequestId.current = requestId
      if (!nextTeamId) {
        setPlugins([])
        setTotal(0)
        resolveRefreshError('plugins')
        return true
      }
      if (!hasTeamPermission(nextTeamId, 'plugin.read')) {
        setPlugins([])
        setTotal(0)
        return undefined
      }
      const isCurrentRequest = () => pluginRequestId.current === requestId && activeTeamIdRef.current === nextTeamId
      setLoading(true)
      try {
        const response = await service.listTeamPlugins(nextTeamId, buildTeamPluginQuery(nextQuery))
        if (!isCurrentRequest()) return undefined
        const nextPlugins = unwrapItems<any>(response, ['plugins']).map(normalizeTeamPlugin)
        setPlugins(nextPlugins)
        setTotal(getTotal(response, nextPlugins.length))
        resolveRefreshError('plugins')
        return true
      } catch (error) {
        if (!isCurrentRequest()) return undefined
        notifyOperationError('加载团队插件', error)
        if (refreshAction) markRefreshError(refreshAction, 'plugins')
        return false
      } finally {
        if (isCurrentRequest()) setLoading(false)
      }
    },
  )

  const loadFilters = useMemoizedFn(
    async (nextTeamId: number, refreshAction?: string): Promise<boolean | undefined> => {
      if (activeTeamIdRef.current !== nextTeamId) return undefined
      const requestId = filterRequestId.current + 1
      filterRequestId.current = requestId
      const isCurrentRequest = () => filterRequestId.current === requestId && activeTeamIdRef.current === nextTeamId
      const canReadCategories = hasTeamPermission(nextTeamId, 'plugin.read')
      const canReadGroups = hasTeamPermission(nextTeamId, 'plugin_group.read')
      if (!canReadCategories) setCategories([])
      if (!canReadGroups) setGroups([])
      if (!canReadCategories && !canReadGroups) return undefined
      const [categoryResult, groupResult] = await Promise.allSettled([
        canReadCategories
          ? service.listPluginCategories(nextTeamId, { page: 1, limit: 200 })
          : Promise.resolve(undefined),
        canReadGroups ? service.listPluginGroups(nextTeamId, { page: 1, limit: 200 }) : Promise.resolve(undefined),
      ])
      if (!isCurrentRequest()) return undefined
      const failures: unknown[] = []
      if (canReadCategories) {
        if (categoryResult.status === 'fulfilled') {
          setCategories(
            unwrapItems<any>(categoryResult.value, ['categories']).map((item) => ({
              id: Number(item.id ?? item.ID),
              name: item.name ?? item.category_name ?? `#${item.id ?? item.ID}`,
              description: item.description ?? '',
              sort_order: Number(item.sort_order ?? 0),
              status: item.status ?? 'active',
            })),
          )
        } else {
          failures.push(categoryResult.reason)
        }
      }
      if (canReadGroups) {
        if (groupResult.status === 'fulfilled') {
          setGroups(
            unwrapItems<any>(groupResult.value, ['groups']).map((item) => ({
              id: Number(item.id ?? item.ID),
              name: item.name ?? item.group_name ?? `#${item.id ?? item.ID}`,
              description: item.description ?? '',
              sort_order: Number(item.sort_order ?? 0),
              status: item.status ?? 'active',
            })),
          )
        } else {
          failures.push(groupResult.reason)
        }
      }
      if (failures.length) {
        notifyOperationError('加载插件分类与分组', failures[0])
        if (refreshAction) markRefreshError(refreshAction, 'filters')
        return false
      }
      resolveRefreshError('filters')
      return true
    },
  )

  const loadTeamAccess = useMemoizedFn(async (requestedTeamId: number | null) => {
    if (!userInfo.isLogin || !Number.isSafeInteger(authenticatedUserId) || authenticatedUserId <= 0) {
      invalidateAuthenticationSession()
      return
    }
    const requestIdentity: TeamPermissionRequestIdentity = {
      userId: authenticatedUserId,
      teamId: requestedTeamId,
      requestSequence: permissionRequestSequence.current + 1,
    }
    permissionRequestSequence.current = requestIdentity.requestSequence
    currentPermissionRequest.current = requestIdentity
    commitPermissionSnapshots(new Map(), authenticationSessionKey)
    clearTeamData()
    setLoading(true)
    try {
      const [teamResponse, currentUserResponse] = await Promise.all([
        service.listTeams({ page: 1, limit: 100 }),
        service.getMe(),
      ])
      if (
        !currentPermissionRequest.current ||
        !isCurrentTeamPermissionResponse(currentPermissionRequest.current, requestIdentity) ||
        authenticationSessionKeyRef.current !== authenticationSessionKey
      ) {
        return
      }
      const currentUser = unwrapData<teamCollaboration.CurrentCollaborationUser>(currentUserResponse)
      if (
        !currentUser?.user ||
        currentUser.user.id !== authenticatedUserId ||
        !Array.isArray(currentUser.memberships)
      ) {
        throw new Error('团队权限响应用户不匹配')
      }
      const joinedTeams = mergeTeamMemberships(
        unwrapItems<teamCollaboration.CollaborationTeam>(teamResponse, ['teams']),
        currentUser.memberships,
      )
      const nextTeams = joinedTeams
        .map((item) => ({ id: Number(item.id), name: item.name || `#${item.id}` }))
        .sort((left, right) => left.id - right.id)
      setTeams(nextTeams)
      let nextTeamId = requestedTeamId
      if (requestedTeamId === null) {
        if (activeTeamIdRef.current !== undefined) return
        nextTeamId = nextTeams[0]?.id || null
      } else if (activeTeamIdRef.current !== requestedTeamId) {
        return
      }
      if (nextTeamId === null || !nextTeams.some((item) => item.id === nextTeamId)) {
        activeTeamIdRef.current = undefined
        setTeamId(undefined)
        return
      }

      activeTeamIdRef.current = nextTeamId
      setTeamId(nextTeamId)
      const snapshots = buildTeamPermissionSnapshots(currentUser)
      const snapshot = snapshots.get(nextTeamId)
      if (
        !snapshot ||
        !acceptTeamPermissionMemberVersion(
          authenticationSessionKey,
          snapshot.userId,
          snapshot.teamId,
          snapshot.memberVersion,
        )
      ) {
        return
      }
      commitPermissionSnapshots(new Map([[nextTeamId, snapshot]]), authenticationSessionKey)
      await Promise.all([
        hasTeamPermission(nextTeamId, 'plugin.read') || hasTeamPermission(nextTeamId, 'plugin_group.read')
          ? loadFilters(nextTeamId)
          : Promise.resolve(undefined),
        hasTeamPermission(nextTeamId, 'plugin.read')
          ? loadPlugins(nextTeamId, queryRef.current)
          : Promise.resolve(undefined),
      ])
    } catch (error) {
      if (
        currentPermissionRequest.current &&
        isCurrentTeamPermissionResponse(currentPermissionRequest.current, requestIdentity) &&
        authenticationSessionKeyRef.current === authenticationSessionKey
      ) {
        commitPermissionSnapshots(new Map(), authenticationSessionKey)
        clearTeamData()
        setTeams([])
        activeTeamIdRef.current = undefined
        setTeamId(undefined)
        notifyOperationError('加载团队', error)
      }
    } finally {
      if (
        currentPermissionRequest.current &&
        isCurrentTeamPermissionResponse(currentPermissionRequest.current, requestIdentity) &&
        authenticationSessionKeyRef.current === authenticationSessionKey
      ) {
        setLoading(false)
      }
    }
  })

  const selectTeam = useMemoizedFn(async (nextTeamId: number) => {
    if (!Number.isSafeInteger(nextTeamId) || nextTeamId <= 0) return
    const nextQuery = { ...queryRef.current, categoryId: undefined, groupId: undefined, page: 1 }
    activeTeamIdRef.current = nextTeamId
    queryRef.current = nextQuery
    setTeamId(nextTeamId)
    setQuery(nextQuery)
    await loadTeamAccess(nextTeamId)
  })

  useEffect(() => {
    void loadTeamAccess(null)
  }, [loadTeamAccess])

  useEffect(() => {
    if (appliedAuthenticationSessionKeyRef.current === authenticationSessionKey) return
    appliedAuthenticationSessionKeyRef.current = authenticationSessionKey
    invalidateAuthenticationSession()
    void loadTeamAccess(null)
  }, [authenticationSessionKey, invalidateAuthenticationSession, loadTeamAccess])

  useEffect(() => {
    const unsubscribePermissionInvalidation = subscribeTeamPermissionInvalidation((invalidatedTeamId) => {
      invalidatePermissionSnapshot(invalidatedTeamId)
      if (activeTeamIdRef.current === invalidatedTeamId) void loadTeamAccess(invalidatedTeamId)
    })
    const unsubscribeAuthenticationInvalidation = subscribeTeamAuthenticationInvalidation(
      invalidateAuthenticationSession,
    )
    return () => {
      unsubscribePermissionInvalidation()
      unsubscribeAuthenticationInvalidation()
    }
  }, [invalidateAuthenticationSession, invalidatePermissionSnapshot, loadTeamAccess])

  const updateQuery = useMemoizedFn((patch: Partial<TeamPluginQueryState>) => {
    const nextQuery = { ...queryRef.current, ...patch, page: patch.page ?? 1 }
    queryRef.current = nextQuery
    setQuery(nextQuery)
    loadPlugins(teamId, nextQuery)
  })

  const assertOperationPermission = useMemoizedFn((operationTeamId: number, code: string) => {
    if (activeTeamIdRef.current !== operationTeamId || !hasTeamPermission(operationTeamId, code)) {
      throw new Error('团队权限已失效，请刷新后重试')
    }
  })

  const loadPluginVersions = useMemoizedFn(
    async (plugin: TeamPluginRecord): Promise<teamCollaboration.TeamPluginVersion[] | undefined> => {
      const operationTeamId = activeTeamIdRef.current
      if (!operationTeamId || !hasTeamPermission(operationTeamId, 'plugin.read')) return undefined
      const requestId = versionRequestId.current + 1
      versionRequestId.current = requestId
      const response = await service.listTeamPluginVersions(operationTeamId, plugin.id, { page: 1, limit: 200 })
      if (
        versionRequestId.current !== requestId ||
        activeTeamIdRef.current !== operationTeamId ||
        !hasTeamPermission(operationTeamId, 'plugin.read')
      ) {
        return undefined
      }
      const versions = unwrapItems<teamCollaboration.TeamPluginVersion>(response, ['versions'])
      if (!versions.length) throw new Error('插件没有可下载的历史版本')
      const valid = versions.every(
        (item) =>
          Number(item.team_id) === operationTeamId &&
          Number(item.plugin_id) === plugin.id &&
          Number.isSafeInteger(Number(item.version)) &&
          Number(item.version) > 0 &&
          sha256Pattern.test(String(item.file_hash)),
      )
      if (!valid) throw new Error('插件版本元数据无效')
      return [...versions].sort((left, right) => right.version - left.version)
    },
  )

  const openPluginVersions = useMemoizedFn(async (plugin: TeamPluginRecord) => {
    if (!hasActiveTeamPermission('plugin.read')) return
    const operationTeamId = activeTeamIdRef.current
    if (!operationTeamId) return
    setLoading(true)
    try {
      const versions = await loadPluginVersions(plugin)
      if (!versions || activeTeamIdRef.current !== operationTeamId) return
      const selected = versions.find((item) => item.version === plugin.version) || versions[0]
      setPluginVersionPicker({
        teamId: operationTeamId,
        plugin,
        versions,
        selectedVersion: selected.version,
      })
    } catch (error) {
      if (activeTeamIdRef.current === operationTeamId && hasTeamPermission(operationTeamId, 'plugin.read')) {
        notifyOperationError('加载插件历史版本', error)
      }
    } finally {
      if (activeTeamIdRef.current === operationTeamId) setLoading(false)
    }
  })

  const resolveInstallConflict = useMemoizedFn(
    (input: { plugin: TeamPluginInstallRecord; existing: LocalPluginRecord }) =>
      new Promise<TeamPluginLocalConflictResolution>((resolve) => {
        setConflictCopyName(`${input.plugin.scriptName}-副本`)
        setInstallConflict({ ...input, resolve })
      }),
  )

  const finishInstallConflict = useMemoizedFn((resolution: TeamPluginLocalConflictResolution) => {
    installConflict?.resolve(resolution)
    setInstallConflict(undefined)
  })

  const findLocalPlugin = useMemoizedFn(async (scriptName: string): Promise<LocalPluginRecord | undefined> => {
    const response = await ipcRenderer.invoke('QueryYakScript', {
      IncludedScriptNames: [scriptName],
      Pagination: { Page: 1, Limit: 10, OrderBy: 'updated_at', Order: 'desc' },
    })
    return (response?.Data || []).find((plugin: LocalPluginRecord) => plugin.ScriptName === scriptName)
  })

  const notifyInstalledPlugin = useMemoizedFn((mapping: TeamPluginLocalMapping) => {
    onInstall?.(
      JSON.stringify({
        name: mapping.localScriptName,
        ...(mapping.localPluginUUID ? { uuid: mapping.localPluginUUID } : {}),
      }),
    )
  })

  const installPlugin = useMemoizedFn(
    async (plugin: TeamPluginRecord, selectedVersion: teamCollaboration.TeamPluginVersion, operationTeamId: number) => {
      assertOperationPermission(operationTeamId, 'plugin.read')
      if (
        selectedVersion.team_id !== operationTeamId ||
        selectedVersion.plugin_id !== plugin.id ||
        !Number.isSafeInteger(selectedVersion.version) ||
        selectedVersion.version <= 0 ||
        !sha256Pattern.test(selectedVersion.file_hash)
      ) {
        throw new Error('插件版本元数据无效')
      }
      let expectedFileHash = selectedVersion.file_hash
      if (selectedVersion.version === plugin.version) {
        const manifestResponse = await service.listOfflinePluginManifest(operationTeamId, {
          page: 1,
          limit: 200,
          keyword: plugin.script_name,
        })
        assertOperationPermission(operationTeamId, 'plugin.read')
        const manifest = unwrapItems<teamCollaboration.OfflinePluginManifestItem>(manifestResponse).find(
          (item) => item.id === plugin.id && item.version === selectedVersion.version,
        )
        if (
          !manifest ||
          manifest.team_id !== operationTeamId ||
          manifest.script_name !== plugin.script_name ||
          manifest.hash_algorithm !== 'sha256' ||
          manifest.file_hash !== selectedVersion.file_hash ||
          manifest.download_url !== buildVersionDownloadURL(operationTeamId, plugin.id, selectedVersion.version)
        ) {
          throw new Error('离线插件清单与选中版本不一致')
        }
        await assertManifestEngineCompatibility(manifest)
        assertOperationPermission(operationTeamId, 'plugin.read')
        expectedFileHash = manifest.file_hash
      }
      const onlineBaseUrl = await getOnlineBaseUrl()
      assertOperationPermission(operationTeamId, 'plugin.read')
      const categoryName = plugin.category_name || categories.find((item) => item.id === plugin.category_id)?.name
      const groupNames =
        plugin.group_names ||
        plugin.group_ids?.map((id) => groups.find((item) => item.id === id)?.name || `#${id}`) ||
        []
      const result = await installTeamPluginDownload(
        {
          id: plugin.id,
          teamId: operationTeamId,
          scriptName: plugin.script_name,
          type: plugin.type,
          uuid: plugin.uuid,
          description: plugin.description,
          fileHash: expectedFileHash,
          version: selectedVersion.version,
          revision: plugin.revision,
          visibility: plugin.visibility,
          categoryId: plugin.category_id,
          categoryName,
          groupIds: plugin.group_ids,
          groupNames,
          tags: plugin.tags,
        },
        {
          onlineBaseUrl,
          findLocalPlugin: async (scriptName) => {
            assertOperationPermission(operationTeamId, 'plugin.read')
            return findLocalPlugin(scriptName)
          },
          resolveLocalConflict: resolveInstallConflict,
          download: async (version) => {
            assertOperationPermission(operationTeamId, 'plugin.read')
            const content = (await service.downloadTeamPluginVersion(
              operationTeamId,
              plugin.id,
              version,
            )) as TeamPluginDownloadContent
            assertOperationPermission(operationTeamId, 'plugin.read')
            return content
          },
          savePlugin: (input) => {
            assertOperationPermission(operationTeamId, 'plugin.read')
            return ipcRenderer.invoke('SaveYakScript', input)
          },
          saveGroups: async (scriptName, saveGroups) => {
            assertOperationPermission(operationTeamId, 'plugin.read')
            await apiFetchSaveYakScriptGroupLocal({
              Filter: {
                IncludedScriptNames: [scriptName],
                Pagination: { Page: 1, Limit: 1, OrderBy: 'updated_at', Order: 'desc' },
              },
              SaveGroup: saveGroups,
              RemoveGroup: [],
            })
          },
          saveMapping: (mapping) => {
            assertOperationPermission(operationTeamId, 'plugin.read')
            return saveTeamPluginMapping(mapping)
          },
        },
      )
      return result
    },
  )

  const downloadPlugin = useMemoizedFn(
    async (plugin: TeamPluginRecord, selectedVersion: teamCollaboration.TeamPluginVersion, operationTeamId: number) => {
      if (!hasTeamPermission(operationTeamId, 'plugin.read') || activeTeamIdRef.current !== operationTeamId) return
      setLoading(true)
      setOperationMessage(`正在下载并校验：${plugin.script_name}`)
      try {
        const result = await installPlugin(plugin, selectedVersion, operationTeamId)
        if (!hasTeamPermission(operationTeamId, 'plugin.read') || activeTeamIdRef.current !== operationTeamId) return
        if ('skipped' in result) {
          setOperationMessage(`已跳过本地同名插件：${plugin.script_name}`)
          success(`已跳过本地同名插件“${plugin.script_name}”`)
        } else {
          setOperationMessage(`摘要校验通过并已安装：${plugin.script_name}`)
          notifyInstalledPlugin(result.mapping)
          success(`插件“${plugin.script_name}”已安装到本地`)
        }
      } catch (error) {
        if (activeTeamIdRef.current === operationTeamId && hasTeamPermission(operationTeamId, 'plugin.read')) {
          setOperationMessage(`安装失败：${plugin.script_name}：${readError(error).message}`)
          notifyOperationError('下载团队插件', error)
        }
      } finally {
        if (activeTeamIdRef.current === operationTeamId) setLoading(false)
      }
    },
  )

  const confirmVersionInstall = useMemoizedFn(async () => {
    const picker = pluginVersionPicker
    if (!picker || activeTeamIdRef.current !== picker.teamId || !hasTeamPermission(picker.teamId, 'plugin.read')) return
    const selectedVersion = picker.versions.find((item) => item.version === picker.selectedVersion)
    if (!selectedVersion) return
    setPluginVersionPicker(undefined)
    await downloadPlugin(picker.plugin, selectedVersion, picker.teamId)
  })

  const downloadSelectedPlugins = useMemoizedFn(async () => {
    if (!hasActiveTeamPermission('plugin.read')) return
    const operationTeamId = activeTeamIdRef.current
    if (!operationTeamId) return
    const selected = plugins.filter((plugin) => selectedPluginIds.includes(plugin.id))
    if (!selected.length) {
      yakitFailed('请选择团队插件')
      return
    }
    setLoading(true)
    let installed = 0
    let skipped = 0
    let failed = 0
    let lastInstalledMapping: TeamPluginLocalMapping | undefined
    const failures: string[] = []
    for (let index = 0; index < selected.length; index += 1) {
      const plugin = selected[index]
      setOperationMessage(`批量安装 ${index + 1}/${selected.length}：${plugin.script_name}`)
      try {
        assertOperationPermission(operationTeamId, 'plugin.read')
        const versions = await loadPluginVersions(plugin)
        if (!versions) throw new Error('插件版本请求已失效')
        const selectedVersion = versions.find((item) => item.version === plugin.version) || versions[0]
        const result = await installPlugin(plugin, selectedVersion, operationTeamId)
        if ('skipped' in result) skipped += 1
        else {
          installed += 1
          lastInstalledMapping = result.mapping
        }
      } catch (error) {
        failed += 1
        failures.push(`${plugin.script_name}：${readError(error).message}`)
      }
    }
    if (activeTeamIdRef.current !== operationTeamId) return
    setLoading(false)
    setSelectedPluginIds([])
    if (lastInstalledMapping) notifyInstalledPlugin(lastInstalledMapping)
    const summary = `批量安装完成：成功 ${installed}，跳过 ${skipped}，失败 ${failed}`
    setOperationMessage(failures.length ? `${summary}；${failures.slice(0, 3).join('；')}` : summary)
    if (failed) yakitFailed(`${summary}；${failures.slice(0, 3).join('；')}`)
    else success(summary)
  })

  const openCreatePlugin = useMemoizedFn(() => {
    if (!teamId || !hasActiveTeamPermission('plugin.manage')) {
      yakitFailed('请选择团队')
      return
    }
    setPluginDraft(createEmptyPluginDraft())
    setPluginEditor({ mode: 'create' })
  })

  const openEditPlugin = useMemoizedFn((plugin: TeamPluginRecord) => {
    if (!hasActiveTeamPermission('plugin.manage')) return
    setPluginDraft({
      scriptName: plugin.script_name,
      type: plugin.type || 'yak',
      content: plugin.content || '',
      description: plugin.description || '',
      tags: (plugin.tags || []).join(', '),
      categoryId: plugin.category_id,
      groupIds: plugin.group_ids || [],
      visibility: plugin.visibility,
      enabled: plugin.enabled !== false,
      changeNote: '',
    })
    setPluginEditor({ mode: 'edit', plugin })
  })

  const savePlugin = useMemoizedFn(async () => {
    if (!teamId || !pluginEditor || !hasActiveTeamPermission('plugin.manage')) return
    const operationTeamId = teamId
    const scriptName = pluginDraft.scriptName.trim()
    const type = pluginDraft.type.trim()
    if (!scriptName || !type || !pluginDraft.content) {
      yakitFailed('插件名称、类型和内容为必填项')
      return
    }
    const data = {
      script_name: scriptName,
      type,
      content: pluginDraft.content,
      description: pluginDraft.description.trim(),
      tags: pluginDraft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      enabled: pluginDraft.enabled,
      visibility: pluginDraft.visibility,
      category_id: pluginDraft.categoryId || 0,
      group_ids: pluginDraft.groupIds,
    }
    const action = pluginEditor.mode === 'create' ? '创建远端插件' : '更新远端插件'
    setLoading(true)
    try {
      assertOperationPermission(operationTeamId, 'plugin.manage')
      if (pluginEditor.mode === 'create') {
        await service.createTeamPlugin(operationTeamId, data)
      } else if (pluginEditor.plugin) {
        await service.updateTeamPlugin(operationTeamId, pluginEditor.plugin.id, {
          ...data,
          change_note: pluginDraft.changeNote.trim(),
          revision: pluginEditor.plugin.revision,
        })
      }
      if (activeTeamIdRef.current !== operationTeamId || !hasTeamPermission(operationTeamId, 'plugin.manage')) {
        return
      }
      setPluginEditor(undefined)
      setOperationMessage(`${action}已提交，正在刷新插件列表`)
      const refreshed = await loadPlugins(operationTeamId, { ...queryRef.current }, action)
      if (refreshed === true) {
        setOperationMessage('')
        success(`${action}成功`)
      } else {
        setOperationMessage('')
      }
    } catch (error) {
      if (activeTeamIdRef.current === operationTeamId) notifyOperationError(action, error)
    } finally {
      if (activeTeamIdRef.current === operationTeamId) setLoading(false)
    }
  })

  const deletePlugin = useMemoizedFn(async () => {
    if (!teamId || !pluginToDelete || !hasActiveTeamPermission('plugin.manage')) return
    const operationTeamId = teamId
    setLoading(true)
    try {
      const deletedPluginId = pluginToDelete.id
      setOperationMessage('正在删除远端插件并清空分组引用')
      assertOperationPermission(operationTeamId, 'plugin.manage')
      await service.deleteTeamPlugin(operationTeamId, deletedPluginId, { cascade: true })
      if (activeTeamIdRef.current !== operationTeamId || !hasTeamPermission(operationTeamId, 'plugin.manage')) {
        return
      }
      setPluginToDelete(undefined)
      setSelectedPluginIds((current) => current.filter((id) => id !== deletedPluginId))
      setPlugins((current) => current.filter((plugin) => plugin.id !== deletedPluginId))
      setTotal((current) => Math.max(0, current - 1))
      setOperationMessage('删除远端插件已提交，正在刷新插件列表')
      const refreshed = await loadPlugins(operationTeamId, { ...queryRef.current }, '删除远端插件')
      if (refreshed === true) {
        setOperationMessage('')
        success('删除远端插件成功')
      } else {
        setOperationMessage('')
      }
    } catch (error) {
      if (activeTeamIdRef.current === operationTeamId) {
        setOperationMessage('')
        notifyOperationError('删除远端插件', error)
      }
    } finally {
      if (activeTeamIdRef.current === operationTeamId) setLoading(false)
    }
  })

  const openFilterEditor = useMemoizedFn((kind: ManagedFilterKind, item?: ManagedFilterRecord) => {
    if (!hasActiveTeamPermission(getManagedFilterPermission(kind))) return
    setFilterDraft({
      name: item?.name || '',
      description: item?.description || '',
      sortOrder: item?.sort_order || 0,
      status: item?.status || 'active',
    })
    setFilterEditor({ kind, item })
  })

  const openFilterManager = useMemoizedFn(async () => {
    if (!teamId || (!hasActiveTeamPermission('plugin.manage') && !hasActiveTeamPermission('plugin_group.manage'))) {
      yakitFailed('请选择团队')
      return
    }
    setFilterManagerVisible(true)
    await loadFilters(teamId)
  })

  const saveFilter = useMemoizedFn(async () => {
    if (!teamId || !filterEditor) return
    const operationTeamId = teamId
    const permissionCode = getManagedFilterPermission(filterEditor.kind)
    if (!hasActiveTeamPermission(permissionCode)) return
    const name = filterDraft.name.trim()
    if (!name) {
      yakitFailed(`${filterEditor.kind === 'category' ? '分类' : '分组'}名称为必填项`)
      return
    }
    const data = {
      name,
      description: filterDraft.description.trim(),
      sort_order: filterDraft.sortOrder,
      status: filterDraft.status,
    }
    const label = filterEditor.kind === 'category' ? '分类' : '分组'
    const action = `${filterEditor.item ? '更新' : '创建'}${label}`
    setLoading(true)
    try {
      assertOperationPermission(operationTeamId, permissionCode)
      if (filterEditor.kind === 'category') {
        if (filterEditor.item) await service.updatePluginCategory(operationTeamId, filterEditor.item.id, data)
        else await service.createPluginCategory(operationTeamId, data)
      } else if (filterEditor.item) {
        await service.updatePluginGroup(operationTeamId, filterEditor.item.id, data)
      } else {
        await service.createPluginGroup(operationTeamId, data)
      }
      if (activeTeamIdRef.current !== operationTeamId || !hasTeamPermission(operationTeamId, permissionCode)) {
        return
      }
      setFilterEditor(undefined)
      setOperationMessage(`${action}已提交，正在刷新分类与分组`)
      const refreshed = await loadFilters(operationTeamId, action)
      if (refreshed === true) {
        setOperationMessage('')
        success(`${action}成功`)
      } else {
        setOperationMessage('')
      }
    } catch (error) {
      if (activeTeamIdRef.current === operationTeamId) notifyOperationError(action, error)
    } finally {
      if (activeTeamIdRef.current === operationTeamId) setLoading(false)
    }
  })

  const deleteFilter = useMemoizedFn(async () => {
    if (!teamId || !filterToDelete) return
    const operationTeamId = teamId
    const permissionCode = getManagedFilterPermission(filterToDelete.kind)
    if (!hasActiveTeamPermission(permissionCode)) return
    const label = filterToDelete.kind === 'category' ? '分类' : '分组'
    const action = `删除${label}`
    setLoading(true)
    try {
      const deletedFilter = filterToDelete
      assertOperationPermission(operationTeamId, permissionCode)
      setOperationMessage(`正在删除${label}并清空引用`)
      if (deletedFilter.kind === 'category') {
        await service.deletePluginCategory(operationTeamId, deletedFilter.item.id, { cascade: true })
      } else {
        await service.deletePluginGroup(operationTeamId, deletedFilter.item.id, { cascade: true })
      }
      if (activeTeamIdRef.current !== operationTeamId || !hasTeamPermission(operationTeamId, permissionCode)) {
        return
      }
      setFilterToDelete(undefined)
      if (deletedFilter.kind === 'category') {
        setCategories((current) => current.filter((item) => item.id !== deletedFilter.item.id))
        setPlugins((current) =>
          current.map((plugin) =>
            plugin.category_id === deletedFilter.item.id
              ? {
                  ...plugin,
                  category_id: undefined,
                  category_name: undefined,
                  revision: plugin.revision + 1,
                }
              : plugin,
          ),
        )
      } else {
        setGroups((current) => current.filter((item) => item.id !== deletedFilter.item.id))
        setPlugins((current) =>
          current.map((plugin) =>
            plugin.group_ids?.includes(deletedFilter.item.id)
              ? {
                  ...plugin,
                  group_ids: plugin.group_ids.filter((id) => id !== deletedFilter.item.id),
                  group_names: plugin.group_names?.filter((name) => name !== deletedFilter.item.name),
                }
              : plugin,
          ),
        )
      }
      const currentQuery = queryRef.current
      const clearsCategory = deletedFilter.kind === 'category' && currentQuery.categoryId === deletedFilter.item.id
      const clearsGroup = deletedFilter.kind === 'group' && currentQuery.groupId === deletedFilter.item.id
      const nextQuery: TeamPluginQueryState = {
        ...currentQuery,
        ...(clearsCategory ? { categoryId: undefined, page: 1 } : {}),
        ...(clearsGroup ? { groupId: undefined, page: 1 } : {}),
      }
      if (clearsCategory || clearsGroup) {
        queryRef.current = nextQuery
        setQuery(nextQuery)
      }
      setOperationMessage('')
      success(`删除${label}成功`)
    } catch (error) {
      if (activeTeamIdRef.current === operationTeamId) {
        setOperationMessage('')
        notifyOperationError(`删除${label}`, error)
      }
    } finally {
      if (activeTeamIdRef.current === operationTeamId) setLoading(false)
    }
  })

  const updateVisibility = useMemoizedFn(async (plugin: TeamPluginRecord, visibility: TeamPluginVisibility) => {
    if (!teamId || plugin.visibility === visibility || !hasActiveTeamPermission('plugin.manage')) return
    const operationTeamId = teamId
    setLoading(true)
    setOperationMessage('正在读取本地插件')
    try {
      assertOperationPermission(operationTeamId, 'plugin.manage')
      await service.setPluginVisibility(operationTeamId, plugin.id, visibility, plugin.revision)
      if (activeTeamIdRef.current !== operationTeamId || !hasTeamPermission(operationTeamId, 'plugin.manage')) {
        return
      }
      if (await loadPlugins(operationTeamId, { ...queryRef.current })) {
        success(`插件可见范围已设为${visibility === 'team' ? '团队' : '私有'}`)
      }
    } catch (error) {
      if (activeTeamIdRef.current === operationTeamId) notifyOperationError('更新插件可见范围', error)
    } finally {
      if (activeTeamIdRef.current === operationTeamId) setLoading(false)
    }
  })

  const openLocalUpload = useMemoizedFn(async () => {
    if (!teamId || !hasActiveTeamPermission('plugin.import')) {
      yakitFailed('请选择团队')
      return
    }
    const operationTeamId = teamId
    setLoading(true)
    try {
      assertOperationPermission(operationTeamId, 'plugin.import')
      const response = await apiQueryYakScriptBase({
        Pagination: { Page: 1, Limit: 1000, OrderBy: 'updated_at', Order: 'desc' },
        IsHistory: false,
      })
      if (activeTeamIdRef.current !== operationTeamId || !hasTeamPermission(operationTeamId, 'plugin.import')) {
        return
      }
      const candidates = (response.Data || []).filter((plugin) => !plugin.IsHistory)
      if (!candidates.length) throw new Error('本地插件库为空')
      setLocalPlugins(candidates)
      setSelectedLocalPluginIds([])
      setUploadVisibility('team')
      setUploadCategoryId(undefined)
      setUploadGroupIds([])
      setUploadOverwrite(false)
      setUploadVisible(true)
      setOperationMessage(`已读取 ${candidates.length} 个本地插件`)
    } catch (error) {
      if (activeTeamIdRef.current === operationTeamId) notifyOperationError('读取本地插件', error)
    } finally {
      if (activeTeamIdRef.current === operationTeamId) setLoading(false)
    }
  })

  const uploadLocalPlugins = useMemoizedFn(async () => {
    if (!teamId || !hasActiveTeamPermission('plugin.import')) return
    const operationTeamId = teamId
    const requiresManagePermission = uploadOverwrite
    if (requiresManagePermission && !hasActiveTeamPermission('plugin.manage')) return
    const selected = localPlugins.filter((plugin) => selectedLocalPluginIds.includes(plugin.Id))
    const options: TeamPluginUploadOptions = {
      visibility: uploadVisibility,
      overwrite: uploadOverwrite,
      categoryId: uploadCategoryId,
      groupIds: uploadGroupIds,
    }
    setLoading(true)
    try {
      assertOperationPermission(operationTeamId, 'plugin.import')
      if (requiresManagePermission) assertOperationPermission(operationTeamId, 'plugin.manage')
      setOperationMessage(`正在计算 ${selected.length} 个本地插件的 SHA-256`)
      const entries = await buildTeamPluginUploadEntries(selected, options)
      if (activeTeamIdRef.current === operationTeamId && hasTeamPermission(operationTeamId, 'plugin.import')) {
        setOperationMessage(`正在上传 ${entries.length} 个本地插件`)
      }
      assertOperationPermission(operationTeamId, 'plugin.import')
      if (requiresManagePermission) assertOperationPermission(operationTeamId, 'plugin.manage')
      const response = await service.importTeamPlugins(operationTeamId, { plugins: entries })
      if (
        activeTeamIdRef.current !== operationTeamId ||
        !hasTeamPermission(operationTeamId, 'plugin.import') ||
        (requiresManagePermission && !hasTeamPermission(operationTeamId, 'plugin.manage'))
      ) {
        return
      }
      const results = unwrapItems<TeamPluginImportResult>(response, ['results'])
      setImportResults(results)
      setUploadVisible(false)
      await loadPlugins(operationTeamId, { ...queryRef.current })
      if (activeTeamIdRef.current !== operationTeamId) return
      const summary = summarizeTeamPluginImportResults(results)
      setOperationMessage(`上传完成：成功 ${summary.succeeded}，跳过 ${summary.skipped}，失败 ${summary.failed}`)
      if (summary.failed) {
        yakitFailed(`上传完成：成功 ${summary.succeeded}，跳过 ${summary.skipped}，失败 ${summary.failed}`)
      } else {
        success(`已提交 ${entries.length} 个本地插件`)
      }
    } catch (error) {
      if (activeTeamIdRef.current === operationTeamId) notifyOperationError('上传本地插件', error)
    } finally {
      if (activeTeamIdRef.current === operationTeamId) setLoading(false)
    }
  })

  const importFile = useMemoizedFn(async (file: File) => {
    if (!teamId || !hasActiveTeamPermission('plugin.import')) {
      yakitFailed('请选择团队')
      return false
    }
    const operationTeamId = teamId
    setLoading(true)
    try {
      assertOperationPermission(operationTeamId, 'plugin.import')
      const text = await file.text()
      assertOperationPermission(operationTeamId, 'plugin.import')
      const parsed = JSON.parse(text)
      const items = Array.isArray(parsed) ? parsed : parsed.plugins
      if (!Array.isArray(items) || !items.length) throw new Error('文件中没有插件数组')
      const requiresManagePermission = items.some((item) => item?.overwrite === true)
      if (requiresManagePermission) assertOperationPermission(operationTeamId, 'plugin.manage')
      const plugins = items.map((item, index) => ({
        ...item,
        source_name: item.source_name || `${file.name}#${index + 1}`,
      }))
      if (activeTeamIdRef.current === operationTeamId && hasTeamPermission(operationTeamId, 'plugin.import')) {
        setOperationMessage(`正在导入 ${plugins.length} 个插件条目`)
      }
      assertOperationPermission(operationTeamId, 'plugin.import')
      if (requiresManagePermission) assertOperationPermission(operationTeamId, 'plugin.manage')
      const response = await service.importTeamPlugins(operationTeamId, { plugins })
      if (
        activeTeamIdRef.current !== operationTeamId ||
        !hasTeamPermission(operationTeamId, 'plugin.import') ||
        (requiresManagePermission && !hasTeamPermission(operationTeamId, 'plugin.manage'))
      ) {
        return false
      }
      const results = unwrapItems<TeamPluginImportResult>(response, ['results'])
      setImportResults(results)
      await loadPlugins(operationTeamId, { ...queryRef.current })
      if (activeTeamIdRef.current !== operationTeamId) return false
      const summary = summarizeTeamPluginImportResults(results)
      setOperationMessage(`导入完成：成功 ${summary.succeeded}，跳过 ${summary.skipped}，失败 ${summary.failed}`)
      if (summary.failed) {
        yakitFailed(`导入完成：成功 ${summary.succeeded}，跳过 ${summary.skipped}，失败 ${summary.failed}`)
      } else {
        success(`导入完成：成功 ${summary.succeeded}，跳过 ${summary.skipped}`)
      }
    } catch (error) {
      if (activeTeamIdRef.current === operationTeamId) notifyOperationError('批量导入团队插件', error)
    } finally {
      if (activeTeamIdRef.current === operationTeamId) setLoading(false)
    }
    return false
  })

  const columns = [
    {
      title: '插件',
      key: 'plugin',
      render: (_: unknown, record: TeamPluginRecord) => (
        <div className={styles.pluginInfo}>
          <strong>{record.script_name}</strong>
          <span>{record.description || record.type || '-'}</span>
        </div>
      ),
    },
    {
      title: '分类',
      key: 'category_name',
      render: (_: unknown, record: TeamPluginRecord) =>
        record.category_name || categories.find((item) => item.id === record.category_id)?.name || '-',
    },
    {
      title: '分组',
      dataIndex: 'group_names',
      key: 'group_names',
      render: (_: unknown, record: TeamPluginRecord) => {
        const values =
          record.group_names ||
          record.group_ids?.map((id) => groups.find((item) => item.id === id)?.name || `#${id}`) ||
          []
        return values.length ? values.map((value) => <Tag key={value}>{value}</Tag>) : '-'
      },
    },
    {
      title: '可见范围',
      key: 'visibility',
      render: (_: unknown, record: TeamPluginRecord) =>
        canManagePlugins ? (
          <Select
            size="small"
            value={record.visibility}
            options={[
              { value: 'team', label: '团队' },
              { value: 'private', label: '私有' },
            ]}
            onChange={(value) => updateVisibility(record, value)}
          />
        ) : record.visibility === 'team' ? (
          '团队'
        ) : (
          '私有'
        ),
    },
    { title: '版本', dataIndex: 'version', key: 'version', width: 76 },
    { title: '修订', dataIndex: 'revision', key: 'revision', width: 76 },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      render: (_: unknown, record: TeamPluginRecord) => (
        <div className={styles.actionGroup}>
          {canReadPlugins ? (
            <YakitButton type="outline1" onClick={() => openPluginVersions(record)}>
              下载到本地
            </YakitButton>
          ) : null}
          {canManagePlugins ? (
            <>
              <YakitButton
                type="text"
                aria-label={`编辑插件 ${record.script_name}`}
                onClick={() => openEditPlugin(record)}
              >
                编辑
              </YakitButton>
              <YakitButton
                type="text"
                aria-label={`删除插件 ${record.script_name}`}
                onClick={() => {
                  if (hasActiveTeamPermission('plugin.manage')) setPluginToDelete(record)
                }}
              >
                删除
              </YakitButton>
            </>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <Select
          value={teamId}
          className={styles.teamSelect}
          placeholder="选择团队"
          options={teams.map((item) => ({ value: item.id, label: item.name }))}
          onChange={selectTeam}
        />
        <YakitInput.Search
          value={query.keyword}
          placeholder="搜索插件名称或内容"
          onChange={(event) => {
            const nextQuery = { ...queryRef.current, keyword: event.target.value }
            queryRef.current = nextQuery
            setQuery(nextQuery)
          }}
          onSearch={() => updateQuery({ keyword: query.keyword })}
        />
        {canReadPlugins ? (
          <Select
            allowClear
            value={query.categoryId}
            placeholder="全部分类"
            options={categories.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => updateQuery({ categoryId: value })}
          />
        ) : null}
        {canReadPluginGroups ? (
          <Select
            allowClear
            value={query.groupId}
            placeholder="全部分组"
            options={groups.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => updateQuery({ groupId: value })}
          />
        ) : null}
        <Select
          allowClear
          value={query.visibility}
          placeholder="全部可见范围"
          options={[
            { value: 'team', label: '团队' },
            { value: 'private', label: '私有' },
          ]}
          onChange={(value) => updateQuery({ visibility: value })}
        />
        {canImportPlugins ? (
          <YakitButton type="primary" onClick={openLocalUpload}>
            上传本地插件
          </YakitButton>
        ) : null}
        {canManagePlugins ? (
          <YakitButton type="outline1" onClick={openCreatePlugin}>
            新建远端插件
          </YakitButton>
        ) : null}
        {canManagePlugins || canManagePluginGroups ? (
          <YakitButton type="outline1" onClick={openFilterManager}>
            管理分类与分组
          </YakitButton>
        ) : null}
        {canReadPlugins ? (
          <YakitButton type="outline1" disabled={!selectedPluginIds.length} onClick={downloadSelectedPlugins}>
            批量安装
          </YakitButton>
        ) : null}
        {canImportPlugins ? (
          <Upload accept=".json,application/json" showUploadList={false} beforeUpload={importFile}>
            <YakitButton data-testid="team-plugin-import" type="outline1">
              导入插件清单
            </YakitButton>
          </Upload>
        ) : null}
        <YakitButton type="outline1" onClick={() => loadPlugins()}>
          刷新
        </YakitButton>
      </div>

      {statusMessage ? (
        <div className={styles.operationStatus} role="status">
          {statusMessage}
        </div>
      ) : null}

      {importResults.length ? (
        <div className={styles.importResults}>
          <strong>
            导入结果：成功 {importSummary.succeeded}，失败 {importSummary.failed}，跳过 {importSummary.skipped}
          </strong>
          <div className={styles.resultList}>
            {importSummary.items.map((item, index) => (
              <span className={styles[`result-${item.status}`]} key={`${item.name}-${index}`}>
                {item.name}：{item.detail}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <Table<TeamPluginRecord>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={plugins}
        onRow={(record) =>
          ({
            'data-testid': `team-plugin-row-${record.id}`,
          }) as React.HTMLAttributes<HTMLTableRowElement> & { 'data-testid': string }
        }
        rowSelection={
          canReadPlugins
            ? {
                selectedRowKeys: selectedPluginIds,
                onChange: (keys) => setSelectedPluginIds(keys.map((key) => Number(key))),
              }
            : undefined
        }
        pagination={{
          current: query.page,
          pageSize: query.limit,
          total,
          showSizeChanger: true,
          onChange: (page, limit) => updateQuery({ page, limit }),
        }}
        locale={{ emptyText: '当前团队暂无插件' }}
      />

      <YakitModal
        visible={Boolean(pluginVersionPicker)}
        title="选择插件版本"
        width={560}
        okText="安装选中版本"
        cancelText="取消"
        confirmLoading={loading}
        onOk={confirmVersionInstall}
        onCancel={() => {
          versionRequestId.current += 1
          setPluginVersionPicker(undefined)
        }}
      >
        <div className={styles.editorForm}>
          <label>
            <span>历史版本</span>
            <Select
              aria-label="插件历史版本"
              value={pluginVersionPicker?.selectedVersion}
              options={(pluginVersionPicker?.versions || []).map((item) => ({
                value: item.version,
                label: `v${item.version}${item.change_note ? ` · ${item.change_note}` : ''}`,
              }))}
              onChange={(selectedVersion) =>
                setPluginVersionPicker((current) => (current ? { ...current, selectedVersion } : current))
              }
            />
          </label>
        </div>
      </YakitModal>

      <YakitModal
        visible={Boolean(pluginEditor)}
        title={pluginEditor?.mode === 'edit' ? '编辑远端插件' : '新建远端插件'}
        width={720}
        okText={pluginEditor?.mode === 'edit' ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={loading}
        onOk={savePlugin}
        onCancel={() => setPluginEditor(undefined)}
      >
        <div className={styles.editorForm}>
          <label>
            <span>插件名称</span>
            <YakitInput
              aria-label="插件名称"
              value={pluginDraft.scriptName}
              onChange={(event) => setPluginDraft((current) => ({ ...current, scriptName: event.target.value }))}
            />
          </label>
          <label>
            <span>插件类型</span>
            <YakitInput
              aria-label="插件类型"
              value={pluginDraft.type}
              onChange={(event) => setPluginDraft((current) => ({ ...current, type: event.target.value }))}
            />
          </label>
          <label className={styles.fullWidth}>
            <span>插件内容</span>
            <YakitInput.TextArea
              aria-label="插件内容"
              rows={10}
              value={pluginDraft.content}
              onChange={(event) => setPluginDraft((current) => ({ ...current, content: event.target.value }))}
            />
          </label>
          <label className={styles.fullWidth}>
            <span>插件描述</span>
            <YakitInput
              aria-label="插件描述"
              value={pluginDraft.description}
              onChange={(event) => setPluginDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label className={styles.fullWidth}>
            <span>插件标签</span>
            <YakitInput
              aria-label="插件标签"
              placeholder="使用英文逗号分隔"
              value={pluginDraft.tags}
              onChange={(event) => setPluginDraft((current) => ({ ...current, tags: event.target.value }))}
            />
          </label>
          <label>
            <span>分类</span>
            <Select
              aria-label="插件分类"
              allowClear
              disabled={!canReadPlugins}
              value={pluginDraft.categoryId}
              placeholder="不设置分类"
              options={categories.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => setPluginDraft((current) => ({ ...current, categoryId: value }))}
            />
          </label>
          <label>
            <span>分组</span>
            <Select
              aria-label="插件分组"
              disabled={!canReadPluginGroups}
              mode="multiple"
              value={pluginDraft.groupIds}
              placeholder="不设置分组"
              options={groups.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => setPluginDraft((current) => ({ ...current, groupIds: value }))}
            />
          </label>
          <label>
            <span>可见范围</span>
            <Select
              aria-label="插件可见范围"
              value={pluginDraft.visibility}
              options={[
                { value: 'team', label: '团队' },
                { value: 'private', label: '私有' },
              ]}
              onChange={(value) => setPluginDraft((current) => ({ ...current, visibility: value }))}
            />
          </label>
          <label>
            <span>启用状态</span>
            <Switch
              aria-label="插件启用状态"
              checked={pluginDraft.enabled}
              checkedChildren="启用"
              unCheckedChildren="停用"
              onChange={(checked) => setPluginDraft((current) => ({ ...current, enabled: checked }))}
            />
          </label>
          {pluginEditor?.mode === 'edit' ? (
            <label className={styles.fullWidth}>
              <span>修改说明</span>
              <YakitInput
                aria-label="修改说明"
                value={pluginDraft.changeNote}
                onChange={(event) => setPluginDraft((current) => ({ ...current, changeNote: event.target.value }))}
              />
            </label>
          ) : null}
        </div>
      </YakitModal>

      <YakitModal
        visible={filterManagerVisible}
        title="管理分类与分组"
        width={720}
        footer={
          <YakitButton type="outline1" onClick={() => setFilterManagerVisible(false)}>
            关闭
          </YakitButton>
        }
        onCancel={() => setFilterManagerVisible(false)}
      >
        <div className={styles.filterManager}>
          {[
            {
              kind: 'category' as const,
              title: '分类',
              items: categories,
              canRead: canReadPlugins,
              canManage: canManagePlugins,
            },
            {
              kind: 'group' as const,
              title: '分组',
              items: groups,
              canRead: canReadPluginGroups,
              canManage: canManagePluginGroups,
            },
          ]
            .filter(({ canManage, canRead }) => canManage || canRead)
            .map(({ canManage, kind, title, items }) => (
              <section key={kind}>
                <div className={styles.managerHeader}>
                  <strong>{title}</strong>
                  {canManage ? (
                    <YakitButton type="outline1" onClick={() => openFilterEditor(kind)}>
                      新建{title}
                    </YakitButton>
                  ) : null}
                </div>
                <div className={styles.managerList}>
                  {items.length ? (
                    items.map((item) => (
                      <div className={styles.managerRow} key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.description || '暂无描述'}</span>
                        </div>
                        {canManage ? (
                          <div className={styles.actionGroup}>
                            <YakitButton
                              type="text"
                              aria-label={`编辑${title} ${item.name}`}
                              onClick={() => openFilterEditor(kind, item)}
                            >
                              编辑
                            </YakitButton>
                            <YakitButton
                              type="text"
                              aria-label={`删除${title} ${item.name}`}
                              onClick={() => setFilterToDelete({ kind, item })}
                            >
                              删除
                            </YakitButton>
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <span>暂无{title}</span>
                  )}
                </div>
              </section>
            ))}
        </div>
      </YakitModal>

      <YakitModal
        visible={Boolean(filterEditor)}
        title={`${filterEditor?.item ? '编辑' : '新建'}${filterEditor?.kind === 'group' ? '分组' : '分类'}`}
        width={520}
        okText={filterEditor?.item ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={loading}
        onOk={saveFilter}
        onCancel={() => setFilterEditor(undefined)}
      >
        <div className={styles.filterForm}>
          <label>
            <span>名称</span>
            <YakitInput
              aria-label="资源名称"
              value={filterDraft.name}
              onChange={(event) => setFilterDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            <span>描述</span>
            <YakitInput
              aria-label="资源描述"
              value={filterDraft.description}
              onChange={(event) => setFilterDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label>
            <span>排序</span>
            <YakitInput
              aria-label="资源排序"
              type="number"
              value={filterDraft.sortOrder}
              onChange={(event) =>
                setFilterDraft((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))
              }
            />
          </label>
          <label>
            <span>状态</span>
            <Select
              aria-label="资源状态"
              value={filterDraft.status}
              options={[
                { value: 'active', label: '启用' },
                { value: 'disabled', label: '停用' },
              ]}
              onChange={(value) => setFilterDraft((current) => ({ ...current, status: value }))}
            />
          </label>
        </div>
      </YakitModal>

      <YakitModal
        visible={Boolean(pluginToDelete)}
        title="删除远端插件"
        width={480}
        okText="确认删除"
        cancelText="取消"
        confirmLoading={loading}
        onOk={deletePlugin}
        onCancel={() => setPluginToDelete(undefined)}
      >
        <p>确定删除“{pluginToDelete?.script_name}”吗？删除前将自动解除该插件的全部分组引用。</p>
      </YakitModal>

      <YakitModal
        visible={Boolean(filterToDelete)}
        title={`删除${filterToDelete?.kind === 'group' ? '分组' : '分类'}`}
        width={480}
        okText="确认删除"
        cancelText="取消"
        confirmLoading={loading}
        onOk={deleteFilter}
        onCancel={() => setFilterToDelete(undefined)}
      >
        <p>确定删除“{filterToDelete?.item.name}”吗？删除前将自动清空全部插件中的对应引用。</p>
      </YakitModal>

      <YakitModal
        visible={uploadVisible}
        title="上传本地插件"
        width={640}
        okText="上传"
        cancelText="取消"
        confirmLoading={loading}
        okButtonProps={{
          disabled: !selectedLocalPluginIds.length || (uploadOverwrite && !canManagePlugins),
        }}
        onOk={uploadLocalPlugins}
        onCancel={() => setUploadVisible(false)}
      >
        <div className={styles.uploadForm}>
          <label>
            <span>本地插件</span>
            <Select
              mode="multiple"
              value={selectedLocalPluginIds}
              maxTagCount="responsive"
              placeholder="选择一个或多个本地插件"
              options={localPlugins.map((plugin) => ({ value: plugin.Id, label: plugin.ScriptName }))}
              onChange={setSelectedLocalPluginIds}
            />
          </label>
          <label>
            <span>可见范围</span>
            <Select
              value={uploadVisibility}
              options={[
                { value: 'team', label: '团队' },
                { value: 'private', label: '私有' },
              ]}
              onChange={setUploadVisibility}
            />
          </label>
          <label>
            <span>分类</span>
            <Select
              allowClear
              disabled={!canReadPlugins}
              value={uploadCategoryId}
              placeholder="不设置分类"
              options={categories.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setUploadCategoryId}
            />
          </label>
          <label>
            <span>分组</span>
            <Select
              disabled={!canReadPluginGroups}
              mode="multiple"
              value={uploadGroupIds}
              placeholder="不设置分组"
              options={groups.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setUploadGroupIds}
            />
          </label>
          <label>
            <span>同名处理</span>
            <Select
              disabled={!canManagePlugins}
              value={uploadOverwrite ? 'overwrite' : 'skip'}
              options={[
                { value: 'skip', label: '跳过重复项' },
                { value: 'overwrite', label: '覆盖为新版本' },
              ]}
              onChange={(value) => {
                if (!canManagePlugins) return
                setUploadOverwrite(value === 'overwrite')
              }}
            />
          </label>
        </div>
      </YakitModal>

      <YakitModal
        visible={Boolean(installConflict)}
        title="本地同名插件"
        width={520}
        closable={false}
        keyboard={false}
        maskClosable={false}
        footer={[
          <YakitButton key="skip" type="outline1" onClick={() => finishInstallConflict({ action: 'skip' })}>
            跳过
          </YakitButton>,
          <YakitButton
            key="copy"
            type="outline1"
            disabled={!conflictCopyName.trim() || conflictCopyName.trim() === installConflict?.plugin.scriptName}
            onClick={() => finishInstallConflict({ action: 'copy', scriptName: conflictCopyName })}
          >
            保存副本
          </YakitButton>,
          <YakitButton key="overwrite" type="primary" onClick={() => finishInstallConflict({ action: 'overwrite' })}>
            覆盖
          </YakitButton>,
        ]}
      >
        <div className={styles.conflictForm}>
          <span>{installConflict?.plugin.scriptName}</span>
          <YakitInput value={conflictCopyName} onChange={(event) => setConflictCopyName(event.target.value)} />
        </div>
      </YakitModal>
    </div>
  )
})
