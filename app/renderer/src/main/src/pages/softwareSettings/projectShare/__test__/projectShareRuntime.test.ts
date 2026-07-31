import { describe, expect, it, vi } from 'vitest'
import type { ProjectShareCreation, ProjectShareImportReceipt } from '@/services/teamCollaboration'
import type { UploadedProjectShareBundle } from '../projectShareBundle'
import type { ProjectShareRecoveryRecord } from '../projectShareRecovery'
import {
  importProjectShare,
  publishProjectShare,
  resumeProjectShareImport,
  type ProjectShareRuntimeDependencies,
} from '../projectShareRuntime'

const readyBundle = (): UploadedProjectShareBundle => ({
  local: {
    handle: '44444444-4444-4444-8444-444444444444',
    bundleId: '55555555-5555-4555-8555-555555555555',
    fileSize: 12,
    archiveSha256: '4'.repeat(64),
    manifestSha256: '5'.repeat(64),
    chunkSize: 4_194_304,
    chunkCount: 1,
  },
  remote: {
    id: 1,
    team_id: 7,
    source_project_id: 9,
    bundle_id: '55555555-5555-4555-8555-555555555555',
    status: 'ready',
    failure_code: '',
    manifest_sha256: '5'.repeat(64),
    archive_sha256: '4'.repeat(64),
    file_size: 12,
    chunk_size: 4_194_304,
    chunk_count: 1,
    uploaded_chunks: [0],
    version: 3,
    created_at: '2026-07-31T00:00:00.000Z',
    updated_at: '2026-07-31T00:00:00.000Z',
  },
  managedHandles: ['44444444-4444-4444-8444-444444444444'],
  dispose: vi.fn(async () => undefined),
})

const receipt = (status: ProjectShareImportReceipt['status'] = 'prepared'): ProjectShareImportReceipt => ({
  receipt_id: 9,
  share_id: 3,
  snapshot_id: 4,
  project_id: 8,
  project_key: 'imported-project',
  name: '导入项目',
  status,
  failure_code: status === 'failed' ? 'local_import_failed' : '',
  lease_expires_at: status === 'prepared' ? '2026-07-31T00:05:00.000Z' : null,
  bundle: {
    file_size: 20,
    archive_sha256: 'a'.repeat(64),
    media_type: 'application/vnd.yakit.team-project-bundle.v2+zip',
  },
  ...(status === 'completed'
    ? {
        project: {
          id: 8,
          team_id: 7,
          project_key: 'imported-project',
          name: '导入项目',
          status: 'active' as const,
        },
      }
    : {}),
  version: status === 'completed' ? 3 : 1,
})

const createRuntimeDependencies = () => {
  let recovery: ProjectShareRecoveryRecord | undefined
  const events: string[] = []
  const dependencies: ProjectShareRuntimeDependencies = {
    createAndUploadBundle: vi.fn(async () => readyBundle()),
    createShare: vi.fn(async (): Promise<ProjectShareCreation> => {
      events.push('create-share')
      return {
        share: {
          id: 21,
          team_id: 7,
          project_id: 9,
          snapshot_id: 12,
          binding_version: 2,
          name: '验收密令',
          expires_at: null,
          max_uses: 1,
          used_count: 0,
          enabled: true,
          revoked_at: null,
          invalidated_at: null,
          invalidated_reason: '',
          created_by: 1,
          version: 1,
          created_at: '2026-07-31T00:00:00.000Z',
          updated_at: '2026-07-31T00:00:00.000Z',
        },
        token: 'one-time-token',
      }
    }),
    prepareImport: vi.fn(async () => {
      events.push('prepare')
      return receipt()
    }),
    resumeImport: vi.fn(async () => receipt()),
    heartbeatImport: vi.fn(async () => receipt()),
    completeImport: vi.fn(async () => {
      events.push('complete')
      return receipt('completed')
    }),
    failImport: vi.fn(async () => receipt('failed')),
    getClientContext: vi.fn(async () => ({
      clientId: 'desktop-client',
    })),
    listRecoveries: vi.fn(async () => (recovery ? [recovery] : [])),
    upsertRecovery: vi.fn(async ({ expectedRevision, record }) => {
      expect(record.revision).toBe(expectedRevision)
      recovery = {
        ...record,
        revision: expectedRevision + 1,
        updatedAt: '2026-07-31T00:01:00.000Z',
      } as ProjectShareRecoveryRecord
      events.push(`recovery:${recovery.status}`)
      return recovery
    }),
    releaseRecoveryHandle: vi.fn(async ({ handle, expectedRevision }) => {
      if (!recovery || recovery.revision !== expectedRevision) throw new Error('project_share_recovery_conflict')
      recovery = {
        ...recovery,
        managedHandles: recovery.managedHandles.filter((item) => item.handle !== handle),
        revision: recovery.revision + 1,
      } as ProjectShareRecoveryRecord
      events.push(`release:${handle}`)
      return recovery
    }),
    removeRecovery: vi.fn(async ({ expectedRevision }) => {
      if (!recovery || recovery.revision !== expectedRevision || recovery.managedHandles.length) {
        throw new Error('project_share_recovery_conflict')
      }
      events.push('remove-recovery')
      recovery = undefined
    }),
    downloadImportBundle: vi.fn(async () => {
      events.push('download')
      return {
        handle: '11111111-1111-4111-8111-111111111111',
        fileSize: 20,
        archiveSha256: 'a'.repeat(64),
      }
    }),
    extractBundle: vi.fn(async () => {
      events.push('extract')
      return {
        bundleId: '55555555-5555-4555-8555-555555555555',
        projectArchiveHandle: '22222222-2222-4222-8222-222222222222',
        projectArchiveSize: 12,
        projectArchiveSha256: '2'.repeat(64),
        plugins: [
          {
            handle: '33333333-3333-4333-8333-333333333333',
            scriptName: 'project-plugin',
            type: 'yak',
            version: 2,
            fileHash: '3'.repeat(64),
            entry: 'plugins/0001.json',
            byteLength: 10,
            sha256: '3'.repeat(64),
            metadata: {
              author: '验收',
              help: '项目插件',
              tags: ['项目'],
              params: [],
            },
          },
        ],
      }
    }),
    readPluginContent: vi.fn(async () => ({
      contentBase64: 'cHJpbnRsbigxKQ==',
      byteLength: 10,
      sha256: '3'.repeat(64),
    })),
    importProjectArchive: vi.fn(async () => {
      if (!recovery) throw new Error('missing recovery')
      recovery = {
        ...recovery,
        status: 'project_imported',
        localProjectId: 41,
        revision: recovery.revision + 2,
      } as ProjectShareRecoveryRecord
      events.push('import-project')
      return {
        localProjectId: 41,
        localProjectName: '本地项目',
      }
    }),
    resolveImportedProject: vi.fn(async () => null),
    installPlugin: vi.fn(async () => {
      events.push('install-plugin')
    }),
    createUUID: vi
      .fn()
      .mockReturnValueOnce('55555555-5555-4555-8555-555555555555')
      .mockReturnValueOnce('66666666-6666-4666-8666-666666666666')
      .mockReturnValueOnce('77777777-7777-4777-8777-777777777777')
      .mockReturnValueOnce('88888888-8888-4888-8888-888888888888'),
    createNonce: vi.fn(() => '0123456789abcdef0123456789abcdef'),
    now: vi.fn(() => new Date('2026-07-31T00:00:00.000Z')),
    startHeartbeat: vi.fn(() => () => undefined),
  }
  return {
    dependencies,
    events,
    getRecovery: () => recovery,
    setRecovery: (value: ProjectShareRecoveryRecord | undefined) => {
      recovery = value
    },
  }
}

describe('项目分享运行时', () => {
  it('只在远端 bundle ready 后创建一次性密令并清理本地发布句柄', async () => {
    const { dependencies, events } = createRuntimeDependencies()
    const bundle = readyBundle()
    vi.mocked(dependencies.createAndUploadBundle).mockImplementation(async () => {
      events.push('bundle-ready')
      return bundle
    })

    const created = await publishProjectShare(
      {
        teamId: 7,
        onlineProjectId: 9,
        localProject: { id: 17, name: '本地项目' },
        password: '',
        engine: {
          version: '1.4.8-beta3',
          commit: 'fixture',
          exportFormat: 'yakitproject/v1',
        },
        plugins: [],
        name: '验收密令',
        expiresAt: null,
        maxUses: 1,
        enabled: true,
      },
      dependencies,
    )

    expect(created.token).toBe('one-time-token')
    expect(events).toEqual(['bundle-ready', 'create-share'])
    expect(dependencies.createShare).toHaveBeenCalledWith(7, 9, {
      bundle_id: '55555555-5555-4555-8555-555555555555',
      name: '验收密令',
      expires_at: null,
      max_uses: 1,
      enabled: true,
    })
    expect(bundle.dispose).toHaveBeenCalledTimes(1)
  })

  it('按 prepare、持久化、下载、解包、本地导入、插件安装、complete 顺序恢复完整环境', async () => {
    const { dependencies, events, getRecovery } = createRuntimeDependencies()

    const result = await importProjectShare(
      {
        token: 'share-token',
        projectKey: 'imported-project',
        name: '导入项目',
        localProjectName: '本地项目',
        password: '',
        folderId: 0,
        childFolderId: 0,
        projectType: 'project',
      },
      dependencies,
    )

    expect(result).toEqual({
      localProjectId: 41,
      localProjectName: '本地项目',
      onlineProjectId: 8,
    })
    expect(getRecovery()).toBeUndefined()
    expect(events.indexOf('prepare')).toBeLessThan(events.indexOf('recovery:prepared'))
    expect(events.indexOf('recovery:prepared')).toBeLessThan(events.indexOf('download'))
    expect(events.indexOf('download')).toBeLessThan(events.indexOf('extract'))
    expect(events.indexOf('extract')).toBeLessThan(events.indexOf('import-project'))
    expect(events.indexOf('import-project')).toBeLessThan(events.indexOf('install-plugin'))
    expect(events.indexOf('install-plugin')).toBeLessThan(events.indexOf('complete'))
    expect(events.indexOf('complete')).toBeLessThan(events.indexOf('remove-recovery'))
    expect(dependencies.downloadImportBundle).toHaveBeenCalledWith({
      receiptId: 9,
      expectedSize: 20,
      expectedSha256: 'a'.repeat(64),
    })
    expect(dependencies.installPlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        localProjectId: 41,
        plugin: expect.objectContaining({
          scriptName: 'project-plugin',
          version: 2,
          fileHash: '3'.repeat(64),
        }),
        contentBase64: 'cHJpbnRsbigxKQ==',
      }),
    )
  })

  it('complete 响应丢失后保留 completing 记录，恢复时不重复导入项目', async () => {
    const { dependencies, setRecovery, getRecovery } = createRuntimeDependencies()
    setRecovery({
      schema: 'yakit.project-share-recovery/v1',
      receiptId: 9,
      shareId: 3,
      snapshotId: 4,
      onlineProjectId: 8,
      projectKey: 'imported-project',
      name: '导入项目',
      localProjectName: '本地项目',
      localImportName: '__yakit_share_9_0123456789abcdef0123456789abcdef',
      folderId: 0,
      childFolderId: 0,
      projectType: 'project',
      managedHandles: [],
      expectedSize: 20,
      expectedSha256: 'a'.repeat(64),
      clientId: 'desktop-client',
      idempotencyKey: '88888888-8888-4888-8888-888888888888',
      status: 'completing',
      revision: 11,
      updatedAt: '2026-07-31T00:00:00.000Z',
      localProjectId: 41,
    })
    vi.mocked(dependencies.resumeImport).mockResolvedValue(receipt('completed'))

    const result = await resumeProjectShareImport(9, {}, dependencies)

    expect(result.localProjectId).toBe(41)
    expect(dependencies.prepareImport).not.toHaveBeenCalled()
    expect(dependencies.downloadImportBundle).not.toHaveBeenCalled()
    expect(dependencies.importProjectArchive).not.toHaveBeenCalled()
    expect(dependencies.installPlugin).not.toHaveBeenCalled()
    expect(getRecovery()).toBeUndefined()
  })

  it('completing 回执仍为 prepared 时只重试 complete', async () => {
    const { dependencies, setRecovery, getRecovery } = createRuntimeDependencies()
    setRecovery({
      schema: 'yakit.project-share-recovery/v1',
      receiptId: 9,
      shareId: 3,
      snapshotId: 4,
      onlineProjectId: 8,
      projectKey: 'imported-project',
      name: '导入项目',
      localProjectName: '本地项目',
      localImportName: '__yakit_share_9_0123456789abcdef0123456789abcdef',
      folderId: 0,
      childFolderId: 0,
      projectType: 'project',
      managedHandles: [],
      expectedSize: 20,
      expectedSha256: 'a'.repeat(64),
      clientId: 'desktop-client',
      idempotencyKey: '88888888-8888-4888-8888-888888888888',
      status: 'completing',
      revision: 11,
      updatedAt: '2026-07-31T00:00:00.000Z',
      localProjectId: 41,
    })

    const result = await resumeProjectShareImport(9, {}, dependencies)

    expect(result.localProjectId).toBe(41)
    expect(dependencies.completeImport).toHaveBeenCalledTimes(1)
    expect(dependencies.downloadImportBundle).not.toHaveBeenCalled()
    expect(dependencies.extractBundle).not.toHaveBeenCalled()
    expect(dependencies.importProjectArchive).not.toHaveBeenCalled()
    expect(dependencies.installPlugin).not.toHaveBeenCalled()
    expect(getRecovery()).toBeUndefined()
  })

  it('renaming_project 恢复时先按本地项目 ID 对账再安装剩余插件', async () => {
    const { dependencies, setRecovery, getRecovery } = createRuntimeDependencies()
    setRecovery({
      schema: 'yakit.project-share-recovery/v1',
      receiptId: 9,
      shareId: 3,
      snapshotId: 4,
      onlineProjectId: 8,
      projectKey: 'imported-project',
      name: '导入项目',
      localProjectName: '本地项目',
      localImportName: '__yakit_share_9_0123456789abcdef0123456789abcdef',
      folderId: 0,
      childFolderId: 0,
      projectType: 'project',
      managedHandles: [
        {
          kind: 'project_archive',
          handle: '22222222-2222-4222-8222-222222222222',
          byteLength: 12,
          sha256: '2'.repeat(64),
        },
        {
          kind: 'plugin',
          handle: '33333333-3333-4333-8333-333333333333',
          byteLength: 10,
          sha256: '3'.repeat(64),
          scriptName: 'project-plugin',
          type: 'yak',
          version: 2,
          fileHash: '3'.repeat(64),
          entry: 'plugins/0001.json',
          metadata: {
            author: '验收',
            help: '项目插件',
            tags: ['项目'],
            params: [],
          },
        },
      ],
      expectedSize: 20,
      expectedSha256: 'a'.repeat(64),
      clientId: 'desktop-client',
      idempotencyKey: '88888888-8888-4888-8888-888888888888',
      status: 'renaming_project',
      revision: 8,
      updatedAt: '2026-07-31T00:00:00.000Z',
      localProjectId: 41,
    })
    vi.mocked(dependencies.resolveImportedProject).mockImplementation(async () => {
      const current = getRecovery()
      if (!current) throw new Error('missing recovery')
      setRecovery({
        ...current,
        status: 'project_imported',
        revision: current.revision + 1,
      } as ProjectShareRecoveryRecord)
      return { localProjectId: 41, localProjectName: '本地项目' }
    })

    const result = await resumeProjectShareImport(9, {}, dependencies)

    expect(result.localProjectId).toBe(41)
    expect(dependencies.resolveImportedProject).toHaveBeenCalledWith(9)
    expect(dependencies.downloadImportBundle).not.toHaveBeenCalled()
    expect(dependencies.importProjectArchive).not.toHaveBeenCalled()
    expect(dependencies.installPlugin).toHaveBeenCalledTimes(1)
    expect(getRecovery()).toBeUndefined()
  })
})
