const fs = require('fs')
const zlib = require('zlib')
const { Writable } = require('stream')
const { pipeline } = require('stream/promises')

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0')
const ENCRYPTED_MAGIC = Buffer.from([255, 255, 255, 255])
const MAX_HEADER_BYTES = 3 * 1024 * 1024

const importError = (code, message) => Object.assign(new Error(`${code}: ${message}`), { code })
const cancelled = () => Object.assign(new Error('项目传输已取消'), { name: 'AbortError' })

const readArchiveHeader = (bytes) => {
  let offset = 0
  const fields = []
  for (let field = 0; field < 3; field++) {
    let length = 0
    let shift = 0
    let byte
    do {
      if (offset >= bytes.length || shift > 21) throw importError('FORMAT_INVALID', '项目归档元数据不完整或过长')
      byte = bytes[offset++]
      length += (byte & 127) * 2 ** shift
      shift += 7
    } while (byte & 128)
    if (length > 1024 * 1024 || offset + length > bytes.length) {
      throw importError('FORMAT_INVALID', '项目归档元数据不完整或过长')
    }
    fields.push(bytes.subarray(offset, offset + length))
    offset += length
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    if (!decoder.decode(fields[0]).trim()) throw new Error()
    decoder.decode(fields[1])
    const metadata = JSON.parse(decoder.decode(fields[2]))
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error()
  } catch {
    throw importError('FORMAT_INVALID', '项目归档元数据格式错误')
  }
  return offset
}

const validateSQLiteHeader = (header, size) => {
  if (header.length < 100 || !header.subarray(0, 16).equals(SQLITE_MAGIC)) {
    throw importError('DATABASE_INVALID', '文件内容不是 SQLite 数据库')
  }
  const rawPageSize = header.readUInt16BE(16)
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize
  const pages = header.readUInt32BE(28)
  if (
    pageSize < 512 ||
    pageSize > 65536 ||
    (pageSize & (pageSize - 1)) !== 0 ||
    size < pageSize ||
    size % pageSize !== 0 ||
    pages * pageSize > size ||
    ![1, 2].includes(header[18]) ||
    ![1, 2].includes(header[19]) ||
    header[21] !== 64 ||
    header[22] !== 32 ||
    header[23] !== 32
  ) {
    throw importError('DATABASE_DAMAGED', 'SQLite 文件头或页长度异常，文件可能已截断')
  }
}

const inspectProjectImportFile = async (filePath, { signal } = {}) => {
  if (signal?.aborted) throw cancelled()
  const stat = await fs.promises.stat(filePath)
  if (!stat.isFile()) throw importError('FORMAT_INVALID', '请选择文件，而不是目录')
  if (stat.size === 0) throw importError('FILE_EMPTY', '项目文件为空')
  const file = await fs.promises.open(filePath, 'r')
  const head = Buffer.alloc(512)
  let bytesRead
  try {
    ;({ bytesRead } = await file.read(head, 0, head.length, 0))
  } finally {
    await file.close()
  }
  const prefix = head.subarray(0, bytesRead)
  const text = prefix
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart()
  if (/^(?:<!doctype\s+html|<html\b|<head\b|<body\b|%PDF-)/i.test(text)) {
    throw importError('REPORT_NOT_PROJECT', '文件内容是 HTML/PDF 报告，不是项目归档')
  }
  const encrypted = prefix.subarray(0, 4).equals(ENCRYPTED_MAGIC)
  const offset = encrypted ? 4 : 0
  if (prefix[offset] === 31 && prefix[offset + 1] === 139 && prefix[offset + 2] === 8) {
    const parts = []
    let collected = 0
    let size = 0
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        size += chunk.length
        if (!encrypted && collected < MAX_HEADER_BYTES) {
          const part = chunk.subarray(0, MAX_HEADER_BYTES - collected)
          parts.push(part)
          collected += part.length
        }
        callback()
      },
    })
    try {
      await pipeline(fs.createReadStream(filePath, { start: offset }), zlib.createGunzip(), sink, { signal })
    } catch (error) {
      if (signal?.aborted) throw cancelled()
      throw importError('ARCHIVE_DAMAGED', `归档截断、压缩校验失败或文件损坏：${error.message}`)
    }
    if (!size) throw importError('ARCHIVE_DAMAGED', '归档内容为空')
    if (!encrypted) {
      const data = Buffer.concat(parts)
      const databaseOffset = readArchiveHeader(data)
      validateSQLiteHeader(data.subarray(databaseOffset), size - databaseOffset)
    }
    return { format: 'project-archive', encrypted, size: stat.size, validation: 'container-header' }
  }
  if (encrypted) throw importError('ARCHIVE_DAMAGED', '加密项目归档缺少有效的压缩内容')
  if (prefix.subarray(0, 16).equals(SQLITE_MAGIC)) {
    validateSQLiteHeader(prefix, stat.size)
    return { format: 'sqlite', encrypted: false, size: stat.size, validation: 'container-header' }
  }
  throw importError('FORMAT_INVALID', '文件内容不是支持的项目归档或 SQLite 数据库，修改后缀不会转换格式')
}

const prepareProjectImport = async (params, options) => {
  const inspection = await inspectProjectImportFile(params.ProjectFilePath, options)
  if (inspection.encrypted && !params.Password) throw importError('PASSWORD_REQUIRED', '该项目文件已加密，请填写密码')
  return { ...params, Password: inspection.encrypted ? params.Password : '' }
}

const callProjectRpc = (client, method, params, signal) =>
  new Promise((resolve, reject) => {
    let call
    let settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve(result)
    }
    const onAbort = () => {
      finish(cancelled())
      call?.cancel?.()
    }
    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      call = client[method](params, { deadline: Date.now() + 15000 }, finish)
    } catch (error) {
      finish(error)
    }
  })

const runProjectStream = (client, method, params, { signal, onProgress, timeoutMs = 30 * 60 * 1000 } = {}) =>
  new Promise((resolve, reject) => {
    let stream
    let ended = false
    let status
    let targetPath = ''
    let settled = false
    const timer = setTimeout(() => finish(importError('TRANSFER_TIMEOUT', '项目传输超时，请重试')), timeoutMs)
    const onAbort = () => finish(cancelled())
    const onError = (error) => finish(error)
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      stream?.removeListener('data', onData)
      stream?.removeListener('end', onEnd)
      stream?.removeListener('status', onStatus)
    }
    const finish = (error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) {
        stream?.cancel?.()
        reject(error)
      } else resolve(targetPath)
    }
    const complete = () => {
      if (ended && status === 0) finish()
    }
    const onData = (data) => {
      if (settled) return
      if (data.TargetPath) targetPath = data.TargetPath
      try {
        onProgress?.(data)
      } catch (error) {
        finish(error)
      }
    }
    const onEnd = () => {
      ended = true
      complete()
    }
    const onStatus = (value) => {
      status = value.code
      if (status !== 0) finish(new Error(value.details || `引擎传输失败（${status}）`))
      else complete()
    }
    const onClose = () => {
      if (!settled) finish(importError('ENGINE_DISCONNECTED', '项目传输连接已关闭，请重试'))
      stream.removeListener('error', onError)
    }
    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      stream = client[method](params)
      stream.on('data', onData)
      stream.on('end', onEnd)
      stream.on('status', onStatus)
      stream.on('error', onError)
      stream.once('close', onClose)
    } catch (error) {
      finish(error)
    }
  })

const verifyImportedProject = async (client, params, signal) => {
  const response = await callProjectRpc(
    client,
    'GetProjects',
    {
      ProjectName: params.LocalProjectName,
      Type: params.Type || 'project',
      FrontendType: params.Type || 'project',
      FolderId: Number(params.FolderId || 0),
      ChildFolderId: Number(params.ChildFolderId || 0),
      Pagination: { Page: 1, Limit: 100 },
    },
    signal,
  )
  const matches = (response?.Projects || []).filter(
    (project) =>
      project.ProjectName === params.LocalProjectName &&
      Number(project.FolderId || 0) === Number(params.FolderId || 0) &&
      Number(project.ChildFolderId || 0) === Number(params.ChildFolderId || 0) &&
      project.Type === (params.Type || 'project'),
  )
  if (matches.length !== 1 || Number(matches[0].Id) <= 0 || !matches[0].DatabasePath) {
    throw importError('IMPORT_UNCONFIRMED', '引擎结束但没有返回唯一有效的项目收据，请核对本地项目列表')
  }
  const project = matches[0]
  const inspection = await inspectProjectImportFile(project.DatabasePath, { signal })
  if (inspection.format !== 'sqlite') throw importError('DATABASE_INVALID', '导入后的项目不是 SQLite 数据库')
  return {
    ProjectId: Number(project.Id),
    ProjectName: project.ProjectName,
    DatabasePath: project.DatabasePath,
    Validation: inspection.validation,
  }
}

const importProjectWithReceipt = async (client, params, { signal, onProgress } = {}) => {
  const prepared = await prepareProjectImport(params, { signal })
  if (!params.LocalProjectName?.trim()) throw importError('PROJECT_NAME_REQUIRED', '请填写本地项目名称')
  await callProjectRpc(
    client,
    'IsProjectNameValid',
    {
      ProjectName: params.LocalProjectName,
      Type: params.Type || 'project',
      FolderId: Number(params.FolderId || 0),
      ChildFolderId: Number(params.ChildFolderId || 0),
    },
    signal,
  )
  try {
    await runProjectStream(client, 'ImportProject', prepared, { signal, onProgress })
  } catch (error) {
    if (prepared.Password && /decrypt|padding|authenticat|解密|PKCS|填充/i.test(error.details || error.message)) {
      throw importError('DECRYPT_FAILED', '解密校验失败：密码错误或加密内容损坏；' + (error.details || error.message))
    }
    throw error
  }
  return verifyImportedProject(client, prepared, signal)
}

module.exports = {
  inspectProjectImportFile,
  prepareProjectImport,
  callProjectRpc,
  runProjectStream,
  importProjectWithReceipt,
}
