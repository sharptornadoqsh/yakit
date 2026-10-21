const assert = require('assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const net = require('net')
const path = require('path')
const { execFileSync, spawn } = require('child_process')
const { redactEngineOutput } = require('../../app/main/windowsLegacyEngine')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const readLogs = (directory) =>
  fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((name) => name.endsWith('.txt'))
        .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
        .join('\n')
    : ''

const inspectStartupLogs = (print, engine) => {
  if (
    /uncaughtException|render-process-gone|did-fail-load|register(?:New)?IPC (?:error|failed)/i.test(print) ||
    /fatal error:|panic before malloc|引擎进程提前退出|引擎未完成启动|引擎运行时初始化失败|引擎 DLL|本地引擎超时|检查随机密码模式超时|部署失败/.test(engine) ||
    /检查随机密码模式结束，退出码: (?!0(?:\D|$))/.test(engine)
  ) {
    throw new Error('成品 IPC 或引擎启动失败；窗口加载不作为通过依据')
  }
  return (
    ['engineLinkWin', 'mainWin'].every(
      (name) => print.includes(`[${name}] did-finish-load`) && print.includes(`[${name}] ready-to-show`),
    ) &&
    print.includes('[engineLinkWin] registerNewIPC completed') &&
    print.includes('[Main] registerIPC completed') &&
    engine.includes('随机密码模式检查通过') &&
    /Echo 测试通过|引擎启动成功|成功启动本地引擎/.test(engine)
  )
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    const timer = setTimeout(() => {
      server.close()
      reject(new Error('分配验包调试端口超时'))
    }, 5000)
    server.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close((error) => {
        clearTimeout(timer)
        if (error) reject(error)
        else resolve(port)
      })
    })
  })

const evaluate = (url, expression) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    let settled = false
    const timer = setTimeout(() => finish(new Error('成品 IPC/Echo 检查超时')), 10000)
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.close()
      if (error) reject(error)
      else resolve(result)
    }
    socket.addEventListener('error', () => finish(new Error('成品调试连接失败')))
    socket.addEventListener('open', () => {
      if (settled) {
        socket.close()
        return
      }
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      )
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      if (message.error || message.result?.exceptionDetails) finish(new Error('真实 IPC/Echo 调用失败'))
      else finish(null, message.result?.result?.value)
    })
  })

const powershell = (script) =>
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
  }).trim()

const processSnapshot = () =>
  [].concat(JSON.parse(
    powershell(
      '@(Get-CimInstance Win32_Process | Where-Object {$_.CreationDate} | ' +
        'Select-Object ProcessId,ParentProcessId,ExecutablePath,' +
        "@{n='Created';e={$_.CreationDate.ToUniversalTime().ToString('o')}}) | ConvertTo-Json -Compress",
    ) || '[]',
  ))

const ownedDescendants = (rootPid, snapshot) => {
  const pids = new Set([rootPid])
  let added
  do {
    added = false
    for (const process of snapshot) {
      if (pids.has(process.ParentProcessId) && !pids.has(process.ProcessId)) {
        pids.add(process.ProcessId)
        added = true
      }
    }
  } while (added)
  return snapshot.filter((process) => pids.has(process.ProcessId))
}

const verifyWindowsLegacyStartup = async (executable, env, userData, artifact, reportPath) => {
  assert.equal(env.GITHUB_ACTIONS, 'true', '严格宿主验包仅在 GitHub Actions 执行')
  const port = await freePort()
  const child = spawn(executable, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], {
    env: { ...env, RENYAN_PACKAGE_VERIFY_USER_DATA: userData },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let launchError
  child.on('error', (error) => (launchError = error))
  // Do not copy arbitrary application stdio or credentials into the Actions log.
  child.stdout.resume()
  child.stderr.resume()
  const owned = new Map()
  const report = { hostVerification: 'failed', win7Verification: 'pending', ipc: false, capability: false, echo: false }
  const home = path.join(userData, 'projects')
  try {
    const start = Date.now()
    while (Date.now() - start < 240000) {
      if (launchError) throw launchError
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`成品进程提前退出：${child.exitCode}`)
      const snapshot = processSnapshot()
      for (const item of ownedDescendants(child.pid, snapshot)) {
        if (!owned.has(item.ProcessId)) owned.set(item.ProcessId, item)
      }
      const print = readLogs(path.join(home, 'print-log'))
      const engine = readLogs(path.join(home, 'engine-log'))
      if (inspectStartupLogs(print, engine)) {
        const targets = await fetch(`http://127.0.0.1:${port}/json/list`, {
          signal: AbortSignal.timeout(5000),
        }).then((r) => r.json())
        const target = targets.find((item) => item.type === 'page' && /engine-link-startup/.test(item.url))
        if (!target) throw new Error('启动窗口调试目标缺失')
        const challenge = `package-${crypto.randomBytes(16).toString('hex')}`
        const result = await evaluate(
          target.webSocketDebuggerUrl,
          `(async () => {
            const bridge = window.yakitBridge;
            if (!bridge?.system?.windowsLegacy) throw new Error('legacy flag missing');
            const reply = await bridge.engine.echo({text: ${JSON.stringify(challenge)}});
            if (reply.result !== ${JSON.stringify(challenge)}) throw new Error('echo mismatch');
            const address = await bridge.engine.fetchYaklangEngineAddr();
            return {ok: true, address: address.addr};
          })()`,
        )
        assert.equal(result?.ok, true, '成品实际连接检查失败')
        const enginePort = Number(result.address?.match(/:(\d+)$/)?.[1])
        assert.ok(Number.isInteger(enginePort) && enginePort > 0 && enginePort <= 65535, '引擎端口无效')
        const listeners = JSON.parse(
          powershell(
            `@(Get-NetTCPConnection -LocalPort ${enginePort} -State Listen | ` +
              'Select-Object -ExpandProperty OwningProcess) | ConvertTo-Json -Compress',
          ) || '[]',
        )
        const current = processSnapshot()
        const expectedEngine = path.join(home, 'yak-engine/yak.exe').toLowerCase()
        const engineProcess = current.find(
          (item) =>
            item.ExecutablePath?.toLowerCase() === expectedEngine &&
            owned.get(item.ProcessId)?.Created === item.Created,
        )
        assert.ok(engineProcess && [].concat(listeners).includes(engineProcess.ProcessId), '连接不是本次启动的引擎')
        const { verifyFileSha256 } = require('../../app/main/engineLifecycle')
        for (const file of artifact.files) {
          await verifyFileSha256(path.join(home, 'yak-engine', file.name), file.sha256)
        }
        await wait(2000)
        assert.ok(inspectStartupLogs(readLogs(path.join(home, 'print-log')), readLogs(path.join(home, 'engine-log'))))
        const alive = processSnapshot().some(
          (item) => item.ProcessId === engineProcess.ProcessId && item.Created === engineProcess.Created,
        )
        assert.ok(alive && child.exitCode === null, '窗口就绪后引擎或应用退出')
        Object.assign(report, { hostVerification: 'passed', ipc: true, capability: true, echo: true })
        return report
      }
      await wait(1000)
    }
    throw new Error('成品 IPC、能力检查或真实连接未在 240 秒内完成')
  } catch (error) {
    report.error = redactEngineOutput(error.message)
    const engine = readLogs(path.join(home, 'engine-log'))
    report.engineExitCodes = [...engine.matchAll(/退出码[:：]\s*(-?\d+)/g)].map((match) => match[1])
    report.runtimeFailure = /fatal error:|panic before malloc/.test(engine)
    throw new Error(report.error)
  } finally {
    let cleanupError
    let remaining = []
    try {
      const current = processSnapshot()
      const root = owned.get(child.pid)
      if (!root || current.some((item) => item.ProcessId === root.ProcessId && item.Created === root.Created)) {
        for (const item of ownedDescendants(child.pid, current)) {
          if (!owned.has(item.ProcessId)) owned.set(item.ProcessId, item)
        }
      }
      // Creation time prevents a recycled PID from being treated as an owned process.
      for (const item of [...owned.values()].reverse()) {
        const live = processSnapshot().find(
          (process) => process.ProcessId === item.ProcessId && process.Created === item.Created,
        )
        if (live) {
          powershell(
            `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${item.ProcessId}'; ` +
              `if ($p -and $p.CreationDate.ToUniversalTime().ToString('o') -eq '${item.Created}') { ` +
              `$process = Get-Process -Id ${item.ProcessId} -ErrorAction SilentlyContinue; ` +
              `if ($process) { $process.Kill(); if (-not $process.WaitForExit(5000)) { throw '进程退出超时' } } }`,
          )
        }
      }
    } catch (error) {
      cleanupError = error
    }
    try {
      remaining = processSnapshot().filter((item) => owned.get(item.ProcessId)?.Created === item.Created)
    } catch (error) {
      cleanupError = cleanupError || error
    }
    report.cleanup = remaining.length === 0 && !cleanupError ? 'passed' : 'failed'
    if (report.cleanup !== 'passed') report.hostVerification = 'failed'
    if (reportPath) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true })
      fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    }
    if (cleanupError) throw new Error('验包进程清理失败，详见宿主检查状态')
    assert.equal(remaining.length, 0, '验包进程清理未完成')
  }
}

module.exports = { inspectStartupLogs, ownedDescendants, verifyWindowsLegacyStartup }
