import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
  listAuditLogs,
  listProjectMembers,
  listTeamMembers,
  listTeamProjects,
  listTeams,
  listTestData,
  listTestResults,
  updateProjectSnapshot,
} from '@/services/teamCollaboration'
import { publishTeamProjectBundle, restoreTeamProjectBundle, type ProjectBundleProgress } from './teamProjectBundle'
import { createDefaultTeamProjectBundleDependencies } from './teamProjectBundleRuntime'
import styles from './TeamCollaborationPage.module.css'

type ApiEntity = Record<string, any>
type ApiFunction = (...args: any[]) => Promise<any>

const getValue = (record: ApiEntity | undefined, keys: string[], fallback: any = ''): any => {
  if (!record) return fallback
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return fallback
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

const getErrorStatus = (error: any): number =>
  Number(error?.response?.status || error?.status || error?.response?.data?.code || error?.code || 0)

const getErrorMessage = (error: any): string =>
  `${error?.response?.data?.message || error?.message || error || '请求失败'}`

const formatTime = (value: any): string => {
  if (!value) return '暂无同步记录'
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? `${value}` : time.toLocaleString('zh-CN', { hour12: false })
}

const getMembershipTeamId = (membership: ApiEntity): string => {
  const teamId = getId(getValue(membership, ['team'], undefined))
  if (teamId) return teamId
  return `${getValue(membership, ['team_id', 'teamId'], getValue(membership?.member, ['team_id', 'teamId']))}`
}

const mergeTeamMemberships = (teams: ApiEntity[], memberships: ApiEntity[]): ApiEntity[] => {
  const membershipByTeamId = new Map<string, ApiEntity>()
  memberships.forEach((membership) => {
    const teamId = getMembershipTeamId(membership)
    if (teamId) membershipByTeamId.set(teamId, membership)
  })
  return teams.map((team) => {
    const membership = membershipByTeamId.get(getId(team))
    if (!membership) return team
    return {
      ...team,
      current_member: getValue(membership, ['member'], undefined),
      current_user_roles: getValue(membership, ['roles'], []),
      permissions: getValue(membership, ['permissions'], []),
    }
  })
}

const getTeamRoleCodes = (team: ApiEntity): string[] => {
  const roles = getValue(team, ['current_user_roles', 'roles'], [])
  const roleCodes = Array.isArray(roles)
    ? roles.map((role) => (typeof role === 'string' ? role : getValue(role, ['code', 'name'], '')))
    : []
  roleCodes.push(getValue(team, ['role', 'role_name', 'roleName', 'current_user_role'], ''))
  return roleCodes.map((role) => `${role}`.trim().toLowerCase()).filter(Boolean)
}

const hasTeamPermission = (team: ApiEntity | undefined, requiredCodes: string[]): boolean => {
  if (!team) return false
  if (getValue(team, ['can_write', 'canWrite'], false) === true) return true
  if (getTeamRoleCodes(team).some((role) => ['owner', 'admin', 'administrator', 'superadmin'].includes(role))) {
    return true
  }
  const permissions = getValue(team, ['permissions', 'permission_codes', 'permissionCodes'], [])
  if (!Array.isArray(permissions)) return false
  const permissionCodes = permissions.map((permission) => `${permission}`)
  return permissionCodes.includes('*') || requiredCodes.some((permission) => permissionCodes.includes(permission))
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
  const [teams, setTeams] = useState<ApiEntity[]>([])
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
  const [snapshotText, setSnapshotText] = useState('{}')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [syncConflict, setSyncConflict] = useState(false)

  const selectedTeam = useMemo(() => teams.find((team) => getId(team) === selectedTeamId), [selectedTeamId, teams])
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
  const canManageProject = useMemo(() => hasTeamPermission(selectedTeam, ['project.manage']), [selectedTeam])
  const canWriteTestData = useMemo(() => hasTeamPermission(selectedTeam, ['test_data.write']), [selectedTeam])
  const canWriteTestResult = useMemo(() => hasTeamPermission(selectedTeam, ['test_result.write']), [selectedTeam])
  const canReadAudit = useMemo(() => hasTeamPermission(selectedTeam, ['audit.read']), [selectedTeam])
  const canPublishProject = canManageProject && canWriteTestData
  const canWrite = canManageProject || canWriteTestData || canWriteTestResult

  const loadTeams = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const [teamResponse, currentUserResponse] = await Promise.all([
        callApi(listTeams as ApiFunction),
        callApi(getMe as ApiFunction),
      ])
      const nextTeams = mergeTeamMemberships(
        getList(teamResponse, ['teams']),
        getList(currentUserResponse, ['memberships']),
      )
      setTeams(nextTeams)
      setSelectedTeamId((current) => {
        if (nextTeams.some((team) => getId(team) === current)) return current
        return getId(nextTeams[0])
      })
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      setTeams([])
      setSelectedTeamId('')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTeamContext = useCallback(async (teamId: string) => {
    if (!teamId) return
    setDetailLoading(true)
    setErrorMessage('')
    const [memberResult, projectResult] = await Promise.allSettled([
      callApi(listTeamMembers as ApiFunction, teamId),
      callApi(listTeamProjects as ApiFunction, teamId),
    ])
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
  }, [])

  const loadSync = useCallback(async (teamId: string, projectId: string) => {
    if (!teamId || !projectId) return
    setActionLoading('sync')
    setSyncConflict(false)
    try {
      const response = await callApi(getProjectSync as ApiFunction, teamId, projectId)
      setSyncInfo((response?.data || response) as ApiEntity)
    } catch (error) {
      if (getErrorStatus(error) === 409 || getErrorMessage(error).includes('version_conflict')) {
        setSyncConflict(true)
      } else {
        setErrorMessage(getErrorMessage(error))
      }
    } finally {
      setActionLoading('')
    }
  }, [])

  const loadProjectContext = useCallback(
    async (teamId: string, projectId: string) => {
      if (!teamId || !projectId) return
      setDetailLoading(true)
      setErrorMessage('')
      const auditRequest = canReadAudit
        ? callApi(listAuditLogs as ApiFunction, teamId, { project_id: projectId })
        : Promise.resolve([])
      const [memberResult, dataResult, resultResult, auditResult] = await Promise.allSettled([
        callApi(listProjectMembers as ApiFunction, teamId, projectId),
        callApi(listTestData as ApiFunction, teamId, projectId),
        callApi(listTestResults as ApiFunction, teamId, projectId),
        auditRequest,
      ])
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
    [canReadAudit, loadSync],
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

  useEffect(() => {
    loadTeams()
    loadLocalProjects()
  }, [loadLocalProjects, loadTeams])

  useEffect(() => {
    setSelectedProjectId('')
    setSyncInfo(undefined)
    setSyncConflict(false)
    loadTeamContext(selectedTeamId)
  }, [loadTeamContext, selectedTeamId])

  useEffect(() => {
    loadProjectContext(selectedTeamId, selectedProjectId)
  }, [loadProjectContext, selectedProjectId, selectedTeamId])

  useEffect(() => {
    const name = getValue(selectedProject, ['name', 'project_name', 'projectName'], '')
    setLocalCopyName(name ? `${name}-本地副本` : '')
    setBundleMessage('')
    setLocalProjectConflict(undefined)
    setConflictCopyName('')
  }, [selectedProjectId])

  const updateBundleProgress = useCallback((progress: ProjectBundleProgress) => {
    const labels = { export: '导出本地项目', upload: '上传项目归档', download: '下载项目归档', import: '导入本地副本' }
    setBundleMessage(`${labels[progress.stage]}：${progress.completed}/${progress.total}`)
  }, [])

  const publishLocalProject = useCallback(async () => {
    if (!selectedTeamId || !selectedProjectId || !selectedLocalProject || !canPublishProject) return
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
    loadProjectContext,
    loadTeamContext,
    selectedLocalProject,
    selectedProjectId,
    selectedTeamId,
    updateBundleProgress,
  ])

  const executeProjectDownload = useCallback(
    async (name: string, overwriteProject?: ApiEntity) => {
      if (!selectedTeamId || !selectedProjectId || !name) return
      setActionLoading('download-project-bundle')
      setErrorMessage('')
      setBundleMessage('')
      try {
        const remoteVersion = getValue(syncInfo, ['version', 'Version'], undefined)
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
    [loadLocalProjects, selectedProjectId, selectedTeamId, syncInfo, updateBundleProgress],
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
    if (!selectedTeamId || !canManageProject || !name) return
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
  }, [canManageProject, loadTeamContext, projectName, selectedTeamId])

  const updateSnapshot = useCallback(async () => {
    if (!selectedTeamId || !selectedProjectId || !canManageProject) return
    let snapshot: ApiEntity
    try {
      snapshot = JSON.parse(snapshotText)
      if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== 'object') throw new Error('invalid')
    } catch {
      setErrorMessage('快照必须是 JSON 对象')
      return
    }
    setActionLoading('snapshot')
    setErrorMessage('')
    setSyncConflict(false)
    try {
      await callApi(updateProjectSnapshot as ApiFunction, selectedTeamId, selectedProjectId, {
        snapshot,
        version: Number(getValue(syncInfo || selectedProject, ['version', 'Version'], 0)),
      })
      await loadSync(selectedTeamId, selectedProjectId)
    } catch (error) {
      if (getErrorStatus(error) === 409 || getErrorMessage(error).includes('version_conflict')) {
        setSyncConflict(true)
      } else {
        setErrorMessage(getErrorMessage(error))
      }
    } finally {
      setActionLoading('')
    }
  }, [canManageProject, loadSync, selectedProject, selectedProjectId, selectedTeamId, snapshotText, syncInfo])

  const addTestData = useCallback(async () => {
    const name = testDataName.trim()
    if (!selectedTeamId || !selectedProjectId || !canWriteTestData || !name) return
    setActionLoading('test-data')
    try {
      await callApi(createTestData as ApiFunction, selectedTeamId, selectedProjectId, {
        name,
        type: 'manual',
        deduplication_key: `manual-data:${Date.now()}`,
        content: '{}',
      })
      setTestDataName('')
      const response = await callApi(listTestData as ApiFunction, selectedTeamId, selectedProjectId)
      setTestData(getList(response, ['test_data', 'testData']))
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setActionLoading('')
    }
  }, [canWriteTestData, selectedProjectId, selectedTeamId, testDataName])

  const addTestResult = useCallback(async () => {
    const name = testResultName.trim()
    if (!selectedTeamId || !selectedProjectId || !canWriteTestResult || !name) return
    setActionLoading('test-result')
    try {
      await callApi(createTestResult as ApiFunction, selectedTeamId, selectedProjectId, {
        name,
        type: 'manual',
        deduplication_key: `manual-result:${Date.now()}`,
        status: 'pending',
        content: JSON.stringify({ summary: '' }),
      })
      setTestResultName('')
      const response = await callApi(listTestResults as ApiFunction, selectedTeamId, selectedProjectId)
      setTestResults(getList(response, ['test_results', 'testResults']))
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setActionLoading('')
    }
  }, [canWriteTestResult, selectedProjectId, selectedTeamId, testResultName])

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
            style={{ flex: 1 }}
            value={selectedTeamId || undefined}
            placeholder="请选择团队"
            onChange={(value) => setSelectedTeamId(`${value}`)}
            disabled={loading || teams.length === 0}
          >
            {teams.map((team) => (
              <YakitSelect.Option key={getId(team)} value={getId(team)}>
                {getValue(team, ['name', 'team_name', 'teamName'], '未命名团队')}
              </YakitSelect.Option>
            ))}
          </YakitSelect>
          <YakitTag color={canWrite ? 'green' : 'blue'}>{canWrite ? '可编辑' : '只读'}</YakitTag>
          <YakitButton type="outline1" onClick={loadTeams} loading={loading}>
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
                      <span>项目版本 {getValue(syncInfo || selectedProject, ['version', 'Version'], 0)}</span>
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
                        />
                        <YakitButton
                          type="outline1"
                          onClick={downloadLocalProject}
                          disabled={!localCopyName.trim()}
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
                        {formatTime(getValue(syncInfo, ['last_sync_at', 'lastSyncAt', 'synced_at', 'updated_at']))}
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
                          loading={actionLoading === 'sync'}
                        >
                          重试同步
                        </YakitButton>
                      </div>
                    )}
                    <YakitInput.TextArea
                      rows={5}
                      value={snapshotText}
                      onChange={(event) => setSnapshotText(event.target.value)}
                      disabled={!canManageProject}
                      aria-label="项目快照"
                    />
                    <div className={styles['actions']}>
                      <YakitButton
                        type="outline1"
                        onClick={() => loadSync(selectedTeamId, selectedProjectId)}
                        loading={actionLoading === 'sync'}
                      >
                        同步项目
                      </YakitButton>
                      <YakitButton
                        onClick={updateSnapshot}
                        disabled={!canManageProject}
                        loading={actionLoading === 'snapshot'}
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
                          disabled={!canWriteTestData}
                          loading={actionLoading === 'test-data'}
                          onChange={setTestDataName}
                          onCreate={addTestData}
                        />
                      }
                    >
                      {(item) => (
                        <div className={styles['entity-row']} key={getId(item)}>
                          <span>{getValue(item, ['name', 'title'], '未命名数据')}</span>
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
                          disabled={!canWriteTestResult}
                          loading={actionLoading === 'test-result'}
                          onChange={setTestResultName}
                          onCreate={addTestResult}
                        />
                      }
                    >
                      {(item) => (
                        <div className={styles['result-row']} key={getId(item)}>
                          <div>
                            <span>{getValue(item, ['name', 'title'], '未命名结果')}</span>
                            <small>{getValue(item, ['summary', 'message'], '')}</small>
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
            onClick={overwriteConflictProject}
          >
            覆盖本地副本
          </YakitButton>,
          <YakitButton
            key="copy"
            type="primary"
            loading={actionLoading === 'download-project-bundle'}
            disabled={
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
