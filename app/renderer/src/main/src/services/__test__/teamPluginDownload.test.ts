// @vitest-environment node
import { Buffer } from 'buffer'
import { createHash } from 'crypto'
import { createServer } from 'http'
import Module from 'module'
import { resolve } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadTeamPluginVersion, downloadTeamPluginVersionWithSummary } from '../teamCollaboration'
import { installTeamPluginDownload } from '../../pages/pluginHub/pluginHubList/teamPluginInstall'
import {
  subscribeTeamAuthenticationInvalidation,
  subscribeTeamPermissionInvalidation,
} from '../../pages/teamCollaboration/teamPermissionContext'
import { resetTokenExpirationState } from '../fetch'

const mocks = vi.hoisted(() => ({ axiosApi: vi.fn(), logoutDynamicControl: vi.fn() }))
vi.mock('../electronBridge', () => ({ yakitNetwork: mocks }))
vi.mock('@/utils/envfile', () => ({ globalUserLogout: vi.fn() }))
vi.mock('@/utils/login', () => ({ loginOutLocal: vi.fn() }))
vi.mock('@/utils/notification', () => ({ failed: vi.fn() }))
vi.mock('@/i18n/i18n', () => ({ default: { getFixedT: () => (key: string) => key } }))

const mainRequire = Module.createRequire(resolve(process.cwd(), 'app/main/httpServer.js'))
const content = '\uFEFFprintln("团队插件")\r\n'
const bytes = Buffer.from(content)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const headers = { 'x-content-sha256': sha256, 'x-plugin-version': '2' }
const plugin = { id: 5, teamId: 3, scriptName: 'download-fixture', fileHash: sha256, version: 2, revision: 7 }
const respond = (body: unknown, responseHeaders = headers) =>
  mocks.axiosApi.mockResolvedValue({ code: 200, data: body, headers: responseHeaders })
const assertBytes = (body: ArrayBuffer) => {
  expect(body).toBeInstanceOf(ArrayBuffer)
  expect(body.byteLength).toBe(bytes.byteLength)
  expect(Array.from(new Uint8Array(body))).toEqual(Array.from(bytes))
  expect(createHash('sha256').update(new Uint8Array(body)).digest('hex')).toBe(sha256)
}

describe('团队插件下载二进制传输', () => {
  beforeAll(() => {
    vi.stubGlobal('crypto', mainRequire('crypto').webcrypto)
  })
  afterAll(() => {
    vi.unstubAllGlobals()
  })
  beforeEach(() => {
    vi.resetAllMocks()
    resetTokenExpirationState()
  })

  it.each([
    ['ArrayBuffer', () => Uint8Array.from(bytes).buffer],
    ['Uint8Array', () => Uint8Array.from(bytes)],
    ['Node Buffer', () => Buffer.from(bytes)],
    ['非零偏移 Uint8Array', () => Uint8Array.from([91, ...bytes, 92]).subarray(1, bytes.length + 1)],
    [
      '非零偏移 Buffer',
      () => Buffer.concat([Buffer.from([91]), bytes, Buffer.from([92])]).subarray(1, bytes.length + 1),
    ],
  ] as const)('%s 经真实 fetch 处理后保留正文、长度、摘要和版本', async (_name, makeBody) => {
    const input = makeBody()
    respond(input)
    const result = await downloadTeamPluginVersionWithSummary(3, 5, 2)

    assertBytes(result.body)
    expect(result).toMatchObject({ sha256, version: 2 })
    expect(mocks.axiosApi).toHaveBeenCalledWith({
      method: 'get',
      url: 'v2/teams/3/plugins/5/versions/2/download',
      params: {},
      responseType: 'arraybuffer',
      includeResponseHeaders: true,
    })
    if (input instanceof Uint8Array) input.fill(0)
    assertBytes(result.body)
  })

  it('Buffer 结构化克隆模拟 IPC 后的子视图仍只下载有效字节', async () => {
    const storage = Buffer.concat([Buffer.from([91]), bytes, Buffer.from([92])])
    const cloned = structuredClone({ code: 200, data: storage.subarray(1, bytes.length + 1), headers })
    expect(Buffer.isBuffer(cloned.data)).toBe(false)
    expect(cloned.data).toBeInstanceOf(Uint8Array)
    expect(cloned.data.byteOffset).toBeGreaterThan(0)
    expect(cloned.data.buffer.byteLength).toBeGreaterThan(cloned.data.byteLength)
    mocks.axiosApi.mockResolvedValue(cloned)

    assertBytes(await downloadTeamPluginVersion(3, 5, 2))
  })

  it('本地 HTTP 200 经真实 Axios Node 适配器、克隆模拟 IPC、fetch 与安装保留正文', async () => {
    const axios = mainRequire('axios')
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/octet-stream', ...headers })
      response.end(bytes)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('本地测试监听地址无效')
    mocks.axiosApi.mockImplementation(async (params) => {
      const response = await axios({ ...params, baseURL: `http://127.0.0.1:${address.port}/api/`, proxy: false })
      expect(Buffer.isBuffer(response.data)).toBe(true)
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toBe('application/octet-stream')
      const cloned = structuredClone({
        code: response.status,
        data: response.data,
        headers: {
          'x-content-sha256': response.headers['x-content-sha256'],
          'x-plugin-version': response.headers['x-plugin-version'],
        },
      })
      expect(Buffer.isBuffer(cloned.data)).toBe(false)
      expect(cloned.data).toBeInstanceOf(Uint8Array)
      return cloned
    })
    const savePlugin = vi.fn().mockResolvedValue({ Id: 17, ScriptName: plugin.scriptName })

    try {
      const result = await installTeamPluginDownload(plugin, {
        download: (version) => downloadTeamPluginVersion(3, 5, version),
        savePlugin,
      })
      expect(savePlugin).toHaveBeenCalledWith(expect.objectContaining({ Content: content }))
      expect(result.mapping).toMatchObject({ fileHash: sha256, version: 2 })
      assertBytes(Uint8Array.from(Buffer.from(savePlugin.mock.calls[0][0].Content)).buffer)
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })

  it.each([
    ['字符串', content],
    ['普通对象', { body: bytes }],
    ['Buffer JSON', { type: 'Buffer', data: Array.from(bytes) }],
    ['类数组对象', { 0: 1, length: 1 }],
    ['数组', [1, 2, 3]],
    ['Uint16Array', new Uint16Array([1, 2, 3])],
    ['DataView', new DataView(new ArrayBuffer(3))],
    ['null', null],
    ['undefined', undefined],
  ])('仍拒绝非法正文：%s', async (_name, body) => {
    respond(body)
    await expect(downloadTeamPluginVersionWithSummary(3, 5, 2)).rejects.toThrow(
      '下载正文 body 必须是二进制 ArrayBuffer',
    )
  })

  it.each([
    ['错误摘要', { ...headers, 'x-content-sha256': 'f'.repeat(64) }, '插件正文摘要校验失败'],
    ['非法摘要', { ...headers, 'x-content-sha256': 'invalid' }, 'x-content-sha256 必须是'],
    ['缺失摘要', { 'x-plugin-version': '2' }, 'x-content-sha256 必须是'],
    ['不同版本', { ...headers, 'x-plugin-version': '3' }, 'x-plugin-version 不匹配'],
    ['零版本', { ...headers, 'x-plugin-version': '0' }, 'x-plugin-version=0'],
    ['缺失版本', { 'x-content-sha256': sha256 }, 'x-plugin-version 必须是'],
  ])('标准化合法字节后仍拒绝%s', async (_name, responseHeaders, error) => {
    mocks.axiosApi.mockResolvedValue({ code: 200, data: structuredClone(bytes), headers: responseHeaders })
    await expect(downloadTeamPluginVersionWithSummary(3, 5, 2)).rejects.toThrow(error)
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('请求版本 %s 非法时不发送下载请求', async (version) => {
    await expect(downloadTeamPluginVersionWithSummary(3, 5, version)).rejects.toThrow('version')
    expect(mocks.axiosApi).not.toHaveBeenCalled()
  })

  it.each([
    ['空正文', Buffer.alloc(0), '团队插件正文为空'],
    ['空白正文', Buffer.from(' \r\n'), '团队插件正文为空'],
    ['非法 UTF-8', Buffer.from([0xc3, 0x28]), '插件正文不是有效 UTF-8'],
  ])('下载%s后安装校验仍阻止本地写入', async (_name, body, error) => {
    const fileHash = createHash('sha256').update(body).digest('hex')
    respond(structuredClone(body), { ...headers, 'x-content-sha256': fileHash })
    const savePlugin = vi.fn()
    await expect(
      installTeamPluginDownload(
        { ...plugin, fileHash },
        { download: (version) => downloadTeamPluginVersion(3, 5, version), savePlugin },
      ),
    ).rejects.toThrow(error)
    expect(savePlugin).not.toHaveBeenCalled()
  })

  it.each([401, 403])('下载 HTTP %s 仍发布认证或团队权限失效', async (status) => {
    const authListener = vi.fn()
    const permissionListener = vi.fn()
    const unsubscribeAuth = subscribeTeamAuthenticationInvalidation(authListener)
    const unsubscribePermission = subscribeTeamPermissionInvalidation(permissionListener)
    mocks.axiosApi.mockResolvedValue({ code: status, data: { error: { message: '下载被拒绝' } } })
    try {
      await expect(downloadTeamPluginVersionWithSummary(3, 5, 2)).rejects.toMatchObject({ status })
      expect(authListener).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
      expect(permissionListener.mock.calls).toEqual(status === 403 ? [[3]] : [])
    } finally {
      unsubscribeAuth()
      unsubscribePermission()
    }
  })
})
