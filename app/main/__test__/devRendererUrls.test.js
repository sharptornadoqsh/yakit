// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTrustedAppSender } from '../security'

const root = path.resolve(__dirname, '../../..')
const sender = (url) => ({ senderFrame: { url } })

afterEach(() => vi.unstubAllEnvs())

describe('开发页面实际地址联动', () => {
  it('仅接受当前两个服务的精确来源', () => {
    vi.stubEnv('YAKIT_DEV_MAIN_URL', 'http://127.0.0.1:3012')
    vi.stubEnv('YAKIT_DEV_STARTUP_URL', 'http://127.0.0.1:5184')
    expect(isTrustedAppSender(sender('http://127.0.0.1:3012/?window=child'))).toBe(true)
    expect(isTrustedAppSender(sender('http://127.0.0.1:5184/'))).toBe(true)
    for (const url of [
      'http://127.0.0.1:3000/',
      'http://127.0.0.1:5173/',
      'http://localhost:3012/',
      'http://127.0.0.1:3013/',
      'https://127.0.0.1:3012/',
    ]) {
      expect(isTrustedAppSender(sender(url))).toBe(false)
    }
    expect(isTrustedAppSender(sender('file:///application/index.html'))).toBe(true)
  })

  it.each([
    'app/main/index.js',
    'app/main/handlers/openNewChildWindow/index.js',
    'app/main/handlers/auxWindowManager/AuxWindowManager.js',
    'app/main/handlers/assets.js',
  ])('全部开发窗口通过共用地址入口加载：%s', (relative) => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8')
    expect(source).toContain('getDevRendererUrl')
    expect(source).not.toMatch(/http:\/\/127\.0\.0\.1:(3000|5173)/)
    expect(source).toContain('loadFile')
  })

  it('社区和企业免许可组合入口都通过统一启动器等待实际页面', () => {
    const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    expect(scripts.dev).toBe('node scripts/dev.js dev default')
    expect(scripts['dev-enterprise-no-license']).toBe('node scripts/dev.js dev enterprise-no-license')
    expect(scripts['start-electron']).toBe('node scripts/dev.js electron')
  })
})
