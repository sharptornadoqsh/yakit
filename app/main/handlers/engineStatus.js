const { ipcMain } = require('electron')
const { getDefaultDatabaseEnvironment } = require('../defaultDatabase')
const childProcess = require('child_process')
const path = require('path')
const _sudoPrompt = require('sudo-prompt')
const { GLOBAL_YAK_SETTING } = require('../state')
const { testRemoteClient } = require('../ipc')
const { getLocalYaklangEngine, getYakitHome } = require('../filePath')
const net = require('net')
const { engineLogOutputFileAndUI, engineLogOutputUI } = require('../logFile')
const { assertTrustedAppSender, normalizePid } = require('../security')
const { psYakList } = require('./yakLocal')
const { runSpecialDetectionActivation } = require('../specialDetectionActivation')

let dbFile = undefined
let currentEngineMode
let lastLocalEngineRuntime
let specialDetectionActivationTask

const DEFAULT_PROFILE_DATABASE_NAME = 'yakit-profile-plugin.db'
const LOCAL_ENGINE_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

const parseEngineAddress = (address) => {
  const value = String(address || '')
  if (value.startsWith('[')) {
    const closingBracket = value.indexOf(']')
    return {
      host: value.slice(1, closingBracket),
      port: Number(value.slice(closingBracket + 2)),
    }
  }
  const separator = value.lastIndexOf(':')
  return {
    host: separator >= 0 ? value.slice(0, separator) : value,
    port: Number(separator >= 0 ? value.slice(separator + 1) : 0),
  }
}

const resolveDatabasePath = (home, databaseName) =>
  path.isAbsolute(databaseName) ? databaseName : path.join(home, databaseName)

const getDatabaseArgument = (args, name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const createLocalEngineRuntime = ({ version, args = [], environment }) => {
  const home = environment.YAKIT_HOME
  const profileDatabaseName =
    getDatabaseArgument(args, '--profile-db') ||
    environment.YAK_DEFAULT_PROFILE_DATABASE_NAME ||
    DEFAULT_PROFILE_DATABASE_NAME
  const projectDatabaseName = getDatabaseArgument(args, '--project-db') || environment.YAK_DEFAULT_PROJECT_DATABASE_NAME
  const activationEnvironment = {
    ...environment,
    YAK_DEFAULT_PROFILE_DATABASE_NAME: profileDatabaseName,
  }
  if (projectDatabaseName) {
    activationEnvironment.YAK_DEFAULT_PROJECT_DATABASE_NAME = projectDatabaseName
  }
  return {
    version,
    environment: activationEnvironment,
    profileDatabasePath: resolveDatabasePath(home, profileDatabaseName),
    projectDatabasePath: projectDatabaseName ? resolveDatabasePath(home, projectDatabaseName) : '',
  }
}

const createFallbackLocalEngineRuntime = () => {
  const version = process.env.RENDER_PLATFORM || process.env.REACT_APP_PLATFORM || 'yakit'
  const home = getYakitHome()
  const databaseEnvironment = getDefaultDatabaseEnvironment(version, version)
  const environment = {
    ...process.env,
    YAKIT_HOME: home,
    ...databaseEnvironment,
  }
  return createLocalEngineRuntime({ version, environment })
}

const querySpecialDetectionGroups = (client, pageId) =>
  new Promise((resolve, reject) => {
    client.QueryYakScriptGroup(
      {
        All: false,
        IsPocBuiltIn: true,
        IsMITMParamPlugins: 2,
        ExcludeType: ['yak', 'codec', 'lua'],
        PageId: pageId || 'YakPoC',
      },
      (error, data) => {
        if (error) {
          reject(error)
          return
        }
        const groups = Array.isArray(data?.Group) ? data.Group : []
        resolve({
          groupCount: groups.length,
          pluginCount: groups.reduce((total, group) => total + Number(group.Total || 0), 0),
        })
      },
    )
  })

const getCurrentEnginePids = async (port) => {
  const processes = await psYakList()
  return processes
    .filter((item) => Number(item.port) === Number(port))
    .map((item) => Number(item.pid))
    .filter(Number.isSafeInteger)
    .sort((left, right) => left - right)
}

function isPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer({})
    server.on('listening', () => {
      server.close((err) => {
        if (err === undefined) {
          resolve()
        } else {
          reject(err)
        }
      })
    })
    server.on('error', (err) => {
      reject(err)
    })
    server.listen(port, () => {})
  })
}

const isWindows = process.platform === 'win32'

const runWindowsTaskKill = (pid) => {
  return new Promise((resolve, reject) => {
    const subprocess = childProcess.spawn('taskkill', ['/F', '/PID', `${pid}`], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    subprocess.stderr.on('data', (data) => {
      stderr += data.toString('utf-8')
    })
    subprocess.on('error', (error) => {
      reject(error)
    })
    subprocess.on('close', (code) => {
      if (code === 0) {
        resolve('')
        return
      }
      reject(stderr || `taskkill exited with code ${code}`)
    })
  })
}

/** @name 生成windows系统的管理员权限命令 */
// function generateWindowsSudoCommand(file, args) {
//     const cmds = args === "" ? `"'${file}'"` : `"'${file}'" "'${args}'"`
//     return `powershell.exe start-process -verb runas -WindowStyle hidden -filepath ${cmds}`
// }
/** @name 以管理员权限执行命令 */
// function sudoExec(cmd, opt, callback) {
//     if (isWindows) {
//         childProcess.exec(cmd, {maxBuffer: 1000 * 1000 * 1000}, (err, stdout, stderr) => {
//             callback(err)
//         })
//     } else {
//         _sudoPrompt.exec(cmd, {...opt, env: {YAKIT_HOME: getYakitHome()}}, callback)
//     }
// }

const ECHO_TEST_MSG = 'Hello RuiYan!'

module.exports = (win, callback, getClient, newClient) => {
  /** 获取本地引擎版本号 */
  ipcMain.handle('fetch-yak-version', () => {
    try {
      engineLogOutputFileAndUI(win, `----- 获取正在连接引擎的版本号 -----`)
      getClient().Version({}, async (err, data) => {
        if (win && data.Version) {
          engineLogOutputFileAndUI(win, `----- 正在连接引擎的版本号: ${data.Version} -----`)
          win.webContents.send('fetch-yak-version-callback', data.Version)
        } else win.webContents.send('fetch-yak-version-callback', '')
      })
    } catch (e) {
      engineLogOutputFileAndUI(win, `----- 获取正在连接引擎版本号失败 -----`)
      engineLogOutputFileAndUI(win, `${e}`)
      win.webContents.send('fetch-yak-version-callback', '')
    }
  })

  ipcMain.handle('engine-status', () => {
    try {
      const text = 'hello yak grpc engine'
      getClient().Echo({ text }, (err, data) => {
        if (win) {
          if (data?.result === text) {
            win.webContents.send('client-engine-status-ok')
          } else {
            win.webContents.send('client-engine-status-error')
          }
        }
      })
    } catch (e) {
      if (win) {
        win.webContents.send('client-engine-status-error')
      }
    }
  })

  // asyncGetRandomPort wrapper
  const asyncGetRandomPort = () => {
    return new Promise((resolve, reject) => {
      const port = 40000 + Math.floor(Math.random() * 9999)
      isPortAvailable(port)
        .then(() => {
          resolve(port)
        })
        .catch((err) => {
          reject(err)
        })
    })
  }
  ipcMain.handle('get-random-local-engine-port', async (e) => {
    return await asyncGetRandomPort()
  })

  // asyncIsPortAvailable wrapper
  const asyncIsPortAvailable = (params) => {
    return isPortAvailable(params)
  }
  ipcMain.handle('is-port-available', async (e, port) => {
    /**
     * @port: 判断端口是否是可以被监听的
     */
    return await asyncIsPortAvailable(port)
  })

  /**
   * @name 手动启动yaklang引擎进程
   * @param {Object} params
   * @param {Boolean} params.sudo 是否使用管理员权限启动yak
   * @param {Number} params.port 本地缓存数据里的引擎启动端口号
   * @param {Boolean} params.isEnpriTraceAgent 本地缓存数据里的引擎启动端口号
   */
  const asyncStartLocalYakEngineServer = (win, params) => {
    const { version } = params

    const { port, isEnpriTraceAgent, isIRify } = params
    return new Promise((resolve, reject) => {
      try {
        engineLogOutputFileAndUI(win, `----- 已启动本地引擎进程 -----`)
        if (isIRify) {
          dbFile = ['--profile-db', 'irify-profile-rule.db', '--project-db', 'default-irify.db']
        }

        const grpcPort = ['grpc', '--port', `${port}`, '--frontend', `${version || 'yakit'}`]
        const extraParams = dbFile ? [...grpcPort, ...dbFile] : grpcPort
        const resultParams = isEnpriTraceAgent ? [...extraParams, '--disable-output'] : extraParams

        engineLogOutputFileAndUI(win, `启动命令: ${getLocalYaklangEngine()} ${resultParams.join(' ')}`)
        const environment = {
          ...process.env,
          YAKIT_HOME: getYakitHome(),
          ...getDefaultDatabaseEnvironment(version, version),
        }
        const subprocess = childProcess.spawn(getLocalYaklangEngine(), resultParams, {
          detached: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: environment,
        })
        currentEngineMode = 'local'
        lastLocalEngineRuntime = {
          ...createLocalEngineRuntime({ version, args: resultParams, environment }),
          enginePid: subprocess.pid,
          port,
        }

        // subprocess.unref()
        process.on('exit', () => {
          // 终止子进程
          subprocess.kill()
        })
        subprocess.on('error', (err) => {
          engineLogOutputFileAndUI(win, `----- 本地引擎遭遇错误，错误原因 -----`)
          engineLogOutputFileAndUI(win, err)
          win.webContents.send('start-yaklang-engine-error', `本地引擎遭遇错误，错误原因为：${err}`)
          reject(err)
        })
        subprocess.on('close', async (e) => {
          engineLogOutputFileAndUI(win, `----- 本地引擎退出，退出码为：${e} -----`)
        })

        subprocess.stdout.on('data', (data) => {
          try {
            // const match = data.toString("utf-8").match(/\[\w+:\d+]\s+(.*)/)[1]
            engineLogOutputFileAndUI(win, `${data.toString('utf-8')}`)
          } catch (error) {}
        })
        subprocess.stderr.on('data', (data) => {
          try {
            // const match = data.toString("utf-8").match(/\[\w+:\d+]\s+(.*)/)[1]
            engineLogOutputFileAndUI(win, `${data.toString('utf-8')}`)
          } catch (error) {}
        })
        resolve()
      } catch (e) {
        reject(e)
      }
    })
  }

  /** 本地启动yaklang引擎 */
  ipcMain.handle('start-local-yaklang-engine', async (e, params) => {
    if (!params['port']) {
      throw Error('启动本地引擎必须指定端口')
    }
    return await asyncStartLocalYakEngineServer(win, params)
  })

  /** 判断远程缓存端口是否已开启引擎 */
  const judgeRemoteEngineStarted = (win, params) => {
    return new Promise((resolve, reject) => {
      try {
        testRemoteClient(params, async (err, result) => {
          if (!err) {
            GLOBAL_YAK_SETTING.defaultYakGRPCAddr = `${params.host}:${params.port}`
            GLOBAL_YAK_SETTING.caPem = params.caPem || ''
            GLOBAL_YAK_SETTING.password = params.password
            GLOBAL_YAK_SETTING.sudo = false
            currentEngineMode = 'remote'
            win.webContents.send('start-yaklang-engine-success', 'remote')
            resolve()
          } else reject(err)
        })
      } catch (e) {
        reject(e)
      }
    })
  }
  /** 远程连接引擎 */
  ipcMain.handle('start-remote-yaklang-engine', async (e, params) => {
    return await judgeRemoteEngineStarted(win, params)
  })

  /** 连接引擎 */
  ipcMain.handle('connect-yaklang-engine', async (e, params) => {
    /**
     * connect yaklang engine 实际上是为了设置参数，实际上他是不知道远程还是本地
     * params 中的参数应该有如下：
     *  @Host: 主机名，可能携带端口
     *  @Port: 端口
     *  @Sudo: 是否是管理员权限
     *  @IsTLS?: 是否是 TLS 加密的
     *  @PemBytes?: Uint8Array 是 CaPem
     *  @Password?: 登陆密码
     */
    const hostRaw = `${params['Host'] || '127.0.0.1'}`
    let portFromRaw = `${params['Port'] || 8087}`
    let hostFormatted = hostRaw
    if (hostRaw.lastIndexOf(':') >= 0) {
      portFromRaw = `${parseInt(hostRaw.substr(hostRaw.lastIndexOf(':') + 1))}`
      hostFormatted = `${hostRaw.substr(0, hostRaw.lastIndexOf(':'))}`
    }
    const addr = `${hostFormatted}:${portFromRaw}`
    engineLogOutputFileAndUI(win, `原始参数为: ${JSON.stringify(params)}`)
    engineLogOutputFileAndUI(win, `开始连接引擎地址为：${addr} Host: ${hostRaw} Port: ${portFromRaw}`)
    GLOBAL_YAK_SETTING.defaultYakGRPCAddr = addr
    currentEngineMode = params.Mode || (LOCAL_ENGINE_HOSTS.has(hostFormatted.toLowerCase()) ? 'local' : 'remote')

    callback(
      GLOBAL_YAK_SETTING.defaultYakGRPCAddr,
      Buffer.from(params['PemBytes'] === undefined ? '' : params['PemBytes']).toString('utf-8'),
      params['Password'] || '',
    )
    return await new Promise((resolve, reject) => {
      const deadline = new Date()
      // 设置超时时间为60秒
      deadline.setSeconds(deadline.getSeconds() + 60)
      newClient().Echo({ text: ECHO_TEST_MSG }, { deadline }, (err, data) => {
        if (err) {
          reject(err + '')
          return
        }
        if (data['result'] === ECHO_TEST_MSG) {
          resolve(data)
        } else {
          reject(`ECHO ${ECHO_TEST_MSG} ERROR`)
        }
      })
    })
  })

  ipcMain.handle('activate-special-detection-plugins', async (event, params = {}) => {
    assertTrustedAppSender(event, 'activate-special-detection-plugins')
    const engineAddress = parseEngineAddress(GLOBAL_YAK_SETTING.defaultYakGRPCAddr)
    const isLocalEngine = LOCAL_ENGINE_HOSTS.has(engineAddress.host.toLowerCase())
    const isValidLocalPort =
      Number.isSafeInteger(engineAddress.port) && engineAddress.port > 0 && engineAddress.port <= 65_535
    if (currentEngineMode === 'remote' || !isLocalEngine || !isValidLocalPort) {
      const error = new Error('当前连接不是本机内置引擎，无法在本地激活专项检测插件')
      error.code = 'SPECIAL_DETECTION_LOCAL_ENGINE_REQUIRED'
      throw error
    }
    if (specialDetectionActivationTask) return await specialDetectionActivationTask

    const activationTask = (async () => {
      const runtime =
        lastLocalEngineRuntime?.port === engineAddress.port
          ? lastLocalEngineRuntime
          : createFallbackLocalEngineRuntime()
      let enginePidsBefore = []
      let enginePidsAfter = []
      try {
        enginePidsBefore = await getCurrentEnginePids(engineAddress.port)
      } catch (error) {
        engineLogOutputFileAndUI(win, `专项检测激活前引擎进程枚举失败：${error}`)
      }

      engineLogOutputFileAndUI(win, '----- 开始激活专项检测插件 -----')
      engineLogOutputFileAndUI(win, `专项检测配置数据库：${runtime.profileDatabasePath}`)
      engineLogOutputFileAndUI(win, `专项检测项目数据库：${runtime.projectDatabasePath || '未指定'}`)
      engineLogOutputFileAndUI(
        win,
        `当前引擎地址：${GLOBAL_YAK_SETTING.defaultYakGRPCAddr}，进程号：${enginePidsBefore.join(',') || '未知'}`,
      )

      try {
        const before = await querySpecialDetectionGroups(getClient(), params.PageId)
        engineLogOutputFileAndUI(
          win,
          `专项检测激活前分类数量：${before.groupCount}，插件引用数量：${before.pluginCount}`,
        )
        const activation = await runSpecialDetectionActivation({
          command: getLocalYaklangEngine(),
          env: runtime.environment,
        })
        engineLogOutputFileAndUI(
          win,
          `专项检测索引刷新进程已退出，进程号：${activation.pid}，耗时：${activation.durationMs} 毫秒`,
        )
        if (activation.outputTruncated) {
          engineLogOutputFileAndUI(win, '专项检测索引刷新进程输出已按上限截断')
        }

        const after = await querySpecialDetectionGroups(getClient(), params.PageId)
        try {
          enginePidsAfter = await getCurrentEnginePids(engineAddress.port)
        } catch (error) {
          engineLogOutputFileAndUI(win, `专项检测激活后引擎进程枚举失败：${error}`)
        }
        const enginePidStable =
          enginePidsBefore.length > 0 && enginePidsAfter.length > 0
            ? enginePidsBefore.join(',') === enginePidsAfter.join(',')
            : null
        engineLogOutputFileAndUI(win, `专项检测激活后分类数量：${after.groupCount}，插件引用数量：${after.pluginCount}`)
        engineLogOutputFileAndUI(
          win,
          `当前引擎进程号：${enginePidsAfter.join(',') || '未知'}，进程保持：${
            enginePidStable === null ? '未能判定' : enginePidStable ? '是' : '否'
          }`,
        )

        if (after.groupCount === 0) {
          const error = new Error('运行时激活完成，但当前引擎仍未读取到专项检测插件分类')
          error.code = 'SPECIAL_DETECTION_GROUPS_NOT_READY'
          throw error
        }
        engineLogOutputFileAndUI(win, '----- 专项检测插件激活完成 -----')
        return {
          before,
          after,
          activationPid: activation.pid,
          activationDurationMs: activation.durationMs,
          enginePidsBefore,
          enginePidsAfter,
          enginePidStable,
          profileDatabasePath: runtime.profileDatabasePath,
          projectDatabasePath: runtime.projectDatabasePath,
        }
      } catch (error) {
        engineLogOutputFileAndUI(
          win,
          `专项检测插件激活失败：${error?.code ? `${error.code}：` : ''}${error?.message || error}`,
        )
        throw error
      }
    })()

    specialDetectionActivationTask = activationTask
    try {
      return await activationTask
    } finally {
      if (specialDetectionActivationTask === activationTask) specialDetectionActivationTask = undefined
    }
  })

  /** 输出到欢迎界面的日志中 */
  ipcMain.handle('output-log-to-welcome-console', (e, msg) => {
    engineLogOutputUI(win, `${msg}`, true)
  })

  /** 调用命令生成运行节点 */
  ipcMain.handle('call-command-generate-node', (e, params) => {
    assertTrustedAppSender(e, 'call-command-generate-node')
    return new Promise((resolve, reject) => {
      // 运行节点
      const subprocess = childProcess.spawn(getLocalYaklangEngine(), [
        'mq',
        '--server',
        params.ipOrdomain,
        '--server-port',
        params.port,
        '--id',
        params.nodename,
      ])
      subprocess.stdout.on('data', (data) => {
        resolve(subprocess.pid)
      })
      subprocess.on('error', (error) => {
        reject(error)
      })
      subprocess.stderr.on('data', (data) => {
        reject(data)
      })
    })
  })
  /** 删除运行节点 */
  ipcMain.handle('kill-run-node', (e, params) => {
    assertTrustedAppSender(e, 'kill-run-node')
    return new Promise((resolve, reject) => {
      const pid = normalizePid(params?.pid)
      if (isWindows) {
        runWindowsTaskKill(pid)
          .then(() => {
            resolve('')
          })
          .catch((error) => {
            reject(error)
          })
      } else {
        try {
          process.kill(pid, 'SIGKILL')
          resolve('')
        } catch (error) {
          reject(error)
        }
      }
    })
  })
}
