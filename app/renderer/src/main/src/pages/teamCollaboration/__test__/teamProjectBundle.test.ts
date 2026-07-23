import { vi } from 'vitest'
import {
  publishTeamProjectBundle,
  restoreTeamProjectBundle,
  type TeamProjectBundleDependencies,
} from '../teamProjectBundle'
import { PROJECT_BUNDLE_SCHEMA, type ProjectBundleManifest } from '../projectBundleData'

const baseDependencies = (): TeamProjectBundleDependencies => ({
  exportLocalProject: vi.fn(),
  inspectArchive: vi.fn(),
  readArchiveChunk: vi.fn(),
  createManagedArchive: vi.fn(),
  writeManagedArchiveChunk: vi.fn(),
  finalizeManagedArchive: vi.fn(),
  importManagedArchive: vi.fn(),
  replaceLocalProjectFromArchive: vi.fn(),
  removeManagedArchive: vi.fn(),
  getProjectSnapshot: vi.fn(),
  updateProjectSnapshot: vi.fn(),
  createTestData: vi.fn(),
  deleteTestData: vi.fn(),
  listTestData: vi.fn(),
  getTestData: vi.fn(),
  saveProjectMapping: vi.fn(),
  createBundleId: () => 'bundle-fixed',
  now: () => '2026-07-23T04:00:00.000Z',
})

describe('团队项目归档传输', () => {
  it('上传全部分块后以项目版本更新快照', async () => {
    const dependencies = baseDependencies()
    vi.mocked(dependencies.exportLocalProject).mockResolvedValue('D:/export/source.yakitproject')
    vi.mocked(dependencies.inspectArchive).mockResolvedValue({
      fileName: 'source.yakitproject',
      filePath: 'D:/export/source.yakitproject',
      size: 7,
      sha256: 'a'.repeat(64),
    })
    vi.mocked(dependencies.getProjectSnapshot).mockResolvedValue({ snapshot: { revision_note: 'keep' }, version: 9 })
    vi.mocked(dependencies.readArchiveChunk)
      .mockResolvedValueOnce({ data: 'YWJjZA==', offset: 0, length: 4 })
      .mockResolvedValueOnce({ data: 'ZWZn', offset: 4, length: 3 })
    vi.mocked(dependencies.createTestData).mockResolvedValueOnce({ id: 71 }).mockResolvedValueOnce({ id: 72 })
    vi.mocked(dependencies.updateProjectSnapshot).mockResolvedValue({ version: 10 })

    const result = await publishTeamProjectBundle(
      { teamId: 3, projectId: 8, localProject: { id: 41, name: '本地项目' }, chunkSize: 4 },
      dependencies,
    )

    expect(dependencies.createTestData).toHaveBeenCalledTimes(2)
    expect(dependencies.updateProjectSnapshot).toHaveBeenCalledWith(3, 8, {
      version: 9,
      snapshot: expect.objectContaining({
        revision_note: 'keep',
        project_bundle: expect.objectContaining({ bundle_id: 'bundle-fixed', chunk_count: 2 }),
      }),
    })
    expect(result.createdDataIds).toEqual([71, 72])
  })

  it('快照版本更新失败时清理本次创建的分块记录', async () => {
    const dependencies = baseDependencies()
    vi.mocked(dependencies.exportLocalProject).mockResolvedValue('D:/export/source.yakitproject')
    vi.mocked(dependencies.inspectArchive).mockResolvedValue({
      fileName: 'source.yakitproject',
      filePath: 'D:/export/source.yakitproject',
      size: 3,
      sha256: 'b'.repeat(64),
    })
    vi.mocked(dependencies.getProjectSnapshot).mockResolvedValue({ snapshot: {}, version: 4 })
    vi.mocked(dependencies.readArchiveChunk).mockResolvedValue({ data: 'YWJj', offset: 0, length: 3 })
    vi.mocked(dependencies.createTestData).mockResolvedValue({ id: 81 })
    vi.mocked(dependencies.updateProjectSnapshot).mockRejectedValue(new Error('version conflict'))

    await expect(
      publishTeamProjectBundle({ teamId: 3, projectId: 8, localProject: { id: 41, name: '本地项目' } }, dependencies),
    ).rejects.toThrow('version conflict')
    expect(dependencies.deleteTestData).toHaveBeenCalledWith(3, 8, 81)
  })

  it('快照已提交但响应丢失时保留已发布分块', async () => {
    const dependencies = baseDependencies()
    const committedManifest: ProjectBundleManifest = {
      schema: PROJECT_BUNDLE_SCHEMA,
      bundle_id: 'bundle-fixed',
      file_name: 'source.yakitproject',
      file_size: 3,
      sha256: 'f'.repeat(64),
      chunk_size: 3,
      chunk_count: 1,
      source_project: { id: 41, name: '本地项目' },
      created_at: '2026-07-23T04:00:00.000Z',
    }
    vi.mocked(dependencies.exportLocalProject).mockResolvedValue('D:/export/source.yakitproject')
    vi.mocked(dependencies.inspectArchive).mockResolvedValue({
      fileName: 'source.yakitproject',
      filePath: 'D:/export/source.yakitproject',
      size: 3,
      sha256: committedManifest.sha256,
    })
    vi.mocked(dependencies.getProjectSnapshot)
      .mockResolvedValueOnce({ snapshot: {}, version: 4 })
      .mockResolvedValueOnce({ snapshot: { project_bundle: committedManifest }, version: 5 })
    vi.mocked(dependencies.readArchiveChunk).mockResolvedValue({ data: 'YWJj', offset: 0, length: 3 })
    vi.mocked(dependencies.createTestData).mockResolvedValue({ id: 91 })
    vi.mocked(dependencies.updateProjectSnapshot).mockRejectedValue(new Error('socket closed'))

    const result = await publishTeamProjectBundle(
      { teamId: 3, projectId: 8, localProject: { id: 41, name: '本地项目' }, chunkSize: 3 },
      dependencies,
    )

    expect(result).toEqual({ manifest: committedManifest, createdDataIds: [91], version: 5 })
    expect(dependencies.deleteTestData).not.toHaveBeenCalled()
  })

  it('按元数据恢复密令复制后的分块并持久化本地映射', async () => {
    const dependencies = baseDependencies()
    const manifest: ProjectBundleManifest = {
      schema: PROJECT_BUNDLE_SCHEMA,
      bundle_id: 'bundle-copied',
      file_name: 'shared.yakitproject',
      file_size: 7,
      sha256: 'c'.repeat(64),
      chunk_size: 4,
      chunk_count: 2,
      source_project: { id: 41, name: '源项目' },
      created_at: '2026-07-23T04:00:00.000Z',
    }
    vi.mocked(dependencies.getProjectSnapshot).mockResolvedValue({ snapshot: { project_bundle: manifest }, version: 6 })
    vi.mocked(dependencies.listTestData).mockResolvedValue([
      {
        id: 102,
        metadata: JSON.stringify({ schema: PROJECT_BUNDLE_SCHEMA, bundle_id: manifest.bundle_id, index: 1, total: 2 }),
      },
      {
        id: 101,
        metadata: JSON.stringify({ schema: PROJECT_BUNDLE_SCHEMA, bundle_id: manifest.bundle_id, index: 0, total: 2 }),
      },
    ])
    vi.mocked(dependencies.getTestData).mockImplementation(async (_teamId, _projectId, dataId) => ({
      id: dataId,
      content:
        dataId === 101
          ? JSON.stringify({
              schema: PROJECT_BUNDLE_SCHEMA,
              bundle_id: manifest.bundle_id,
              index: 0,
              total: 2,
              data: 'YWJjZA==',
            })
          : JSON.stringify({
              schema: PROJECT_BUNDLE_SCHEMA,
              bundle_id: manifest.bundle_id,
              index: 1,
              total: 2,
              data: 'ZWZn',
            }),
    }))
    vi.mocked(dependencies.createManagedArchive).mockResolvedValue({
      fileName: 'shared-copy.yakitproject',
      filePath: 'D:/managed/shared-copy.yakitproject',
    })
    vi.mocked(dependencies.finalizeManagedArchive).mockResolvedValue({
      fileName: 'shared-copy.yakitproject',
      filePath: 'D:/managed/shared-copy.yakitproject',
      size: 7,
      sha256: 'c'.repeat(64),
    })
    vi.mocked(dependencies.importManagedArchive).mockResolvedValue({ id: 501, name: '共享项目副本' })

    const result = await restoreTeamProjectBundle(
      { teamId: 3, projectId: 88, localProjectName: '共享项目副本', onlineProjectVersion: 6 },
      dependencies,
    )

    expect(dependencies.writeManagedArchiveChunk).toHaveBeenNthCalledWith(1, {
      filePath: 'D:/managed/shared-copy.yakitproject',
      offset: 0,
      data: 'YWJjZA==',
    })
    expect(dependencies.writeManagedArchiveChunk).toHaveBeenNthCalledWith(2, {
      filePath: 'D:/managed/shared-copy.yakitproject',
      offset: 4,
      data: 'ZWZn',
    })
    expect(dependencies.saveProjectMapping).toHaveBeenCalledWith({
      teamId: 3,
      projectId: 88,
      onlineProjectVersion: 6,
      bundleId: 'bundle-copied',
      bundleSha256: 'c'.repeat(64),
      localProjectId: 501,
      localProjectName: '共享项目副本',
      importedAt: '2026-07-23T04:00:00.000Z',
    })
    expect(dependencies.removeManagedArchive).toHaveBeenCalledWith('D:/managed/shared-copy.yakitproject')
    expect(result.localProject).toEqual({ id: 501, name: '共享项目副本' })
  })

  it('重建文件摘要不一致时禁止导入', async () => {
    const dependencies = baseDependencies()
    const manifest: ProjectBundleManifest = {
      schema: PROJECT_BUNDLE_SCHEMA,
      bundle_id: 'bundle-invalid',
      file_name: 'invalid.yakitproject',
      file_size: 3,
      sha256: 'd'.repeat(64),
      chunk_size: 3,
      chunk_count: 1,
      source_project: { id: 7, name: '源项目' },
      created_at: '2026-07-23T04:00:00.000Z',
    }
    vi.mocked(dependencies.getProjectSnapshot).mockResolvedValue({ snapshot: { project_bundle: manifest }, version: 1 })
    vi.mocked(dependencies.listTestData).mockResolvedValue([
      {
        id: 1,
        metadata: JSON.stringify({ schema: PROJECT_BUNDLE_SCHEMA, bundle_id: manifest.bundle_id, index: 0, total: 1 }),
      },
    ])
    vi.mocked(dependencies.getTestData).mockResolvedValue({
      id: 1,
      content: JSON.stringify({
        schema: PROJECT_BUNDLE_SCHEMA,
        bundle_id: manifest.bundle_id,
        index: 0,
        total: 1,
        data: 'YWJj',
      }),
    })
    vi.mocked(dependencies.createManagedArchive).mockResolvedValue({
      fileName: 'invalid-copy.yakitproject',
      filePath: 'D:/managed/invalid-copy.yakitproject',
    })
    vi.mocked(dependencies.finalizeManagedArchive).mockResolvedValue({
      fileName: 'invalid-copy.yakitproject',
      filePath: 'D:/managed/invalid-copy.yakitproject',
      size: 3,
      sha256: 'e'.repeat(64),
    })

    await expect(
      restoreTeamProjectBundle({ teamId: 3, projectId: 8, localProjectName: '副本' }, dependencies),
    ).rejects.toThrow('项目归档摘要校验失败')
    expect(dependencies.importManagedArchive).not.toHaveBeenCalled()
    expect(dependencies.removeManagedArchive).toHaveBeenCalledWith('D:/managed/invalid-copy.yakitproject')
  })

  it('用户选择覆盖时通过可恢复替换流程导入同名本地项目', async () => {
    const dependencies = baseDependencies()
    const manifest: ProjectBundleManifest = {
      schema: PROJECT_BUNDLE_SCHEMA,
      bundle_id: 'bundle-overwrite',
      file_name: 'shared.yakitproject',
      file_size: 3,
      sha256: 'f'.repeat(64),
      chunk_size: 3,
      chunk_count: 1,
      source_project: { id: 7, name: '共享项目' },
      created_at: '2026-07-23T04:00:00.000Z',
    }
    const existingProject = { id: 81, name: '共享项目', type: 'project' }
    vi.mocked(dependencies.getProjectSnapshot).mockResolvedValue({ snapshot: { project_bundle: manifest }, version: 3 })
    vi.mocked(dependencies.listTestData).mockResolvedValue([
      {
        id: 1,
        metadata: JSON.stringify({ schema: PROJECT_BUNDLE_SCHEMA, bundle_id: manifest.bundle_id, index: 0, total: 1 }),
      },
    ])
    vi.mocked(dependencies.getTestData).mockResolvedValue({
      id: 1,
      content: JSON.stringify({
        schema: PROJECT_BUNDLE_SCHEMA,
        bundle_id: manifest.bundle_id,
        index: 0,
        total: 1,
        data: 'YWJj',
      }),
    })
    vi.mocked(dependencies.createManagedArchive).mockResolvedValue({
      fileName: 'shared-copy.yakitproject',
      filePath: 'D:/managed/shared-copy.yakitproject',
    })
    vi.mocked(dependencies.finalizeManagedArchive).mockResolvedValue({
      fileName: 'shared-copy.yakitproject',
      filePath: 'D:/managed/shared-copy.yakitproject',
      size: 3,
      sha256: manifest.sha256,
    })
    vi.mocked(dependencies.importManagedArchive).mockResolvedValue({ id: 999, name: '不应创建的副本' })
    vi.mocked(dependencies.replaceLocalProjectFromArchive).mockResolvedValue({
      id: 82,
      name: '共享项目',
      type: 'project',
      backupPath: 'D:/backup/shared.yakitproject',
    })

    const result = await restoreTeamProjectBundle(
      {
        teamId: 3,
        projectId: 8,
        localProjectName: '共享项目',
        overwriteLocalProject: existingProject,
      },
      dependencies,
    )

    expect(dependencies.replaceLocalProjectFromArchive).toHaveBeenCalledWith(
      'D:/managed/shared-copy.yakitproject',
      existingProject,
    )
    expect(dependencies.importManagedArchive).not.toHaveBeenCalled()
    expect(dependencies.saveProjectMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 3,
        projectId: 8,
        localProjectId: 82,
        localProjectName: '共享项目',
        bundleId: 'bundle-overwrite',
      }),
    )
    expect(result.localProject).toEqual(
      expect.objectContaining({ id: 82, name: '共享项目', backupPath: 'D:/backup/shared.yakitproject' }),
    )
  })
})
