const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const MAX_PROJECT_ARCHIVE_CHUNK_BYTES = 3 * 1024 * 1024

const getDefaultRootDirectory = () => {
  const { getYakTemp } = require('./filePath')
  return path.join(getYakTemp(), 'team-project-bundles')
}

const hashFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

const normalizeFileName = (fileName) => {
  const candidate = path.basename(String(fileName || 'team-project.yakitproject'))
  const sanitized = candidate.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  return sanitized || 'team-project.yakitproject'
}

const createProjectArchiveStore = (rootDirectory = getDefaultRootDirectory()) => {
  const rootPath = path.resolve(rootDirectory)

  const ensureRoot = async () => {
    await fs.promises.mkdir(rootPath, { recursive: true })
  }

  const requireManagedPath = (filePath) => {
    const resolvedPath = path.resolve(String(filePath || ''))
    const relativePath = path.relative(rootPath, resolvedPath)
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('归档路径不在受控目录内')
    }
    return resolvedPath
  }

  const inspectArchive = async (filePath) => {
    const resolvedPath = path.resolve(String(filePath || ''))
    const stat = await fs.promises.stat(resolvedPath)
    if (!stat.isFile()) throw new Error('项目归档路径不是文件')
    return {
      fileName: path.basename(resolvedPath),
      filePath: resolvedPath,
      size: stat.size,
      sha256: await hashFile(resolvedPath),
    }
  }

  const readArchiveChunk = async ({ filePath, offset, length }) => {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('归档分块偏移无效')
    if (!Number.isSafeInteger(length) || length <= 0 || length > MAX_PROJECT_ARCHIVE_CHUNK_BYTES) {
      throw new Error('归档分块长度无效')
    }
    const resolvedPath = path.resolve(String(filePath || ''))
    const handle = await fs.promises.open(resolvedPath, 'r')
    try {
      const stat = await handle.stat()
      if (!stat.isFile()) throw new Error('项目归档路径不是文件')
      if (offset > stat.size) throw new Error('归档分块偏移超出文件大小')
      const buffer = Buffer.alloc(Math.min(length, stat.size - offset))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
      return {
        data: buffer.subarray(0, bytesRead).toString('base64'),
        offset,
        length: bytesRead,
      }
    } finally {
      await handle.close()
    }
  }

  const createArchive = async ({ fileName } = {}) => {
    await ensureRoot()
    const normalizedName = normalizeFileName(fileName)
    const extension = path.extname(normalizedName) || '.yakitproject'
    const stem = path.basename(normalizedName, path.extname(normalizedName)) || 'team-project'
    const filePath = path.join(rootPath, `${stem}-${crypto.randomUUID()}${extension}`)
    const handle = await fs.promises.open(filePath, 'wx')
    await handle.close()
    return { fileName: path.basename(filePath), filePath }
  }

  const writeArchiveChunk = async ({ filePath, offset, data }) => {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('归档分块偏移无效')
    if (typeof data !== 'string') throw new Error('归档分块内容无效')
    const resolvedPath = requireManagedPath(filePath)
    const buffer = Buffer.from(data, 'base64')
    if (buffer.length === 0 || buffer.length > MAX_PROJECT_ARCHIVE_CHUNK_BYTES) {
      throw new Error('归档分块内容无效')
    }
    const handle = await fs.promises.open(resolvedPath, 'r+')
    try {
      const stat = await handle.stat()
      if (stat.size !== offset) throw new Error('归档分块写入顺序无效')
      let written = 0
      while (written < buffer.length) {
        const result = await handle.write(buffer, written, buffer.length - written, offset + written)
        written += result.bytesWritten
      }
      await handle.sync()
      return { offset, length: buffer.length, size: offset + buffer.length }
    } finally {
      await handle.close()
    }
  }

  const finalizeArchive = async (filePath) => {
    return inspectArchive(requireManagedPath(filePath))
  }

  const removeArchive = async (filePath) => {
    await fs.promises.unlink(requireManagedPath(filePath))
  }

  return {
    createArchive,
    finalizeArchive,
    inspectArchive,
    readArchiveChunk,
    removeArchive,
    writeArchiveChunk,
  }
}

module.exports = {
  MAX_PROJECT_ARCHIVE_CHUNK_BYTES,
  createProjectArchiveStore,
}
