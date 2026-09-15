const fs = require('fs')
const path = require('path')
const net = require('net')
const http = require('http')
const crypto = require('crypto')
const { spawn, execFile } = require('child_process')
const { SESSION_PATH } = require('./dev-session')

const ROOT = path.resolve(__dirname, '..')
const SESSION_DIR = path.join(ROOT, '.Codex', 'dev-renderers')
const TIMEOUT = 10 * 60 * 1000
const MAX_ATTEMPTS = 100
const VARIANTS = {
  default: [[], 'default'],
  enterprise: [['enterprise'], 'enterprise'],
  'enterprise-no-license': [['enterprise', 'enterpriseNoLicense'], 'enterprise'],
  'simple-enterprise': [['simpleEE'], 'simpleEE'],
  irify: [['irify'], 'irify'],
  'irify-enterprise': [['irifyEnterprise'], 'irifyEnterprise'],
  memfit: [['memfit'], 'memfit'],
}

const getVariant = (variant) => {
  if (!Object.prototype.hasOwnProperty.call(VARIANTS, variant)) throw new Error(`未知的开发版本：${variant}`)
  const [profiles, mode] = VARIANTS[variant]
  const environments = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/renderer/src/main/.env-cmdrc'), 'utf8'))
  const mainEnv = Object.assign({}, ...['noBrouser', 'devTool', ...profiles].map((name) => environments[name]))
  return { mainEnv, mode }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const checkCancelled = (signal) => {
  if (signal?.aborted) throw new Error('开发服务启动已取消')
}

const findAvailablePort = async (preferredPort, attempts = MAX_ATTEMPTS) => {
  if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535) {
    throw new Error('开发端口必须是 1 到 65535 之间的整数')
  }
  for (let port = preferredPort; port <= Math.min(65535, preferredPort + attempts - 1); port++) {
    const available = await new Promise((resolve, reject) => {
      const probe = net.createServer()
      probe.once('error', (error) => (error.code === 'EADDRINUSE' ? resolve(false) : reject(error)))
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
    })
    if (available) return port
  }
  throw new Error('候选范围内没有可用端口')
}

const isAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

const request = (url, timeout = 1000) =>
  new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
        if (body.length > 65536) req.destroy()
      })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
      res.on('error', () => resolve(null))
    })
    req.setTimeout(timeout, () => req.destroy())
    req.on('error', () => resolve(null))
  })

const verifySession = async (session) => {
  if (!session || !isAlive(session.pid) || !isAlive(session.ownerPid)) return false
  try {
    const parsed = new URL(session.url)
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.origin !== session.url) return false
    const result = await request(`${session.url}${SESSION_PATH}`)
    if (result?.status !== 200 || result.headers['x-yakit-dev-session'] !== session.id) return false
    const identity = JSON.parse(result.body)
    return ['id', 'pid', 'role', 'variant'].every((key) => identity[key] === session[key])
  } catch {
    return false
  }
}

const readSession = (sessionDir, role) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(sessionDir, `${role}.json`), 'utf8'))
  } catch {
    return null
  }
}

const writeSession = (sessionDir, session) => {
  fs.mkdirSync(sessionDir, { recursive: true })
  const file = path.join(sessionDir, `${session.role}.json`)
  const temporary = `${file}.${session.id}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(session), 'utf8')
  fs.renameSync(temporary, file)
}

const removeSession = (sessionDir, session) => {
  const current = readSession(sessionDir, session.role)
  if (current?.id === session.id && current?.pid === session.pid) {
    fs.unlinkSync(path.join(sessionDir, `${session.role}.json`))
  }
}

const manageChild = (child, output) => {
  let failure
  let ended = false
  let listening = false
  const finished = new Promise((resolve) => {
    child.once('error', (error) => {
      failure = error
      ended = true
      resolve({ code: 1, error })
    })
    child.once('exit', (code, signal) => {
      ended = true
      resolve({ code, signal, error: failure })
    })
  })
  child.on('message', (message) => {
    if (message.type === 'failure') failure = Object.assign(new Error(message.message), { code: message.code })
    if (message.type === 'listening') listening = true
  })
  child.stdout?.on('data', (chunk) => output(chunk.toString()))
  child.stderr?.on('data', (chunk) => output(chunk.toString()))
  let stopping
  return {
    child,
    finished,
    isListening: () => listening,
    check() {
      if (failure) throw failure
      if (ended) throw new Error(`开发子进程提前退出：${child.exitCode}`)
    },
    stop() {
      if (stopping) return stopping
      stopping = (async () => {
        if (ended) return
        if (process.platform === 'win32') {
          await new Promise((resolve) =>
            execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, resolve),
          )
        } else {
          try {
            process.kill(-child.pid, 'SIGTERM')
          } catch (error) {
            if (error.code !== 'ESRCH') throw error
          }
        }
        let timer
        await Promise.race([
          finished,
          new Promise((resolve) => {
            timer = setTimeout(() => {
              if (!ended) child.kill('SIGKILL')
              resolve()
            }, 2000)
          }),
        ])
        clearTimeout(timer)
      })()
      return stopping
    },
  }
}

const startRenderer = async ({
  role,
  variant,
  sessionId = crypto.randomUUID(),
  paired = false,
  sessionDir = SESSION_DIR,
  preferredPort = role === 'main' ? 3000 : 5173,
  timeout = TIMEOUT,
  signal,
  children = new Set(),
  spawnProcess = spawn,
  output = (text) => process.stdout.write(text),
}) => {
  const config = getVariant(variant)
  const deadline = Date.now() + timeout
  const maxPort = Math.min(65535, preferredPort + MAX_ATTEMPTS - 1)
  let candidate = preferredPort
  for (let attempt = 0; candidate <= maxPort; attempt++) {
    checkCancelled(signal)
    const port = await findAvailablePort(candidate, maxPort - candidate + 1)
    const env = {
      ...process.env,
      ...(role === 'main' ? config.mainEnv : {}),
      HOST: '127.0.0.1',
      PORT: String(port),
      HTTPS: 'false',
      YAKIT_DEV_SESSION_ID: sessionId,
      YAKIT_DEV_ROLE: role,
      YAKIT_DEV_VARIANT: variant,
      YAKIT_DEV_VITE_MODE: config.mode,
      YAKIT_DEV_ATTEMPT: String(attempt),
    }
    const child = spawnProcess(process.execPath, [path.join(__dirname, 'dev-renderer.js')], {
      cwd: path.join(ROOT, role === 'main' ? 'app/renderer/src/main' : 'app/renderer/engine-link-startup'),
      env,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })
    const handle = manageChild(child, output)
    children.add(handle)
    const session = {
      id: sessionId,
      pid: child.pid,
      ownerPid: process.pid,
      role,
      variant,
      paired,
      url: `http://127.0.0.1:${port}`,
      ready: false,
    }
    const stop = async () => {
      await handle.stop()
      children.delete(handle)
      removeSession(sessionDir, session)
    }
    writeSession(sessionDir, session)
    try {
      while (Date.now() < deadline) {
        checkCancelled(signal)
        handle.check()
        if (handle.isListening() && (await verifySession(session))) {
          const page = await request(`${session.url}/`, Math.min(5000, Math.max(1, deadline - Date.now())))
          handle.check()
          if (page?.status === 200 && page.headers['x-yakit-dev-session'] === session.id) {
            session.ready = true
            writeSession(sessionDir, session)
            output(`${role} 开发页面已就绪：${session.url}\n`)
            return { session, stop, finished: handle.finished }
          }
        }
        await delay(100)
      }
      throw new Error(`${role} 开发页面启动超时`)
    } catch (error) {
      await stop()
      if (error.code !== 'EADDRINUSE' || Date.now() >= deadline) throw error
      candidate = port + 1
      output(`${role} 端口 ${port} 被占用，继续尝试下一端口\n`)
    }
  }
  throw new Error('候选范围内没有可用端口')
}

const waitForRenderers = async ({ sessionDir = SESSION_DIR, timeout = TIMEOUT, signal } = {}) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    checkCancelled(signal)
    const main = readSession(sessionDir, 'main')
    const startup = readSession(sessionDir, 'startup')
    const samePair = main && startup && ((!main.paired && !startup.paired) || main.id === startup.id)
    if (
      main?.ready &&
      startup?.ready &&
      samePair &&
      getVariant(main.variant).mode === getVariant(startup.variant).mode
    ) {
      const valid = await Promise.all([verifySession(main), verifySession(startup)])
      if (valid.every(Boolean)) return { main, startup }
    }
    await delay(100)
  }
  throw new Error('等待本次主页面和启动页面超时；请先运行对应版本的 start-renders 命令')
}

const run = async (mode, variant = 'default') => {
  if (!['dev', 'renders', 'main', 'startup', 'electron'].includes(mode)) throw new Error('未知的开发启动命令')
  const controller = new AbortController()
  const children = new Set()
  const services = []
  const startingServices = []
  const sessionId = crypto.randomUUID()
  const onSignal = () => {
    controller.abort()
    for (const handle of children) void handle.stop()
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  try {
    let sessions
    if (mode === 'electron') {
      sessions = await waitForRenderers({ signal: controller.signal })
    } else {
      const roles = ['dev', 'renders'].includes(mode) ? ['main', 'startup'] : [mode]
      startingServices.push(
        ...roles.map(async (role) => {
          const service = await startRenderer({
            role,
            variant,
            sessionId,
            paired: roles.length === 2,
            signal: controller.signal,
            children,
          })
          services.push(service)
        }),
      )
      await Promise.all(startingServices)
      sessions = Object.fromEntries(services.map((service) => [service.session.role, service.session]))
    }
    checkCancelled(controller.signal)
    if (['electron', 'dev'].includes(mode)) {
      const valid = await Promise.all([verifySession(sessions.main), verifySession(sessions.startup)])
      if (!valid.every(Boolean)) throw new Error('开发页面已退出，请重新启动对应版本')
      const child = spawn(require('electron'), [ROOT], {
        cwd: ROOT,
        env: { ...process.env, YAKIT_DEV_MAIN_URL: sessions.main.url, YAKIT_DEV_STARTUP_URL: sessions.startup.url },
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const handle = manageChild(child, (text) => process.stdout.write(text))
      children.add(handle)
      const result = await Promise.race([handle.finished, ...services.map((service) => service.finished)])
      if (result.error) throw result.error
      process.exitCode = result.code || 0
    } else {
      const result = await Promise.race(services.map((service) => service.finished))
      if (!controller.signal.aborted) throw result.error || new Error(`开发页面退出：${result.code}`)
    }
  } finally {
    controller.abort()
    await Promise.allSettled(startingServices)
    await Promise.all([...children].map((handle) => handle.stop()))
    await Promise.all(services.map((service) => service.stop()))
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
  }
}

if (require.main === module) {
  run(...process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { findAvailablePort, getVariant, startRenderer, verifySession, waitForRenderers }
