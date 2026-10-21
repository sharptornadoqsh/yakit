const fs = require('fs')
const path = require('path')
const {
  calculateFileSha256,
  extractArchiveEntry,
  getCompatibilityEntry,
  isWindowsLegacy,
  verifyFileSha256,
} = require('./engineLifecycle')

const deployments = new Map()
const validName = (name) => /^(yak\.exe|ucrtbase\.dll|api-ms-win-[a-z0-9-]+\.dll)$/.test(name)

const validateFiles = (artifact) => {
  const files = artifact?.files
  if (
    !Array.isArray(files) ||
    files.length !== 43 ||
    new Set(files.map((file) => file.name)).size !== files.length ||
    !files.some((file) => file.name === 'yak.exe') ||
    !files.some((file) => file.name === 'ucrtbase.dll') ||
    files.some((file) => !validName(file.name) || !/^[a-f0-9]{64}$/.test(file.sha256))
  ) {
    throw new Error('Windows legacy 引擎及完整运行库清单无效')
  }
  return files
}

const removeFile = (file) => {
  try {
    fs.unlinkSync(file)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

const recoverDeployment = (directory) => {
  const journalPath = path.join(directory, '.legacy-install.json')
  if (!fs.existsSync(journalPath)) return
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
  if (
    !/^\.legacy-stage-[a-zA-Z0-9]+$/.test(journal.stage) ||
    !Array.isArray(journal.files) ||
    journal.files.some((file) => !validName(file.name) || typeof file.existed !== 'boolean')
  ) {
    throw new Error('Windows legacy 部署恢复记录无效')
  }
  const stage = path.join(directory, journal.stage)
  for (const file of journal.files) {
    const target = path.join(directory, file.name)
    const backup = path.join(stage, `${file.name}.previous`)
    if (fs.existsSync(backup)) {
      removeFile(target)
      fs.renameSync(backup, target)
    } else if (!file.existed) {
      removeFile(target)
    }
  }
  removeFile(journalPath)
}

// Only files named by the verified bundle participate in this transaction.
const deployWindowsLegacyBundle = async ({ archivePath, artifact, directory, forceEngine = false }) => {
  const files = validateFiles(artifact)
  fs.mkdirSync(directory, { recursive: true })
  recoverDeployment(directory)
  const engine = path.join(directory, 'yak.exe')
  const currentSha = fs.existsSync(engine) ? await calculateFileSha256(engine) : ''
  const replaceEngine = forceEngine || !currentSha || (artifact.replaceEngineSha256 || []).includes(currentSha)
  const selected = files.filter((file) => file.name !== 'yak.exe' || replaceEngine)
  let unchanged = true
  for (const file of selected) {
    const target = path.join(directory, file.name)
    if (!fs.existsSync(target) || (await calculateFileSha256(target)) !== file.sha256) unchanged = false
  }
  if (unchanged) return { changed: false, engineReplaced: false }

  await verifyFileSha256(archivePath, artifact.archiveSha256)
  const stage = fs.mkdtempSync(path.join(directory, '.legacy-stage-'))
  const journalPath = path.join(directory, '.legacy-install.json')
  const journal = {
    stage: path.basename(stage),
    files: selected.map((file) => ({ name: file.name, existed: fs.existsSync(path.join(directory, file.name)) })),
  }
  try {
    for (const file of selected) {
      const destination = path.join(stage, file.name)
      await extractArchiveEntry(
        archivePath,
        `bins/${file.name === 'yak.exe' ? 'yak_windows_amd64.exe' : file.name}`,
        destination,
      )
      await verifyFileSha256(destination, file.sha256)
    }
    fs.writeFileSync(`${journalPath}.tmp`, JSON.stringify(journal), 'utf8')
    fs.renameSync(`${journalPath}.tmp`, journalPath)
    for (const file of journal.files) {
      const target = path.join(directory, file.name)
      if (file.existed) fs.renameSync(target, path.join(stage, `${file.name}.previous`))
      fs.renameSync(path.join(stage, file.name), target)
    }
    for (const file of selected) await verifyFileSha256(path.join(directory, file.name), file.sha256)
    // Keep the previous set until a later explicit recovery decision.
    removeFile(journalPath)
    return { changed: true, engineReplaced: replaceEngine, backupDirectory: stage }
  } catch (error) {
    try {
      recoverDeployment(directory)
      for (const file of selected) removeFile(path.join(stage, file.name))
      removeFile(`${journalPath}.tmp`)
      if (fs.readdirSync(stage).length === 0) fs.rmdirSync(stage)
    } catch (recoveryError) {
      throw new Error(`Windows legacy 部署失败：${error.message}；恢复待重试：${recoveryError.message}`)
    }
    throw error
  }
}

const prepareWindowsLegacyEngine = ({ command, archivePath, forceEngine = false }) => {
  if (!isWindowsLegacy()) return Promise.resolve()
  const artifact = getCompatibilityEntry()?.artifact
  if (!artifact?.files) {
    return fs.existsSync(archivePath)
      ? Promise.reject(new Error('Windows legacy 预置工件缺少完整运行库清单'))
      : Promise.resolve()
  }
  const directory = path.dirname(command)
  if (deployments.has(directory)) {
    return deployments.get(directory).then(() => prepareWindowsLegacyEngine({ command, archivePath, forceEngine }))
  }
  const pending = deployWindowsLegacyBundle({ archivePath, artifact, directory, forceEngine }).finally(() =>
    deployments.delete(directory),
  )
  deployments.set(directory, pending)
  return pending
}

const redactEngineOutput = (text) =>
  String(text || '')
    .replace(/<json-[\w-]+>[\s\S]*?(?:<\/json-[\w-]+>|<json-[\w-]+>)/g, '[引擎能力数据已隐藏]')
    .replace(/("(?:secret|password|token)"\s*:\s*")[^"]*"/gi, '$1[已隐藏]"')
    .replace(/(--(?:local-password|password|token)\s+)\S+/gi, '$1[已隐藏]')
    .slice(-4000)

const createEngineLogWriter = (write, secret = '') => {
  let pending = ''
  let inJson = false
  const line = (value) => {
    if (inJson || value.includes('<json-')) {
      inJson = !/<\/json-/.test(value) && (value.match(/<json-/g) || []).length < 2
      write('[引擎结构化数据已隐藏]')
      return
    }
    write(redactEngineOutput(secret ? value.split(secret).join('[已隐藏]') : value))
  }
  return {
    push: (chunk) => {
      pending += chunk
      const lines = pending.split(/\r?\n/)
      pending = lines.pop()
      lines.forEach(line)
      if (pending.length > 65536) {
        pending = ''
        write('[超长引擎输出已截断]')
      }
    },
    flush: () => {
      if (pending) line(pending)
      pending = ''
    },
  }
}

const classifyEngineFailure = ({ code = null, signal = null, stderr = '', stage = 'capability-check', secret = '' }) => {
  const exitHex = typeof code === 'number' ? `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}` : ''
  const detail = redactEngineOutput(secret ? stderr.split(secret).join('[已隐藏]') : stderr)
  let status = 'engine_exit'
  let reason = '引擎未完成启动便已退出'
  if (exitHex === '0xC0000135' || /api-ms-win-crt-|(?:cannot find|not found|缺少).+\.dll/i.test(detail)) {
    status = 'dll_load_error'
    reason = '引擎 DLL 或其依赖加载失败'
  }
  if (/fatal error:|panic before malloc heap initialized/i.test(detail)) {
    status = 'runtime_init_error'
    reason = '引擎运行时初始化失败'
  }
  return {
    status,
    stage,
    exitCode: code,
    exitHex,
    signal,
    stderr: detail,
    message: `${reason}；阶段：${stage}；退出码：${code}${exitHex ? ` (${exitHex})` : ''}${detail ? `\n${detail}` : '；没有错误输出'}`,
  }
}

module.exports = {
  classifyEngineFailure,
  createEngineLogWriter,
  deployWindowsLegacyBundle,
  prepareWindowsLegacyEngine,
  redactEngineOutput,
  validateFiles,
}
