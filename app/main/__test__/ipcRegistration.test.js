// @vitest-environment node
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import { createRegistrationHarness } from './fixtures/ipcRegistration.cjs'

const options = () => ({
  sourceRoot:
    process.env.RENYAN_TEST_SOURCE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'),
  dependencyRoot: process.env.RENYAN_TEST_DEPENDENCY_ROOT || process.cwd(),
})

describe('IPC registration contracts', () => {
  it('registers separate main and EngineLink channels without duplicates', async () => {
    const harness = createRegistrationHarness(options())
    const result = await harness.register()
    expect(result.errors).toEqual({})
    for (const channel of ['fetch-file-content', 'debug-print-log', 'render-error-log']) {
      expect(harness.handlers.has(channel)).toBe(true)
      expect(harness.handlers.has(`EngineLink:${channel}`)).toBe(true)
    }
    expect(harness.handlers.has('password-api')).toBe(true)
    expect(new Set(harness.registrationOrder).size).toBe(harness.registrationOrder.length)
    expect(harness.registrationOrder.indexOf('EngineLink:fetch-file-content')).toBe(
      harness.registrationOrder.indexOf('get-yakit-home-config') - 1,
    )
    expect(harness.registrationOrder.indexOf('fetch-file-content')).toBeLessThan(
      harness.registrationOrder.indexOf('password-api'),
    )
    expect(harness.registrationOrder.indexOf('password-api')).toBeLessThan(
      harness.registrationOrder.indexOf('render-error-log'),
    )
    const prefixed = harness.calls.filter((call) => call.method === 'registerNewIPC')
    expect(prefixed.every((call) => call.args.at(-1) === 'EngineLink:')).toBe(true)
    expect(prefixed.filter((call) => call.name === 'localCache.js')).toHaveLength(1)
    expect(prefixed.filter((call) => call.name === 'handlers/newEngineStatus.js')).toHaveLength(1)
  })

  it('preserves file reads and failure recovery for both namespaces', async () => {
    const harness = createRegistrationHarness(options())
    expect((await harness.register()).errors).toEqual({})
    const file = path.resolve(options().dependencyRoot, 'app/main/handlers/portScan2.js')
    const main = harness.handlers.get('fetch-file-content')
    const startup = harness.handlers.get('EngineLink:fetch-file-content')
    expect(await startup({}, file)).toBe(await main({}, file))
    for (const handler of [main, startup]) {
      await expect(handler({}, 'missing.xls')).rejects.toThrow('.xls')
      await expect(handler({}, `${file}.missing`)).rejects.toThrow('ENOENT')
      expect(await handler({}, file)).toContain('registerNewIPC')
    }
  })

  it('keeps the portScan2 object export and requires its registration method', () => {
    const harness = createRegistrationHarness(options())
    const module = harness.load('handlers/portScan2.js')
    expect(typeof module).toBe('object')
    expect(typeof module.registerNewIPC).toBe('function')
    expect(() => module(harness.window, () => {}, 'EngineLink:')).toThrow(TypeError)
  })

  it('does not accept loaded windows when password loading aborts main registration', async () => {
    const harness = createRegistrationHarness({ ...options(), failPasswordLoad: true })
    const result = await harness.register()
    harness.finishWindowLoads()
    expect(harness.loadedEvents).toEqual([
      '[engineLinkWin] did-finish-load',
      '[engineLinkWin] ready-to-show',
      '[mainWin] did-finish-load',
      '[mainWin] ready-to-show',
    ])
    expect(result.success).toBe(false)
    expect(result.errors.main).toBe('TypeError: nodeCrypto.getRandomValues is not a function')
    expect(harness.handlers.has('password-api')).toBe(false)
    expect(harness.handlers.has('debug-print-log')).toBe(false)
    expect(harness.handlers.has('render-error-log')).toBe(false)
  })

  it('detects duplicate registration instead of overwriting an existing handler', () => {
    const harness = createRegistrationHarness(options())
    const module = harness.load('handlers/portScan2.js')
    module.registerNewIPC(harness.window, () => {}, 'EngineLink:')
    expect(() => module.registerNewIPC(harness.window, () => {}, 'EngineLink:')).toThrow(
      'Duplicate IPC handler: EngineLink:fetch-file-content',
    )
  })
})
