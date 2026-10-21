// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sourceRoot = path.resolve(process.env.STARTUP_PORT_TEST_ROOT || '.')
const handlerPath = path.join(sourceRoot, 'app/main/handlers/newEngineStatus.js')
const nodeRequire = createRequire(handlerPath)

function createHarness(onSpawn, windowsLegacy = false) {
  const handlers = new Map()
  const children = []
  const processEvents = new EventEmitter()
  const getDefaultDatabaseEnvironment = vi.fn((softwareVersion, version) => ({ softwareVersion, version }))
  const send = vi.fn()
  const callback = vi.fn()
  const assertLocalPortAvailable = vi.fn().mockResolvedValue(undefined)
  const prepareWindowsLegacyEngine = vi.fn().mockResolvedValue(undefined)
  const engineLog = vi.fn()
  const spawn = vi.fn((command, args, options) => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.pid = 100000 + children.length
    child.unref = vi.fn()
    child.kill = vi.fn()
    children.push(child)
    Promise.resolve().then(() => onSpawn?.({ child, command, args, options, handlers }))
    return child
  })
  const mocks = {
    electron: { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } },
    child_process: { spawn, exec: vi.fn() },
    '../state': { GLOBAL_YAK_SETTING: {} },
    '../filePath': {
      getLocalYaklangEngine: () => '/fixture/yak',
      getYakitHome: () => '/fixture/data',
      loadExtraFilePath: (file) => `/fixture/${file}`,
    },
    '../logFile': { engineLogOutputFileAndUI: engineLog, engineLogOutputUI: vi.fn() },
    '../engineLifecycle': { isWindowsLegacy: () => windowsLegacy },
    '../windowsLegacyEngine': {
      ...nodeRequire('../windowsLegacyEngine'),
      prepareWindowsLegacyEngine,
    },
    '../defaultDatabase': { getDefaultDatabaseEnvironment },
    '../localEnginePort': {
      ...createRequire(path.resolve('app/main/localEnginePort.js'))('./localEnginePort'),
      assertLocalPortAvailable,
    },
  }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(handlerPath, 'utf8'), {
    module,
    exports: module.exports,
    require: (name) => mocks[name] || nodeRequire(name),
    process: {
      env: {},
      platform: 'linux',
      kill: vi.fn(),
      on: processEvents.on.bind(processEvents),
      once: processEvents.once.bind(processEvents),
      removeListener: processEvents.removeListener.bind(processEvents),
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Buffer,
    console,
  })
  module.exports.registerNewIPC(
    { webContents: { send } },
    callback,
    () => ({}),
    () => ({
      Echo: ({ text }, done) => done(null, { result: text }),
    }),
    '',
  )
  return {
    handlers,
    children,
    spawn,
    send,
    callback,
    processEvents,
    getDefaultDatabaseEnvironment,
    assertLocalPortAvailable,
    prepareWindowsLegacyEngine,
    engineLog,
  }
}

const portFromArgs = (args) => Number(args[args.indexOf('--port') + 1])
const completeCheck = (child, json) => {
  child.stdout.emit('data', `<json-check>${JSON.stringify(json)}</json-check>`)
  child.emit('close', json.ok ? 0 : 1)
}
const occupiedCheck = (child, port) =>
  completeCheck(child, {
    ok: false,
    reason: [`net.Listen(tcp, addr) failed: listen tcp 127.0.0.1:${port}: bind: address already in use`],
  })
const successfulCheck = (child, port) => completeCheck(child, { ok: true, port, secret: 'fixture-secret' })
const params = (port = 9011) => ({ port, version: 'yakit', softwareVersion: 'yakit', password: 'fixture-secret' })

describe('Windows legacy 引擎失败证据', () => {
  it.each([
    [3221225781, '', 'dll_load_error', '0xC0000135'],
    [-1073741515, '', 'dll_load_error', '0xC0000135'],
    [2, 'fatal error: advapi32.dll not found\nruntime: panic before malloc heap initialized', 'runtime_init_error', '0x00000002'],
    [1, '', 'engine_exit', '0x00000001'],
    [0, '', 'engine_exit', '0x00000000'],
  ])('保留退出码 %s 及错误类别', async (code, stderr, status, exitHex) => {
    const harness = createHarness(({ child }) => {
      child.stderr.emit('data', stderr)
      child.emit('close', code)
    }, true)
    const result = await harness.handlers.get('check-allow-secret-local-yaklang-engine')(null, params())
    expect(result).toMatchObject({ ok: false, status, exitCode: code, exitHex, stage: 'capability-check' })
    expect(harness.prepareWindowsLegacyEngine).toHaveBeenCalledTimes(1)
    expect(result.message).not.toMatch(/杀软/)
  })

  it('成功 JSON 后异常退出仍然失败', async () => {
    const harness = createHarness(({ child }) => {
      child.stdout.emit('data', '<json-check>{"ok":true,"secret":"private-value"}</json-check>')
      child.emit('close', 2)
    }, true)
    const result = await harness.handlers.get('check-allow-secret-local-yaklang-engine')(null, params())
    expect(result).toMatchObject({ ok: false, status: 'engine_exit', exitCode: 2 })
    expect(JSON.stringify(harness.engineLog.mock.calls)).not.toContain('private-value')
  })

  it('超时结束请求并记录故障阶段', async () => {
    const harness = createHarness(undefined, true)
    const pending = harness.handlers.get('check-allow-secret-local-yaklang-engine')(null, params())
    await vi.advanceTimersByTimeAsync(60001)
    expect(await pending).toMatchObject({ ok: false, status: 'timeout', stage: 'capability-check' })
    expect(harness.children[0].kill).toHaveBeenCalled()
  })

  it('部署失败时不启动任何引擎进程', async () => {
    const harness = createHarness(undefined, true)
    harness.prepareWindowsLegacyEngine.mockRejectedValue(new Error('运行库摘要不匹配'))
    expect(await harness.handlers.get('check-allow-secret-local-yaklang-engine')(null, params())).toMatchObject({
      ok: false,
      status: 'deployment_error',
      stage: 'deployment',
    })
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('部署期间取消后不再创建进程', async () => {
    const harness = createHarness(undefined, true)
    let finish
    harness.prepareWindowsLegacyEngine.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const pending = harness.handlers.get('check-allow-secret-local-yaklang-engine')(null, params())
    await vi.advanceTimersByTimeAsync(0)
    harness.handlers.get('cancel-all-tasks')()
    finish()
    expect(await pending).toMatchObject({ ok: false, status: 'cancelled' })
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('真正启动失败的结果和日志隐藏本次密码', async () => {
    const harness = createHarness(({ child }) => {
      child.stderr.emit('data', 'fatal error: fixture-secret')
      child.emit('close', 2)
    }, true)
    const result = await harness.handlers.get('start-secret-local-yaklang-engine')(null, params())
    expect(result).toMatchObject({ ok: false, status: 'runtime_init_error', stage: 'engine-start' })
    expect(JSON.stringify(result)).not.toContain('fixture-secret')
    expect(JSON.stringify(harness.engineLog.mock.calls)).not.toContain('fixture-secret')
  })

  it('普通分支维持原分类且不触发 legacy 部署', async () => {
    const harness = createHarness(({ child }) => child.emit('close', 3221225781))
    expect(await harness.handlers.get('check-allow-secret-local-yaklang-engine')(null, params())).toMatchObject({
      ok: false,
      status: 'antivirus_blocked',
    })
    expect(harness.prepareWindowsLegacyEngine).not.toHaveBeenCalled()
  })

  it('完整能力检查成功，日志不包含临时密码', async () => {
    const harness = createHarness(({ child, args }) => successfulCheck(child, portFromArgs(args)), true)
    expect(await harness.handlers.get('check-allow-secret-local-yaklang-engine')(null, params())).toMatchObject({
      ok: true,
      status: 'success',
      json: { port: 9011, secret: 'fixture-secret' },
    })
    expect(JSON.stringify(harness.engineLog.mock.calls)).not.toContain('fixture-secret')
  })
})

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('本地引擎端口协商', () => {
  it.each([
    ['community', 'yakit', 'yakit', 9011],
    ['enterprise', 'enterprise', 'yakit', 9012],
    ['enterprise-no-license', 'enterprise', 'yakit', 9012],
    ['simple-enterprise', 'simple-enterprise', 'yakit', 9013],
    ['irify', 'irify', 'irify', 9014],
    ['irify-enterprise', 'irify-enterprise', 'irify', 9015],
    ['memfit', 'memfit', 'memfit', 9016],
  ])('%s 在默认端口占用后递增并保留版本和数据库环境', async (_edition, version, softwareVersion, port) => {
    const harness = createHarness(({ child, args }) => {
      const attemptedPort = portFromArgs(args)
      if (attemptedPort === port) occupiedCheck(child, attemptedPort)
      else successfulCheck(child, attemptedPort)
    })
    const result = await harness.handlers.get('check-allow-secret-local-yaklang-engine')(
      {},
      {
        ...params(port),
        version,
        softwareVersion,
      },
    )
    expect(result).toMatchObject({ ok: true, status: 'success', json: { port: port + 1, secret: 'fixture-secret' } })
    expect(harness.spawn.mock.calls.map((call) => portFromArgs(call[1]))).toEqual([port, port + 1])
    expect(harness.getDefaultDatabaseEnvironment).toHaveBeenCalledTimes(2)
    expect(harness.getDefaultDatabaseEnvironment).toHaveBeenLastCalledWith(softwareVersion, version)
  })

  it('连续占用时逐个递增，并保留已有可连接引擎的端口', async () => {
    const harness = createHarness(({ child, args }) => {
      const port = portFromArgs(args)
      if (port < 9013) occupiedCheck(child, port)
      else successfulCheck(child, port)
    })
    const check = harness.handlers.get('check-allow-secret-local-yaklang-engine')
    expect(await check({}, params())).toMatchObject({ ok: true, json: { port: 9013 } })
    expect(harness.spawn.mock.calls.map((call) => portFromArgs(call[1]))).toEqual([9011, 9012, 9013])
    harness.spawn.mockClear()
    expect(await check({}, params(9013))).toMatchObject({ ok: true, json: { port: 9013 } })
    expect(harness.spawn).toHaveBeenCalledTimes(1)
  })

  it('数据库错误不尝试下一个端口', async () => {
    const harness = createHarness(({ child }) => completeCheck(child, { ok: false, reason: ['database error'] }))
    expect(await harness.handlers.get('check-allow-secret-local-yaklang-engine')({}, params())).toMatchObject({
      ok: false,
      status: 'database_error',
    })
    expect(harness.spawn).toHaveBeenCalledTimes(1)
  })

  it('监听权限错误不被误认为端口占用', async () => {
    const harness = createHarness(({ child }) =>
      completeCheck(child, {
        ok: false,
        reason: ['net.Listen(tcp, addr) failed: listen tcp 127.0.0.1:9011: bind: permission denied'],
      }),
    )
    const result = await harness.handlers.get('check-allow-secret-local-yaklang-engine')({}, params())
    expect(result.ok).toBe(false)
    expect(result.status).not.toBe('port_occupied')
    expect(harness.spawn).toHaveBeenCalledTimes(1)
  })

  it('最多尝试一百个端口并返回可展示的耗尽错误', async () => {
    const harness = createHarness(({ child, args }) => occupiedCheck(child, portFromArgs(args)))
    const result = await harness.handlers.get('check-allow-secret-local-yaklang-engine')({}, params())
    expect(result).toMatchObject({ ok: false, status: 'port_occupied' })
    expect(result.message).toContain('100')
    expect(harness.spawn).toHaveBeenCalledTimes(100)
    expect(portFromArgs(harness.spawn.mock.lastCall[1])).toBe(9110)
  })

  it('到达 65535 后停止，不产生非法端口', async () => {
    const harness = createHarness(({ child, args }) => occupiedCheck(child, portFromArgs(args)))
    const result = await harness.handlers.get('check-allow-secret-local-yaklang-engine')({}, params(65535))
    expect(result).toMatchObject({ ok: false, status: 'port_occupied' })
    expect(harness.spawn).toHaveBeenCalledTimes(1)
  })

  it('非法端口在创建进程前返回错误', async () => {
    const harness = createHarness(({ child, args }) => successfulCheck(child, portFromArgs(args)))
    const result = await harness.handlers.get('check-allow-secret-local-yaklang-engine')({}, params(0))
    expect(result).toMatchObject({ ok: false, status: 'invalid_port' })
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('两次尝试之间取消任务后不再递增', async () => {
    const harness = createHarness(({ child, args, handlers }) => {
      occupiedCheck(child, portFromArgs(args))
      handlers.get('cancel-all-tasks')()
    })
    expect(await harness.handlers.get('check-allow-secret-local-yaklang-engine')({}, params())).toMatchObject({
      ok: false,
      status: 'cancelled',
    })
    expect(harness.spawn).toHaveBeenCalledTimes(1)
  })

  it('检查挂起时取消会结束当前请求', async () => {
    const harness = createHarness()
    const pending = harness.handlers.get('check-allow-secret-local-yaklang-engine')({}, params())
    const settled = vi.fn()
    pending.then(settled)
    harness.handlers.get('cancel-all-tasks')()
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ ok: false, status: 'cancelled' }))
    expect(harness.children[0].kill).toHaveBeenCalledTimes(1)
  })

  it.each(['address already in use', 'Only one usage of each socket address is normally permitted'])(
    '真正启动遇到端口竞态会重试并返回实际端口：%s',
    async (message) => {
      const harness = createHarness(({ child, args }) => {
        if (portFromArgs(args) === 9011) {
          child.stderr.emit('data', `listen tcp 127.0.0.1:9011: bind: ${message}`)
          child.emit('close', 1)
        } else child.stdout.emit('data', 'yak grpc ok\n')
      })
      const result = await harness.handlers.get('start-secret-local-yaklang-engine')({}, params())
      expect(result).toMatchObject({ ok: true, status: 'success', port: 9012 })
      expect(harness.spawn.mock.calls.map((call) => portFromArgs(call[1]))).toEqual([9011, 9012])
      expect(harness.processEvents.listenerCount('exit')).toBe(1)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('真正启动的非端口错误会终止并保留原因', async () => {
    const harness = createHarness(({ child }) => {
      child.stderr.emit('data', 'database is locked')
      child.emit('close', 1)
    })
    const result = await harness.handlers.get('start-secret-local-yaklang-engine')({}, params())
    expect(result).toMatchObject({ ok: false, status: 'exit' })
    expect(result.message).toContain('database is locked')
    expect(harness.spawn).toHaveBeenCalledTimes(1)
    expect(harness.processEvents.listenerCount('exit')).toBe(0)
  })

  it('启动前已被占用时先跳过该端口，不创建失败进程', async () => {
    const harness = createHarness(({ child }) => child.stdout.emit('data', 'yak grpc ok\n'))
    harness.assertLocalPortAvailable.mockRejectedValueOnce({ code: 'EADDRINUSE' })
    expect(await harness.handlers.get('start-secret-local-yaklang-engine')({}, params())).toMatchObject({
      ok: true,
      port: 9012,
    })
    expect(harness.spawn.mock.calls.map((call) => portFromArgs(call[1]))).toEqual([9012])
  })

  it('引擎只记录开始监听后退出时，复核实际端口抢占并重试', async () => {
    const harness = createHarness(({ child, args }) => {
      if (portFromArgs(args) === 9011) {
        child.stdout.emit('data', 'start to listen on: 127.0.0.1:9011\n')
        child.emit('close', 1)
      } else child.stdout.emit('data', 'yak grpc ok\n')
    })
    harness.assertLocalPortAvailable.mockResolvedValueOnce(undefined).mockRejectedValueOnce({ code: 'EADDRINUSE' })
    expect(await harness.handlers.get('start-secret-local-yaklang-engine')({}, params())).toMatchObject({
      ok: true,
      port: 9012,
    })
    expect(harness.spawn.mock.calls.map((call) => portFromArgs(call[1]))).toEqual([9011, 9012])
  })
})
