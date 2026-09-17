// @vitest-environment node
import fs from 'fs'
import path from 'path'
import vm from 'vm'
import { createRequire } from 'module'
import { describe, expect, it, vi } from 'vitest'

const harness = (file) => {
  const handlers = new Map()
  const prepare = vi.fn().mockResolvedValue({ imported: 497 })
  const activate = vi.fn().mockResolvedValue({ exitCode: 0 })
  const client = { Echo: (input, options, done) => done(null, { result: input.text }), close: vi.fn() }
  const source = path.resolve('app/main/handlers', file)
  const native = createRequire(source)
  const mocks = {
    electron: { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } },
    '../filePath': {
      getLocalYaklangEngine: () => '/fixture/yak',
      getYakitHome: () => '/fixture/home',
      loadExtraFilePath: (file) => `/fixture/${file}`,
    },
    '../offlinePlugins': { prepareOfflinePluginsForConnection: prepare },
    '../specialDetectionActivation': { runSpecialDetectionActivation: activate },
    '../state': { GLOBAL_YAK_SETTING: {} },
    '../logFile': { engineLogOutputFileAndUI: vi.fn(), engineLogOutputUI: vi.fn() },
    '../defaultDatabase': { getDefaultDatabaseEnvironment: () => ({}) },
    '../ipc': { testRemoteClient: vi.fn() },
    '../security': { assertTrustedAppSender: vi.fn(), normalizePid: (pid) => pid },
    './yakLocal': { psYakList: vi.fn() },
  }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
    module,
    require: (name) => mocks[name] || native(name),
    process: { env: {}, platform: 'win32', on: vi.fn() },
    Buffer,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  })
  const args = [{ webContents: { send: vi.fn() } }, vi.fn(), () => client, () => client]
  if (file === 'newEngineStatus.js') module.exports.registerNewIPC(...args, '')
  else module.exports(...args)
  return { connect: handlers.get('connect-yaklang-engine'), prepare, activate, client }
}

describe.each(['newEngineStatus.js', 'engineStatus.js'])('%s 离线插件连接集成', (file) => {
  it('本地连接完成前执行资源初始化，并传入同根分类激活', async () => {
    const value = harness(file)
    await value.connect({}, { Host: '127.0.0.1', Port: 9011, Mode: 'local' })
    expect(value.prepare).toHaveBeenCalledOnce()
    const options = value.prepare.mock.calls[0][0]
    expect(options).toMatchObject({
      client: value.client,
      mode: 'local',
      directory: '/fixture/bins/database',
      key: '127.0.0.1:9011',
    })
    await options.activate()
    expect(value.activate).toHaveBeenCalledWith(
      expect.objectContaining({
        command: '/fixture/yak',
        env: expect.objectContaining({ YAKIT_HOME: '/fixture/home' }),
      }),
    )
    expect(value.client.close).toHaveBeenCalledOnce()
  })
  it('即使远程地址是回环地址也不自动导入', async () => {
    const value = harness(file)
    await value.connect({}, { Host: '127.0.0.1', Port: 19000, Mode: 'remote' })
    expect(value.prepare).not.toHaveBeenCalled()
  })
  it('初始化失败向连接方返回错误且关闭临时客户端', async () => {
    const value = harness(file)
    value.prepare.mockRejectedValueOnce(new Error('seed failed'))
    await expect(value.connect({}, { Host: '127.0.0.1', Port: 9011, Mode: 'local' })).rejects.toThrow('seed failed')
    expect(value.client.close).toHaveBeenCalledOnce()
  })
})
