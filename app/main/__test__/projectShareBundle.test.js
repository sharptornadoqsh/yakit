import crypto from 'crypto'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { EventEmitter } from 'events'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_SHARE_BUNDLE_CHUNK_BYTES, createProjectShareBundleStore } from '../projectShareBundle'
import { registerProjectShareIPC } from '../projectShareIPC'

const temporaryDirectories = []
const servers = []

const createTemporaryDirectory = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'project-share-bundle-'))
  temporaryDirectories.push(directory)
  return directory
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

const pluginInput = (scriptName, content) => ({
  scriptName,
  type: 'yak',
  version: 3,
  fileHash: sha256(content),
  contentBase64: content.toString('base64'),
  metadata: {
    author: '验收',
    help: '项目插件',
    tags: ['项目'],
    params: [],
  },
})

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve)
        }),
    ),
  )
  temporaryDirectories.splice(0).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true })
  })
})

describe('v2 项目分享包', () => {
  it('以 opaque 句柄完成项目和插件 ZIP 往返并按 4 MiB 分块', async () => {
    const directory = createTemporaryDirectory()
    const projectBytes = Buffer.concat([
      Buffer.from('project-prefix-'),
      crypto.randomBytes(PROJECT_SHARE_BUNDLE_CHUNK_BYTES + 31),
    ])
    const projectPath = path.join(directory, 'source.yakitproject')
    fs.writeFileSync(projectPath, projectBytes)
    const store = createProjectShareBundleStore({
      rootDirectory: path.join(directory, 'managed'),
      now: () => new Date('2026-07-31T00:00:00.000Z'),
    })
    const project = await store.importProjectArchive(projectPath)
    const firstContent = Buffer.from('println("first")')
    const secondContent = Buffer.from([0, 1, 2, 255])
    const firstPlugin = await store.stagePlugin(pluginInput('first', firstContent))
    const secondPlugin = await store.stagePlugin(pluginInput('second', secondContent))

    const created = await store.createBundle({
      bundleId: 'ef1e1ef2-f7c8-4371-a60f-0983b14518fa',
      createdAt: '2026-07-31T00:00:00.000Z',
      engine: {
        version: '1.4.8-beta3',
        commit: 'fixture',
        exportFormat: 'yakitproject/v1',
      },
      project: {
        name: '验收项目',
        archiveHandle: project.handle,
      },
      stagedPluginHandles: [secondPlugin.handle, firstPlugin.handle],
    })

    expect(created).toMatchObject({
      bundleId: 'ef1e1ef2-f7c8-4371-a60f-0983b14518fa',
      chunkSize: PROJECT_SHARE_BUNDLE_CHUNK_BYTES,
      chunkCount: Math.ceil(created.fileSize / PROJECT_SHARE_BUNDLE_CHUNK_BYTES),
    })
    expect(created.handle).toMatch(/^[0-9a-f-]{36}$/)
    expect(created.archiveSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(created.manifestSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(created).not.toHaveProperty('filePath')

    const chunks = []
    for (let index = 0; index < created.chunkCount; index += 1) {
      const chunk = await store.readBundleChunk({ handle: created.handle, index })
      const raw = Buffer.from(chunk.rawBase64, 'base64')
      expect(chunk.byteLength).toBe(raw.length)
      expect(chunk.sha256).toBe(sha256(raw))
      chunks.push(raw)
    }
    expect(sha256(Buffer.concat(chunks))).toBe(created.archiveSha256)

    const inspection = await store.inspectBundle(created.handle)
    expect(inspection).toMatchObject({
      handle: created.handle,
      bundleId: created.bundleId,
      schema: 'yakit.team-project-bundle/v2',
      mediaType: 'application/vnd.yakit.team-project-bundle.v2+zip',
      archiveSha256: created.archiveSha256,
      manifestSha256: created.manifestSha256,
      project: {
        name: '验收项目',
        entry: 'project/project.yakitproject',
        byteLength: projectBytes.length,
        sha256: sha256(projectBytes),
      },
    })
    expect(inspection.plugins.map((plugin) => plugin.scriptName)).toEqual(['first', 'second'])

    const extraction = await store.extractBundle(created.handle)
    expect(extraction.bundleId).toBe(created.bundleId)
    expect(extraction.projectArchiveHandle).toMatch(/^[0-9a-f-]{36}$/)
    expect(extraction.projectArchiveSha256).toBe(sha256(projectBytes))
    expect(await store.readManagedBytes(extraction.projectArchiveHandle)).toEqual(projectBytes)
    const extractedFirst = extraction.plugins.find((plugin) => plugin.scriptName === 'first')
    expect(extractedFirst).toMatchObject({
      byteLength: firstContent.length,
      sha256: sha256(firstContent),
      fileHash: sha256(firstContent),
    })
    expect(await store.readPluginContent(extractedFirst.handle)).toEqual({
      contentBase64: firstContent.toString('base64'),
      byteLength: firstContent.length,
      sha256: sha256(firstContent),
    })
  })

  it('在插件摘要或 metadata 字段不符合契约时拒绝暂存', async () => {
    const directory = createTemporaryDirectory()
    const store = createProjectShareBundleStore({
      rootDirectory: path.join(directory, 'managed'),
    })
    const content = Buffer.from('content')

    await expect(
      store.stagePlugin({
        ...pluginInput('invalid-hash', content),
        fileHash: '0'.repeat(64),
      }),
    ).rejects.toThrow('project_share_plugin_hash_mismatch')
    await expect(
      store.stagePlugin({
        ...pluginInput('unknown-metadata', content),
        metadata: {
          ...pluginInput('unknown-metadata', content).metadata,
          secret: '不能进入项目包',
        },
      }),
    ).rejects.toThrow('project_share_plugin_metadata_invalid')
    const managedDirectory = path.join(directory, 'managed')
    expect(fs.existsSync(managedDirectory) ? fs.readdirSync(managedDirectory) : []).toEqual([])
  })

  it('流式下载时逐项核对响应头和最终摘要，失败不创建句柄', async () => {
    const directory = createTemporaryDirectory()
    const bytes = Buffer.from('bundle-download-bytes')
    const digest = sha256(bytes)
    const server = http.createServer((request, response) => {
      expect(request.headers.authorization).toBe('raw-token')
      expect(request.headers['x-yakit-client-id']).toBe('desktop-client')
      const responseDigest = request.url.endsWith('/8/bundle') ? 'f'.repeat(64) : digest
      response.writeHead(200, {
        'Content-Type': 'application/vnd.yakit.team-project-bundle.v2+zip',
        'Content-Length': String(bytes.length),
        'X-Archive-SHA256': responseDigest,
        Digest: `sha-256=${Buffer.from(responseDigest, 'hex').toString('base64')}`,
      })
      response.end(bytes)
    })
    servers.push(server)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const store = createProjectShareBundleStore({
      rootDirectory: path.join(directory, 'managed'),
    })

    const downloaded = await store.downloadImportBundle({
      baseUrl: `http://127.0.0.1:${address.port}`,
      authorization: 'raw-token',
      clientId: 'desktop-client',
      receiptId: 7,
      expectedSize: bytes.length,
      expectedSha256: digest,
    })

    expect(downloaded).toMatchObject({
      fileSize: bytes.length,
      archiveSha256: digest,
    })
    expect(await store.readManagedBytes(downloaded.handle)).toEqual(bytes)

    await expect(
      store.downloadImportBundle({
        baseUrl: `http://127.0.0.1:${address.port}`,
        authorization: 'raw-token',
        clientId: 'desktop-client',
        receiptId: 8,
        expectedSize: bytes.length,
        expectedSha256: 'f'.repeat(64),
      }),
    ).rejects.toThrow('project_share_download_digest_mismatch')
    expect(fs.readdirSync(path.join(directory, 'managed')).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})

describe('v2 项目分享 IPC', () => {
  const createIPCMain = () => {
    const handlers = new Map()
    return {
      handlers,
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    }
  }

  it('复用真实导出流但不向 Renderer 泄露 TargetPath', async () => {
    const ipcMain = createIPCMain()
    const stream = new EventEmitter()
    stream.cancel = vi.fn()
    const importProjectArchive = vi.fn(async () => ({
      handle: '718c897f-17e3-4d07-8fc0-71f9cd1a84de',
      fileSize: 12,
      sha256: 'a'.repeat(64),
    }))
    const bundleStore = {
      importProjectArchive,
      stagePlugin: vi.fn(),
      createBundle: vi.fn(),
      readBundleChunk: vi.fn(),
      inspectBundle: vi.fn(),
      downloadImportBundle: vi.fn(),
      extractBundle: vi.fn(),
      readPluginContent: vi.fn(),
      removeManagedHandle: vi.fn(),
      resolveManagedHandlePath: vi.fn(),
    }
    const recoveryStore = {
      get: vi.fn(),
      list: vi.fn(async () => []),
      upsert: vi.fn(),
      remove: vi.fn(),
      releaseHandle: vi.fn(),
    }
    const webContents = { send: vi.fn() }
    registerProjectShareIPC({
      ipcMain,
      win: { webContents },
      getClient: () => ({
        ExportProject: vi.fn(() => stream),
      }),
      bundleStore,
      recoveryStore,
      getClientId: () => 'desktop-client',
    })

    const pending = ipcMain.handlers.get('ExportProjectShareArchive')(
      {},
      { projectId: 17, password: '' },
      'export-operation',
    )
    stream.emit('data', {
      TargetPath: 'D:\\secret\\project.yakitproject',
      Percent: 50,
      Verbose: '正在导出',
    })
    stream.emit('end')
    await expect(pending).resolves.toMatchObject({
      handle: '718c897f-17e3-4d07-8fc0-71f9cd1a84de',
    })
    expect(importProjectArchive).toHaveBeenCalledWith('D:\\secret\\project.yakitproject')
    expect(webContents.send).toHaveBeenCalledWith('export-operation-data', {
      Percent: 50,
      Verbose: '正在导出',
    })
    expect(JSON.stringify(webContents.send.mock.calls)).not.toContain('D:\\\\secret')
  })

  it('下载归档时由 Main 注入 Online 地址、认证和稳定客户端标识', async () => {
    const ipcMain = createIPCMain()
    const downloadImportBundle = vi.fn(async () => ({
      handle: '718c897f-17e3-4d07-8fc0-71f9cd1a84de',
      fileSize: 12,
      archiveSha256: 'a'.repeat(64),
    }))
    const bundleStore = {
      importProjectArchive: vi.fn(),
      stagePlugin: vi.fn(),
      createBundle: vi.fn(),
      readBundleChunk: vi.fn(),
      inspectBundle: vi.fn(),
      downloadImportBundle,
      extractBundle: vi.fn(),
      readPluginContent: vi.fn(),
      removeManagedHandle: vi.fn(),
      resolveManagedHandlePath: vi.fn(),
    }
    registerProjectShareIPC({
      ipcMain,
      win: { webContents: { send: vi.fn() } },
      getClient: vi.fn(),
      bundleStore,
      recoveryStore: {
        get: vi.fn(),
        list: vi.fn(async () => []),
        upsert: vi.fn(),
        remove: vi.fn(),
        releaseHandle: vi.fn(),
      },
      getClientId: () => 'desktop-client',
      getOnlineContext: () => ({
        baseUrl: 'https://online.example',
        authorization: 'raw-token',
      }),
    })

    expect(await ipcMain.handlers.get('GetProjectShareClientContext')()).toEqual({
      clientId: 'desktop-client',
    })
    await ipcMain.handlers.get('DownloadProjectShareImportBundle')(
      {},
      {
        receiptId: 7,
        expectedSize: 12,
        expectedSha256: 'a'.repeat(64),
      },
    )

    expect(downloadImportBundle).toHaveBeenCalledWith({
      receiptId: 7,
      expectedSize: 12,
      expectedSha256: 'a'.repeat(64),
      baseUrl: 'https://online.example',
      authorization: 'raw-token',
      clientId: 'desktop-client',
    })
  })

  it('Main 导入结束后先记录本地 ID，再按 ID 重命名并推进恢复状态', async () => {
    const ipcMain = createIPCMain()
    const stream = new EventEmitter()
    stream.cancel = vi.fn()
    let recovery = {
      ...createRecoveryFixture(),
      status: 'importing_project',
      revision: 3,
    }
    const recoveryStore = {
      get: vi.fn(async () => recovery),
      list: vi.fn(async () => [recovery]),
      upsert: vi.fn(async ({ expectedRevision, record }) => {
        expect(expectedRevision).toBe(recovery.revision)
        recovery = {
          ...record,
          revision: expectedRevision + 1,
          updatedAt: '2026-07-31T00:00:00.000Z',
        }
        return recovery
      }),
      remove: vi.fn(),
      releaseHandle: vi.fn(),
    }
    const bundleStore = {
      resolveManagedHandlePath: vi.fn(async () => 'D:\\managed\\project.yakitproject'),
      importProjectArchive: vi.fn(),
      stagePlugin: vi.fn(),
      createBundle: vi.fn(),
      readBundleChunk: vi.fn(),
      inspectBundle: vi.fn(),
      downloadImportBundle: vi.fn(),
      extractBundle: vi.fn(),
      readPluginContent: vi.fn(),
      removeManagedHandle: vi.fn(),
    }
    const client = {
      IsProjectNameValid: vi.fn((_params, callback) => callback(null, {})),
      ImportProject: vi.fn(() => stream),
      GetProjects: vi
        .fn()
        .mockImplementationOnce((_params, callback) => callback(null, { Projects: [] }))
        .mockImplementation((_params, callback) =>
          callback(null, {
            Projects: [
              {
                Id: 41,
                ProjectName: recovery.localImportName,
                FolderId: 0,
                ChildFolderId: 0,
                Type: 'project',
                Description: '',
              },
            ],
          }),
        ),
      UpdateProject: vi.fn((params, callback) => callback(null, params)),
    }
    registerProjectShareIPC({
      ipcMain,
      win: { webContents: { send: vi.fn() } },
      getClient: () => client,
      bundleStore,
      recoveryStore,
      getClientId: () => 'desktop-client',
      wait: async () => undefined,
    })

    const pending = ipcMain.handlers.get('ImportProjectShareArchive')(
      {},
      {
        receiptId: recovery.receiptId,
        handle: recovery.managedHandles[0].handle,
        localImportName: recovery.localImportName,
        finalLocalProjectName: recovery.localProjectName,
        password: '',
        folderId: 0,
        childFolderId: 0,
        type: 'project',
      },
      'import-operation',
    )
    await vi.waitFor(() => expect(client.ImportProject).toHaveBeenCalledTimes(1))
    stream.emit('end')

    await expect(pending).resolves.toEqual({
      localProjectId: 41,
      localProjectName: recovery.localProjectName,
    })
    expect(client.ImportProject).toHaveBeenCalledWith({
      LocalProjectName: '__yakit_share_9_0123456789abcdef0123456789abcdef',
      ProjectFilePath: 'D:\\managed\\project.yakitproject',
      Password: '',
      FolderId: 0,
      ChildFolderId: 0,
      Type: 'project',
    })
    expect(recoveryStore.upsert.mock.calls.map((call) => call[0].record.status)).toEqual([
      'renaming_project',
      'project_imported',
    ])
    expect(client.UpdateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        Id: 41,
        ProjectName: '本地项目',
      }),
      expect.any(Function),
    )
  })
})

const createRecoveryFixture = () => ({
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
      handle: '718c897f-17e3-4d07-8fc0-71f9cd1a84de',
      byteLength: 12,
      sha256: 'a'.repeat(64),
    },
  ],
  expectedSize: 12,
  expectedSha256: 'a'.repeat(64),
  clientId: 'desktop-client',
  idempotencyKey: 'b98fe436-8005-4107-a726-1d8572248576',
  revision: 0,
  updatedAt: '2026-07-31T00:00:00.000Z',
})
