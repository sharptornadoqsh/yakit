/// <reference types="vitest/globals" />

import {
  type ProjectSync,
  type V2Response,
  bindPluginGroup,
  completeProjectShareImport,
  createPluginCategory,
  createPluginGroup,
  createProjectShare,
  createProjectShareBundle,
  createTeamPlugin,
  createTeamProject,
  createTestData,
  createTestResult,
  deletePluginCategory,
  deletePluginGroup,
  deleteTeamPlugin,
  downloadTeamPlugin,
  failProjectShareImport,
  finalizeProjectShareBundle,
  getMe,
  getProjectSync,
  getTeamPlugin,
  heartbeatProjectShareImport,
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
  resumeProjectShareImport,
  revokeProjectShare,
  setPluginVisibility,
  updatePluginCategory,
  updatePluginGroup,
  updateTeamPlugin,
  updateProjectShare,
  updateProjectSnapshot,
  uploadProjectShareBundleChunk,
  unbindPluginGroup,
} from '../teamCollaboration'
import { createHash } from 'crypto'
import {
  subscribeTeamAuthenticationInvalidation,
  subscribeTeamPermissionInvalidation,
} from '../../pages/teamCollaboration/teamPermissionContext'

const mocks = vi.hoisted(() => ({
  NetWorkApi: vi.fn(),
}))

const sha256 = (value: ArrayBuffer) => createHash('sha256').update(new Uint8Array(value)).digest('hex')

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

    const bundle = {
      bundle_id: 'ef1e1ef2-f7c8-4371-a60f-0983b14518fa',
      manifest_sha256: 'a'.repeat(64),
      archive_sha256: 'b'.repeat(64),
      file_size: 1024,
      chunk_size: 4194304 as const,
      chunk_count: 1,
      idempotency_key: 'b98fe436-8005-4107-a726-1d8572248576',
    }
    await createProjectShareBundle(3, 7, bundle)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/teams/3/projects/7/share-bundles',
      data: bundle,
    })

    const chunk = {
      raw_base64: 'YQ==',
      byte_length: 1,
      sha256: 'c'.repeat(64),
    }
    await uploadProjectShareBundleChunk(3, 7, bundle.bundle_id, 0, chunk)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'put',
      url: `v2/teams/3/projects/7/share-bundles/${bundle.bundle_id}/chunks/0`,
      data: chunk,
    })

    await finalizeProjectShareBundle(3, 7, bundle.bundle_id)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: `v2/teams/3/projects/7/share-bundles/${bundle.bundle_id}/finalize`,
      data: undefined,
    })

    const share = {
      bundle_id: bundle.bundle_id,
      name: 'nightly',
      expires_at: null,
      max_uses: 5,
      enabled: true,
    }
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

    const importInput = {
      token: 'share-token',
      project_key: 'imported-project',
      name: 'Imported',
      idempotency_key: 'ed4fe8bb-f794-4334-bf0e-6100772ffbf2',
    }
    await importProjectShare(importInput)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/project-shares/import',
      data: importInput,
    })

    await resumeProjectShareImport(13)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/project-share-imports/13/resume',
      data: undefined,
    })
    await heartbeatProjectShareImport(13)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/project-share-imports/13/heartbeat',
      data: undefined,
    })
    await failProjectShareImport(13, { failure_code: 'local_import_failed' })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/project-share-imports/13/fail',
      data: { failure_code: 'local_import_failed' },
    })
    await completeProjectShareImport(13)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'post',
      url: 'v2/project-share-imports/13/complete',
      data: undefined,
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

  it('按分页契约读取插件版本并返回原始第二版响应', async () => {
    const api = await import('../teamCollaboration')
    const listTeamPluginVersions = (api as any).listTeamPluginVersions
    expect(typeof listTeamPluginVersions).toBe('function')
    const response = {
      ok: true,
      data: [
        {
          id: 17,
          team_id: 3,
          plugin_id: 5,
          version: 2,
          file_hash: 'a'.repeat(64),
          change_note: '历史版本',
          created_by: 7,
          created_at: '2026-07-30T12:00:00Z',
        },
      ],
      paging: { page: 2, limit: 10, total: 11, total_pages: 2 },
    }
    mocks.NetWorkApi.mockResolvedValueOnce(response)

    await expect(listTeamPluginVersions(3, 5, { page: 2, limit: 10 })).resolves.toBe(response)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/plugins/5/versions',
      params: { page: 2, limit: 10 },
    })
  })

  it('精确下载选中版本的原始字节且保留当前版本下载接口', async () => {
    const api = await import('../teamCollaboration')
    const downloadTeamPluginVersion = (api as any).downloadTeamPluginVersion
    expect(typeof downloadTeamPluginVersion).toBe('function')
    const bytes = new Uint8Array([0, 1, 2, 255]).buffer
    mocks.NetWorkApi.mockResolvedValueOnce({
      body: bytes,
      headers: { 'x-content-sha256': sha256(bytes), 'x-plugin-version': '2' },
    })

    await expect(downloadTeamPluginVersion(3, 5, 2)).resolves.toBe(bytes)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/plugins/5/versions/2/download',
      params: {},
      responseType: 'arraybuffer',
      includeResponseHeaders: true,
    })

    await downloadTeamPlugin(3, 5)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/plugins/5/download',
      params: {},
      responseType: 'arraybuffer',
    })
  })

  it('按后端离线清单契约读取不可变下载地址和兼容性信息', async () => {
    const api = await import('../teamCollaboration')
    const listOfflinePluginManifest = (api as any).listOfflinePluginManifest
    expect(typeof listOfflinePluginManifest).toBe('function')
    const response = {
      ok: true,
      data: [
        {
          id: 5,
          team_id: 3,
          script_name: 'offline-plugin',
          type: 'yak',
          version: 2,
          size_bytes: 12,
          file_hash: 'a'.repeat(64),
          hash_algorithm: 'sha256',
          dependencies: ['base'],
          engine_min_version: '1.0.0',
          engine_max_version: '2.0.0',
          download_url: '/api/v2/teams/3/plugins/5/versions/2/download',
          updated_at: '2026-08-13T00:00:00Z',
        },
      ],
      paging: { page: 1, limit: 20, total: 1, total_pages: 1 },
    }
    mocks.NetWorkApi.mockResolvedValueOnce(response)

    await expect(listOfflinePluginManifest(3, { limit: 20 })).resolves.toBe(response)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/plugins/offline-manifest',
      params: { limit: 20 },
    })
  })

  it('版本下载保留正文、SHA-256 摘要和不可变版本号', async () => {
    const api = await import('../teamCollaboration')
    const downloadTeamPluginVersionWithSummary = (api as any).downloadTeamPluginVersionWithSummary
    expect(typeof downloadTeamPluginVersionWithSummary).toBe('function')
    const body = new Uint8Array([1, 2, 3]).buffer
    const contentSha256 = sha256(body)
    mocks.NetWorkApi.mockResolvedValueOnce({
      body,
      headers: { 'x-content-sha256': contentSha256, 'x-plugin-version': '2' },
    })

    await expect(downloadTeamPluginVersionWithSummary(3, 5, 2)).resolves.toEqual({
      body,
      sha256: contentSha256,
      version: 2,
    })
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/plugins/5/versions/2/download',
      params: {},
      responseType: 'arraybuffer',
      includeResponseHeaders: true,
    })
  })

  it('正文与响应头摘要不匹配时拒绝版本下载', async () => {
    const api = await import('../teamCollaboration')
    const downloadTeamPluginVersionWithSummary = (api as any).downloadTeamPluginVersionWithSummary
    const body = new Uint8Array([1, 2, 3]).buffer
    mocks.NetWorkApi.mockResolvedValueOnce({
      body,
      headers: { 'x-content-sha256': 'f'.repeat(64), 'x-plugin-version': '2' },
    })

    await expect(downloadTeamPluginVersionWithSummary(3, 5, 2)).rejects.toThrow('插件正文摘要校验失败')
  })

  it('reads one team plugin from its resource endpoint', async () => {
    await getTeamPlugin(3, 5)
    expect(mocks.NetWorkApi).toHaveBeenLastCalledWith({
      method: 'get',
      url: 'v2/teams/3/plugins/5',
      params: {},
    })
  })

  it('团队接口 403 从实际请求 URL 发布精确团队失效', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTeamPermissionInvalidation(listener)
    const forbidden = { response: { status: 403 } }

    try {
      mocks.NetWorkApi.mockRejectedValueOnce(forbidden)
      await expect(listTeamMembers(37)).rejects.toBe(forbidden)
      expect(listener.mock.calls).toEqual([[37]])

      mocks.NetWorkApi.mockRejectedValueOnce(forbidden)
      await expect(createTeamProject(42, { project_key: 'p-1', name: '项目' })).rejects.toBe(forbidden)
      expect(listener.mock.calls).toEqual([[37], [42]])
    } finally {
      unsubscribe()
    }
  })

  it('包装与直连的第二版接口 401 都发布认证失效', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTeamAuthenticationInvalidation(listener)
    const unauthorized = { response: { status: 401 } }

    try {
      mocks.NetWorkApi.mockRejectedValueOnce(unauthorized)
      await expect(listTeamMembers(37)).rejects.toBe(unauthorized)

      mocks.NetWorkApi.mockRejectedValueOnce(unauthorized)
      await expect(downloadTeamPlugin(37, 9)).rejects.toBe(unauthorized)

      expect(listener).toHaveBeenCalledTimes(2)
    } finally {
      unsubscribe()
    }
  })

  it('非团队路径和非正十进制团队路径的 403 不发布团队失效', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTeamPermissionInvalidation(listener)
    const forbidden = { response: { status: 403 } }

    try {
      mocks.NetWorkApi.mockRejectedValueOnce(forbidden)
      await expect(getMe()).rejects.toBe(forbidden)

      mocks.NetWorkApi.mockRejectedValueOnce(forbidden)
      await expect(listTeamMembers(0)).rejects.toBe(forbidden)

      expect(listener).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })
})
