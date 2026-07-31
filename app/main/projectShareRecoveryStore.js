const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const RECOVERY_SCHEMA = 'yakit.project-share-recovery/v1'
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LOCAL_IMPORT_NAME_PATTERN = /^__yakit_share_([1-9][0-9]*)_[0-9a-f]{32}$/

const BEFORE_LOCAL_IMPORT_STATUSES = new Set([
  'prepared',
  'downloading',
  'downloaded',
  'importing_project',
  'retryable_failed_before_import',
])
const AFTER_LOCAL_IMPORT_STATUSES = new Set([
  'renaming_project',
  'project_imported',
  'installing_plugins',
  'completing',
  'retryable_failed_after_import',
])
const STATUS_ORDER = new Map([
  ['prepared', 0],
  ['downloading', 1],
  ['downloaded', 2],
  ['retryable_failed_before_import', 2],
  ['importing_project', 3],
  ['renaming_project', 4],
  ['project_imported', 5],
  ['installing_plugins', 6],
  ['retryable_failed_after_import', 6],
  ['completing', 7],
])

const BASE_KEYS = new Set([
  'schema',
  'receiptId',
  'shareId',
  'snapshotId',
  'onlineProjectId',
  'projectKey',
  'name',
  'localProjectName',
  'localImportName',
  'folderId',
  'childFolderId',
  'projectType',
  'managedHandles',
  'expectedSize',
  'expectedSha256',
  'clientId',
  'idempotencyKey',
  'status',
  'revision',
  'lastHeartbeatAt',
  'updatedAt',
  'localProjectId',
])

const errorWithCode = (code) => {
  const error = new Error(code)
  error.code = code
  return error
}

const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0
const isNonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() === value && value.length > 0

const validateExactKeys = (value, allowed) =>
  value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => allowed.has(key))

const validatePluginMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  const keys = Object.keys(metadata).sort()
  if (keys.join('\0') !== ['author', 'help', 'params', 'tags'].join('\0')) return false
  if (
    typeof metadata.author !== 'string' ||
    typeof metadata.help !== 'string' ||
    !Array.isArray(metadata.tags) ||
    !metadata.tags.every((tag) => typeof tag === 'string') ||
    !Array.isArray(metadata.params)
  ) {
    return false
  }
  const requiredParameterKeys = new Set([
    'field',
    'fieldVerbose',
    'required',
    'typeVerbose',
    'defaultValue',
    'extraSetting',
    'help',
  ])
  const allowedParameterKeys = new Set([
    ...requiredParameterKeys,
    'group',
    'methodType',
    'jsonSchema',
    'uiSchema',
    'suggestionDataExpression',
  ])
  return metadata.params.every((parameter) => {
    if (!parameter || typeof parameter !== 'object' || Array.isArray(parameter)) return false
    const parameterKeys = Object.keys(parameter)
    return (
      [...requiredParameterKeys].every((key) => parameterKeys.includes(key)) &&
      parameterKeys.every((key) => allowedParameterKeys.has(key)) &&
      typeof parameter.required === 'boolean' &&
      [...requiredParameterKeys]
        .filter((key) => key !== 'required')
        .every((key) => typeof parameter[key] === 'string') &&
      [...allowedParameterKeys]
        .filter((key) => !requiredParameterKeys.has(key))
        .every((key) => parameter[key] === undefined || typeof parameter[key] === 'string')
    )
  })
}

const validateManagedHandle = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const baseKeys = ['kind', 'handle', 'byteLength', 'sha256']
  const pluginKeys = [...baseKeys, 'scriptName', 'type', 'version', 'fileHash', 'entry', 'metadata']
  const expectedKeys = value.kind === 'plugin' ? pluginKeys : baseKeys
  if (
    Object.keys(value).length !== expectedKeys.length ||
    !expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  ) {
    return false
  }
  if (!['bundle', 'project_archive', 'plugin'].includes(value.kind)) return false
  if (!UUID_PATTERN.test(value.handle) || !isPositiveInteger(value.byteLength) || !SHA256_PATTERN.test(value.sha256)) {
    return false
  }
  if (value.kind === 'plugin') {
    return (
      isNonEmptyString(value.scriptName) &&
      isNonEmptyString(value.type) &&
      isPositiveInteger(value.version) &&
      SHA256_PATTERN.test(value.fileHash) &&
      value.fileHash === value.sha256 &&
      isNonEmptyString(value.entry) &&
      validatePluginMetadata(value.metadata)
    )
  }
  return true
}

const validateRecoveryRecord = (record) => {
  if (!validateExactKeys(record, BASE_KEYS)) throw errorWithCode('project_share_recovery_record_invalid')
  const importNameMatch =
    typeof record.localImportName === 'string' ? record.localImportName.match(LOCAL_IMPORT_NAME_PATTERN) : null
  const statusIsBefore = BEFORE_LOCAL_IMPORT_STATUSES.has(record.status)
  const statusIsAfter = AFTER_LOCAL_IMPORT_STATUSES.has(record.status)
  const hasLocalProjectId = Object.prototype.hasOwnProperty.call(record, 'localProjectId')
  if (
    record.schema !== RECOVERY_SCHEMA ||
    !isPositiveInteger(record.receiptId) ||
    !isPositiveInteger(record.shareId) ||
    !isPositiveInteger(record.snapshotId) ||
    !isPositiveInteger(record.onlineProjectId) ||
    !isNonEmptyString(record.projectKey) ||
    !isNonEmptyString(record.name) ||
    !isNonEmptyString(record.localProjectName) ||
    !importNameMatch ||
    Number(importNameMatch[1]) !== record.receiptId ||
    !isNonNegativeInteger(record.folderId) ||
    !isNonNegativeInteger(record.childFolderId) ||
    !isNonEmptyString(record.projectType) ||
    !Array.isArray(record.managedHandles) ||
    !record.managedHandles.every(validateManagedHandle) ||
    new Set(record.managedHandles.map((item) => item.handle)).size !== record.managedHandles.length ||
    !isPositiveInteger(record.expectedSize) ||
    !SHA256_PATTERN.test(record.expectedSha256) ||
    !isNonEmptyString(record.clientId) ||
    !UUID_PATTERN.test(record.idempotencyKey) ||
    (!statusIsBefore && !statusIsAfter) ||
    !isNonNegativeInteger(record.revision) ||
    !isNonEmptyString(record.updatedAt) ||
    (record.lastHeartbeatAt !== undefined && !isNonEmptyString(record.lastHeartbeatAt)) ||
    (statusIsBefore && hasLocalProjectId) ||
    (statusIsAfter && (!hasLocalProjectId || !isPositiveInteger(record.localProjectId)))
  ) {
    throw errorWithCode('project_share_recovery_record_invalid')
  }
  return record
}

const validateTransition = (current, next) => {
  if (!current) return
  const currentHasID = isPositiveInteger(current.localProjectId)
  const nextHasID = isPositiveInteger(next.localProjectId)
  if (
    current.receiptId !== next.receiptId ||
    current.shareId !== next.shareId ||
    current.snapshotId !== next.snapshotId ||
    current.onlineProjectId !== next.onlineProjectId ||
    current.idempotencyKey !== next.idempotencyKey ||
    current.localImportName !== next.localImportName ||
    (currentHasID && (!nextHasID || current.localProjectId !== next.localProjectId))
  ) {
    throw errorWithCode('project_share_recovery_state_invalid')
  }
  const currentOrder = STATUS_ORDER.get(current.status)
  const nextOrder = STATUS_ORDER.get(next.status)
  const permittedRetry =
    (current.status === 'retryable_failed_before_import' && nextOrder <= STATUS_ORDER.get('importing_project')) ||
    (current.status === 'retryable_failed_after_import' && nextOrder >= STATUS_ORDER.get('project_imported'))
  if (!permittedRetry && nextOrder < currentOrder) {
    throw errorWithCode('project_share_recovery_state_invalid')
  }
}

const defaultRootDirectory = () => {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), 'project-share', 'recovery')
}

const createProjectShareRecoveryStore = ({
  rootDirectory = defaultRootDirectory(),
  now = () => new Date().toISOString(),
} = {}) => {
  const rootPath = path.resolve(rootDirectory)
  const queues = new Map()

  const ensureRoot = () => fs.promises.mkdir(rootPath, { recursive: true })
  const recordPath = (receiptId) => {
    if (!isPositiveInteger(receiptId)) throw errorWithCode('project_share_recovery_record_invalid')
    return path.join(rootPath, `receipt-${receiptId}.json`)
  }

  const serialize = (receiptId, operation) => {
    const previous = queues.get(receiptId) || Promise.resolve()
    const current = previous.catch(() => undefined).then(operation)
    queues.set(receiptId, current)
    return current.finally(() => {
      if (queues.get(receiptId) === current) queues.delete(receiptId)
    })
  }

  const isolateCorrupt = async (filePath) => {
    const isolatedPath = `${filePath}.corrupt-${Date.now()}-${crypto.randomUUID()}`
    await fs.promises.rename(filePath, isolatedPath).catch(() => undefined)
  }

  const readFileRecord = async (filePath, isolate = true) => {
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8')
      const record = JSON.parse(raw)
      validateRecoveryRecord(record)
      if (record.revision < 1) throw errorWithCode('project_share_recovery_record_invalid')
      return record
    } catch (error) {
      if (error && error.code === 'ENOENT') return null
      if (isolate) await isolateCorrupt(filePath)
      throw error
    }
  }

  const get = async (receiptId) => {
    await ensureRoot()
    return readFileRecord(recordPath(receiptId), false)
  }

  const list = async () => {
    await ensureRoot()
    const names = await fs.promises.readdir(rootPath)
    const records = []
    for (const name of names.sort()) {
      if (!/^receipt-[1-9][0-9]*\.json$/.test(name)) continue
      try {
        const record = await readFileRecord(path.join(rootPath, name), true)
        if (record) records.push(record)
      } catch {}
    }
    return records.sort((first, second) => first.receiptId - second.receiptId)
  }

  const writeAtomic = async (filePath, record) => {
    const temporaryPath = `${filePath}.tmp-${crypto.randomUUID()}`
    const bytes = `${JSON.stringify(record, null, 2)}\n`
    const handle = await fs.promises.open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(bytes, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await fs.promises.rename(temporaryPath, filePath)
    } catch (error) {
      await fs.promises.unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }

  const upsert = ({ expectedRevision, record }) => {
    if (!isNonNegativeInteger(expectedRevision)) {
      return Promise.reject(errorWithCode('project_share_recovery_record_invalid'))
    }
    return serialize(record?.receiptId, async () => {
      await ensureRoot()
      if (!record || !isPositiveInteger(record.receiptId)) {
        throw errorWithCode('project_share_recovery_record_invalid')
      }
      const filePath = recordPath(record.receiptId)
      const current = await readFileRecord(filePath, false)
      if (current && isPositiveInteger(current.localProjectId) && !isPositiveInteger(record.localProjectId)) {
        throw errorWithCode('project_share_recovery_state_invalid')
      }
      validateRecoveryRecord(record)
      if (record.revision !== expectedRevision) throw errorWithCode('project_share_recovery_conflict')
      const currentRevision = current?.revision || 0
      if (currentRevision !== expectedRevision) throw errorWithCode('project_share_recovery_conflict')
      validateTransition(current, record)
      const next = {
        ...record,
        revision: expectedRevision + 1,
        updatedAt: now(),
      }
      validateRecoveryRecord(next)
      await writeAtomic(filePath, next)
      return next
    })
  }

  const remove = ({ receiptId, expectedRevision }) =>
    serialize(receiptId, async () => {
      await ensureRoot()
      if (!isPositiveInteger(receiptId) || !isPositiveInteger(expectedRevision)) {
        throw errorWithCode('project_share_recovery_record_invalid')
      }
      const filePath = recordPath(receiptId)
      const current = await readFileRecord(filePath, false)
      if (!current || current.revision !== expectedRevision) {
        throw errorWithCode('project_share_recovery_conflict')
      }
      if (current.managedHandles.length > 0) {
        throw errorWithCode('project_share_recovery_handles_not_empty')
      }
      await fs.promises.unlink(filePath)
    })

  const releaseHandle = async ({ receiptId, handle, expectedRevision }) => {
    const current = await get(receiptId)
    if (!current || current.revision !== expectedRevision) {
      throw errorWithCode('project_share_recovery_conflict')
    }
    if (!UUID_PATTERN.test(String(handle || ''))) {
      throw errorWithCode('project_share_recovery_record_invalid')
    }
    return upsert({
      expectedRevision,
      record: {
        ...current,
        managedHandles: current.managedHandles.filter((item) => item.handle !== handle),
      },
    })
  }

  const isHandleReferenced = async (handle) =>
    (await list()).some((record) => record.managedHandles.some((item) => item.handle === handle))

  return {
    get,
    isHandleReferenced,
    list,
    releaseHandle,
    remove,
    upsert,
  }
}

module.exports = {
  RECOVERY_SCHEMA,
  createProjectShareRecoveryStore,
  validateRecoveryRecord,
}
