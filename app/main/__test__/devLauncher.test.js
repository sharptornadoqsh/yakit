// @vitest-environment node
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { findAvailablePort, getVariant, startRenderer, verifySession, waitForRenderers } from '../../../scripts/dev'

const root = path.resolve(__dirname, '../../..')
const resources = []
const sessionDir = path.join(root, '.Codex/startup-port-fix-20260915/dev-web-test-sessions')
const fixture = path.join(__dirname, 'fixtures/devRenderer.cjs')

async function listen(port = 0, handler = (_req, res) => res.end('<html>other service</html>')) {
  const server = http.createServer(handler)
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve))
  resources.push(() => new Promise((resolve) => server.close(resolve)))
  return server.address().port
}

async function renderer(options = {}, fixtureMode = 'ready') {
  const result = await startRenderer({
    role: 'main',
    variant: 'enterprise-no-license',
    preferredPort: 39000,
    sessionId: 'test-session',
    sessionDir,
    timeout: 3000,
    ...options,
    spawnProcess: (_command, _args, spawnOptions) => spawn(process.execPath, [fixture, fixtureMode], spawnOptions),
    output: () => {},
  })
  resources.push(result.stop)
  return result
}

afterEach(async () => {
  await Promise.all(resources.splice(0).map((close) => close()))
  for (const role of ['main', 'startup']) {
    const file = path.join(sessionDir, `${role}.json`)
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }
})

describe('开发服务端口与会话', () => {
  it('首选及连续端口被占用时递增，保留占用服务', async () => {
    const first = await findAvailablePort(39000)
    await listen(first)
    await listen(first + 1)
    expect(await findAvailablePort(first)).toBe(first + 2)
    const service = await renderer({ preferredPort: first })
    expect(service.session.url).toBe(`http://127.0.0.1:${first + 2}`)
    expect(await verifySession(service.session)).toBe(true)
  })

  it('无冲突保留首选端口', async () => {
    const port = await findAvailablePort(39010)
    const service = await renderer({ preferredPort: port })
    expect(service.session.url).toBe(`http://127.0.0.1:${port}`)
  })

  it('探测后绑定竞态发生明确 EADDRINUSE 时清理旧尝试再重试', async () => {
    const port = await findAvailablePort(39020)
    const service = await renderer({ preferredPort: port }, 'race')
    expect(service.session.url).toBe(`http://127.0.0.1:${port + 1}`)
    expect(service.session.pid).toBeGreaterThan(0)
  })

  it('非端口错误直接返回，不隐瞒重试', async () => {
    await expect(renderer({}, 'failure')).rejects.toThrow('fixture startup failure')
  })

  it('随机 HTML、错误会话和陈旧进程均不算就绪', async () => {
    const port = await listen()
    const other = {
      url: `http://127.0.0.1:${port}`,
      id: 'stale',
      pid: process.pid,
      ownerPid: process.pid,
      role: 'main',
    }
    expect(await verifySession(other)).toBe(false)
    const service = await renderer()
    expect(await verifySession({ ...service.session, id: 'different-session' })).toBe(false)
    expect(await verifySession({ ...service.session, pid: 2147483647 })).toBe(false)
    await service.stop()
    expect(await verifySession(service.session)).toBe(false)
  })

  it('进程存活却没有服务时限时返回并清理', async () => {
    await expect(renderer({ timeout: 150 }, 'hang')).rejects.toThrow('超时')
  })

  it('只有同组且版本对应的两个活动会话才交给独立 Electron', async () => {
    const main = await renderer()
    const startup = await renderer({ role: 'startup', preferredPort: 39100 })
    const sessions = await waitForRenderers({ sessionDir, timeout: 1000 })
    expect(sessions.main.url).toBe(main.session.url)
    expect(sessions.startup.url).toBe(startup.session.url)
    fs.writeFileSync(path.join(sessionDir, 'startup.json'), JSON.stringify({ ...startup.session, id: 'old-pair' }))
    await expect(waitForRenderers({ sessionDir, timeout: 100 })).rejects.toThrow('超时')
  })

  it('端口范围上限和有限候选数均终止', async () => {
    await listen(65535)
    await expect(findAvailablePort(65535)).rejects.toThrow('可用端口')
    await expect(findAvailablePort(65536)).rejects.toThrow('端口')
    const port = await listen()
    await expect(findAvailablePort(port, 1)).rejects.toThrow('可用端口')
  })

  it.each([
    ['default', undefined, 'default'],
    ['enterprise', 'enterprise', 'enterprise'],
    ['enterprise-no-license', 'enterprise', 'enterprise'],
    ['simple-enterprise', 'simple-enterprise', 'simpleEE'],
    ['irify', 'irify', 'irify'],
    ['irify-enterprise', 'irify-enterprise', 'irifyEnterprise'],
    ['memfit', 'memfit', 'memfit'],
  ])('版本 %s 复用既有主界面环境和启动页模式', (variant, platform, mode) => {
    const config = getVariant(variant)
    expect(config.mainEnv.REACT_APP_PLATFORM).toBe(platform)
    expect(config.mode).toBe(mode)
    expect(config.mainEnv.BROWSER).toBe('none')
    expect(config.mainEnv.REACT_APP_REQUIRE_ENTERPRISE_LICENSE).toBe(
      variant === 'enterprise-no-license' ? 'false' : undefined,
    )
  })
})
