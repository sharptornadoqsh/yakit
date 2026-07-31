import { validateHeaderValue } from 'http'
import Module, { createRequire } from 'module'
import {
  applyCollaborationClientHeaders,
  createCollaborationClientHeaders,
  registerCollaborationClientIdentityIPC,
  sanitizeRendererConfig,
  setRendererConfig,
} from '../collaborationClientIdentity'

var productionIPCHandlers = new Map()
var productionIPCMain = {
  handle: vi.fn((channel, handler) => productionIPCHandlers.set(channel, handler)),
  on: vi.fn(),
}
var productionConfig = {}

const createIdentityHeaders = (hostname, overrides = {}) =>
  createCollaborationClientHeaders({
    getConfig: () => ({ collaborationClientId: 'existing-client-id' }),
    setConfig: vi.fn(),
    hostname: () => hostname,
    platform: 'win32',
    arch: 'x64',
    version: '1.4.0',
    ...overrides,
  })

describe('团队协作客户端标识', () => {
  it('首次生成标识后写入现有应用配置', () => {
    const setConfig = vi.fn(() => true)
    const headers = createCollaborationClientHeaders({
      getConfig: () => ({}),
      setConfig,
      createId: () => '67a9ff5a-3a08-4f08-aa11-770205ace231',
      hostname: () => 'workstation-a',
      platform: 'win32',
      arch: 'x64',
      version: '1.4.0',
    })

    expect(setConfig).toHaveBeenCalledWith('collaborationClientId', '67a9ff5a-3a08-4f08-aa11-770205ace231')
    expect(headers).toEqual({
      'X-Yakit-Client-ID': '67a9ff5a-3a08-4f08-aa11-770205ace231',
      'X-Yakit-Device-Name': 'workstation-a',
      'X-Yakit-Hostname': 'workstation-a',
      'X-Yakit-OS': 'win32/x64',
      'X-Yakit-Version': '1.4.0',
    })
  })

  it('持久化失败时拒绝返回无法跨重启复用的标识', () => {
    expect(() =>
      createIdentityHeaders('workstation-a', {
        getConfig: () => ({}),
        setConfig: () => false,
        createId: () => '67a9ff5a-3a08-4f08-aa11-770205ace231',
      }),
    ).toThrow('collaboration_client_id_persist_failed')
  })

  it('拒绝使用生成器返回的非法标识', () => {
    const setConfig = vi.fn()

    expect(() =>
      createIdentityHeaders('workstation-a', {
        getConfig: () => ({}),
        setConfig,
        createId: () => 'invalid\r\nclient-id',
      }),
    ).toThrow('invalid_collaboration_client_id')
    expect(setConfig).not.toHaveBeenCalled()
  })

  it('模拟应用重启后仍复用首次持久化的标识', () => {
    const persistedConfig = {}
    const setConfig = vi.fn((key, value) => {
      persistedConfig[key] = value
      return true
    })
    const firstHeaders = createIdentityHeaders('workstation-a', {
      getConfig: () => persistedConfig,
      setConfig,
      createId: () => '67a9ff5a-3a08-4f08-aa11-770205ace231',
    })
    const restartedHeaders = createIdentityHeaders('workstation-a', {
      getConfig: () => persistedConfig,
      setConfig,
      createId: () => {
        throw new Error('重启后不应重新生成客户端标识')
      },
    })

    expect(restartedHeaders['X-Yakit-Client-ID']).toBe(firstHeaders['X-Yakit-Client-ID'])
    expect(setConfig).toHaveBeenCalledTimes(1)
  })

  it('复用持久化标识并覆盖调用方伪造的客户端头', () => {
    const setConfig = vi.fn()
    const identity = createCollaborationClientHeaders({
      getConfig: () => ({ collaborationClientId: 'existing-client-id' }),
      setConfig,
      hostname: () => 'workstation-b',
      platform: 'linux',
      arch: 'arm64',
      version: '2.0.0',
    })
    const headers = applyCollaborationClientHeaders(
      { Authorization: 'token', 'X-Yakit-Client-ID': 'spoofed-client-id' },
      identity,
    )

    expect(setConfig).not.toHaveBeenCalled()
    expect(headers.Authorization).toBe('token')
    expect(headers['X-Yakit-Client-ID']).toBe('existing-client-id')
  })

  it('保留普通英文电脑名称', () => {
    const headers = createIdentityHeaders('workstation-ascii')

    expect(headers['X-Yakit-Device-Name']).toBe('workstation-ascii')
    expect(headers['X-Yakit-Hostname']).toBe('workstation-ascii')
  })

  it('保留长度上限内的英文电脑名称', () => {
    const hostname = 'a'.repeat(255)
    const headers = createIdentityHeaders(hostname)

    expect(headers['X-Yakit-Device-Name']).toBe(hostname)
    expect(headers['X-Yakit-Hostname']).toBe(hostname)
  })

  it.each([
    ['中文', '开发电脑', 'encoded-4e41865b62eb2e43ae36eb2fc067b85e4f79d5803ca190fb430afaf1b7db0807'],
    ['表情', 'workstation-🚀', 'encoded-d0783d09ec2632898ed327a9d7cdc0582f00e897d37d2988d2e847c1e67e386f'],
    ['回车', 'pc\rname', 'encoded-f1ea66bd3e6ef8219edcfc1a7334e011c27bc35e46efee5572bc4fbede0ec3ce'],
    ['换行', 'pc\nname', 'encoded-fb7c031bbc76a35a559e0ec054d89b09ebc52b977dd6c1005bdd5e0f67fa5211'],
    ['制表符', 'pc\tname', 'encoded-7bb74d013ec6b5e6c8bd31b05562456d0f6bbe77dffebdc7418db5140276497f'],
    ['空字符', 'pc\u0000name', 'encoded-a39caece89d3a0a20eddccf169badfc90dd7cf6b8ed06c91fb9c60695e6f6445'],
    ['删除字符', 'pc\u007fname', 'encoded-0976f8f1620354fb21bef4d60511dff60abc5fea59a0ea6e75e2a56303a5073b'],
    ['超长', 'a'.repeat(256), 'encoded-02d7160d77e18c6447be80c2e355c7ed4388545271702c50253b0914c65ce5fe'],
  ])('将%s电脑名称转换为确定性安全值', (_type, hostname, expected) => {
    const headers = createIdentityHeaders(hostname)

    expect(headers['X-Yakit-Device-Name']).toBe(expected)
    expect(headers['X-Yakit-Hostname']).toBe(expected)
  })

  it.each(['', '   '])('为空电脑名称使用安全默认值', (hostname) => {
    const headers = createIdentityHeaders(hostname)

    expect(headers['X-Yakit-Device-Name']).toBe('unknown')
    expect(headers['X-Yakit-Hostname']).toBe('unknown')
  })

  it.each([
    ['中间控制字符', 'invalid\r\nclient-id'],
    ['尾部控制字符', 'client-id\r\n'],
    ['首尾空格', ' client-id '],
    ['非 ASCII 字符', '客户端标识'],
  ])('为包含%s的非法持久化客户端标识重新生成标识', (_type, collaborationClientId) => {
    const setConfig = vi.fn(() => true)
    const headers = createIdentityHeaders('workstation-a', {
      getConfig: () => ({ collaborationClientId }),
      setConfig,
      createId: () => 'e58e4d3c-78d8-4967-b189-c593355f4b9d',
    })

    expect(setConfig).toHaveBeenCalledWith('collaborationClientId', 'e58e4d3c-78d8-4967-b189-c593355f4b9d')
    expect(headers['X-Yakit-Client-ID']).toBe('e58e4d3c-78d8-4967-b189-c593355f4b9d')
  })

  it('确保最终全部身份请求头均为有效 ASCII', () => {
    const headers = createIdentityHeaders('研发电脑🚀\r\n', {
      platform: '视窗',
      arch: '架构\t',
      version: '版本\u0000',
    })

    Object.entries(headers).forEach(([name, value]) => {
      expect(name).toMatch(/^X-Yakit-/)
      expect(value).toMatch(/^[\x20-\x7e]+$/)
      expect(() => validateHeaderValue(name, value)).not.toThrow()
    })
  })
})

describe('团队协作客户端标识 IPC 边界', () => {
  it('生产 IPC handler 与 HTTP 拦截器读取同一惰性身份缓存', async () => {
    productionIPCHandlers.clear()
    productionIPCMain.handle.mockClear()
    productionIPCMain.on.mockClear()
    productionConfig = {}
    const localRequire = createRequire(import.meta.url)
    const httpServerPath = localRequire.resolve('../httpServer')
    const ipcPath = localRequire.resolve('../ipc')
    const originalLoad = Module._load
    Module._load = function (request, parent, isMain) {
      if (request === 'electron') {
        return {
          app: {
            exit: vi.fn(),
            getVersion: () => '1.4.0',
            relaunch: vi.fn(),
          },
          ipcMain: productionIPCMain,
          nativeImage: { createEmpty: vi.fn() },
          Notification: class {
            show() {}
          },
        }
      }
      if (request === './filePath') {
        return {
          getAppConfigDir: () => 'test-config',
          getConfig: () => productionConfig,
          getEngineLogDir: () => 'test-logs',
          getPrintLogDir: () => 'test-logs',
          getRenderLogDir: () => 'test-logs',
          getYakitHome: () => 'test-home',
          setConfig: (key, value) => {
            productionConfig[key] = value
            return true
          },
        }
      }
      return originalLoad.call(this, request, parent, isMain)
    }
    delete localRequire.cache[httpServerPath]
    delete localRequire.cache[ipcPath]

    try {
      const httpServer = localRequire(httpServerPath)
      const ipc = localRequire(ipcPath)

      ipc.registerCollaborationClientIdentityProductionIPC()
      const requestInterceptor = httpServer.service.interceptors.request.handlers[0].fulfilled
      const firstRequest = requestInterceptor({ headers: {} })
      const handler = productionIPCHandlers.get('GetCollaborationClientID')
      const firstIPCValue = await handler({ senderFrame: { url: 'file:///renderer/index.html' } })
      const secondRequest = requestInterceptor({ headers: {} })

      expect(firstIPCValue).toBe(firstRequest.headers['X-Yakit-Client-ID'])
      expect(secondRequest.headers['X-Yakit-Client-ID']).toBe(firstIPCValue)
      expect(productionConfig.collaborationClientId).toBe(firstIPCValue)
      expect(productionIPCMain.handle).toHaveBeenCalledWith('GetCollaborationClientID', handler)
    } finally {
      Module._load = originalLoad
      delete localRequire.cache[httpServerPath]
      delete localRequire.cache[ipcPath]
    }
  })

  it('只读 IPC 返回值与 Main 请求头使用同一持久化标识', async () => {
    const handlers = new Map()
    const persistedConfig = {}
    const identityHeaders = createIdentityHeaders('workstation-a', {
      getConfig: () => persistedConfig,
      setConfig: (key, value) => {
        persistedConfig[key] = value
        return true
      },
      createId: () => '67a9ff5a-3a08-4f08-aa11-770205ace231',
    })
    registerCollaborationClientIdentityIPC({
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler),
      },
      assertTrustedAppSender: vi.fn(),
      getCollaborationClientID: () => identityHeaders['X-Yakit-Client-ID'],
    })

    await expect(handlers.get('GetCollaborationClientID')({})).resolves.toBe(identityHeaders['X-Yakit-Client-ID'])
  })

  it('只注册可信的只读客户端标识 IPC，且忽略渲染端伪造参数', async () => {
    const handlers = new Map()
    const ipcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    }
    const callOrder = []
    const assertTrustedAppSender = vi.fn(() => callOrder.push('trusted'))
    const getCollaborationClientID = vi.fn(() => {
      callOrder.push('identity')
      return 'main-owned-client-id'
    })

    registerCollaborationClientIdentityIPC({
      ipcMain,
      assertTrustedAppSender,
      getCollaborationClientID,
    })

    expect(ipcMain.handle).toHaveBeenCalledTimes(1)
    expect(ipcMain.handle).toHaveBeenCalledWith('GetCollaborationClientID', expect.any(Function))
    await expect(handlers.get('GetCollaborationClientID')({ senderFrame: {} }, 'spoofed-client-id')).resolves.toBe(
      'main-owned-client-id',
    )
    expect(assertTrustedAppSender).toHaveBeenCalledWith({ senderFrame: {} }, 'GetCollaborationClientID')
    expect(getCollaborationClientID).toHaveBeenCalledWith()
    expect(callOrder).toEqual(['trusted', 'identity'])
  })

  it('不可信发送方不会触发客户端标识生成', async () => {
    const handlers = new Map()
    const getCollaborationClientID = vi.fn()
    registerCollaborationClientIdentityIPC({
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler),
      },
      assertTrustedAppSender: () => {
        throw new Error('untrusted_ipc_sender')
      },
      getCollaborationClientID,
    })

    await expect(handlers.get('GetCollaborationClientID')({})).rejects.toThrow('untrusted_ipc_sender')
    expect(getCollaborationClientID).not.toHaveBeenCalled()
  })

  it('配置 IPC 不泄露也不允许改写保留的客户端标识', () => {
    expect(
      sanitizeRendererConfig({
        YAKIT_HOME: 'projects',
        collaborationClientId: 'main-owned-client-id',
      }),
    ).toEqual({ YAKIT_HOME: 'projects' })

    const setConfig = vi.fn(() => true)
    expect(setRendererConfig(setConfig, 'collaborationClientId', 'spoofed-client-id')).toEqual({ success: false })
    expect(setConfig).not.toHaveBeenCalled()
    expect(setRendererConfig(setConfig, 'YAKIT_HOME', 'other-projects')).toEqual({ success: true })
    expect(setConfig).toHaveBeenCalledWith('YAKIT_HOME', 'other-projects')
  })
})
