import { describe, expect, it, vi } from 'vitest'
import {
  createProjectShareRecoveryRecord,
  disposeProjectShareRecovery,
  transitionProjectShareRecovery,
  type ProjectShareRecoveryDependencies,
  type ProjectShareRecoveryRecord,
} from '../projectShareRecovery'

const createReceipt = () => ({
  receipt_id: 9,
  share_id: 3,
  snapshot_id: 4,
  project_id: 8,
  project_key: 'imported-project',
  name: '导入项目',
  status: 'prepared' as const,
  failure_code: '',
  lease_expires_at: '2026-07-31T00:05:00.000Z',
  bundle: {
    file_size: 12,
    archive_sha256: 'a'.repeat(64),
    media_type: 'application/vnd.yakit.team-project-bundle.v2+zip' as const,
  },
  version: 1,
})

describe('项目分享恢复记录', () => {
  it('只保存恢复所需字段且不保存项目密码', () => {
    const record = createProjectShareRecoveryRecord({
      receipt: createReceipt(),
      localProjectName: '本地项目',
      localImportNonce: '0123456789abcdef0123456789abcdef',
      folderId: 0,
      childFolderId: 0,
      projectType: 'project',
      clientId: 'desktop-client',
      idempotencyKey: 'b98fe436-8005-4107-a726-1d8572248576',
      updatedAt: '2026-07-31T00:00:00.000Z',
    })

    expect(record).toEqual({
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
      expectedSize: 12,
      expectedSha256: 'a'.repeat(64),
      clientId: 'desktop-client',
      idempotencyKey: 'b98fe436-8005-4107-a726-1d8572248576',
      status: 'prepared',
      revision: 0,
      updatedAt: '2026-07-31T00:00:00.000Z',
    })
    expect(JSON.stringify(record)).not.toContain('password')
  })

  it('每次状态推进都使用最新 revision 做 CAS', async () => {
    const initial = createProjectShareRecoveryRecord({
      receipt: createReceipt(),
      localProjectName: '本地项目',
      localImportNonce: '0123456789abcdef0123456789abcdef',
      folderId: 0,
      childFolderId: 0,
      projectType: 'project',
      clientId: 'desktop-client',
      idempotencyKey: 'b98fe436-8005-4107-a726-1d8572248576',
      updatedAt: '2026-07-31T00:00:00.000Z',
    })
    const upsert = vi.fn(async ({ expectedRevision, record }) => ({
      ...record,
      revision: expectedRevision + 1,
      updatedAt: '2026-07-31T00:01:00.000Z',
    }))
    const created = await transitionProjectShareRecovery({ upsert }, initial, {})
    const downloading = await transitionProjectShareRecovery({ upsert }, created, {
      status: 'downloading',
    })

    expect(upsert.mock.calls.map((call) => call[0].expectedRevision)).toEqual([0, 1])
    expect(downloading).toMatchObject({ status: 'downloading', revision: 2 })
  })

  it('清理时先逐个 CAS 释放句柄，再用最新 revision 删除记录', async () => {
    let current: ProjectShareRecoveryRecord = {
      ...createProjectShareRecoveryRecord({
        receipt: createReceipt(),
        localProjectName: '本地项目',
        localImportNonce: '0123456789abcdef0123456789abcdef',
        folderId: 0,
        childFolderId: 0,
        projectType: 'project',
        clientId: 'desktop-client',
        idempotencyKey: 'b98fe436-8005-4107-a726-1d8572248576',
        updatedAt: '2026-07-31T00:00:00.000Z',
      }),
      revision: 4,
      managedHandles: [
        {
          kind: 'bundle',
          handle: '11111111-1111-4111-8111-111111111111',
          byteLength: 20,
          sha256: '1'.repeat(64),
        },
        {
          kind: 'project_archive',
          handle: '22222222-2222-4222-8222-222222222222',
          byteLength: 12,
          sha256: '2'.repeat(64),
        },
      ],
    }
    const dependencies: ProjectShareRecoveryDependencies = {
      upsert: vi.fn(),
      releaseHandle: vi.fn(async ({ handle, expectedRevision }) => {
        expect(expectedRevision).toBe(current.revision)
        current = {
          ...current,
          managedHandles: current.managedHandles.filter((item) => item.handle !== handle),
          revision: current.revision + 1,
        }
        return current
      }),
      remove: vi.fn(async ({ receiptId, expectedRevision }) => {
        expect({ receiptId, expectedRevision }).toEqual({
          receiptId: 9,
          expectedRevision: 6,
        })
      }),
    }

    await disposeProjectShareRecovery(dependencies, current)

    expect(dependencies.releaseHandle).toHaveBeenCalledTimes(2)
    expect(dependencies.remove).toHaveBeenCalledTimes(1)
  })
})
