import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import Module, { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const nodeRequire = createRequire(import.meta.url)
const launcherModulePath = nodeRequire.resolve('../chromelauncher.js')
const originalLoad = Module._load

const handlers = new Map()
const launch = vi.fn()
let productUserDataDir = ''

beforeEach(() => {
  handlers.clear()
  launch.mockReset()
  launch.mockResolvedValue({ process: { on: vi.fn() } })
  productUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ruiyan-chrome-launcher-'))
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
      return {
        getAppConfigDir: () => productUserDataDir,
        getYakitHome: () => 'D:\\ProgramFiles\\Yakit\\yakit-projects',
      }
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
  fs.rmSync(productUserDataDir, { recursive: true, force: true })
})

describe('Chrome 免配置启动', () => {
  it('默认用户目录独立于旧项目目录', async () => {
    const getDefaultUserDataDir = handlers.get('getDefaultUserDataDir')
    expect(getDefaultUserDataDir).toBeTypeOf('function')

    await expect(getDefaultUserDataDir()).resolves.toBe(path.join(productUserDataDir, 'projects', 'chrome-profile'))
  })

  it('返回默认用户目录前确保目录已创建', async () => {
    const getDefaultUserDataDir = handlers.get('getDefaultUserDataDir')

    const userDataDir = await getDefaultUserDataDir()

    expect(fs.existsSync(userDataDir)).toBe(true)
  })

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
