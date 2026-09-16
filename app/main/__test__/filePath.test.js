// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'

const directories = []
const loadPaths = (configuredHome = '', unavailableUserData = false) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ruiyan-home-test-'))
  directories.push(home)
  const userData = path.join(home, 'RuiYan-Pentest')
  const legacyHome = path.join(home, 'Yakit', 'yakit-projects')
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ YAKIT_HOME: configuredHome }))
  const processMock = { ...process, env: { ...process.env, YAKIT_HOME: legacyHome } }
  const mocks = {
    electron: {
      app: {
        getPath: () => {
          if (unavailableUserData) throw new Error('not ready')
          return userData
        },
      },
    },
    'electron-is-dev': false,
    os: { ...os, homedir: () => home },
    path,
    fs,
    process: processMock,
    './product': { productConfig: { defaultDataDirectory: 'RuiYan-Pentest' } },
  }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.resolve('app/main/filePath.js'), 'utf8'), {
    require: (name) => mocks[name],
    module,
    console: { log: () => {} },
  })
  return { paths: module.exports, home, userData, legacyHome, processMock }
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('睿眼独立数据目录', () => {
  it('忽略原版 Yakit 全局目录，所有派生路径留在睿眼产品目录', () => {
    const { paths, userData, legacyHome, processMock } = loadPaths()
    const root = path.join(userData, 'projects')
    expect(paths.getYakitHome()).toBe(root)
    expect(paths.getYaklangEngineDir()).toBe(path.join(root, 'yak-engine'))
    expect(paths.getEngineLogDir()).toBe(path.join(root, 'engine-log'))
    expect(paths.getRenderLogDir()).toBe(path.join(root, 'render-log'))
    expect(paths.getBasicDir()).toBe(path.join(root, 'base'))
    expect(fs.existsSync(legacyHome)).toBe(false)
    expect(processMock.env.YAKIT_HOME).toBe(legacyHome)
  })

  it('保留睿眼自己的显式绝对目录', () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'ruiyan-explicit-'))
    directories.push(target)
    const { paths } = loadPaths(target)
    expect(paths.getYakitHome()).toBe(target)
    expect(paths.getEngineLogDir()).toBe(path.join(target, 'engine-log'))
  })

  it('保留显式相对目录的既有解析方式', () => {
    const { paths, home } = loadPaths('ruiyan-custom')
    expect(paths.getYakitHome()).toBe(path.join(home, 'ruiyan-custom'))
  })

  it('产品 userData 尚未就绪时仍使用睿眼备用目录', () => {
    const { paths, home } = loadPaths('', true)
    expect(paths.getYakitHome()).toBe(path.join(home, 'RuiYan-Pentest', 'projects'))
  })
})
