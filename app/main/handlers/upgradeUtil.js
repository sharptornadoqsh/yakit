const { ipcMain, shell } = require('electron')
const childProcess = require('child_process')
const spawn = require('cross-spawn')
const process = require('process')
const path = require('path')
const fs = require('fs')
const EventEmitter = require('events')
const zip = require('node-stream-zip')
const { assertTrustedAppSender, validateOpenPath } = require('../security')
const { resolveApplicationDownloadPath } = require('../applicationArtifact')
const { productConfig } = require('../product')

const {
  getYakitHome,
  getRemoteLinkDir,
  getYaklangEngineDir,
  getBasicDir,
  getRemoteLinkFile,
  getCodeDir,
  loadExtraFilePath,
  getYakitInstallDir,
} = require('../filePath')
const {
  downloadYakitEE,
  downloadYakitCommunity,
  downloadIntranetYakit,
  downloadYakEngine,
  getDownloadUrl,
  getSuffix,
} = require('./utils/network')
const { engineCancelRequestWithProgress, yakitCancelRequestWithProgress } = require('./utils/requestWithProgress')
const { fetchSpecifiedYakVersionHash } = require('../handlers/utils/network')
const { engineLogOutputFileAndUI } = require('../logFile')

const assertClientUpdateEnabled = () => {
  if (!productConfig.clientUpdateEnabled) {
    throw new Error('当前版本未配置睿眼客户端在线更新渠道')
  }
}
const {
  atomicInstallEngine,
  downloadAndVerifyArtifact,
  extractAndVerifyEngineArchive,
  getCompatibilityEntry,
  normalizeSha256,
  recoverInterruptedEngineInstall,
  selectBundledEngineArchivePath,
  verifyFileSha256,
} = require('../engineLifecycle')

const getUserChromeDataDir = () => path.join(getYakitHome(), 'chrome-profile')
const authMeta = []

const initMkbaseDir = async () => {
  return new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(getRemoteLinkDir(), { recursive: true })
      fs.mkdirSync(getBasicDir(), { recursive: true })
      fs.mkdirSync(getUserChromeDataDir(), { recursive: true })
      fs.mkdirSync(getYaklangEngineDir(), { recursive: true })
      fs.mkdirSync(getCodeDir(), { recursive: true })

      try {
        console.info('Start checking bins/resources')
        const extraResources = loadExtraFilePath(path.join('bins', 'resources'))
        const resourceBase = getBasicDir()
        if (!fs.existsSync(path.join(resourceBase, 'flag.txt'))) {
          console.info('Start to load bins/resources ...')
          fs.readdirSync(extraResources).forEach((value) => {
            if (value.endsWith('.txt')) {
              try {
                fs.copyFileSync(path.join(extraResources, value), path.join(resourceBase, value))
              } catch (e) {
                console.info(e)
              }
            }
          })
        }
      } catch (e) {
        console.error(e)
      }

      resolve()
    } catch (e) {
      reject(e)
    }
  })
}

const loadSecrets = () => {
  authMeta.splice(0, authMeta.length)
  try {
    const data = fs.readFileSync(getRemoteLinkFile())
    JSON.parse(data).forEach((i) => {
      if (!(i['host'] && i['port'])) {
        return
      }

      authMeta.push({
        name: i['name'] || `${i['host']}:${i['port']}`,
        host: i['host'],
        port: i['port'],
        tls: i['tls'] || false,
        password: i['password'] || '',
        caPem: i['caPem'] || '',
      })
    })
  } catch (e) {}
}

function saveSecret(name, host, port, tls, password, caPem) {
  if (!host || !port) {
    throw new Error('empty host or port')
  }

  authMeta.push({
    host,
    port,
    tls,
    password,
    caPem,
    name: name || `${host}:${port}`,
  })
  saveAllSecret([...authMeta])
}

const isWindows = process.platform === 'win32'

const saveAllSecret = (authInfos) => {
  try {
    fs.unlinkSync(getRemoteLinkFile())
  } catch (e) {}

  const authFileStr = JSON.stringify([
    ...authInfos.filter((v, i, arr) => {
      return arr.findIndex((origin) => origin.name === v.name) === i
    }),
  ])
  fs.writeFileSync(getRemoteLinkFile(), Buffer.from(authFileStr, 'utf8'), { mode: 0o600 })
  if (!isWindows) {
    fs.chmodSync(getRemoteLinkFile(), 0o600)
  }
}

const getLatestYakLocalEngine = () => {
  switch (process.platform) {
    case 'darwin':
    case 'linux':
      return path.join(getYaklangEngineDir(), 'yak')
    case 'win32':
      return path.join(getYaklangEngineDir(), 'yak.exe')
  }
}

const getEngineVersionCachePath = (version) =>
  path.join(
    getYaklangEngineDir(),
    version.startsWith('dev/') ? 'yak-' + version.replace('dev/', 'dev-') : `yak-${version}`,
  )

const emitEngineLifecycleStage = (win, state, message, extra = {}) => {
  const payload = { state, message, ...extra }
  if (win && !win.isDestroyed?.()) win.webContents.send('engine-lifecycle-stage', payload)
  engineLogOutputFileAndUI(win, `[引擎生命周期] ${message}`)
}

const normalizeProgress = (state) => {
  if (typeof state === 'number') return Math.max(0, Math.min(100, state))
  const percent = Number(state?.percent || 0)
  return Math.max(0, Math.min(100, percent <= 1 ? percent * 100 : percent))
}

const downloadEngineToVerifiedCache = async (win, version) => {
  const targetPath = getEngineVersionCachePath(version)
  try {
    emitEngineLifecycleStage(win, 'downloading', `正在下载引擎 ${version}`, { progress: 0 })
    const result = await downloadAndVerifyArtifact({
      targetPath,
      fetchExpectedSha256: () => fetchSpecifiedYakVersionHash(version, { timeout: 10000 }),
      download: (temporaryPath) =>
        new Promise((resolve, reject) => {
          Promise.resolve(
            downloadYakEngine(
              version,
              temporaryPath,
              (state) => {
                win.webContents.send('download-yak-engine-progress', state)
                emitEngineLifecycleStage(win, 'downloading', `正在下载引擎 ${version}`, {
                  progress: normalizeProgress(state),
                })
              },
              resolve,
              reject,
            ),
          ).catch(reject)
        }),
      onDownloaded: () => {
        emitEngineLifecycleStage(win, 'verifying', `正在验证引擎 ${version}`, { progress: 100 })
      },
    })
    return { version, path: targetPath, sha256: result.sha256 }
  } catch (error) {
    emitEngineLifecycleStage(win, 'recoverable-error', `引擎 ${version} 下载或验证失败`, {
      error: `${error}`,
    })
    throw error
  }
}

const readCachedEngineSha256 = async (version) => {
  const targetPath = getEngineVersionCachePath(version)
  const sidecarPath = `${targetPath}.sha256.txt`
  if (fs.existsSync(sidecarPath)) return normalizeSha256(fs.readFileSync(sidecarPath, 'utf8'))
  return normalizeSha256(await fetchSpecifiedYakVersionHash(version, { timeout: 10000 }))
}

const installVerifiedEngineVersion = async (win, version) => {
  try {
    const sourcePath = getEngineVersionCachePath(version)
    const expectedSha256 = await readCachedEngineSha256(version)
    if (!expectedSha256) throw new Error(`引擎 ${version} 缺少有效摘要`)

    emitEngineLifecycleStage(win, 'verifying', `正在复验引擎 ${version}`)
    await verifyFileSha256(sourcePath, expectedSha256)
    emitEngineLifecycleStage(win, 'installing', `正在安装引擎 ${version}`)
    const result = await atomicInstallEngine({
      sourcePath,
      targetPath: getLatestYakLocalEngine(),
      expectedSha256,
    })
    fs.writeFileSync(path.join(getYakitHome(), 'engine-sha256.txt'), `${expectedSha256}\n`, 'utf8')
    return result
  } catch (error) {
    emitEngineLifecycleStage(win, 'recoverable-error', `引擎 ${version} 安装失败，旧版本仍被保留`, {
      error: `${error}`,
    })
    throw error
  }
}

const writeEngineShaMetadata = async (version) => {
  if (process.platform !== 'darwin') return
  const expectedSha256 = version
    ? await readCachedEngineSha256(version)
    : normalizeSha256(getBundledEngineInfo().engineSha256)
  if (!expectedSha256) throw new Error('引擎摘要元数据不可用')

  const targetPath = path.join(getYakitHome(), 'engine-sha256.txt')
  const temporaryPath = `${targetPath}.tmp`
  fs.writeFileSync(temporaryPath, `${expectedSha256}\n`, 'utf8')
  try {
    fs.renameSync(temporaryPath, targetPath)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    fs.unlinkSync(targetPath)
    fs.renameSync(temporaryPath, targetPath)
  }
}

const getBundledEngineInfo = () => {
  const compatibility = getCompatibilityEntry()
  const packagedArchivePath = loadExtraFilePath(
    compatibility?.artifact?.packagedArchive || path.join('bins', 'yak.zip'),
  )
  const sourceArchivePath = compatibility?.artifact?.sourceArchive
    ? loadExtraFilePath(compatibility.artifact.sourceArchive)
    : ''
  const archivePath = selectBundledEngineArchivePath({ packagedArchivePath, sourceArchivePath })
  const archiveSha256 = normalizeSha256(compatibility?.artifact?.archiveSha256)
  const engineSha256 = normalizeSha256(compatibility?.artifact?.engineSha256)
  return {
    exists: fs.existsSync(archivePath),
    trusted: Boolean(engineSha256 && compatibility?.artifact?.archiveEntry),
    archivePath,
    archiveSha256,
    engineSha256,
    version: compatibility?.recommendedEngineVersion || '',
    artifact: compatibility?.artifact,
    compatibility,
  }
}

const restoreVerifiedBundledEngine = async (win) => {
  const bundled = getBundledEngineInfo()
  if (!bundled.exists) throw new Error('未找到预置引擎压缩包')
  if (!bundled.trusted) {
    throw new Error('当前平台的预置引擎摘要尚未验证')
  }

  const extractedPath = path.join(getYaklangEngineDir(), 'yak.bundled.download')
  try {
    emitEngineLifecycleStage(win, 'verifying', '正在验证预置引擎压缩包')
    try {
      fs.unlinkSync(extractedPath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }

    await extractAndVerifyEngineArchive({
      archivePath: bundled.archivePath,
      archiveSha256: bundled.archiveSha256,
      entryName: bundled.artifact.archiveEntry,
      destination: extractedPath,
      engineSha256: bundled.engineSha256,
      onArchiveInspected: (verification) => {
        if (!verification.valid && verification.expected) {
          emitEngineLifecycleStage(win, 'verifying', '预置引擎压缩包摘要已变化，正在验证内部引擎文件')
        }
        emitEngineLifecycleStage(win, 'extracting-bundled', `正在提取预置引擎 ${bundled.version}`)
      },
    })
    emitEngineLifecycleStage(win, 'installing', `正在安装预置引擎 ${bundled.version}`)
    const result = await atomicInstallEngine({
      sourcePath: extractedPath,
      targetPath: getLatestYakLocalEngine(),
      expectedSha256: bundled.engineSha256,
    })
    fs.writeFileSync(path.join(getYakitHome(), 'engine-sha256.txt'), `${bundled.engineSha256}\n`, 'utf8')
    return result
  } catch (error) {
    emitEngineLifecycleStage(win, 'recoverable-error', '预置引擎恢复失败，原引擎保持不变', {
      error: `${error}`,
    })
    throw error
  } finally {
    try {
      fs.unlinkSync(extractedPath)
    } catch (error) {}
  }
}

const installManualEngine = async (win, selectedPath) => {
  try {
    const sourcePath = validateOpenPath(selectedPath, { allowBlockedExtensions: true })
    const sidecarPath = `${sourcePath}.sha256.txt`
    if (!fs.existsSync(sidecarPath)) throw new Error(`手工安装需要同名摘要文件：${path.basename(sidecarPath)}`)
    const expectedSha256 = normalizeSha256(fs.readFileSync(sidecarPath, 'utf8'))
    if (!expectedSha256) throw new Error('手工安装摘要文件格式无效')

    emitEngineLifecycleStage(win, 'verifying', '正在验证手工选择的引擎')
    await verifyFileSha256(sourcePath, expectedSha256)
    emitEngineLifecycleStage(win, 'installing', '正在安装手工选择的引擎')
    const result = await atomicInstallEngine({
      sourcePath,
      targetPath: getLatestYakLocalEngine(),
      expectedSha256,
    })
    fs.writeFileSync(path.join(getYakitHome(), 'engine-sha256.txt'), `${expectedSha256}\n`, 'utf8')
    return result
  } catch (error) {
    emitEngineLifecycleStage(win, 'recoverable-error', '手工安装失败，旧版本仍被保留', { error: `${error}` })
    throw error
  }
}

const getEngineLifecycleInfo = async () => {
  const targetPath = getLatestYakLocalEngine()
  const recovery = await recoverInterruptedEngineInstall(targetPath)
  const bundled = getBundledEngineInfo()
  return {
    installed: fs.existsSync(targetPath),
    recovery,
    bundled: {
      exists: bundled.exists,
      trusted: bundled.trusted,
      version: bundled.version,
      status: bundled.artifact?.status || 'missing-compatibility-entry',
    },
    compatibility: bundled.compatibility,
  }
}

// 获取Yakit所处平台
const getYakitPlatform = () => {
  const suffix = getSuffix()
  switch (process.platform) {
    case 'darwin':
      if (process.arch === 'arm64') {
        return `darwin${suffix}-arm64`
      } else {
        return `darwin${suffix}-x64`
      }
    case 'win32':
      return `windows${suffix}-amd64`
    case 'linux':
      return `linux${suffix}-amd64`
  }
}

const diagnosingYakVersion = () => {
  return new Promise((resolve, reject) => {
    const commandPath = getLatestYakLocalEngine()
    fs.access(commandPath, fs.constants.X_OK, (err) => {
      if (err) {
        if (err.code === 'ENOENT') {
          engineLogOutputFileAndUI(win, `命令未找到: ${commandPath}`)
          reject(new Error(`命令未找到: ${commandPath}`))
        } else if (err.code === 'EACCES') {
          engineLogOutputFileAndUI(win, `命令无法执行(无权限): ${commandPath}`)
          reject(new Error(`命令无法执行(无权限): ${commandPath}`))
        } else {
          engineLogOutputFileAndUI(win, `命令无法执行: ${commandPath}`)
          reject(new Error(`命令无法执行: ${commandPath}`))
        }
        return
      }

      const child = spawn(commandPath, ['-v'], { timeout: 20200 })
      let stdout = ''
      let stderr = ''
      let finished = false
      const timer = setTimeout(() => {
        if (!finished) {
          finished = true
          child.kill()
          try {
            if (process.platform === 'win32') {
              childProcess.exec(`taskkill /PID ${child.pid} /T /F`)
            } else {
              process.kill(child.pid, 'SIGKILL')
            }
          } catch (e) {
          } finally {
            let errorMessage = `命令执行超时，进程遭遇未知问题，需要用户在命令行中执行引擎调试: ${commandPath}\nStdout: ${stdout}\nStderr: ${stderr}`
            engineLogOutputFileAndUI(win, `${errorMessage}`)
            reject(new Error(errorMessage))
          }
        }
      }, 20000)
      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })
      child.stderr.on('data', (data) => {
        stderr += data.toString()
      })
      child.on('error', (error) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        let errorMessage = `命令执行失败: ${error.message}\nStdout: ${stdout}\nStderr: ${stderr}`
        if (error.code === 'ENOENT') {
          errorMessage = `无法执行命令，引擎未找到: ${commandPath}\nerror: ${error.message}\nStderr: ${stderr}`
        } else if (error.killed) {
          errorMessage = `引擎启动被系统强制终止，可能的原因为内存占用过多或系统退出或安全防护软件: ${commandPath}\nerror: ${error.message}\nStderr: ${stderr}`
        } else if (error.signal) {
          errorMessage = `引擎由于信号而终止: ${error.signal}\nStderr: ${stderr}`
        }
        engineLogOutputFileAndUI(win, `${errorMessage}`)
        reject(new Error(errorMessage))
      })
      child.on('close', (code, signal) => {
        if (finished) return
        if (code !== 0) {
          let errorMessage = `命令执行失败: 退出码 ${code}\nStdout: ${stdout}\nStderr: ${stderr}`
          if (signal) {
            errorMessage = `引擎由于信号而终止: ${signal}\nStderr: ${stderr}`
          }
          engineLogOutputFileAndUI(win, `${errorMessage}`)
          reject(new Error(errorMessage))
          return
        }
        if (stderr) {
          engineLogOutputFileAndUI(win, `Stderr: ${stderr}`)
          reject(new Error(stderr))
          return
        }
        finished = true
        clearTimeout(timer)
        resolve(stdout)
      })
    })
  })
}

// 判断历史引擎版本是否存在以及正确性
const asyncYakEngineVersionExistsAndCorrectness = (version) => {
  const destination = getEngineVersionCachePath(version)
  return new Promise(async (resolve, reject) => {
    if (!fs.existsSync(destination)) {
      reject(new Error('指定版本的引擎缓存不存在'))
      return
    }
    try {
      const expectedSha256 = await readCachedEngineSha256(version)
      if (!expectedSha256) {
        resolve(false)
        return
      }
      await verifyFileSha256(destination, expectedSha256)
      resolve(true)
    } catch (error) {
      if (error.code === 'ENGINE_SHA256_MISMATCH') resolve(false)
      else reject(error)
    }
  })
}

module.exports = {
  getLatestYakLocalEngine,
  initial: async () => {
    return await initMkbaseDir()
  },
  register: (win, getClient) => {
    ipcMain.handle('save-yakit-remote-auth', async (e, params) => {
      assertTrustedAppSender(e, 'save-yakit-remote-auth')
      let { name, host, port, tls, caPem, password } = params
      name = name || `${host}:${port}`
      saveAllSecret([
        ...authMeta.filter((i) => {
          return i.name !== name
        }),
      ])
      loadSecrets()
      saveSecret(name, host, port, tls, password, caPem)
    })
    ipcMain.handle('remove-yakit-remote-auth', async (e, name) => {
      assertTrustedAppSender(e, 'remove-yakit-remote-auth')
      saveAllSecret([
        ...authMeta.filter((i) => {
          return i.name !== name
        }),
      ])
      loadSecrets()
    })
    ipcMain.handle('get-yakit-remote-auth-all', async (e, name) => {
      assertTrustedAppSender(e, 'get-yakit-remote-auth-all')
      loadSecrets()
      return authMeta
    })
    ipcMain.handle('get-yakit-remote-auth-dir', async (e, name) => {
      assertTrustedAppSender(e, 'get-yakit-remote-auth-dir')
      return getRemoteLinkDir()
    })

    class YakVersionEmitter extends EventEmitter {}

    const yakVersionEmitter = new YakVersionEmitter()
    let isFetchingVersion = false
    let latestVersionCache = null

    /** clear latestVersionCache value */
    ipcMain.handle('clear-local-yaklang-version-cache', async (e) => {
      latestVersionCache = null
      return
    })

    // asyncQueryLatestYakEngineVersion wrapper
    const asyncGetCurrentLatestYakVersion = (params) => {
      return new Promise((resolve, reject) => {
        if (latestVersionCache) {
          engineLogOutputFileAndUI(win, `----- 获取到yak版本(缓存): ${latestVersionCache} -----`)
          resolve(latestVersionCache)
          return
        }

        engineLogOutputFileAndUI(win, `----- 开始获取 yak 本地版本 -----`)
        console.info('YAK-VERSION: mount version')
        yakVersionEmitter.once('version', (err, version) => {
          if (err) {
            diagnosingYakVersion()
              .catch((err) => {
                console.info('YAK-VERSION(DIAG): fetch error: ' + `${err}`)
                reject(err)
              })
              .then(() => {
                console.info('YAK-VERSION: fetch error: ' + `${err}`)
                reject(err)
              })
          } else {
            console.info('YAK-VERSION: hit version: ' + `${version}`)
            resolve(version)
          }
        })
        if (isFetchingVersion) {
          console.info('YAK-VERSION is executing...')
          return
        }

        console.info('YAK-VERSION process is executing...')
        isFetchingVersion = true
        const child = spawn(getLatestYakLocalEngine(), ['-v'], { timeout: 5200 })
        let stdout = ''
        let stderr = ''
        let finished = false
        const timer = setTimeout(() => {
          if (!finished) {
            finished = true
            child.kill()
            try {
              if (process.platform === 'win32') {
                childProcess.exec(`taskkill /PID ${child.pid} /T /F`)
              } else {
                process.kill(child.pid, 'SIGKILL')
              }
            } catch (e) {
            } finally {
              const error = new Error('[yak -v] 获取版本超时，已强制终止')
              engineLogOutputFileAndUI(win, error.toString())
              yakVersionEmitter.emit('version', error, null)
              isFetchingVersion = false
            }
          }
        }, 5000)
        child.stdout.on('data', (data) => {
          stdout += data.toString('utf-8')
        })
        child.stderr.on('data', (data) => {
          stderr += data.toString('utf-8')
        })
        child.on('error', (err) => {
          if (finished) return
          finished = true
          clearTimeout(timer)
          engineLogOutputFileAndUI(win, `${err.toString('utf-8')}`)
          if (stderr) {
            engineLogOutputFileAndUI(win, `${stderr}`)
          }
          yakVersionEmitter.emit('version', err, null)
          isFetchingVersion = false
        })
        child.on('close', (code) => {
          if (finished) return
          engineLogOutputFileAndUI(win, `${stdout}`)
          const match = /.*?yak(\.exe)?\s+version\s+(\S+)/.exec(stdout)
          const version = match && match[2]
          if (!version) {
            engineLogOutputFileAndUI(win, '----- 引擎无法获取yak本地版本 -----')
            if (code !== 0 || stderr) {
              engineLogOutputFileAndUI(win, `${stderr}` || `Process exited with code ${code}`)
              const error = new Error(`${stderr}` || `Process exited with code ${code}`)
              yakVersionEmitter.emit('version', error, null)
              isFetchingVersion = false
            }
          } else {
            finished = true
            clearTimeout(timer)
            engineLogOutputFileAndUI(win, `----- 获取到yak本地版本: ${version}-----`)
            latestVersionCache = version
            yakVersionEmitter.emit('version', null, version)
            isFetchingVersion = false
          }
        })
      })
    }
    ipcMain.handle('get-current-yak', async (e, params) => {
      return await asyncGetCurrentLatestYakVersion(params)
    })

    ipcMain.handle('diagnosing-yak-version', async (e, params) => {
      return diagnosingYakVersion()
    })

    const asyncDownloadLatestYak = (version) => downloadEngineToVerifiedCache(win, version)
    ipcMain.handle('download-latest-yak', async (e, version) => {
      return await asyncDownloadLatestYak(version)
    })

    const asyncWriteEngineKeyToYakitProjects = (version) => writeEngineShaMetadata(version)

    ipcMain.handle('write-engine-key-to-yakit-projects', async (e, version) => {
      return await asyncWriteEngineKeyToYakitProjects(version)
    })

    ipcMain.handle('yak-engine-version-exists-and-correctness', async (e, version) => {
      return await asyncYakEngineVersionExistsAndCorrectness(version)
    })
    ipcMain.handle('cancel-download-yak-engine-version', async (e, version) => {
      return await engineCancelRequestWithProgress(version)
    })

    // asyncDownloadLatestYakit wrapper
    async function asyncDownloadLatestYakit(version, type) {
      assertClientUpdateEnabled()
      return new Promise(async (resolve, reject) => {
        const { isEnterprise, isIRify, isMemfit } = type
        const IRifyCE = isIRify && !isEnterprise
        const IRifyEE = isIRify && isEnterprise
        const YakitCE = !isIRify && !isEnterprise
        const YakitEE = !isIRify && isEnterprise
        const MemfitCE = isMemfit && !isEnterprise
        const MemfitEE = isMemfit && isEnterprise
        // format version，下载的版本号里不能存在 V
        if (version.startsWith('v')) {
          version = version.substr(1)
        }

        console.info('start to fetching download-url for yakit')
        let downloadUrl = ''
        if (IRifyCE) {
          downloadUrl = await getDownloadUrl(version, 'IRifyCE')
        } else if (IRifyEE) {
          downloadUrl = await getDownloadUrl(version, 'IRifyEE')
        } else if (YakitEE) {
          downloadUrl = await getDownloadUrl(version, 'YakitEE')
        } else if (MemfitCE) {
          downloadUrl = await getDownloadUrl(version, 'Memfit')
        } else if (MemfitEE) {
          downloadUrl = await getDownloadUrl(version, 'Memfit')
        } else {
          downloadUrl = await getDownloadUrl(version, 'YakitCE')
        }
        // 可能存在中文的下载文件夹，就判断下Downloads文件夹是否存在，不存在则新建一个
        if (!fs.existsSync(getYakitInstallDir())) fs.mkdirSync(getYakitInstallDir(), { recursive: true })
        const dest = resolveApplicationDownloadPath(getYakitInstallDir(), downloadUrl, {
          preserveFilename: isIRify || isMemfit,
        })
        try {
          fs.unlinkSync(dest)
        } catch (e) {}

        console.info(`start to download yakit from ${downloadUrl} to ${dest}`)
        // 企业版下载
        if (YakitEE || IRifyEE || MemfitEE) {
          await downloadYakitEE(
            version,
            isIRify,
            dest,
            (state) => {
              if (!!state) {
                win.webContents.send('download-yakit-engine-progress', state)
              }
            },
            resolve,
            reject,
          )
        } else {
          // 社区版下载
          await downloadYakitCommunity(
            version,
            isIRify,
            isMemfit,
            dest,
            (state) => {
              if (!!state) {
                win.webContents.send('download-yakit-engine-progress', state)
              }
            },
            resolve,
            reject,
          )
        }
      })
    }

    ipcMain.handle('cancel-download-yakit-version', async (e) => {
      return await yakitCancelRequestWithProgress()
    })

    ipcMain.handle('download-latest-yakit', async (e, version, type) => {
      return await asyncDownloadLatestYakit(version, type)
    })

    const asyncDownloadLatestIntranetYakit = (filePath) => {
      assertClientUpdateEnabled()
      return new Promise((resolve, reject) => {
        const dest = resolveApplicationDownloadPath(getYakitInstallDir(), filePath)
        // 校验getYakitInstallDir()目录下是否已经存在filePath文件，存在则直接返回
        fs.access(dest, fs.constants.F_OK, async (err) => {
          if (err) {
            // 内网版下载
            await downloadIntranetYakit(
              filePath,
              dest,
              (state) => {
                if (!!state) {
                  win.webContents.send('download-yakit-engine-progress', state)
                }
              },
              resolve,
              reject,
            )
          } else {
            resolve(true)
          }
        })
      })
    }

    ipcMain.handle('download-latest-intranet-yakit', async (e, filePath) => {
      return await asyncDownloadLatestIntranetYakit(filePath)
    })

    ipcMain.handle('update-enpritrace-info', async () => {
      return await { version: getYakitPlatform() }
    })

    ipcMain.handle('get-windows-install-dir', async (e) => {
      return getLatestYakLocalEngine()
      //systemRoot := os.Getenv("WINDIR")
      // 			if systemRoot == "" {
      // 				systemRoot = os.Getenv("windir")
      // 			}
      // 			if systemRoot == "" {
      // 				systemRoot = os.Getenv("SystemRoot")
      // 			}
      //
      // 			if systemRoot == "" {
      // 				return utils.Errorf("cannot fetch windows system root dir")
      // 			}
      //
      // 			installed = filepath.Join(systemRoot, "System32", "yak.exe")
      // if (process.platform !== "win32") {
      //     return "%WINDIR%\\System32\\yak.exe"
      // }
      // return getWindowsInstallPath();
    })

    const installYakEngine = (version) => installVerifiedEngineVersion(win, version)

    ipcMain.handle('install-yak-engine', async (e, version) => {
      return await installYakEngine(version)
    })

    ipcMain.handle('manual-install-yak-engine', async (e, selectedPath) => {
      assertTrustedAppSender(e, 'manual-install-yak-engine')
      return await installManualEngine(win, selectedPath)
    })

    ipcMain.handle('get-engine-lifecycle-info', async () => {
      return await getEngineLifecycleInfo()
    })

    // 获取yak code文件根目录路径
    ipcMain.handle('fetch-code-path', () => {
      return getCodeDir()
    })

    // 打开指定路径文件
    ipcMain.handle('open-specified-file', async (e, path) => {
      assertTrustedAppSender(e, 'open-specified-file')
      const resolvedPath = validateOpenPath(path, { allowBlockedExtensions: true })
      return shell.showItemInFolder(resolvedPath)
    })

    const generateInstallScript = () => {
      return new Promise((resolve, reject) => {
        const all = 'auto-install-cert.zip'
        const output_name = isWindows ? `auto-install-cert.bat` : `auto-install-cert.sh`
        if (!fs.existsSync(loadExtraFilePath(path.join('bins/scripts', all)))) {
          reject(all + ' not found')
          return
        }
        console.log('start to gen cert script')
        const zipHandler = new zip({
          file: loadExtraFilePath(path.join('bins/scripts', all)),
          storeEntries: true,
        })
        zipHandler.on('ready', () => {
          const targetPath = path.join(getYakitHome(), output_name)
          zipHandler.extract(output_name, targetPath, (err, res) => {
            if (!fs.existsSync(targetPath)) {
              reject(`Extract Cert Script Failed`)
            } else {
              // 如果不是 Windows，给脚本文件添加执行权限
              if (!isWindows) {
                fs.chmodSync(targetPath, 0o755)
              }
              resolve(targetPath)
            }
            zipHandler.close()
          })
        })
        zipHandler.on('error', (err) => {
          console.info(err)
          reject(`${err}`)
          zipHandler.close()
        })
      })
    }

    ipcMain.handle('generate-install-script', async (e) => {
      return await generateInstallScript()
    })

    const asyncInitBuildInEngine = () => restoreVerifiedBundledEngine(win)

    // 尝试初始化数据库
    ipcMain.handle('InitCVEDatabase', async (e) => {
      const targetFile = path.join(getYakitHome(), 'default-cve.db.gzip')
      if (fs.existsSync(targetFile)) {
        return
      }
      const buildinDBFile = loadExtraFilePath(path.join('bins', 'database', 'default-cve.db.gzip'))
      if (fs.existsSync(buildinDBFile)) {
        fs.copyFileSync(buildinDBFile, targetFile)
      }
    })

    // 获取内置引擎版本
    ipcMain.handle(
      'GetBuildInEngineVersion',
      /*"IsBinsExisted"*/ async (e) => {
        const bundled = getBundledEngineInfo()
        return bundled.exists && bundled.trusted ? bundled.version : ''
      },
    )

    // asyncRestoreEngineAndPlugin wrapper
    ipcMain.handle('RestoreEngineAndPlugin', async (e, params) => {
      latestVersionCache = null
      const cacheFlagLock = path.join(getBasicDir(), 'flag.txt')
      try {
        if (fs.existsSync(cacheFlagLock)) {
          fs.unlinkSync(cacheFlagLock)
        }
      } catch (e) {
        throw e
      }
      return await asyncInitBuildInEngine({})
    })

    // 插件压缩包和解压目录
    const generateChromePlugin = () => {
      return new Promise((resolve, reject) => {
        const zipFilePath = loadExtraFilePath(path.join('bins/scripts', 'google-chrome-plugin.zip'))
        const targetPath = path.join(getYakitHome(), 'google-chrome-plugin')

        // 确保压缩包存在
        if (!fs.existsSync(zipFilePath)) {
          reject(zipFilePath + ' not found')
          return
        }

        // 确保输出文件夹存在，不存在则进行创建
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true })
        }

        const zipHandler = new zip({
          file: zipFilePath,
          storeEntries: true,
        })

        zipHandler.on('ready', () => {
          // 执行解压
          zipHandler.extract(null, targetPath, (err, res) => {
            if (err) {
              reject(`Extract Google Chrome Plugin Failed: ${err}`)
            } else {
              resolve(targetPath)
            }
            zipHandler.close()
          })
        })

        zipHandler.on('error', (err) => {
          reject(`Zip error: ${err}`)
          zipHandler.close()
        })
      })
    }

    ipcMain.handle('generate-chrome-plugin', async (e) => {
      return await generateChromePlugin()
    })

    // 解压 start-engine.zip
    const generateStartEngineGRPC = () => {
      return new Promise((resolve, reject) => {
        const all = 'start-engine.zip'
        const output_name = isWindows ? `start-engine-grpc.bat` : `start-engine-grpc.sh`

        // 如果存在就不在解压
        if (fs.existsSync(path.join(getYaklangEngineDir(), output_name))) {
          resolve('')
          return
        }

        if (!fs.existsSync(loadExtraFilePath(path.join('bins/scripts', all)))) {
          reject(all + ' not found')
          return
        }
        const zipHandler = new zip({
          file: loadExtraFilePath(path.join('bins/scripts', all)),
          storeEntries: true,
        })
        zipHandler.on('ready', () => {
          const targetPath = path.join(getYaklangEngineDir(), output_name)
          zipHandler.extract(output_name, targetPath, (err, res) => {
            if (!fs.existsSync(targetPath)) {
              reject(`Extract Start Engine GRPC Script Failed`)
            } else {
              // 如果不是 Windows，给脚本文件添加执行权限
              if (!isWindows) {
                fs.chmodSync(targetPath, 0o755)
              }
              resolve('')
            }
            zipHandler.close()
          })
        })
        zipHandler.on('error', (err) => {
          console.info(err)
          reject(`${err}`)
          zipHandler.close()
        })
      })
    }
    ipcMain.handle('generate-start-engine', async (e) => {
      return await generateStartEngineGRPC()
    })
  },
  registerNewIPC: (win, getClient, ipcEventPre) => {
    class YakVersionEmitter extends EventEmitter {}
    const yakVersionEmitter = new YakVersionEmitter()
    let latestVersionCache = null
    let isFetchingVersion = false

    // 解压 start-engine.zip
    const generateStartEngineGRPC = () => {
      return new Promise((resolve, reject) => {
        const all = 'start-engine.zip'
        const output_name = isWindows ? `start-engine-grpc.bat` : `start-engine-grpc.sh`

        // 如果存在就不在解压
        if (fs.existsSync(path.join(getYaklangEngineDir(), output_name))) {
          resolve('')
          return
        }

        if (!fs.existsSync(loadExtraFilePath(path.join('bins/scripts', all)))) {
          reject(all + ' not found')
          return
        }
        const zipHandler = new zip({
          file: loadExtraFilePath(path.join('bins/scripts', all)),
          storeEntries: true,
        })
        zipHandler.on('ready', () => {
          const targetPath = path.join(getYaklangEngineDir(), output_name)
          zipHandler.extract(output_name, targetPath, (err, res) => {
            if (!fs.existsSync(targetPath)) {
              reject(`Extract Start Engine GRPC Script Failed`)
            } else {
              // 如果不是 Windows，给脚本文件添加执行权限
              if (!isWindows) {
                fs.chmodSync(targetPath, 0o755)
              }
              resolve('')
            }
            zipHandler.close()
          })
        })
        zipHandler.on('error', (err) => {
          console.info(err)
          reject(`${err}`)
          zipHandler.close()
        })
      })
    }
    ipcMain.handle(ipcEventPre + 'generate-start-engine', async (e) => {
      return await generateStartEngineGRPC()
    })

    // 尝试初始化数据库
    ipcMain.handle(ipcEventPre + 'InitCVEDatabase', async (e) => {
      const targetFile = path.join(getYakitHome(), 'default-cve.db.gzip')
      if (fs.existsSync(targetFile)) {
        return
      }
      const buildinDBFile = loadExtraFilePath(path.join('bins', 'database', 'default-cve.db.gzip'))
      if (fs.existsSync(buildinDBFile)) {
        fs.copyFileSync(buildinDBFile, targetFile)
      }
    })
    // 获取内置引擎版本
    ipcMain.handle(
      ipcEventPre + 'GetBuildInEngineVersion',
      /*"IsBinsExisted"*/ async (e) => {
        const bundled = getBundledEngineInfo()
        return bundled.exists && bundled.trusted ? bundled.version : ''
      },
    )
    const asyncInitBuildInEngine = () => restoreVerifiedBundledEngine(win)

    // asyncRestoreEngineAndPlugin wrapper
    ipcMain.handle(ipcEventPre + 'RestoreEngineAndPlugin', async (e, params) => {
      latestVersionCache = null
      const cacheFlagLock = path.join(getBasicDir(), 'flag.txt')
      try {
        if (fs.existsSync(cacheFlagLock)) {
          fs.unlinkSync(cacheFlagLock)
        }
      } catch (e) {
        throw e
      }
      return await asyncInitBuildInEngine({})
    })

    const asyncDownloadLatestYak = (version) => downloadEngineToVerifiedCache(win, version)
    ipcMain.handle(ipcEventPre + 'download-latest-yak', async (e, version) => {
      return await asyncDownloadLatestYak(version)
    })

    /** clear latestVersionCache value */
    ipcMain.handle(ipcEventPre + 'clear-local-yaklang-version-cache', async (e) => {
      latestVersionCache = null
      return
    })
    const asyncWriteEngineKeyToYakitProjects = (version) => writeEngineShaMetadata(version)

    ipcMain.handle(ipcEventPre + 'write-engine-key-to-yakit-projects', async (e, version) => {
      return await asyncWriteEngineKeyToYakitProjects(version)
    })

    const installYakEngine = (version) => installVerifiedEngineVersion(win, version)

    ipcMain.handle(ipcEventPre + 'install-yak-engine', async (e, version) => {
      return await installYakEngine(version)
    })

    ipcMain.handle(ipcEventPre + 'manual-install-yak-engine', async (e, selectedPath) => {
      assertTrustedAppSender(e, ipcEventPre + 'manual-install-yak-engine')
      return await installManualEngine(win, selectedPath)
    })

    ipcMain.handle(ipcEventPre + 'get-engine-lifecycle-info', async () => {
      return await getEngineLifecycleInfo()
    })

    ipcMain.handle(ipcEventPre + 'cancel-download-yak-engine-version', async (e, version) => {
      return await engineCancelRequestWithProgress(version)
    })

    ipcMain.handle(ipcEventPre + 'get-yakit-remote-auth-all', async (e, name) => {
      assertTrustedAppSender(e, ipcEventPre + 'get-yakit-remote-auth-all')
      loadSecrets()
      return authMeta
    })

    ipcMain.handle(ipcEventPre + 'save-yakit-remote-auth', async (e, params) => {
      assertTrustedAppSender(e, ipcEventPre + 'save-yakit-remote-auth')
      let { name, host, port, tls, caPem, password } = params
      name = name || `${host}:${port}`
      saveAllSecret([
        ...authMeta.filter((i) => {
          return i.name !== name
        }),
      ])
      loadSecrets()
      saveSecret(name, host, port, tls, password, caPem)
    })

    ipcMain.handle(ipcEventPre + 'remove-yakit-remote-auth', async (e, name) => {
      assertTrustedAppSender(e, ipcEventPre + 'remove-yakit-remote-auth')
      saveAllSecret([
        ...authMeta.filter((i) => {
          return i.name !== name
        }),
      ])
      loadSecrets()
    })

    // 打开指定路径文件
    ipcMain.handle(ipcEventPre + 'open-specified-file', async (e, path) => {
      assertTrustedAppSender(e, ipcEventPre + 'open-specified-file')
      const resolvedPath = validateOpenPath(path, { allowBlockedExtensions: true })
      return shell.showItemInFolder(resolvedPath)
    })

    // asyncDownloadLatestYakit wrapper
    async function asyncDownloadLatestYakit(version, type) {
      assertClientUpdateEnabled()
      return new Promise(async (resolve, reject) => {
        try {
          const { isEnterprise, isIRify, isMemfit } = type
          const IRifyCE = isIRify && !isEnterprise
          const IRifyEE = isIRify && isEnterprise
          const YakitCE = !isIRify && !isEnterprise
          const YakitEE = !isIRify && isEnterprise
          const MemfitCE = isMemfit && !isEnterprise
          const MemfitEE = isMemfit && isEnterprise
          // format version，下载的版本号里不能存在 V
          if (version.startsWith('v')) {
            version = version.substr(1)
          }

          console.info('start to fetching download-url for yakit')
          let downloadUrl = ''
          if (IRifyCE) {
            downloadUrl = await getDownloadUrl(version, 'IRifyCE')
          } else if (IRifyEE) {
            downloadUrl = await getDownloadUrl(version, 'IRifyEE')
          } else if (YakitEE) {
            downloadUrl = await getDownloadUrl(version, 'YakitEE')
          } else if (MemfitCE) {
            downloadUrl = await getDownloadUrl(version, 'Memfit')
          } else if (MemfitEE) {
            downloadUrl = await getDownloadUrl(version, 'Memfit')
          } else {
            downloadUrl = await getDownloadUrl(version, 'YakitCE')
          }
          // 可能存在中文的下载文件夹，就判断下Downloads文件夹是否存在，不存在则新建一个
          if (!fs.existsSync(getYakitInstallDir())) fs.mkdirSync(getYakitInstallDir(), { recursive: true })
          const dest = resolveApplicationDownloadPath(getYakitInstallDir(), downloadUrl, {
            preserveFilename: isIRify || isMemfit,
          })
          try {
            fs.unlinkSync(dest)
          } catch (e) {}

          console.info(`start to download yakit from ${downloadUrl} to ${dest}`)
          // 企业版下载
          if (YakitEE || IRifyEE || MemfitEE) {
            await downloadYakitEE(
              version,
              isIRify,
              dest,
              (state) => {
                if (!!state) {
                  win.webContents.send('download-yakit-engine-progress', state)
                }
              },
              resolve,
              reject,
            )
          } else {
            // 社区版下载
            await downloadYakitCommunity(
              version,
              isIRify,
              isMemfit,
              dest,
              (state) => {
                if (!!state) {
                  win.webContents.send('download-yakit-engine-progress', state)
                }
              },
              resolve,
              reject,
            )
          }
        } catch (error) {
          reject(error)
        }
      })
    }
    ipcMain.handle(ipcEventPre + 'download-latest-yakit', async (e, version, type) => {
      return await asyncDownloadLatestYakit(version, type)
    })

    ipcMain.handle(ipcEventPre + 'cancel-download-yakit-version', async (e) => {
      return await yakitCancelRequestWithProgress()
    })

    // asyncQueryLatestYakEngineVersion wrapper
    const asyncGetCurrentLatestYakVersion = (params) => {
      return new Promise((resolve, reject) => {
        if (latestVersionCache) {
          engineLogOutputFileAndUI(win, `----- 获取到yak版本(缓存): ${latestVersionCache} -----`)
          resolve(latestVersionCache)
          return
        }

        engineLogOutputFileAndUI(win, `----- 开始获取 yak 本地版本 -----`)
        yakVersionEmitter.once('version', (err, version) => {
          if (err) {
            diagnosingYakVersion()
              .catch((err) => {
                console.info('YAK-VERSION(DIAG): fetch error: ' + `${err}`)
                reject(err)
              })
              .then(() => {
                console.info('YAK-VERSION: fetch error: ' + `${err}`)
                reject(err)
              })
          } else {
            console.info('YAK-VERSION: hit version: ' + `${version}`)
            resolve(version)
          }
        })
        if (isFetchingVersion) {
          console.info('YAK-VERSION is executing...')
          return
        }

        console.info('YAK-VERSION process is executing...')
        isFetchingVersion = true
        const child = spawn(getLatestYakLocalEngine(), ['-v'], { timeout: 5200 })
        let stdout = ''
        let stderr = ''
        let finished = false
        const timer = setTimeout(() => {
          if (!finished) {
            finished = true
            child.kill()
            try {
              if (process.platform === 'win32') {
                childProcess.exec(`taskkill /PID ${child.pid} /T /F`)
              } else {
                process.kill(child.pid, 'SIGKILL')
              }
            } catch (e) {
            } finally {
              const error = new Error('[yak -v] 获取版本超时，已强制终止')
              engineLogOutputFileAndUI(win, error.toString())
              yakVersionEmitter.emit('version', error, null)
              isFetchingVersion = false
            }
          }
        }, 5000)
        child.stdout.on('data', (data) => {
          stdout += data.toString('utf-8')
        })
        child.stderr.on('data', (data) => {
          stderr += data.toString('utf-8')
        })
        child.on('error', (err) => {
          if (finished) return
          finished = true
          clearTimeout(timer)
          engineLogOutputFileAndUI(win, `${err.toString('utf-8')}`)
          if (stderr) {
            engineLogOutputFileAndUI(win, `${stderr}`)
          }
          yakVersionEmitter.emit('version', err, null)
          isFetchingVersion = false
        })
        child.on('close', (code) => {
          if (finished) return
          engineLogOutputFileAndUI(win, `${stdout}`)
          const match = /.*?yak(\.exe)?\s+version\s+(\S+)/.exec(stdout)
          const version = match && match[2]
          if (!version) {
            engineLogOutputFileAndUI(win, '----- 引擎无法获取yak本地版本 -----')
            if (code !== 0 || stderr) {
              engineLogOutputFileAndUI(win, `${stderr}` || `Process exited with code ${code}`)
              const error = new Error(`${stderr}` || `Process exited with code ${code}`)
              yakVersionEmitter.emit('version', error, null)
              isFetchingVersion = false
            }
          } else {
            finished = true
            clearTimeout(timer)
            engineLogOutputFileAndUI(win, `----- 获取到yak本地版本: ${version}-----`)
            latestVersionCache = version
            yakVersionEmitter.emit('version', null, version)
            isFetchingVersion = false
          }
        })
      })
    }

    ipcMain.handle(ipcEventPre + 'get-current-yak', async (e, params) => {
      return await asyncGetCurrentLatestYakVersion(params)
    })

    ipcMain.handle(ipcEventPre + 'yak-engine-version-exists-and-correctness', async (e, version) => {
      return await asyncYakEngineVersionExistsAndCorrectness(version)
    })
  },
}
