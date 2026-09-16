// @vitest-environment node

import fs from 'fs'
import os from 'os'
import path from 'path'
import vm from 'vm'
import { EventEmitter } from 'events'
import { createRequire } from 'module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApplicationIdentity, productConfig } from '../product'
import { supportedAssets } from '../../../packageScript/script/prepare-renyan-engine'
import packageJson from '../../../package.json'

const directories = []
const verifierPath = path.resolve('packageScript/script/verify-renyan-package.js')
const nativeRequire = createRequire(verifierPath)
const targets = [
  ['windows-x64', 'win32', 'x64'],
  ['linux-x64', 'linux', 'x64'],
  ['linux-arm64', 'linux', 'arm64'],
  ['macos-x64', 'darwin', 'x64'],
  ['macos-arm64', 'darwin', 'arm64'],
]

const loadModule = (file, mocks, processMock) => {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module,
    require: (name) => (Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : nativeRequire(name)),
    process: processMock,
    __dirname: path.dirname(file),
    Buffer,
    Date,
    setTimeout,
    console: { log: vi.fn(), error: vi.fn() },
  })
  return module.exports
}

const createHarness = (platform = 'win32', architecture = 'x64', behavior = 'ready') => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ruiyan-package-startup-'))
  directories.push(root)
  const home = path.join(root, 'user')
  const environment = {
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
    YAKIT_HOME: path.join(root, 'other-product'),
    NODE_OPTIONS: '--max_old_space_size=4096',
  }
  const originalEnvironment = { ...environment }
  const appData =
    platform === 'win32'
      ? environment.APPDATA
      : platform === 'darwin'
        ? path.join(home, 'Library', 'Application Support')
        : environment.XDG_CONFIG_HOME
  const userData = path.join(appData, productConfig.defaultDataDirectory)
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.exitCode = null
  child.signalCode = null
  child.kill = vi.fn(() => {
    child.exitCode = 0
    child.emit('close', 0)
  })
  const osMock = { ...os, homedir: () => home, tmpdir: () => root }
  let printLogDirectory
  const spawn = vi.fn((_file, _args, { env }) => {
    const appPaths = { appData }
    const app = {
      getPath: (name) => appPaths[name],
      setPath: (name, value) => (appPaths[name] = value),
      setName: vi.fn(),
      setAppUserModelId: vi.fn(),
    }
    configureApplicationIdentity(app, platform)
    const processMock = { platform, arch: architecture, env }
    const paths = loadModule(
      path.resolve('app/main/filePath.js'),
      { electron: { app }, 'electron-is-dev': false, os: osMock, process: processMock, './product': { productConfig } },
      processMock,
    )
    printLogDirectory = paths.getPrintLogDir()
    fs.mkdirSync(printLogDirectory, { recursive: true })
    const events = [
      '[engineLinkWin] did-finish-load',
      '[engineLinkWin] ready-to-show',
      '[mainWin] did-finish-load',
      '[mainWin] ready-to-show',
    ]
    if (behavior === 'missing-window') events.pop()
    if (behavior.startsWith('error:')) events.push(behavior.slice('error:'.length))
    fs.writeFileSync(path.join(printLogDirectory, 'print-log-startup.txt'), events.join('\n'))
    if (behavior === 'exit') child.exitCode = 3
    if (behavior === 'spawn-error') setTimeout(() => child.emit('error', new Error('spawn failed')), 0)
    return child
  })
  const execFileSync = vi.fn((_file, args) =>
    args[0] === '-e'
      ? JSON.stringify({ platform, arch: architecture, electron: packageJson.devDependencies.electron })
      : '',
  )
  if (platform === 'darwin') {
    fs.mkdirSync(path.join(root, 'release', architecture === 'arm64' ? 'mac-arm64' : 'mac', 'RuiYan.app'), {
      recursive: true,
    })
  }
  const verifier = loadModule(
    process.env.RENYAN_TEST_VERIFIER_SOURCE || verifierPath,
    {
      os: osMock,
      child_process: { spawn, execFileSync },
      '@electron/asar': {
        extractFile: (_archive, entry) =>
          Buffer.from(JSON.stringify(entry === 'package.json' ? packageJson : productConfig)),
      },
      '../../app/main/engineLifecycle': { extractAndVerifyEngineArchive: vi.fn() },
      './prepare-renyan-engine': { supportedAssets, verifyEngineBinary: vi.fn(), parseBoolean: vi.fn() },
    },
    { platform, arch: architecture, env: environment },
  )
  return {
    root,
    userData,
    child,
    environment,
    originalEnvironment,
    spawn,
    execFileSync,
    verifier,
    getLogDirectory: () => printLogDirectory,
  }
}

const runVerification = async (harness, target) => {
  const result = harness.verifier.verifyPackage({ root: harness.root, target, includeEngine: false }).then(
    (value) => ({ value }),
    (error) => ({ error }),
  )
  await vi.advanceTimersByTimeAsync(46000)
  return result
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  const temporaryRoot = fs.realpathSync(os.tmpdir())
  for (const directory of directories.splice(0)) {
    const resolved = fs.realpathSync(directory)
    if (
      !resolved.startsWith(`${temporaryRoot}${path.sep}`) ||
      !path.basename(resolved).startsWith('ruiyan-package-startup-')
    ) {
      throw new Error('Unexpected test directory')
    }
    fs.rmSync(resolved, { recursive: true, force: true })
  }
})

describe('安装包启动验证', () => {
  it.each(targets)('%s 使用产品真实目录的日志且隔离构建环境变量', async (target, platform, architecture) => {
    const harness = createHarness(platform, architecture)
    const result = await runVerification(harness, target)
    expect(result.error).toBeUndefined()
    expect(result.value).toMatchObject({ target, architecture, native: true })
    expect(harness.getLogDirectory()).toBe(path.join(harness.userData, 'projects', 'print-log'))
    expect(harness.spawn.mock.calls[0][1]).toEqual([`--user-data-dir=${harness.userData}`])
    for (const [, , options] of [
      ...harness.execFileSync.mock.calls.filter(([, args]) => args[0] === '-e'),
      ...harness.spawn.mock.calls,
    ]) {
      expect(options.env).not.toHaveProperty('NODE_OPTIONS')
      expect(options.env).not.toHaveProperty('YAKIT_HOME')
    }
    expect(harness.environment).toEqual(harness.originalEnvironment)
    expect(harness.child.kill).toHaveBeenCalledOnce()
  })

  it('缺少任意窗口就绪标记时仍然超时', async () => {
    const harness = createHarness('win32', 'x64', 'missing-window')
    const { error } = await runVerification(harness, 'windows-x64')
    expect(error.message).toContain('Packaged renderer did not load within 45 seconds')
    expect(harness.child.kill).toHaveBeenCalledOnce()
  })

  it.each(['uncaughtException', 'render-process-gone', 'did-fail-load'])(
    '真实日志包含 %s 时仍然失败',
    async (failure) => {
      const harness = createHarness('linux', 'arm64', `error:${failure}`)
      const { error } = await runVerification(harness, 'linux-arm64')
      expect(error.message).toContain('Packaged application reported a startup failure')
      expect(error.message).toContain(failure)
      expect(harness.child.kill).toHaveBeenCalledOnce()
    },
  )

  it.each(['exit', 'spawn-error'])('进程 %s 时仍然失败而不误报成功', async (behavior) => {
    const harness = createHarness('win32', 'x64', behavior)
    const { error } = await runVerification(harness, 'windows-x64')
    expect(error.message).toContain(
      behavior === 'exit' ? 'Packaged application exited before startup: 3/null' : 'spawn failed',
    )
    expect(harness.child.kill).not.toHaveBeenCalled()
  })

  it('已有产品配置时在启动前停止且保留原文件', async () => {
    const harness = createHarness()
    fs.mkdirSync(harness.userData, { recursive: true })
    const config = path.join(harness.userData, 'config.json')
    fs.writeFileSync(config, 'keep-existing-profile')
    const { error } = await runVerification(harness, 'windows-x64')
    expect(error.message).toContain('requires a clean RuiYan profile')
    expect(harness.spawn).not.toHaveBeenCalled()
    expect(fs.readFileSync(config, 'utf8')).toBe('keep-existing-profile')
  })
})
