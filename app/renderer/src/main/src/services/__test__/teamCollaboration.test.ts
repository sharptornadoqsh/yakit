import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bindPluginGroup,
  createProjectShare,
  createTeamProject,
  createTestData,
  createTestResult,
  downloadTeamPlugin,
  getMe,
  getProjectSync,
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
  updateProjectShare,
  updateProjectSnapshot,
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

    const testData = { name: 'request', data_type: 'http-flow' }
    await createTestData(3, 7, testData)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/teams/3/projects/7/test-data',
      data: testData,
    })

    const testResult = { name: 'finding', result_type: 'risk' }
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

    await bindPluginGroup(3, 5, 9)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'put',
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
      responseType: 'blob',
    })
  })
})
