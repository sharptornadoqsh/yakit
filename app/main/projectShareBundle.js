const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const zlib = require('zlib')
const { Transform } = require('stream')
const { pipeline } = require('stream/promises')

const PROJECT_SHARE_BUNDLE_SCHEMA = 'yakit.team-project-bundle/v2'
const PROJECT_SHARE_PLUGIN_SCHEMA = 'yakit.team-project-plugin/v1'
const PROJECT_SHARE_BUNDLE_MEDIA_TYPE = 'application/vnd.yakit.team-project-bundle.v2+zip'
const PROJECT_SHARE_BUNDLE_CHUNK_BYTES = 4 * 1024 * 1024
const PROJECT_SHARE_MAX_PLUGIN_BYTES = 10 * 1024 * 1024
const PROJECT_SHARE_MAX_BUNDLE_BYTES = 2 * 1024 * 1024 * 1024
const PROJECT_SHARE_MAX_PLUGINS = 1000
const PROJECT_SHARE_MAX_MANIFEST_BYTES = 4 * 1024 * 1024
const PROJECT_SHARE_MAX_PLUGIN_ENTRY_BYTES = 16 * 1024 * 1024

const SHA256_PATTERN = /^[0-9a-f]{64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const ZIP_UTF8_FLAG = 0x0800
const ZIP_LOCAL_SIGNATURE = 0x04034b50
const ZIP_CENTRAL_SIGNATURE = 0x02014b50
const ZIP_END_SIGNATURE = 0x06054b50

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

const updateCRC32 = (current, bytes) => {
  let crc = current
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return crc >>> 0
}

const crc32 = (bytes) => (updateCRC32(0xffffffff, bytes) ^ 0xffffffff) >>> 0
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() === value && value.length > 0

const errorWithCode = (code) => {
  const error = new Error(code)
  error.code = code
  return error
}

const requireExactKeys = (value, keys, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw errorWithCode(code)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw errorWithCode(code)
  }
  return value
}

const decodeBase64 = (value, code) => {
  if (typeof value !== 'string' || !BASE64_PATTERN.test(value)) throw errorWithCode(code)
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value) throw errorWithCode(code)
  return bytes
}

const validateParameter = (parameter) => {
  const requiredKeys = ['field', 'fieldVerbose', 'required', 'typeVerbose', 'defaultValue', 'extraSetting', 'help']
  const optionalKeys = ['group', 'methodType', 'jsonSchema', 'uiSchema', 'suggestionDataExpression']
  if (!parameter || typeof parameter !== 'object' || Array.isArray(parameter)) return false
  const keys = Object.keys(parameter)
  if (
    !requiredKeys.every((key) => keys.includes(key)) ||
    keys.some((key) => ![...requiredKeys, ...optionalKeys].includes(key))
  ) {
    return false
  }
  return (
    typeof parameter.required === 'boolean' &&
    requiredKeys.filter((key) => key !== 'required').every((key) => typeof parameter[key] === 'string') &&
    optionalKeys.every((key) => parameter[key] === undefined || typeof parameter[key] === 'string')
  )
}

const validateMetadata = (metadata) => {
  requireExactKeys(metadata, ['author', 'help', 'tags', 'params'], 'project_share_plugin_metadata_invalid')
  if (
    typeof metadata.author !== 'string' ||
    typeof metadata.help !== 'string' ||
    !Array.isArray(metadata.tags) ||
    !metadata.tags.every((tag) => typeof tag === 'string') ||
    !Array.isArray(metadata.params) ||
    !metadata.params.every(validateParameter)
  ) {
    throw errorWithCode('project_share_plugin_metadata_invalid')
  }
  return metadata
}

const validatePluginInput = (input) => {
  requireExactKeys(
    input,
    ['scriptName', 'type', 'version', 'fileHash', 'contentBase64', 'metadata'],
    'project_share_plugin_invalid',
  )
  if (
    !isNonEmptyString(input.scriptName) ||
    !isNonEmptyString(input.type) ||
    !isPositiveInteger(input.version) ||
    !SHA256_PATTERN.test(input.fileHash)
  ) {
    throw errorWithCode('project_share_plugin_invalid')
  }
  const content = decodeBase64(input.contentBase64, 'project_share_plugin_invalid')
  if (content.length === 0 || content.length > PROJECT_SHARE_MAX_PLUGIN_BYTES) {
    throw errorWithCode('project_share_plugin_too_large')
  }
  if (sha256(content) !== input.fileHash) throw errorWithCode('project_share_plugin_hash_mismatch')
  validateMetadata(input.metadata)
  return content
}

const pluginEnvelopeFromInput = (input) => ({
  schema: PROJECT_SHARE_PLUGIN_SCHEMA,
  script_name: input.scriptName,
  type: input.type,
  version: input.version,
  content_base64: input.contentBase64,
  file_hash: input.fileHash,
  metadata: input.metadata,
})

const validatePluginEnvelope = (envelope, rawBytes) => {
  requireExactKeys(
    envelope,
    ['schema', 'script_name', 'type', 'version', 'content_base64', 'file_hash', 'metadata'],
    'project_share_plugin_invalid',
  )
  if (envelope.schema !== PROJECT_SHARE_PLUGIN_SCHEMA) throw errorWithCode('project_share_plugin_invalid')
  const input = {
    scriptName: envelope.script_name,
    type: envelope.type,
    version: envelope.version,
    contentBase64: envelope.content_base64,
    fileHash: envelope.file_hash,
    metadata: envelope.metadata,
  }
  const content = validatePluginInput(input)
  return {
    input,
    content,
    byteLength: rawBytes.length,
    sha256: sha256(rawBytes),
  }
}

const scanFile = async (filePath, maximumBytes = PROJECT_SHARE_MAX_BUNDLE_BYTES) => {
  const hash = crypto.createHash('sha256')
  let checksum = 0xffffffff
  let byteLength = 0
  for await (const chunk of fs.createReadStream(filePath)) {
    byteLength += chunk.length
    if (byteLength > maximumBytes) throw errorWithCode('project_share_bundle_too_large')
    hash.update(chunk)
    checksum = updateCRC32(checksum, chunk)
  }
  return {
    byteLength,
    sha256: hash.digest('hex'),
    crc32: (checksum ^ 0xffffffff) >>> 0,
  }
}

const writeAll = async (handle, bytes, position) => {
  let written = 0
  while (written < bytes.length) {
    const result = await handle.write(bytes, written, bytes.length - written, position + written)
    if (result.bytesWritten <= 0) throw errorWithCode('project_share_file_write_failed')
    written += result.bytesWritten
  }
  return position + bytes.length
}

const dosDateTime = (value) => {
  const date = new Date(value)
  const safe = Number.isNaN(date.getTime()) ? new Date() : date
  const year = Math.max(1980, safe.getUTCFullYear())
  return {
    time: ((safe.getUTCHours() & 31) << 11) | ((safe.getUTCMinutes() & 63) << 5) | ((safe.getUTCSeconds() / 2) & 31),
    date: (((year - 1980) & 127) << 9) | (((safe.getUTCMonth() + 1) & 15) << 5) | (safe.getUTCDate() & 31),
  }
}

const writeStoredZip = async (targetPath, entries, createdAt) => {
  const handle = await fs.promises.open(targetPath, 'wx', 0o600)
  const centralEntries = []
  let position = 0
  const dateTime = dosDateTime(createdAt)
  try {
    for (const entry of entries) {
      const nameBytes = Buffer.from(entry.name, 'utf8')
      const localOffset = position
      const local = Buffer.alloc(30)
      local.writeUInt32LE(ZIP_LOCAL_SIGNATURE, 0)
      local.writeUInt16LE(20, 4)
      local.writeUInt16LE(ZIP_UTF8_FLAG, 6)
      local.writeUInt16LE(0, 8)
      local.writeUInt16LE(dateTime.time, 10)
      local.writeUInt16LE(dateTime.date, 12)
      local.writeUInt32LE(entry.crc32, 14)
      local.writeUInt32LE(entry.byteLength, 18)
      local.writeUInt32LE(entry.byteLength, 22)
      local.writeUInt16LE(nameBytes.length, 26)
      position = await writeAll(handle, local, position)
      position = await writeAll(handle, nameBytes, position)
      if (entry.bytes) {
        position = await writeAll(handle, entry.bytes, position)
      } else {
        for await (const chunk of fs.createReadStream(entry.filePath)) {
          position = await writeAll(handle, chunk, position)
        }
      }
      centralEntries.push({
        ...entry,
        nameBytes,
        localOffset,
      })
    }
    const centralOffset = position
    for (const entry of centralEntries) {
      const central = Buffer.alloc(46)
      central.writeUInt32LE(ZIP_CENTRAL_SIGNATURE, 0)
      central.writeUInt16LE(0x0314, 4)
      central.writeUInt16LE(20, 6)
      central.writeUInt16LE(ZIP_UTF8_FLAG, 8)
      central.writeUInt16LE(0, 10)
      central.writeUInt16LE(dateTime.time, 12)
      central.writeUInt16LE(dateTime.date, 14)
      central.writeUInt32LE(entry.crc32, 16)
      central.writeUInt32LE(entry.byteLength, 20)
      central.writeUInt32LE(entry.byteLength, 24)
      central.writeUInt16LE(entry.nameBytes.length, 28)
      central.writeUInt32LE((0o100600 << 16) >>> 0, 38)
      central.writeUInt32LE(entry.localOffset, 42)
      position = await writeAll(handle, central, position)
      position = await writeAll(handle, entry.nameBytes, position)
    }
    const centralSize = position - centralOffset
    const end = Buffer.alloc(22)
    end.writeUInt32LE(ZIP_END_SIGNATURE, 0)
    end.writeUInt16LE(centralEntries.length, 8)
    end.writeUInt16LE(centralEntries.length, 10)
    end.writeUInt32LE(centralSize, 12)
    end.writeUInt32LE(centralOffset, 16)
    position = await writeAll(handle, end, position)
    if (position > PROJECT_SHARE_MAX_BUNDLE_BYTES) throw errorWithCode('project_share_bundle_too_large')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

const readExactly = async (fileHandle, length, position) => {
  const buffer = Buffer.alloc(length)
  let read = 0
  while (read < length) {
    const result = await fileHandle.read(buffer, read, length - read, position + read)
    if (result.bytesRead <= 0) throw errorWithCode('project_share_bundle_invalid')
    read += result.bytesRead
  }
  return buffer
}

const decodeEntryName = (bytes) => {
  let name
  try {
    name = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw errorWithCode('project_share_bundle_invalid')
  }
  const parts = name.split('/')
  if (
    !name ||
    name.includes('\\') ||
    name.startsWith('/') ||
    /^[A-Za-z]:/.test(name) ||
    parts.some((part) => !part || part === '.' || part === '..')
  ) {
    throw errorWithCode('project_share_bundle_invalid')
  }
  return name
}

const parseZipDirectory = async (filePath) => {
  const fileHandle = await fs.promises.open(filePath, 'r')
  try {
    const stat = await fileHandle.stat()
    if (!stat.isFile() || stat.size < 22 || stat.size > PROJECT_SHARE_MAX_BUNDLE_BYTES) {
      throw errorWithCode('project_share_bundle_invalid')
    }
    const tailLength = Math.min(stat.size, 65557)
    const tail = await readExactly(fileHandle, tailLength, stat.size - tailLength)
    let endIndex = -1
    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === ZIP_END_SIGNATURE) {
        endIndex = index
        break
      }
    }
    if (endIndex < 0 || endIndex + 22 + tail.readUInt16LE(endIndex + 20) !== tail.length) {
      throw errorWithCode('project_share_bundle_invalid')
    }
    const disk = tail.readUInt16LE(endIndex + 4)
    const centralDisk = tail.readUInt16LE(endIndex + 6)
    const diskEntries = tail.readUInt16LE(endIndex + 8)
    const entryCount = tail.readUInt16LE(endIndex + 10)
    const centralSize = tail.readUInt32LE(endIndex + 12)
    const centralOffset = tail.readUInt32LE(endIndex + 16)
    if (
      disk !== 0 ||
      centralDisk !== 0 ||
      diskEntries !== entryCount ||
      entryCount < 2 ||
      entryCount > PROJECT_SHARE_MAX_PLUGINS + 2 ||
      centralSize > 16 * 1024 * 1024 ||
      centralOffset + centralSize > stat.size - 22
    ) {
      throw errorWithCode('project_share_bundle_invalid')
    }
    const central = await readExactly(fileHandle, centralSize, centralOffset)
    const entries = []
    const names = new Set()
    let offset = 0
    for (let index = 0; index < entryCount; index += 1) {
      if (offset + 46 > central.length || central.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) {
        throw errorWithCode('project_share_bundle_invalid')
      }
      const flags = central.readUInt16LE(offset + 8)
      const method = central.readUInt16LE(offset + 10)
      const checksum = central.readUInt32LE(offset + 16)
      const compressedSize = central.readUInt32LE(offset + 20)
      const byteLength = central.readUInt32LE(offset + 24)
      const nameLength = central.readUInt16LE(offset + 28)
      const extraLength = central.readUInt16LE(offset + 30)
      const commentLength = central.readUInt16LE(offset + 32)
      const diskStart = central.readUInt16LE(offset + 34)
      const externalAttributes = central.readUInt32LE(offset + 38)
      const localOffset = central.readUInt32LE(offset + 42)
      const end = offset + 46 + nameLength + extraLength + commentLength
      if (
        end > central.length ||
        flags !== ZIP_UTF8_FLAG ||
        ![0, 8].includes(method) ||
        diskStart !== 0 ||
        compressedSize > PROJECT_SHARE_MAX_BUNDLE_BYTES ||
        byteLength > PROJECT_SHARE_MAX_BUNDLE_BYTES ||
        ((externalAttributes >>> 16) & 0xf000) === 0xa000
      ) {
        throw errorWithCode('project_share_bundle_invalid')
      }
      const nameBytes = central.subarray(offset + 46, offset + 46 + nameLength)
      const name = decodeEntryName(nameBytes)
      if (names.has(name)) throw errorWithCode('project_share_bundle_invalid')
      names.add(name)
      const local = await readExactly(fileHandle, 30, localOffset)
      if (
        local.readUInt32LE(0) !== ZIP_LOCAL_SIGNATURE ||
        local.readUInt16LE(6) !== flags ||
        local.readUInt16LE(8) !== method ||
        local.readUInt32LE(14) !== checksum ||
        local.readUInt32LE(18) !== compressedSize ||
        local.readUInt32LE(22) !== byteLength
      ) {
        throw errorWithCode('project_share_bundle_invalid')
      }
      const localNameLength = local.readUInt16LE(26)
      const localExtraLength = local.readUInt16LE(28)
      const localName = await readExactly(fileHandle, localNameLength, localOffset + 30)
      if (!localName.equals(nameBytes)) throw errorWithCode('project_share_bundle_invalid')
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength
      if (dataOffset + compressedSize > centralOffset) throw errorWithCode('project_share_bundle_invalid')
      entries.push({
        name,
        method,
        checksum,
        compressedSize,
        byteLength,
        dataOffset,
      })
      offset = end
    }
    if (offset !== central.length) throw errorWithCode('project_share_bundle_invalid')
    return {
      byteLength: stat.size,
      entries,
    }
  } finally {
    await fileHandle.close()
  }
}

const entryReadStream = (filePath, entry) => {
  const source = fs.createReadStream(filePath, {
    start: entry.dataOffset,
    end: entry.dataOffset + entry.compressedSize - 1,
  })
  return entry.method === 8 ? source.pipe(zlib.createInflateRaw()) : source
}

const scanZipEntry = async (filePath, entry, maximumBytes) => {
  const hash = crypto.createHash('sha256')
  let checksum = 0xffffffff
  let byteLength = 0
  for await (const chunk of entryReadStream(filePath, entry)) {
    byteLength += chunk.length
    if (byteLength > maximumBytes) throw errorWithCode('project_share_bundle_invalid')
    hash.update(chunk)
    checksum = updateCRC32(checksum, chunk)
  }
  if (byteLength !== entry.byteLength || (checksum ^ 0xffffffff) >>> 0 !== entry.checksum) {
    throw errorWithCode('project_share_bundle_invalid')
  }
  return {
    byteLength,
    sha256: hash.digest('hex'),
  }
}

const readZipEntry = async (filePath, entry, maximumBytes) => {
  const chunks = []
  let total = 0
  for await (const chunk of entryReadStream(filePath, entry)) {
    total += chunk.length
    if (total > maximumBytes) throw errorWithCode('project_share_bundle_invalid')
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  if (bytes.length !== entry.byteLength || crc32(bytes) !== entry.checksum) {
    throw errorWithCode('project_share_bundle_invalid')
  }
  return bytes
}

const copyZipEntry = async (filePath, entry, targetPath) => {
  let total = 0
  let checksum = 0xffffffff
  const hash = crypto.createHash('sha256')
  const verifier = new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length
      if (total > PROJECT_SHARE_MAX_BUNDLE_BYTES) {
        callback(errorWithCode('project_share_bundle_invalid'))
        return
      }
      checksum = updateCRC32(checksum, chunk)
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  try {
    await pipeline(
      entryReadStream(filePath, entry),
      verifier,
      fs.createWriteStream(targetPath, { flags: 'wx', mode: 0o600 }),
    )
    if (total !== entry.byteLength || (checksum ^ 0xffffffff) >>> 0 !== entry.checksum) {
      throw errorWithCode('project_share_bundle_invalid')
    }
    return {
      byteLength: total,
      sha256: hash.digest('hex'),
    }
  } catch (error) {
    await fs.promises.unlink(targetPath).catch(() => undefined)
    throw error
  }
}

const validateManifest = (manifest) => {
  requireExactKeys(
    manifest,
    ['schema', 'bundle_id', 'created_at', 'engine', 'project', 'plugins'],
    'project_share_bundle_invalid',
  )
  requireExactKeys(manifest.engine, ['version', 'commit', 'export_format'], 'project_share_bundle_invalid')
  requireExactKeys(manifest.project, ['name', 'entry', 'byte_length', 'sha256'], 'project_share_bundle_invalid')
  if (
    manifest.schema !== PROJECT_SHARE_BUNDLE_SCHEMA ||
    !UUID_PATTERN.test(manifest.bundle_id) ||
    !isNonEmptyString(manifest.created_at) ||
    Number.isNaN(Date.parse(manifest.created_at)) ||
    !isNonEmptyString(manifest.engine.version) ||
    !isNonEmptyString(manifest.engine.commit) ||
    !isNonEmptyString(manifest.engine.export_format) ||
    !isNonEmptyString(manifest.project.name) ||
    manifest.project.entry !== 'project/project.yakitproject' ||
    !isPositiveInteger(manifest.project.byte_length) ||
    !SHA256_PATTERN.test(manifest.project.sha256) ||
    !Array.isArray(manifest.plugins) ||
    manifest.plugins.length > PROJECT_SHARE_MAX_PLUGINS
  ) {
    throw errorWithCode('project_share_bundle_invalid')
  }
  const pluginKeys = ['script_name', 'type', 'version', 'file_hash', 'entry', 'byte_length', 'sha256']
  const entries = new Set()
  for (let index = 0; index < manifest.plugins.length; index += 1) {
    const plugin = manifest.plugins[index]
    requireExactKeys(plugin, pluginKeys, 'project_share_bundle_invalid')
    const expectedEntry = `plugins/${String(index + 1).padStart(4, '0')}-${plugin.file_hash}.json`
    if (
      !isNonEmptyString(plugin.script_name) ||
      !isNonEmptyString(plugin.type) ||
      !isPositiveInteger(plugin.version) ||
      !SHA256_PATTERN.test(plugin.file_hash) ||
      plugin.entry !== expectedEntry ||
      !isPositiveInteger(plugin.byte_length) ||
      plugin.byte_length > PROJECT_SHARE_MAX_PLUGIN_ENTRY_BYTES ||
      !SHA256_PATTERN.test(plugin.sha256) ||
      entries.has(plugin.entry)
    ) {
      throw errorWithCode('project_share_bundle_invalid')
    }
    entries.add(plugin.entry)
  }
  return manifest
}

const parseBundle = async (filePath) => {
  const directory = await parseZipDirectory(filePath)
  const entries = new Map(directory.entries.map((entry) => [entry.name, entry]))
  const manifestEntry = entries.get('manifest.json')
  const projectEntry = entries.get('project/project.yakitproject')
  if (!manifestEntry || !projectEntry) throw errorWithCode('project_share_bundle_invalid')
  const manifestRaw = await readZipEntry(filePath, manifestEntry, PROJECT_SHARE_MAX_MANIFEST_BYTES)
  let manifest
  try {
    manifest = validateManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestRaw)))
  } catch (error) {
    if (error?.code) throw error
    throw errorWithCode('project_share_bundle_invalid')
  }
  const expectedEntries = new Set([
    'manifest.json',
    manifest.project.entry,
    ...manifest.plugins.map((plugin) => plugin.entry),
  ])
  if (expectedEntries.size !== entries.size || [...entries.keys()].some((name) => !expectedEntries.has(name))) {
    throw errorWithCode('project_share_bundle_invalid')
  }
  const project = await scanZipEntry(filePath, projectEntry, PROJECT_SHARE_MAX_BUNDLE_BYTES)
  if (project.byteLength !== manifest.project.byte_length || project.sha256 !== manifest.project.sha256) {
    throw errorWithCode('project_share_bundle_invalid')
  }
  const plugins = []
  for (const declared of manifest.plugins) {
    const entry = entries.get(declared.entry)
    if (!entry) throw errorWithCode('project_share_bundle_invalid')
    const raw = await readZipEntry(filePath, entry, PROJECT_SHARE_MAX_PLUGIN_ENTRY_BYTES)
    const validated = validatePluginEnvelope(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)), raw)
    if (
      raw.length !== declared.byte_length ||
      validated.sha256 !== declared.sha256 ||
      validated.input.scriptName !== declared.script_name ||
      validated.input.type !== declared.type ||
      validated.input.version !== declared.version ||
      validated.input.fileHash !== declared.file_hash
    ) {
      throw errorWithCode('project_share_bundle_invalid')
    }
    plugins.push({
      declared,
      entry,
      envelope: validated,
      raw,
    })
  }
  return {
    byteLength: directory.byteLength,
    entries,
    manifest,
    manifestRaw,
    projectEntry,
    plugins,
  }
}

const defaultRootDirectory = () => {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), 'project-share', 'managed')
}

const createProjectShareBundleStore = ({
  rootDirectory = defaultRootDirectory(),
  now = () => new Date().toISOString(),
  createHandle = crypto.randomUUID,
  isHandleReferenced = async () => false,
} = {}) => {
  const rootPath = path.resolve(rootDirectory)
  const records = new Map()
  const extensions = {
    bundle: '.bundle.zip',
    project_archive: '.project.yakitproject',
    plugin: '.plugin.json',
    plugin_content: '.plugin.bin',
  }

  const ensureRoot = () => fs.promises.mkdir(rootPath, { recursive: true })
  const requireHandle = (handle) => {
    const normalized = String(handle || '').toLowerCase()
    if (!UUID_PATTERN.test(normalized)) throw errorWithCode('project_share_handle_invalid')
    return normalized
  }
  const pathFor = (handle, kind) => path.join(rootPath, `${requireHandle(handle)}${extensions[kind]}`)

  const registerRecord = (handle, kind, filePath, summary) => {
    const record = {
      handle,
      kind,
      filePath,
      byteLength: summary.byteLength,
      sha256: summary.sha256,
    }
    records.set(handle, record)
    return record
  }

  const locate = async (handle, expectedKind) => {
    const normalized = requireHandle(handle)
    const cached = records.get(normalized)
    if (cached) {
      if (expectedKind && cached.kind !== expectedKind) throw errorWithCode('project_share_handle_invalid')
      return cached
    }
    const kinds = expectedKind ? [expectedKind] : Object.keys(extensions)
    for (const kind of kinds) {
      const filePath = pathFor(normalized, kind)
      try {
        const summary = await scanFile(
          filePath,
          kind === 'plugin' || kind === 'plugin_content'
            ? PROJECT_SHARE_MAX_PLUGIN_ENTRY_BYTES
            : PROJECT_SHARE_MAX_BUNDLE_BYTES,
        )
        return registerRecord(normalized, kind, filePath, summary)
      } catch (error) {
        if (error && error.code === 'ENOENT') continue
        throw error
      }
    }
    throw errorWithCode('project_share_handle_not_found')
  }

  const createManagedPath = async (kind) => {
    await ensureRoot()
    const handle = requireHandle(createHandle())
    return {
      handle,
      filePath: pathFor(handle, kind),
    }
  }

  const importProjectArchive = async (sourcePath) => {
    const source = path.resolve(String(sourcePath || ''))
    const stat = await fs.promises.stat(source)
    if (!stat.isFile() || stat.size <= 0 || stat.size > PROJECT_SHARE_MAX_BUNDLE_BYTES) {
      throw errorWithCode('project_share_project_archive_invalid')
    }
    const managed = await createManagedPath('project_archive')
    try {
      await fs.promises.copyFile(source, managed.filePath, fs.constants.COPYFILE_EXCL)
      const summary = await scanFile(managed.filePath)
      registerRecord(managed.handle, 'project_archive', managed.filePath, summary)
      return {
        handle: managed.handle,
        fileSize: summary.byteLength,
        sha256: summary.sha256,
      }
    } catch (error) {
      await fs.promises.unlink(managed.filePath).catch(() => undefined)
      throw error
    }
  }

  const stagePlugin = async (input) => {
    validatePluginInput(input)
    const envelope = pluginEnvelopeFromInput(input)
    const raw = Buffer.from(JSON.stringify(envelope), 'utf8')
    if (raw.length > PROJECT_SHARE_MAX_PLUGIN_ENTRY_BYTES) throw errorWithCode('project_share_plugin_too_large')
    const managed = await createManagedPath('plugin')
    try {
      await fs.promises.writeFile(managed.filePath, raw, { flag: 'wx', mode: 0o600 })
      const summary = {
        byteLength: raw.length,
        sha256: sha256(raw),
      }
      registerRecord(managed.handle, 'plugin', managed.filePath, summary)
      return {
        handle: managed.handle,
        scriptName: input.scriptName,
        type: input.type,
        version: input.version,
        fileHash: input.fileHash,
        entry: `plugins/0000-${input.fileHash}.json`,
        byteLength: raw.length,
        sha256: summary.sha256,
        metadata: input.metadata,
      }
    } catch (error) {
      await fs.promises.unlink(managed.filePath).catch(() => undefined)
      throw error
    }
  }

  const loadStagedPlugin = async (handle) => {
    const record = await locate(handle, 'plugin')
    const raw = await fs.promises.readFile(record.filePath)
    const envelope = validatePluginEnvelope(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)), raw)
    if (record.byteLength !== raw.length || record.sha256 !== envelope.sha256) {
      throw errorWithCode('project_share_handle_corrupt')
    }
    return {
      record,
      raw,
      envelope,
    }
  }

  const createBundle = async (input) => {
    requireExactKeys(
      input,
      ['bundleId', 'createdAt', 'engine', 'project', 'stagedPluginHandles'],
      'project_share_bundle_request_invalid',
    )
    requireExactKeys(input.engine, ['version', 'commit', 'exportFormat'], 'project_share_bundle_request_invalid')
    requireExactKeys(input.project, ['name', 'archiveHandle'], 'project_share_bundle_request_invalid')
    if (
      !UUID_PATTERN.test(input.bundleId) ||
      !isNonEmptyString(input.createdAt) ||
      Number.isNaN(Date.parse(input.createdAt)) ||
      !isNonEmptyString(input.engine.version) ||
      !isNonEmptyString(input.engine.commit) ||
      !isNonEmptyString(input.engine.exportFormat) ||
      !isNonEmptyString(input.project.name) ||
      !Array.isArray(input.stagedPluginHandles) ||
      input.stagedPluginHandles.length > PROJECT_SHARE_MAX_PLUGINS ||
      new Set(input.stagedPluginHandles).size !== input.stagedPluginHandles.length
    ) {
      throw errorWithCode('project_share_bundle_request_invalid')
    }
    const project = await locate(input.project.archiveHandle, 'project_archive')
    if (project.byteLength <= 0) throw errorWithCode('project_share_project_archive_invalid')
    const staged = await Promise.all(input.stagedPluginHandles.map(loadStagedPlugin))
    staged.sort((first, second) => {
      const firstKey = [
        first.envelope.input.scriptName,
        first.envelope.input.type,
        String(first.envelope.input.version).padStart(12, '0'),
        first.envelope.input.fileHash,
      ].join('\0')
      const secondKey = [
        second.envelope.input.scriptName,
        second.envelope.input.type,
        String(second.envelope.input.version).padStart(12, '0'),
        second.envelope.input.fileHash,
      ].join('\0')
      return firstKey < secondKey ? -1 : firstKey > secondKey ? 1 : 0
    })
    const manifest = {
      schema: PROJECT_SHARE_BUNDLE_SCHEMA,
      bundle_id: input.bundleId.toLowerCase(),
      created_at: input.createdAt,
      engine: {
        version: input.engine.version,
        commit: input.engine.commit,
        export_format: input.engine.exportFormat,
      },
      project: {
        name: input.project.name,
        entry: 'project/project.yakitproject',
        byte_length: project.byteLength,
        sha256: project.sha256,
      },
      plugins: staged.map((plugin, index) => ({
        script_name: plugin.envelope.input.scriptName,
        type: plugin.envelope.input.type,
        version: plugin.envelope.input.version,
        file_hash: plugin.envelope.input.fileHash,
        entry: `plugins/${String(index + 1).padStart(4, '0')}-${plugin.envelope.input.fileHash}.json`,
        byte_length: plugin.record.byteLength,
        sha256: plugin.record.sha256,
      })),
    }
    const manifestRaw = Buffer.from(JSON.stringify(manifest), 'utf8')
    if (manifestRaw.length > PROJECT_SHARE_MAX_MANIFEST_BYTES) throw errorWithCode('project_share_bundle_too_large')
    const managed = await createManagedPath('bundle')
    try {
      await writeStoredZip(
        managed.filePath,
        [
          {
            name: 'manifest.json',
            bytes: manifestRaw,
            byteLength: manifestRaw.length,
            crc32: crc32(manifestRaw),
          },
          {
            name: manifest.project.entry,
            filePath: project.filePath,
            byteLength: project.byteLength,
            crc32: (await scanFile(project.filePath)).crc32,
          },
          ...staged.map((plugin, index) => ({
            name: manifest.plugins[index].entry,
            filePath: plugin.record.filePath,
            byteLength: plugin.record.byteLength,
            crc32: crc32(plugin.raw),
          })),
        ],
        input.createdAt,
      )
      const archive = await scanFile(managed.filePath)
      registerRecord(managed.handle, 'bundle', managed.filePath, archive)
      return {
        handle: managed.handle,
        bundleId: manifest.bundle_id,
        fileSize: archive.byteLength,
        archiveSha256: archive.sha256,
        manifestSha256: sha256(manifestRaw),
        chunkSize: PROJECT_SHARE_BUNDLE_CHUNK_BYTES,
        chunkCount: Math.ceil(archive.byteLength / PROJECT_SHARE_BUNDLE_CHUNK_BYTES),
      }
    } catch (error) {
      await fs.promises.unlink(managed.filePath).catch(() => undefined)
      throw error
    }
  }

  const readBundleChunk = async ({ handle, index }) => {
    if (!Number.isSafeInteger(index) || index < 0) throw errorWithCode('project_share_chunk_index_invalid')
    const bundle = await locate(handle, 'bundle')
    const chunkCount = Math.ceil(bundle.byteLength / PROJECT_SHARE_BUNDLE_CHUNK_BYTES)
    if (index >= chunkCount) throw errorWithCode('project_share_chunk_index_invalid')
    const offset = index * PROJECT_SHARE_BUNDLE_CHUNK_BYTES
    const length = Math.min(PROJECT_SHARE_BUNDLE_CHUNK_BYTES, bundle.byteLength - offset)
    const fileHandle = await fs.promises.open(bundle.filePath, 'r')
    try {
      const bytes = await readExactly(fileHandle, length, offset)
      return {
        rawBase64: bytes.toString('base64'),
        byteLength: bytes.length,
        sha256: sha256(bytes),
      }
    } finally {
      await fileHandle.close()
    }
  }

  const inspectBundle = async (handle) => {
    const bundle = await locate(handle, 'bundle')
    const parsed = await parseBundle(bundle.filePath)
    const current = await scanFile(bundle.filePath)
    if (current.byteLength !== bundle.byteLength || current.sha256 !== bundle.sha256) {
      throw errorWithCode('project_share_handle_corrupt')
    }
    return {
      handle: bundle.handle,
      bundleId: parsed.manifest.bundle_id,
      schema: parsed.manifest.schema,
      mediaType: PROJECT_SHARE_BUNDLE_MEDIA_TYPE,
      fileSize: bundle.byteLength,
      archiveSha256: bundle.sha256,
      manifestSha256: sha256(parsed.manifestRaw),
      project: {
        name: parsed.manifest.project.name,
        entry: parsed.manifest.project.entry,
        byteLength: parsed.manifest.project.byte_length,
        sha256: parsed.manifest.project.sha256,
      },
      plugins: parsed.manifest.plugins.map((plugin) => ({
        scriptName: plugin.script_name,
        type: plugin.type,
        version: plugin.version,
        fileHash: plugin.file_hash,
        entry: plugin.entry,
        byteLength: plugin.byte_length,
        sha256: plugin.sha256,
      })),
    }
  }

  const extractBundle = async (handle) => {
    const bundle = await locate(handle, 'bundle')
    const parsed = await parseBundle(bundle.filePath)
    const created = []
    try {
      const projectManaged = await createManagedPath('project_archive')
      const projectSummary = await copyZipEntry(bundle.filePath, parsed.projectEntry, projectManaged.filePath)
      if (
        projectSummary.byteLength !== parsed.manifest.project.byte_length ||
        projectSummary.sha256 !== parsed.manifest.project.sha256
      ) {
        throw errorWithCode('project_share_bundle_invalid')
      }
      registerRecord(projectManaged.handle, 'project_archive', projectManaged.filePath, projectSummary)
      created.push(projectManaged.handle)
      const plugins = []
      for (const plugin of parsed.plugins) {
        const pluginManaged = await createManagedPath('plugin_content')
        await fs.promises.writeFile(pluginManaged.filePath, plugin.envelope.content, { flag: 'wx', mode: 0o600 })
        const summary = {
          byteLength: plugin.envelope.content.length,
          sha256: plugin.envelope.input.fileHash,
        }
        registerRecord(pluginManaged.handle, 'plugin_content', pluginManaged.filePath, summary)
        created.push(pluginManaged.handle)
        plugins.push({
          handle: pluginManaged.handle,
          scriptName: plugin.envelope.input.scriptName,
          type: plugin.envelope.input.type,
          version: plugin.envelope.input.version,
          fileHash: plugin.envelope.input.fileHash,
          entry: plugin.declared.entry,
          byteLength: summary.byteLength,
          sha256: summary.sha256,
          metadata: plugin.envelope.input.metadata,
        })
      }
      return {
        bundleId: parsed.manifest.bundle_id,
        projectArchiveHandle: projectManaged.handle,
        projectArchiveSize: projectSummary.byteLength,
        projectArchiveSha256: projectSummary.sha256,
        plugins,
      }
    } catch (error) {
      await Promise.all(created.map((createdHandle) => removeManagedHandle(createdHandle).catch(() => undefined)))
      throw error
    }
  }

  const readPluginContent = async (handle) => {
    const plugin = await locate(handle, 'plugin_content')
    const content = await fs.promises.readFile(plugin.filePath)
    if (
      content.length !== plugin.byteLength ||
      content.length === 0 ||
      content.length > PROJECT_SHARE_MAX_PLUGIN_BYTES ||
      sha256(content) !== plugin.sha256
    ) {
      throw errorWithCode('project_share_handle_corrupt')
    }
    return {
      contentBase64: content.toString('base64'),
      byteLength: content.length,
      sha256: plugin.sha256,
    }
  }

  const readManagedBytes = async (handle) => {
    const record = await locate(handle)
    return fs.promises.readFile(record.filePath)
  }

  const inspectManagedHandle = async (handle, expectedKind) => {
    const internalKind = expectedKind === 'plugin' ? 'plugin_content' : expectedKind
    const record = await locate(handle, internalKind)
    const current = await scanFile(
      record.filePath,
      record.kind === 'plugin' || record.kind === 'plugin_content'
        ? PROJECT_SHARE_MAX_PLUGIN_ENTRY_BYTES
        : PROJECT_SHARE_MAX_BUNDLE_BYTES,
    )
    if (current.byteLength !== record.byteLength || current.sha256 !== record.sha256) {
      throw errorWithCode('project_share_handle_corrupt')
    }
    return {
      handle: record.handle,
      kind: record.kind === 'plugin_content' ? 'plugin' : record.kind,
      byteLength: record.byteLength,
      sha256: record.sha256,
    }
  }

  const resolveManagedHandlePath = async (handle, expectedKind) => {
    await inspectManagedHandle(handle, expectedKind)
    return (await locate(handle, expectedKind)).filePath
  }

  const removeManagedHandle = async (handle) => {
    const normalized = requireHandle(handle)
    if (await isHandleReferenced(normalized)) throw errorWithCode('project_share_handle_referenced')
    let record
    try {
      record = await locate(normalized)
    } catch (error) {
      if (error?.code === 'project_share_handle_not_found') return
      throw error
    }
    await fs.promises.unlink(record.filePath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error
    })
    records.delete(normalized)
  }

  const downloadImportBundle = async (input) => {
    requireExactKeys(
      input,
      ['baseUrl', 'authorization', 'clientId', 'receiptId', 'expectedSize', 'expectedSha256'],
      'project_share_download_request_invalid',
    )
    if (
      !isNonEmptyString(input.baseUrl) ||
      !isNonEmptyString(input.authorization) ||
      !isNonEmptyString(input.clientId) ||
      !isPositiveInteger(input.receiptId) ||
      !isPositiveInteger(input.expectedSize) ||
      input.expectedSize > PROJECT_SHARE_MAX_BUNDLE_BYTES ||
      !SHA256_PATTERN.test(input.expectedSha256)
    ) {
      throw errorWithCode('project_share_download_request_invalid')
    }
    let endpoint
    try {
      const base = new URL(input.baseUrl)
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.hash) {
        throw new Error('invalid')
      }
      const basePath = base.pathname.replace(/\/+$/, '').replace(/\/api$/i, '')
      base.pathname = `${basePath}/api/v2/project-share-imports/${input.receiptId}/bundle`
      base.search = ''
      endpoint = base
    } catch {
      throw errorWithCode('project_share_download_request_invalid')
    }
    const managed = await createManagedPath('bundle')
    const temporaryPath = `${managed.filePath}.tmp-${crypto.randomUUID()}`
    const transport = endpoint.protocol === 'https:' ? https : http
    try {
      const response = await new Promise((resolve, reject) => {
        const request = transport.request(
          endpoint,
          {
            method: 'GET',
            headers: {
              Authorization: input.authorization,
              'X-Yakit-Client-ID': input.clientId,
            },
          },
          resolve,
        )
        request.setTimeout(30 * 60 * 1000, () => request.destroy(errorWithCode('project_share_download_timeout')))
        request.on('error', reject)
        request.end()
      })
      if (response.statusCode !== 200) {
        response.resume()
        throw errorWithCode(`project_share_download_http_${response.statusCode || 0}`)
      }
      const contentLength = Number(response.headers['content-length'])
      const archiveSha256 = String(response.headers['x-archive-sha256'] || '').toLowerCase()
      const expectedDigest = `sha-256=${Buffer.from(input.expectedSha256, 'hex').toString('base64')}`
      if (
        contentLength !== input.expectedSize ||
        archiveSha256 !== input.expectedSha256 ||
        response.headers.digest !== expectedDigest
      ) {
        response.resume()
        throw errorWithCode('project_share_download_headers_invalid')
      }
      let byteLength = 0
      const hash = crypto.createHash('sha256')
      const verifier = new Transform({
        transform(chunk, _encoding, callback) {
          byteLength += chunk.length
          if (byteLength > input.expectedSize) {
            callback(errorWithCode('project_share_download_length_mismatch'))
            return
          }
          hash.update(chunk)
          callback(null, chunk)
        },
      })
      await pipeline(response, verifier, fs.createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }))
      const digest = hash.digest('hex')
      if (byteLength !== input.expectedSize) throw errorWithCode('project_share_download_length_mismatch')
      if (digest !== input.expectedSha256) throw errorWithCode('project_share_download_digest_mismatch')
      await fs.promises.rename(temporaryPath, managed.filePath)
      registerRecord(managed.handle, 'bundle', managed.filePath, {
        byteLength,
        sha256: digest,
      })
      return {
        handle: managed.handle,
        fileSize: byteLength,
        archiveSha256: digest,
      }
    } catch (error) {
      await fs.promises.unlink(temporaryPath).catch(() => undefined)
      await fs.promises.unlink(managed.filePath).catch(() => undefined)
      records.delete(managed.handle)
      throw error
    }
  }

  return {
    createBundle,
    downloadImportBundle,
    extractBundle,
    importProjectArchive,
    inspectManagedHandle,
    inspectBundle,
    readBundleChunk,
    readManagedBytes,
    readPluginContent,
    removeManagedHandle,
    resolveManagedHandlePath,
    stagePlugin,
  }
}

module.exports = {
  PROJECT_SHARE_BUNDLE_CHUNK_BYTES,
  PROJECT_SHARE_BUNDLE_MEDIA_TYPE,
  PROJECT_SHARE_BUNDLE_SCHEMA,
  PROJECT_SHARE_PLUGIN_SCHEMA,
  createProjectShareBundleStore,
}
