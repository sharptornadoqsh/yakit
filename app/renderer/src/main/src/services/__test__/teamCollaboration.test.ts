import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ProjectSync,
  type V2Response,
  bindPluginGroup,
  createPluginCategory,
  createPluginGroup,
  createProjectShare,
  createTeamPlugin,
  createTeamProject,
  createTestData,
  createTestResult,
  deletePluginCategory,
  deletePluginGroup,
  deleteTeamPlugin,
  downloadTeamPlugin,
  getMe,
  getProjectSync,
  getTeamPlugin,
  importProjectShare,
  importTeamPlugins,
  listAuditLogs,
  listPluginCategories,
  listPluginGroups,
  listProjectMembers,
  listProjectShares,
  listProjectShareUses,
  listTeamMembers,
  listTeamPlugins,
  listTeamProjects,
  listTeams,
  listTestData,
  listTestResults,
  previewProjectShare,
  revokeProjectShare,
  setPluginVisibility,
  updatePluginCategory,
  updatePluginGroup,
  updateTeamPlugin,
  updateProjectShare,
  updateProjectSnapshot,
  unbindPluginGroup,
} from '../teamCollaboration'

const mocks = vi.hoisted(() => ({
  NetWorkApi: vi.fn(),
}))

vi.mock('../fetch', () => ({
  NetWorkApi: mocks.NetWorkApi,
}))

describe('team collaboration service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.NetWorkApi.mockResolvedValue({ ok: true, data: [] })
  })

  it('uses params for v2 read requests', async () => {
    await getMe()
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({ method: 'get', url: 'v2/me', params: {} })

    await listTeams({ page: 2 })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({ method: 'get', url: 'v2/teams', params: { page: 2 } })

    await listTeamMembers(3, { limit: 10 })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/members',
      params: { limit: 10 },
    })

    await listTeamProjects(3, { status: 'active' })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/projects',
      params: { status: 'active' },
    })

    await listProjectMembers(3, 7, { page: 1 })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/projects/7/members',
      params: { page: 1 },
    })

    await getProjectSync(3, 7, '2026-07-22T00:00:00Z')
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/projects/7/sync',
      params: { since: '2026-07-22T00:00:00Z' },
    })

    await listTestData(3, 7, { keyword: 'request' })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/projects/7/test-data',
      params: { keyword: 'request' },
    })

    await listTestResults(3, 7, { keyword: 'finding' })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/projects/7/test-results',
      params: { keyword: 'finding' },
    })

    await listAuditLogs(3, { project_id: 7 })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/audit-logs',
      params: { project_id: 7 },
    })

    await listTeamPlugins(3, { group_id: 9 })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/plugins',
      params: { group_id: 9 },
    })

    await listPluginCategories(3, { page: 1 })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/plugin-categories',
      params: { page: 1 },
    })

    await listPluginGroups(3, { page: 1 })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/plugin-groups',
      params: { page: 1 },
    })

    await listProjectShares(3, 7, { status: 'enabled' })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/projects/7/shares',
      params: { status: 'enabled' },
    })

    await listProjectShareUses(3, 7, 11, { page: 1 })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/projects/7/shares/11/uses',
      params: { page: 1 },
    })
  })

  it('保留项目同步响应中的删除记录', async () => {
    const syncResponse: V2Response<ProjectSync> = {
      ok: true,
      data: {
        server_time: '2026-07-26T12:00:00Z',
        project_members: [],
        test_data: [],
        test_results: [],
        tombstones: {
          project_members: [{ id: 11, deleted_at: '2026-07-26T11:57:00Z' }],
          test_data: [{ id: 12, deleted_at: '2026-07-26T11:58:00Z' }],
          test_results: [{ id: 13, deleted_at: '2026-07-26T11:59:00Z' }],
        },
      },
    }
    mocks.NetWorkApi.mockResolvedValueOnce(syncResponse)

    await expect(getProjectSync(3, 7, '2026-07-26T11:00:00Z')).resolves.toEqual(syncResponse)
  })

  it('兼容不含删除记录字段的旧项目同步响应', async () => {
    const legacyResponse: V2Response<ProjectSync> = {
      ok: true,
      data: {
        server_time: '2026-07-26T12:01:00Z',
        project_members: [],
        test_data: [],
        test_results: [],
      },
    }
    mocks.NetWorkApi.mockResolvedValueOnce(legacyResponse)

    const legacySync = await getProjectSync(3, 7)
    expect(legacySync.data.tombstones).toBeUndefined()
  })

  it('uses data for v2 write requests', async () => {
    const project = { project_key: 'alpha', name: 'Alpha' }
    await createTeamProject(3, project)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/teams/3/projects',
      data: project,
    })

    const snapshot = { version: 2, snapshot: { tasks: [] } }
    await updateProjectSnapshot(3, 7, snapshot)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'patch',
      url: 'v2/teams/3/projects/7/snapshot',
      data: snapshot,
    })

    const testData = {
      name: 'request',
      type: 'http-flow',
      metadata: { protocol: 'http' },
      content: JSON.stringify({ request: 'GET /' }),
    }
    await createTestData(3, 7, testData)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/teams/3/projects/7/test-data',
      data: testData,
    })

    const testResult = {
      name: 'finding',
      type: 'risk',
      metadata: { scanner: 'baseline' },
      content: JSON.stringify({ severity: 'high' }),
    }
    await createTestResult(3, 7, testResult)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/teams/3/projects/7/test-results',
      data: testResult,
    })

    const pluginImport = { plugins: [{ script_name: 'scanner', type: 'yak', content: 'println(1)' }] }
    await importTeamPlugins(3, pluginImport)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/teams/3/plugins/import',
      data: pluginImport,
    })

    const plugin = {
      script_name: 'scanner',
      type: 'yak',
      content: 'println(1)',
      description: '团队扫描插件',
      tags: ['scanner'],
      enabled: true,
      visibility: 'team' as const,
      category_id: 4,
      group_ids: [9],
    }
    await createTeamPlugin(3, plugin)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/teams/3/plugins',
      data: plugin,
    })

    const updatedPlugin = {
      ...plugin,
      script_name: 'scanner-v2',
      content: 'println(2)',
      change_note: '更新检测逻辑',
      revision: 4,
    }
    await updateTeamPlugin(3, 5, updatedPlugin)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'patch',
      url: 'v2/teams/3/plugins/5',
      data: updatedPlugin,
    })

    await deleteTeamPlugin(3, 5)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'delete',
      url: 'v2/teams/3/plugins/5',
      data: undefined,
    })
    await deleteTeamPlugin(3, 5, { cascade: true })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'delete',
      url: 'v2/teams/3/plugins/5?cascade=true',
      data: undefined,
    })

    const category = { name: 'Web', description: 'Web 插件', sort_order: 1, status: 'active' }
    await createPluginCategory(3, category)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/teams/3/plugin-categories',
      data: category,
    })
    await updatePluginCategory(3, 4, { ...category, name: 'Web 安全' })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'patch',
      url: 'v2/teams/3/plugin-categories/4',
      data: { ...category, name: 'Web 安全' },
    })
    await deletePluginCategory(3, 4)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'delete',
      url: 'v2/teams/3/plugin-categories/4',
      data: undefined,
    })
    await deletePluginCategory(3, 4, { cascade: true })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'delete',
      url: 'v2/teams/3/plugin-categories/4?cascade=true',
      data: undefined,
    })

    const group = { name: '基线', description: '基线插件', sort_order: 2, status: 'active' }
    await createPluginGroup(3, group)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/teams/3/plugin-groups',
      data: group,
    })
    await updatePluginGroup(3, 9, { ...group, name: '发布基线' })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'patch',
      url: 'v2/teams/3/plugin-groups/9',
      data: { ...group, name: '发布基线' },
    })
    await deletePluginGroup(3, 9)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'delete',
      url: 'v2/teams/3/plugin-groups/9',
      data: undefined,
    })
    await deletePluginGroup(3, 9, { cascade: true })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'delete',
      url: 'v2/teams/3/plugin-groups/9?cascade=true',
      data: undefined,
    })

    await bindPluginGroup(3, 5, 9)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'put',
      url: 'v2/teams/3/plugins/5/groups/9',
      data: undefined,
    })
    await unbindPluginGroup(3, 5, 9)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'delete',
      url: 'v2/teams/3/plugins/5/groups/9',
      data: undefined,
    })

    await setPluginVisibility(3, 5, 'team', 4)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'patch',
      url: 'v2/teams/3/plugins/5/visibility',
      data: { visibility: 'team', revision: 4 },
    })

    const share = { name: 'nightly', max_uses: 5 }
    await createProjectShare(3, 7, share)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/teams/3/projects/7/shares',
      data: share,
    })

    await updateProjectShare(3, 7, 11, { version: 1, enabled: false })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'patch',
      url: 'v2/teams/3/projects/7/shares/11',
      data: { version: 1, enabled: false },
    })

    await previewProjectShare('share-token')
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/project-shares/preview',
      data: { token: 'share-token' },
    })

    await importProjectShare({ token: 'share-token', name: 'Imported' })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/project-shares/import',
      data: { token: 'share-token', name: 'Imported' },
    })
  })

  it('uses the endpoint-specific transport options for revoke and download', async () => {
    await revokeProjectShare(3, 7, 11, 2)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'delete',
      url: 'v2/teams/3/projects/7/shares/11',
      params: { version: 2 },
    })

    await downloadTeamPlugin(3, 5)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/plugins/5/download',
      params: {},
      responseType: 'arraybuffer',
    })
  })

  it('reads one team plugin from its resource endpoint', async () => {
    await getTeamPlugin(3, 5)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/plugins/5',
      params: {},
    })
  })
})
