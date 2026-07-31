import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectShareRecoveryStore } from '../projectShareRecoveryStore'

const temporaryDirectories = []

const createTemporaryDirectory = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'project-share-recovery-'))
  temporaryDirectories.push(directory)
  return directory
}

const createRecord = (overrides = {}) => ({
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
  expectedSize: 128,
  expectedSha256: 'a'.repeat(64),
  clientId: 'desktop-client',
  idempotencyKey: 'b98fe436-8005-4107-a726-1d8572248576',
  status: 'prepared',
  revision: 0,
  updatedAt: '调用方时间会被覆盖',
  ...overrides,
})
afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true })
  })
})

describe('项目分享恢复记录', () => {
  it('用 revision CAS 原子创建、更新并拒绝陈旧覆盖和删除', async () => {
    const directory = createTemporaryDirectory()
    let tick = 0
    const store = createProjectShareRecoveryStore({
      rootDirectory: directory,
      now: () => `2026-07-31T00:00:0${tick++}.000Z`,
    })

    const created = await store.upsert({
      expectedRevision: 0,
      record: createRecord(),
    })
    expect(created.revision).toBe(1)
    expect(created.updatedAt).toBe('2026-07-31T00:00:00.000Z')
    expect(fs.existsSync(path.join(directory, 'receipt-9.json'))).toBe(true)

    const updated = await store.upsert({
      expectedRevision: created.revision,
      record: {
        ...created,
        status: 'downloading',
      },
    })
    expect(updated.revision).toBe(2)
    await expect(
      store.upsert({
        expectedRevision: created.revision,
        record: {
          ...created,
          status: 'downloaded',
        },
      }),
    ).rejects.toThrow('project_share_recovery_conflict')
    await expect(store.remove({ receiptId: 9, expectedRevision: 1 })).rejects.toThrow('project_share_recovery_conflict')
    await store.remove({ receiptId: 9, expectedRevision: 2 })
    expect(await store.list()).toEqual([])
  })

  it('拒绝身份边界回退、密码字段和本地项目 ID 混用', async () => {
    const directory = createTemporaryDirectory()
    const store = createProjectShareRecoveryStore({ rootDirectory: directory })
    const created = await store.upsert({
      expectedRevision: 0,
      record: createRecord({
        status: 'renaming_project',
        localProjectId: 27,
      }),
    })

    await expect(
      store.upsert({
        expectedRevision: created.revision,
        record: {
          ...created,
          status: 'importing_project',
          localProjectId: undefined,
        },
      }),
    ).rejects.toThrow('project_share_recovery_state_invalid')
    await expect(
      store.upsert({
        expectedRevision: 0,
        record: {
          ...createRecord({ receiptId: 10 }),
          password: '不能落盘',
        },
      }),
    ).rejects.toThrow('project_share_recovery_record_invalid')
  })

  it('隔离损坏文件且不影响其他有效回执', async () => {
    const directory = createTemporaryDirectory()
    const store = createProjectShareRecoveryStore({ rootDirectory: directory })
    await store.upsert({
      expectedRevision: 0,
      record: createRecord(),
    })
    fs.writeFileSync(path.join(directory, 'receipt-10.json'), '{invalid-json')

    const records = await store.list()

    expect(records).toHaveLength(1)
    expect(records[0].receiptId).toBe(9)
    expect(fs.readdirSync(directory).some((name) => name.startsWith('receipt-10.json.corrupt-'))).toBe(true)
  })

  it('只允许在受管句柄引用清空后删除恢复记录', async () => {
    const directory = createTemporaryDirectory()
    const store = createProjectShareRecoveryStore({ rootDirectory: directory })
    const created = await store.upsert({
      expectedRevision: 0,
      record: createRecord({
        managedHandles: [
          {
            kind: 'bundle',
            handle: 'f498ce1e-30c4-4684-ad9a-08bd37bcf617',
            byteLength: 128,
            sha256: 'a'.repeat(64),
          },
        ],
      }),
    })

    await expect(store.remove({ receiptId: 9, expectedRevision: created.revision })).rejects.toThrow(
      'project_share_recovery_handles_not_empty',
    )
  })
})
