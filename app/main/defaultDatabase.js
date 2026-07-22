const childProcess = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { productConfig } = require('./product')

const SQLITE_FILE_SUFFIXES = ['', '-wal', '-shm']
const SQLITE_MOVE_SUFFIXES = ['-wal', '-shm', '']
const SQLITE_ACTIVITY_SUFFIXES = ['', '-wal', '-shm', '-journal']
const MIGRATION_JOURNAL_NAME = '.ruiyan-default-database-migration.json'
const MIGRATION_LOCK_NAME = '.ruiyan-default-database-migration.lock'
const MIGRATION_LOCK_QUEUE_NAME = `${MIGRATION_LOCK_NAME}.queue`
const MIGRATION_JOURNAL_VERSION = 1
const MIGRATION_LOCK_EVENT_VERSION = 1
const MIGRATION_LOCK_STALE_MS = 5 * 60 * 1000
const DATABASE_IDLE_SAMPLE_MS = 100
const PROCESS_LIST_TIMEOUT_MS = 5000
const DATABASE_IDLE_WAIT_ARRAY = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))
const ENTERPRISE_EDITIONS = new Set([
  'enterprise',
  'enpritrace',
  'yakitee',
  'simple-enterprise',
  'etraceagent',
  'yakitse',
])
const SPECIAL_DATABASE_ENVIRONMENTS = {
  irify: {
    YAK_DEFAULT_PROFILE_DATABASE_NAME: 'irify-profile-rule.db',
    YAK_DEFAULT_PROJECT_DATABASE_NAME: 'default-irify.db',
    SSA_DATABASE_RAW: 'default-yakssa.db',
  },
  memfit: {
    YAK_DEFAULT_PROJECT_DATABASE_NAME: 'default-memfit.db',
  },
}
const LEGACY_DATABASES = [
  { from: 'default-yakit.db', to: productConfig.defaultDatabaseName },
  { from: 'company-default-yakit.db', to: productConfig.enterpriseDefaultDatabaseName },
]

let initializationError

const getDefaultDatabaseName = (edition = '') =>
  ENTERPRISE_EDITIONS.has(String(edition).toLowerCase())
    ? productConfig.enterpriseDefaultDatabaseName
    : productConfig.defaultDatabaseName

const getDefaultDatabaseEnvironment = (softwareVersion = '', edition = '') => {
  if (initializationError) {
    const error = new Error(`默认数据库名称迁移未完成：${initializationError.message}`)
    error.cause = initializationError
    throw error
  }

  const specialEnvironment = SPECIAL_DATABASE_ENVIRONMENTS[String(softwareVersion).toLowerCase()]
  if (specialEnvironment) return { ...specialEnvironment }

  return { YAK_DEFAULT_PROJECT_DATABASE_NAME: getDefaultDatabaseName(edition) }
}

const hasDatabaseFiles = (directory, databaseName) =>
  SQLITE_FILE_SUFFIXES.some((suffix) => fs.existsSync(path.join(directory, `${databaseName}${suffix}`)))

const getMigrationJournalPath = (directory) => path.join(directory, MIGRATION_JOURNAL_NAME)

const getMigrationLockPath = (directory) => path.join(directory, MIGRATION_LOCK_NAME)

const getMigrationLockQueuePath = (directory) => path.join(directory, MIGRATION_LOCK_QUEUE_NAME)

const getMigrationLockClaimPath = (directory, ownerId) =>
  path.join(directory, `${MIGRATION_LOCK_NAME}.${ownerId}.claim`)

const syncDirectory = (directory) => {
  let descriptor
  try {
    descriptor = fs.openSync(directory, 'r')
    fs.fsyncSync(descriptor)
  } catch (error) {
    if (!['EACCES', 'EBADF', 'EISDIR', 'EINVAL', 'EPERM', 'UNKNOWN'].includes(error?.code)) throw error
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
}

const writeJsonAtomically = (filePath, value) => {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    const descriptor = fs.openSync(temporaryPath, 'wx')
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
      fs.fsyncSync(descriptor)
    } finally {
      fs.closeSync(descriptor)
    }
    fs.renameSync(temporaryPath, filePath)
    syncDirectory(path.dirname(filePath))
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true })
    throw error
  }
}

const createMigrationLockError = (lockPath) => {
  const error = new Error(`默认数据库迁移正在由另一进程执行：${lockPath}`)
  error.code = 'DATABASE_MIGRATION_LOCKED'
  return error
}

const isLeaseFresh = (filePath) => {
  try {
    return Date.now() - fs.statSync(filePath).mtimeMs <= MIGRATION_LOCK_STALE_MS
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

const assertLegacyMigrationLockInactive = (directory) => {
  const lockPath = getMigrationLockPath(directory)
  if (isLeaseFresh(lockPath)) throw createMigrationLockError(lockPath)
}

const appendMigrationLockEvent = (directory, event) => {
  const queuePath = getMigrationLockQueuePath(directory)
  const content = Buffer.from(`${JSON.stringify(event)}\n`, 'utf8')
  const descriptor = fs.openSync(queuePath, 'a')
  try {
    const written = fs.writeSync(descriptor, content, 0, content.length)
    if (written !== content.length) throw new Error(`默认数据库迁移锁事件写入不完整：${queuePath}`)
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  syncDirectory(directory)
}

const validateMigrationLockEvent = (event) => {
  if (
    event?.version !== MIGRATION_LOCK_EVENT_VERSION ||
    !['acquire', 'release'].includes(event?.type) ||
    typeof event?.ownerId !== 'string' ||
    !/^[0-9a-f-]{36}$/.test(event.ownerId)
  ) {
    throw new Error('默认数据库迁移锁队列格式无效')
  }
  return event
}

const readMigrationLockEvents = (directory) => {
  const queuePath = getMigrationLockQueuePath(directory)
  try {
    return fs
      .readFileSync(queuePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => validateMigrationLockEvent(JSON.parse(line)))
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    const queueError = new Error(`默认数据库迁移锁队列损坏：${error.message}`)
    queueError.cause = error
    throw queueError
  }
}

const removeMigrationLockClaim = (migrationLock) => {
  fs.rmSync(migrationLock.claimPath, { force: true })
  syncDirectory(migrationLock.directory)
}

const retireMigrationLockClaim = (migrationLock) => {
  appendMigrationLockEvent(migrationLock.directory, {
    version: MIGRATION_LOCK_EVENT_VERSION,
    type: 'release',
    ownerId: migrationLock.ownerId,
    createdAt: new Date().toISOString(),
  })
  migrationLock.released = true
}

const cleanupRejectedMigrationLockClaim = (migrationLock) => {
  try {
    retireMigrationLockClaim(migrationLock)
  } catch (error) {}
  try {
    removeMigrationLockClaim(migrationLock)
  } catch (error) {}
}

const touchMigrationLock = (migrationLock) => {
  if (migrationLock.released) throw new Error('默认数据库迁移锁已经释放')
  const now = new Date()
  try {
    fs.utimesSync(migrationLock.claimPath, now, now)
  } catch (error) {
    const compromisedError = new Error(`默认数据库迁移锁已失效：${migrationLock.claimPath}`)
    compromisedError.code = 'DATABASE_MIGRATION_LOCK_COMPROMISED'
    compromisedError.cause = error
    throw compromisedError
  }
}

const acquireMigrationLock = (directory) => {
  assertLegacyMigrationLockInactive(directory)
  const ownerId = crypto.randomUUID()
  const claimPath = getMigrationLockClaimPath(directory, ownerId)
  const migrationLock = { directory, ownerId, claimPath, released: false }
  const descriptor = fs.openSync(claimPath, 'wx')

  try {
    fs.writeFileSync(
      descriptor,
      `${JSON.stringify({ version: MIGRATION_LOCK_EVENT_VERSION, ownerId, pid: process.pid })}\n`,
      'utf8',
    )
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  syncDirectory(directory)

  try {
    appendMigrationLockEvent(directory, {
      version: MIGRATION_LOCK_EVENT_VERSION,
      type: 'acquire',
      ownerId,
      createdAt: new Date().toISOString(),
    })
    const events = readMigrationLockEvents(directory)
    const releasedOwners = new Set(events.filter(({ type }) => type === 'release').map(({ ownerId }) => ownerId))
    const ownEventIndex = events.findIndex((event) => event.type === 'acquire' && event.ownerId === ownerId)
    if (ownEventIndex < 0) throw new Error('默认数据库迁移锁票据不存在')

    const blockingEvent = events
      .slice(0, ownEventIndex)
      .find(
        (event) =>
          event.type === 'acquire' &&
          !releasedOwners.has(event.ownerId) &&
          isLeaseFresh(getMigrationLockClaimPath(directory, event.ownerId)),
      )
    if (blockingEvent) throw createMigrationLockError(getMigrationLockClaimPath(directory, blockingEvent.ownerId))

    touchMigrationLock(migrationLock)
    return migrationLock
  } catch (error) {
    cleanupRejectedMigrationLockClaim(migrationLock)
    throw error
  }
}

const releaseMigrationLock = (migrationLock) => {
  const errors = []
  try {
    retireMigrationLockClaim(migrationLock)
  } catch (error) {
    errors.push(error)
  }
  try {
    removeMigrationLockClaim(migrationLock)
  } catch (error) {
    errors.push(error)
  }
  if (errors.length > 0) console.warn(`默认数据库迁移锁清理失败：${errors.map(({ message }) => message).join('；')}`)
}

const parseActiveLocalEngineProcesses = (stdout) => {
  const processes = []
  String(stdout)
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      if (process.platform === 'win32') {
        const match = /^(\d+)\t\d+\t(.+)$/.exec(line)
        if (!match) return
        processes.push({ name: match[2], pid: Number(match[1]) })
        return
      }

      const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(line)
      if (match) processes.push({ name: match[2], pid: Number(match[1]) })
    })

  return processes.filter(({ name }) => ['yak', 'yak.exe'].includes(path.basename(name).toLowerCase()))
}

const getActiveLocalEngineProcesses = () => {
  try {
    let stdout
    if (process.platform === 'win32') {
      const executableName = {
        ia32: 'fastlist-0.3.0-x86.exe',
        x64: 'fastlist-0.3.0-x64.exe',
      }[process.arch]
      if (!executableName) throw new Error(`不支持的进程架构：${process.arch}`)
      const executablePath = path.join(__dirname, 'handlers', 'libs', 'extVendor', executableName)
      stdout = childProcess.execFileSync(executablePath, [], {
        encoding: 'utf8',
        timeout: PROCESS_LIST_TIMEOUT_MS,
        windowsHide: true,
      })
    } else {
      stdout = childProcess.execFileSync('ps', ['-A', '-o', 'pid=,comm='], {
        encoding: 'utf8',
        timeout: PROCESS_LIST_TIMEOUT_MS,
      })
    }
    return parseActiveLocalEngineProcesses(stdout)
  } catch (error) {
    const activityError = new Error(`无法确认本地引擎状态：${error.message}`)
    activityError.code = 'DATABASE_MIGRATION_ACTIVITY_UNKNOWN'
    activityError.cause = error
    throw activityError
  }
}

const assertNoActiveLocalEngines = () => {
  const processes = getActiveLocalEngineProcesses()
  if (processes.length === 0) return
  const error = new Error(`检测到活动的本地引擎：${processes.map(({ pid }) => pid).join('、')}`)
  error.code = 'DATABASE_MIGRATION_ACTIVE_ENGINE'
  throw error
}

const getDatabaseActivityPaths = (directory, databaseNames) =>
  [...databaseNames].flatMap((databaseName) =>
    SQLITE_ACTIVITY_SUFFIXES.map((suffix) => path.join(directory, `${databaseName}${suffix}`)),
  )

const getFileSignature = (filePath) => {
  try {
    const statistics = fs.statSync(filePath, { bigint: true })
    return `${statistics.dev}:${statistics.ino}:${statistics.size}:${statistics.mtimeNs}:${statistics.ctimeNs}`
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing'
    throw error
  }
}

const captureDatabaseActivity = (filePaths) =>
  new Map(filePaths.map((filePath) => [filePath, getFileSignature(filePath)]))

const confirmDatabaseIdle = ({ directory, databaseNames }) => {
  assertNoActiveLocalEngines()
  const filePaths = getDatabaseActivityPaths(directory, databaseNames)
  const rollbackJournal = filePaths.find((filePath) => filePath.endsWith('-journal') && fs.existsSync(filePath))
  if (rollbackJournal) {
    const error = new Error(`检测到未恢复的 SQLite 回滚日志：${rollbackJournal}`)
    error.code = 'DATABASE_MIGRATION_RECOVERY_REQUIRED'
    throw error
  }

  const before = captureDatabaseActivity(filePaths)
  Atomics.wait(DATABASE_IDLE_WAIT_ARRAY, 0, 0, DATABASE_IDLE_SAMPLE_MS)
  const after = captureDatabaseActivity(filePaths)
  assertNoActiveLocalEngines()

  const changedPath = filePaths.find((filePath) => before.get(filePath) !== after.get(filePath))
  if (!changedPath) return true
  const error = new Error(`检测到数据库文件仍在写入：${changedPath}`)
  error.code = 'DATABASE_MIGRATION_ACTIVE_WRITE'
  throw error
}

const getAvailableArchiveName = (directory, databaseName) => {
  const extension = path.extname(databaseName)
  const stem = databaseName.slice(0, -extension.length)
  let index = 1
  let candidate = `${stem}-legacy${extension}`

  while (hasDatabaseFiles(directory, candidate)) {
    index += 1
    candidate = `${stem}-legacy-${index}${extension}`
  }

  return candidate
}

const getOperationKey = (source, target) => `${source}\u0000${target}`

const isValidArchiveName = (targetName, archiveName) => {
  if (archiveName === null) return true
  if (typeof archiveName !== 'string' || path.basename(archiveName) !== archiveName) return false

  const extension = path.extname(targetName)
  const stem = targetName.slice(0, -extension.length)
  const archiveStem = archiveName.slice(0, -extension.length)
  const archivePrefix = `${stem}-legacy`
  return (
    archiveName.endsWith(extension) &&
    (archiveStem === archivePrefix ||
      (archiveStem.startsWith(`${archivePrefix}-`) && /^\d+$/.test(archiveStem.slice(archivePrefix.length + 1))))
  )
}

const validateMigrationJournal = (journal) => {
  const mapping = LEGACY_DATABASES.find(({ from, to }) => journal?.from === from && journal?.to === to)
  const archivedTo = journal?.archivedTo

  if (
    journal?.version !== MIGRATION_JOURNAL_VERSION ||
    !mapping ||
    !isValidArchiveName(journal.to, archivedTo) ||
    !Array.isArray(journal.operations) ||
    journal.operations.length === 0
  ) {
    throw new Error('默认数据库迁移日志格式无效')
  }

  const allowedOperations = new Set()
  SQLITE_FILE_SUFFIXES.forEach((suffix) => {
    allowedOperations.add(getOperationKey(`${journal.from}${suffix}`, `${journal.to}${suffix}`))
    if (archivedTo) {
      allowedOperations.add(getOperationKey(`${journal.to}${suffix}`, `${archivedTo}${suffix}`))
    }
  })

  const observedOperations = new Set()
  journal.operations.forEach((operation) => {
    const key = getOperationKey(operation?.source, operation?.target)
    if (!allowedOperations.has(key) || observedOperations.has(key) || typeof operation.completed !== 'boolean') {
      throw new Error('默认数据库迁移日志步骤无效')
    }
    observedOperations.add(key)
  })

  return journal
}

const readMigrationJournal = (directory) => {
  const journalPath = getMigrationJournalPath(directory)
  if (!fs.existsSync(journalPath)) return undefined
  try {
    return validateMigrationJournal(JSON.parse(fs.readFileSync(journalPath, 'utf8')))
  } catch (error) {
    const journalError = new Error(`默认数据库迁移日志损坏：${error.message}`)
    journalError.cause = error
    throw journalError
  }
}

const writeMigrationJournal = (directory, journal) => {
  writeJsonAtomically(getMigrationJournalPath(directory), journal)
}

const createOperation = (source, target) => ({ source, target, completed: false })

const isInterruptedLegacyMigration = (directory, sourceName, targetName) => {
  const sourceMainExists = fs.existsSync(path.join(directory, sourceName))
  const targetMainExists = fs.existsSync(path.join(directory, targetName))
  if (!sourceMainExists || targetMainExists) return false

  const sidecarSuffixes = ['-wal', '-shm']
  const interruptedSidecarExists = sidecarSuffixes.some(
    (suffix) =>
      fs.existsSync(path.join(directory, `${targetName}${suffix}`)) &&
      !fs.existsSync(path.join(directory, `${sourceName}${suffix}`)),
  )
  const conflictingSidecarExists = sidecarSuffixes.some(
    (suffix) =>
      fs.existsSync(path.join(directory, `${targetName}${suffix}`)) &&
      fs.existsSync(path.join(directory, `${sourceName}${suffix}`)),
  )

  return interruptedSidecarExists && !conflictingSidecarExists
}

const createMigrationJournal = (directory, sourceName, targetName) => {
  if (!fs.existsSync(path.join(directory, sourceName))) {
    throw new Error(`旧默认数据库主文件不存在：${path.join(directory, sourceName)}`)
  }

  const interruptedMigration = isInterruptedLegacyMigration(directory, sourceName, targetName)
  const targetExists = hasDatabaseFiles(directory, targetName)
  const archivedTo = targetExists && !interruptedMigration ? getAvailableArchiveName(directory, targetName) : null
  const operations = []

  if (archivedTo) {
    SQLITE_MOVE_SUFFIXES.forEach((suffix) => {
      if (fs.existsSync(path.join(directory, `${targetName}${suffix}`))) {
        operations.push(createOperation(`${targetName}${suffix}`, `${archivedTo}${suffix}`))
      }
    })
  }

  SQLITE_MOVE_SUFFIXES.forEach((suffix) => {
    const sourceExists = fs.existsSync(path.join(directory, `${sourceName}${suffix}`))
    const targetAlreadyContainsSource =
      interruptedMigration && fs.existsSync(path.join(directory, `${targetName}${suffix}`))
    if (sourceExists || targetAlreadyContainsSource) {
      operations.push(createOperation(`${sourceName}${suffix}`, `${targetName}${suffix}`))
    }
  })

  return {
    version: MIGRATION_JOURNAL_VERSION,
    from: sourceName,
    to: targetName,
    archivedTo,
    operations,
  }
}

const executeMigrationJournal = (directory, journal, migrationLock) => {
  journal.operations.forEach((operation) => {
    touchMigrationLock(migrationLock)
    const sourcePath = path.join(directory, operation.source)
    const targetPath = path.join(directory, operation.target)
    const sourceExists = fs.existsSync(sourcePath)
    const targetExists = fs.existsSync(targetPath)
    if (!sourceExists && targetExists) {
      if (!operation.completed) {
        operation.completed = true
        writeMigrationJournal(directory, journal)
      }
      return
    }
    if (sourceExists && !targetExists) {
      if (operation.completed) {
        operation.completed = false
        writeMigrationJournal(directory, journal)
      }
      fs.renameSync(sourcePath, targetPath)
      syncDirectory(directory)
      operation.completed = true
      writeMigrationJournal(directory, journal)
      touchMigrationLock(migrationLock)
      return
    }
    if (sourceExists && targetExists) {
      throw new Error(`默认数据库迁移源与目标同时存在：${sourcePath}，${targetPath}`)
    }
    throw new Error(`默认数据库迁移源与目标均不存在：${sourcePath}，${targetPath}`)
  })
}

const getMigrationRecord = (journal) => {
  const record = { from: journal.from, to: journal.to }
  if (journal.archivedTo) record.archivedTo = journal.archivedTo
  return record
}

const completeMigrationJournal = (directory, journal, migrationLock) => {
  executeMigrationJournal(directory, journal, migrationLock)
  fs.rmSync(getMigrationJournalPath(directory), { force: true })
  syncDirectory(directory)
  return getMigrationRecord(journal)
}

const migrateLegacyDefaultDatabases = (directory, options = {}) => {
  const migrationLock = acquireMigrationLock(directory)
  try {
    const records = []
    const pendingJournal = readMigrationJournal(directory)
    const pendingMappings = LEGACY_DATABASES.filter(({ from }) => hasDatabaseFiles(directory, from))
    const databaseNames = new Set()
    if (pendingJournal) {
      databaseNames.add(pendingJournal.from)
      databaseNames.add(pendingJournal.to)
      if (pendingJournal.archivedTo) databaseNames.add(pendingJournal.archivedTo)
    }
    pendingMappings.forEach(({ from, to }) => {
      databaseNames.add(from)
      databaseNames.add(to)
    })

    if (databaseNames.size > 0) {
      touchMigrationLock(migrationLock)
      const idleResult = (options.confirmDatabaseIdle || confirmDatabaseIdle)({ directory, databaseNames })
      if (idleResult === false) {
        const error = new Error('无法确认默认数据库处于静默状态')
        error.code = 'DATABASE_MIGRATION_ACTIVITY_UNKNOWN'
        throw error
      }
      touchMigrationLock(migrationLock)
    }

    if (pendingJournal) records.push(completeMigrationJournal(directory, pendingJournal, migrationLock))

    pendingMappings.forEach(({ from, to }) => {
      if (!hasDatabaseFiles(directory, from)) return

      const journal = createMigrationJournal(directory, from, to)
      writeMigrationJournal(directory, journal)
      records.push(completeMigrationJournal(directory, journal, migrationLock))
    })

    return records
  } finally {
    releaseMigrationLock(migrationLock)
  }
}

const initializeDefaultDatabases = (directory, options = {}) => {
  try {
    const records = migrateLegacyDefaultDatabases(directory, options)
    initializationError = undefined
    return records
  } catch (error) {
    initializationError = error
    throw error
  }
}

module.exports = {
  getDefaultDatabaseEnvironment,
  getDefaultDatabaseName,
  initializeDefaultDatabases,
  migrateLegacyDefaultDatabases,
}
