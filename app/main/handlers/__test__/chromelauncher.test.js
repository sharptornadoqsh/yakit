import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Module, { createRequire } from 'node:module'

const nodeRequire = createRequire(import.meta.url)
const launcherModulePath = nodeRequire.resolve('../chromelauncher.js')
const originalLoad = Module._load

const handlers = new Map()
const launch = vi.fn()

beforeEach(() => {
  handlers.clear()
  launch.mockReset()
  launch.mockResolvedValue({ process: { on: vi.fn() } })
  delete nodeRequire.cache[launcherModulePath]

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        ipcMain: {
          handle: (channel, handler) => handlers.set(channel, handler),
        },
      }
    }
    if (request === 'chrome-launcher') {
      return { launch, killAll: vi.fn(), getChromePath: vi.fn() }
    }
    if (request === '../filePath') {
      return { getYakitHome: () => 'C:\\tmp\\yakit' }
    }
    if (request === '../product') {
      return { productConfig: { shortName: 'RuiYan', artifactContainerPrefix: 'ruiyan' } }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const registerChromeLauncherHandlers = nodeRequire(launcherModulePath)
    registerChromeLauncherHandlers()
  } finally {
    Module._load = originalLoad
  }
})

afterEach(() => {
  Module._load = originalLoad
  delete nodeRequire.cache[launcherModulePath]
})

describe('Chrome 免配置启动', () => {
  it('启动代理浏览器时打开空白新标签并保留代理地址', async () => {
    const launchChromeWithParams = handlers.get('LaunchChromeWithParams')
    expect(launchChromeWithParams).toBeTypeOf('function')

    await launchChromeWithParams(undefined, {
      host: '127.0.0.1',
      port: 8083,
      userDataDir: '',
      username: '',
      password: '',
      disableCACertPage: false,
      chromeFlags: [],
    })

    expect(launch).toHaveBeenCalledOnce()
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        startingUrl: 'chrome://newtab',
        chromeFlags: expect.arrayContaining(['--proxy-server=http://127.0.0.1:8083']),
      }),
    )
  })
})
