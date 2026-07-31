import { describe, expect, it, vi } from 'vitest'
import {
  createAndUploadProjectShareBundle,
  type ProjectShareBundleDependencies,
  type ProjectSharePluginMaterial,
} from '../projectShareBundle'

const plugin = (scriptName: string, hash: string): ProjectSharePluginMaterial => ({
  scriptName,
  type: 'yak',
  version: 3,
  fileHash: hash,
  contentBase64: btoa(`println("${scriptName}")`),
  metadata: {
    author: '验收',
    help: '项目插件',
    tags: ['项目'],
    params: [],
  },
})

const createDependencies = (): ProjectShareBundleDependencies => ({
  exportProjectArchive: vi.fn(async () => ({
    handle: '11111111-1111-4111-8111-111111111111',
    fileSize: 17,
    sha256: '1'.repeat(64),
  })),
  stagePlugin: vi
    .fn()
    .mockResolvedValueOnce({
      handle: '22222222-2222-4222-8222-222222222222',
      scriptName: 'first',
      type: 'yak',
      version: 3,
      fileHash: '2'.repeat(64),
      entry: 'plugins/0001.json',
      byteLength: 11,
      sha256: 'a'.repeat(64),
      metadata: plugin('first', '2'.repeat(64)).metadata,
    })
    .mockResolvedValueOnce({
      handle: '33333333-3333-4333-8333-333333333333',
      scriptName: 'second',
      type: 'yak',
      version: 3,
      fileHash: '3'.repeat(64),
      entry: 'plugins/0002.json',
      byteLength: 12,
      sha256: 'b'.repeat(64),
      metadata: plugin('second', '3'.repeat(64)).metadata,
    }),
  createBundle: vi.fn(async () => ({
    handle: '44444444-4444-4444-8444-444444444444',
    bundleId: '55555555-5555-4555-8555-555555555555',
    fileSize: 4_194_305,
    archiveSha256: '4'.repeat(64),
    manifestSha256: '5'.repeat(64),
    chunkSize: 4_194_304 as const,
    chunkCount: 2,
  })),
  readBundleChunk: vi.fn(async ({ index }) => ({
    rawBase64: index === 0 ? 'YQ==' : 'Yg==',
    byteLength: 1,
    sha256: String(index + 6).repeat(64),
  })),
  removeManagedHandle: vi.fn(async () => undefined),
  createRemoteBundle: vi.fn(async () => ({
    id: 1,
    team_id: 7,
    source_project_id: 9,
    bundle_id: '55555555-5555-4555-8555-555555555555',
    status: 'staging' as const,
    failure_code: '',
    manifest_sha256: '5'.repeat(64),
    archive_sha256: '4'.repeat(64),
    file_size: 4_194_305,
    chunk_size: 4_194_304,
    chunk_count: 2,
    uploaded_chunks: [0],
    version: 1,
    created_at: '2026-07-31T00:00:00.000Z',
    updated_at: '2026-07-31T00:00:00.000Z',
  })),
  uploadRemoteChunk: vi.fn(async (_teamId, _projectId, bundleId, index, input) => ({
    bundle_id: bundleId,
    chunk_index: index,
    byte_length: input.byte_length,
    sha256: input.sha256,
    status: 'uploaded' as const,
  })),
  finalizeRemoteBundle: vi
    .fn()
    .mockResolvedValueOnce({
      id: 1,
      team_id: 7,
      source_project_id: 9,
      bundle_id: '55555555-5555-4555-8555-555555555555',
      status: 'finalizing',
      failure_code: '',
      manifest_sha256: '5'.repeat(64),
      archive_sha256: '4'.repeat(64),
      file_size: 4_194_305,
      chunk_size: 4_194_304,
      chunk_count: 2,
      uploaded_chunks: [0, 1],
      version: 2,
      created_at: '2026-07-31T00:00:00.000Z',
      updated_at: '2026-07-31T00:00:00.000Z',
    })
    .mockResolvedValueOnce({
      id: 1,
      team_id: 7,
      source_project_id: 9,
      bundle_id: '55555555-5555-4555-8555-555555555555',
      status: 'ready',
      failure_code: '',
      manifest_sha256: '5'.repeat(64),
      archive_sha256: '4'.repeat(64),
      file_size: 4_194_305,
      chunk_size: 4_194_304,
      chunk_count: 2,
      uploaded_chunks: [0, 1],
      version: 3,
      created_at: '2026-07-31T00:00:00.000Z',
      updated_at: '2026-07-31T00:00:00.000Z',
    }),
  sleep: vi.fn(async () => undefined),
})

describe('项目分享包发布', () => {
  it('导出当前本地项目、暂存精确插件、续传缺失分块并等待 ready', async () => {
    const dependencies = createDependencies()

    const result = await createAndUploadProjectShareBundle(
      {
        teamId: 7,
        onlineProjectId: 9,
        localProject: { id: 17, name: '本地验收项目' },
        password: '',
        engine: {
          version: '1.4.8-beta3',
          commit: 'fixture',
          exportFormat: 'yakitproject/v1',
        },
        plugins: [plugin('first', '2'.repeat(64)), plugin('second', '3'.repeat(64))],
        bundleId: '55555555-5555-4555-8555-555555555555',
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
        operationToken: '77777777-7777-4777-8777-777777777777',
        createdAt: '2026-07-31T00:00:00.000Z',
      },
      dependencies,
    )

    expect(dependencies.exportProjectArchive).toHaveBeenCalledWith(
      { projectId: 17, password: '' },
      '77777777-7777-4777-8777-777777777777',
    )
    expect(dependencies.stagePlugin).toHaveBeenCalledTimes(2)
    expect(dependencies.createRemoteBundle).toHaveBeenCalledWith(7, 9, {
      bundle_id: '55555555-5555-4555-8555-555555555555',
      manifest_sha256: '5'.repeat(64),
      archive_sha256: '4'.repeat(64),
      file_size: 4_194_305,
      chunk_size: 4_194_304,
      chunk_count: 2,
      idempotency_key: '66666666-6666-4666-8666-666666666666',
    })
    expect(dependencies.readBundleChunk).toHaveBeenCalledTimes(1)
    expect(dependencies.readBundleChunk).toHaveBeenCalledWith({
      handle: '44444444-4444-4444-8444-444444444444',
      index: 1,
    })
    expect(dependencies.uploadRemoteChunk).toHaveBeenCalledWith(7, 9, '55555555-5555-4555-8555-555555555555', 1, {
      raw_base64: 'Yg==',
      byte_length: 1,
      sha256: '7'.repeat(64),
    })
    expect(dependencies.finalizeRemoteBundle).toHaveBeenCalledTimes(2)
    expect(vi.mocked(dependencies.sleep!).mock.calls).toEqual([[250]])
    expect(result.remote.status).toBe('ready')
    expect(result.managedHandles).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ])

    await result.dispose()
    expect(dependencies.removeManagedHandle).toHaveBeenCalledTimes(4)
  })

  it('暂存任一插件失败时清理此前创建的受管句柄且不上传', async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.stagePlugin)
      .mockReset()
      .mockResolvedValueOnce({
        handle: '22222222-2222-4222-8222-222222222222',
        scriptName: 'first',
        type: 'yak',
        version: 3,
        fileHash: '2'.repeat(64),
        entry: 'plugins/0001.json',
        byteLength: 11,
        sha256: 'a'.repeat(64),
        metadata: plugin('first', '2'.repeat(64)).metadata,
      })
      .mockRejectedValueOnce(new Error('project_share_plugin_hash_mismatch'))

    await expect(
      createAndUploadProjectShareBundle(
        {
          teamId: 7,
          onlineProjectId: 9,
          localProject: { id: 17, name: '本地验收项目' },
          password: '',
          engine: {
            version: '1.4.8-beta3',
            commit: 'fixture',
            exportFormat: 'yakitproject/v1',
          },
          plugins: [plugin('first', '2'.repeat(64)), plugin('second', '3'.repeat(64))],
          bundleId: '55555555-5555-4555-8555-555555555555',
          idempotencyKey: '66666666-6666-4666-8666-666666666666',
          operationToken: '77777777-7777-4777-8777-777777777777',
          createdAt: '2026-07-31T00:00:00.000Z',
        },
        dependencies,
      ),
    ).rejects.toThrow('project_share_plugin_hash_mismatch')

    expect(dependencies.createRemoteBundle).not.toHaveBeenCalled()
    expect(dependencies.removeManagedHandle).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222')
    expect(dependencies.removeManagedHandle).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })

  it('finalize 五分钟仍未 ready 时返回稳定错误且不伪造成功', async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.finalizeRemoteBundle)
      .mockReset()
      .mockResolvedValue({
        id: 1,
        team_id: 7,
        source_project_id: 9,
        bundle_id: '55555555-5555-4555-8555-555555555555',
        status: 'finalizing',
        failure_code: '',
        manifest_sha256: '5'.repeat(64),
        archive_sha256: '4'.repeat(64),
        file_size: 4_194_305,
        chunk_size: 4_194_304,
        chunk_count: 2,
        uploaded_chunks: [0, 1],
        version: 2,
        created_at: '2026-07-31T00:00:00.000Z',
        updated_at: '2026-07-31T00:00:00.000Z',
      })

    await expect(
      createAndUploadProjectShareBundle(
        {
          teamId: 7,
          onlineProjectId: 9,
          localProject: { id: 17, name: '本地验收项目' },
          password: '',
          engine: {
            version: '1.4.8-beta3',
            commit: 'fixture',
            exportFormat: 'yakitproject/v1',
          },
          plugins: [],
          bundleId: '55555555-5555-4555-8555-555555555555',
          idempotencyKey: '66666666-6666-4666-8666-666666666666',
          operationToken: '77777777-7777-4777-8777-777777777777',
          createdAt: '2026-07-31T00:00:00.000Z',
        },
        { ...dependencies, maxFinalizeWaitMs: 500 },
      ),
    ).rejects.toMatchObject({ code: 'project_bundle_finalize_timeout' })
  })
})
