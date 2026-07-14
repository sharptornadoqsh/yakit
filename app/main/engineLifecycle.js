const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const StreamZip = require('node-stream-zip')

const compatibilityManifest = require('../../product/engine-compatibility.json')
const packageJson = require('../../package.json')

const normalizeSha256 = (value) => {
  const normalized = `${value || ''}`.trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : ''
}

const createEngineError = (code, message, details = {}) => {
  const error = new Error(message)
  error.code = code
  Object.assign(error, details)
  return error
}

const calculateFileSha256 = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const input = fs.createReadStream(filePath)
    input.on('error', reject)
    input.on('data', (data) => hash.update(data))
    input.on('end', () => resolve(hash.digest('hex')))
  })

const verifyFileSha256 = async (filePath, expectedSha256) => {
  const expected = normalizeSha256(expectedSha256)
  if (!expected) {
    throw createEngineError('ENGINE_SHA256_MISSING', '引擎摘要缺失或格式无效', { filePath })
  }
  if (!fs.existsSync(filePath)) {
    throw createEngineError('ENGINE_FILE_MISSING', '引擎文件不存在', { filePath })
  }

  const actual = await calculateFileSha256(filePath)
  if (actual !== expected) {
    throw createEngineError('ENGINE_SHA256_MISMATCH', '引擎摘要不匹配', {
      filePath,
      expected,
      actual,
    })
  }
  return { valid: true, expected, actual }
}

const safeUnlink = (filePath) => {
  try {
    fs.unlinkSync(filePath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

const writeInstallMarker = (markerPath, marker) => {
  const temporaryMarkerPath = `${markerPath}.tmp`
  fs.writeFileSync(temporaryMarkerPath, JSON.stringify(marker), 'utf8')
  safeUnlink(markerPath)
  fs.renameSync(temporaryMarkerPath, markerPath)
}

const readInstallMarker = (markerPath) => {
  try {
    return JSON.parse(fs.readFileSync(markerPath, 'utf8'))
  } catch (error) {
    return undefined
  }
}

const engineInstallPaths = (targetPath) => ({
  stagePath: `${targetPath}.installing`,
  markerPath: `${targetPath}.installing.json`,
  rollbackPath: `${targetPath}.rollback`,
  backupPath: `${targetPath}.last-good`,
})

const matchesRecordedSha = async (filePath, expectedSha256) => {
  const expected = normalizeSha256(expectedSha256)
  if (!expected || !fs.existsSync(filePath)) return false
  return (await calculateFileSha256(filePath)) === expected
}

const recoverInterruptedEngineInstall = async (targetPath) => {
  const { stagePath, markerPath, rollbackPath, backupPath } = engineInstallPaths(targetPath)
  const marker = readInstallMarker(markerPath)

  if (fs.existsSync(targetPath) && marker && (await matchesRecordedSha(targetPath, marker.expectedSha256))) {
    if (fs.existsSync(rollbackPath)) {
      fs.copyFileSync(rollbackPath, backupPath)
      safeUnlink(rollbackPath)
    }
    safeUnlink(stagePath)
    safeUnlink(markerPath)
    return { recovered: false, source: 'active' }
  }

  if (fs.existsSync(targetPath) && marker && fs.existsSync(rollbackPath)) {
    const rollbackValid = !marker.previousSha256 || (await matchesRecordedSha(rollbackPath, marker.previousSha256))
    if (rollbackValid) {
      safeUnlink(targetPath)
      fs.renameSync(rollbackPath, targetPath)
      safeUnlink(stagePath)
      safeUnlink(markerPath)
      return { recovered: true, source: 'rollback' }
    }
  }

  if (!fs.existsSync(targetPath) && fs.existsSync(rollbackPath)) {
    const rollbackValid = !marker?.previousSha256 || (await matchesRecordedSha(rollbackPath, marker.previousSha256))
    if (rollbackValid) {
      fs.renameSync(rollbackPath, targetPath)
      safeUnlink(stagePath)
      safeUnlink(markerPath)
      return { recovered: true, source: 'rollback' }
    }
  }

  if (!fs.existsSync(targetPath) && fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, targetPath)
    safeUnlink(stagePath)
    safeUnlink(markerPath)
    return { recovered: true, source: 'last-good' }
  }

  if (!marker) safeUnlink(stagePath)
  return { recovered: false, source: fs.existsSync(targetPath) ? 'active' : 'none' }
}

const atomicInstallEngine = async ({ sourcePath, targetPath, expectedSha256, executableMode = 0o755 }) => {
  const expected = normalizeSha256(expectedSha256)
  await verifyFileSha256(sourcePath, expected)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  await recoverInterruptedEngineInstall(targetPath)

  const { stagePath, markerPath, rollbackPath, backupPath } = engineInstallPaths(targetPath)
  safeUnlink(stagePath)
  safeUnlink(rollbackPath)
  fs.copyFileSync(sourcePath, stagePath)
  if (process.platform !== 'win32') fs.chmodSync(stagePath, executableMode)
  await verifyFileSha256(stagePath, expected)

  const previousVersionPreserved = fs.existsSync(targetPath)
  const previousSha256 = previousVersionPreserved ? await calculateFileSha256(targetPath) : undefined
  writeInstallMarker(markerPath, {
    expectedSha256: expected,
    previousSha256,
    phase: 'staged',
  })

  try {
    if (previousVersionPreserved) {
      fs.renameSync(targetPath, rollbackPath)
      writeInstallMarker(markerPath, {
        expectedSha256: expected,
        previousSha256,
        phase: 'target-moved',
      })
    }

    fs.renameSync(stagePath, targetPath)
    await verifyFileSha256(targetPath, expected)

    if (previousVersionPreserved) {
      fs.copyFileSync(rollbackPath, backupPath)
      safeUnlink(rollbackPath)
    }
    safeUnlink(markerPath)

    return {
      targetPath,
      backupPath,
      sha256: expected,
      previousVersionPreserved,
    }
  } catch (error) {
    if (fs.existsSync(rollbackPath)) {
      safeUnlink(targetPath)
      fs.renameSync(rollbackPath, targetPath)
    }
    safeUnlink(stagePath)
    safeUnlink(markerPath)
    throw error
  }
}

const downloadAndVerifyArtifact = async ({ targetPath, fetchExpectedSha256, download, onDownloaded }) => {
  const temporaryPath = `${targetPath}.download`
  const sidecarPath = `${targetPath}.sha256.txt`
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  safeUnlink(temporaryPath)

  try {
    const expectedSha256 = normalizeSha256(await fetchExpectedSha256())
    if (!expectedSha256) throw createEngineError('ENGINE_SHA256_MISSING', '下载服务未提供有效的引擎摘要')
    await download(temporaryPath)
    if (onDownloaded) onDownloaded()
    await verifyFileSha256(temporaryPath, expectedSha256)
    await atomicInstallEngine({ sourcePath: temporaryPath, targetPath, expectedSha256 })
    fs.writeFileSync(sidecarPath, `${expectedSha256}\n`, 'utf8')
    safeUnlink(temporaryPath)
    return { targetPath, sha256: expectedSha256, sidecarPath }
  } catch (error) {
    safeUnlink(temporaryPath)
    throw error
  }
}

const extractArchiveEntry = (archivePath, entryName, destination) =>
  new Promise((resolve, reject) => {
    const archive = new StreamZip({ file: archivePath, storeEntries: true })
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      archive.close()
      if (error) reject(error)
      else resolve(destination)
    }
    archive.on('ready', () => {
      const entry = archive.entry(entryName)
      if (!entry || entry.isDirectory) {
        finish(createEngineError('ENGINE_ARCHIVE_ENTRY_MISSING', `预置引擎缺少条目：${entryName}`))
        return
      }
      archive.extract(entryName, destination, (error) => finish(error))
    })
    archive.on('error', finish)
  })

const getCompatibilityEntry = ({
  clientVersion = packageJson.version,
  platform = process.platform,
  architecture = process.arch,
} = {}) => {
  const client = compatibilityManifest.clientVersions.find((item) => item.clientVersion === clientVersion)
  if (!client) return undefined
  const artifact = client.artifacts.find((item) => item.platform === platform && item.architecture === architecture)
  if (!artifact) return undefined
  return {
    clientVersion: client.clientVersion,
    minimumEngineVersion: client.minimumEngineVersion,
    recommendedEngineVersion: client.recommendedEngineVersion,
    highestVerifiedEngineVersion: client.highestVerifiedEngineVersion,
    compatibilityGate: client.compatibilityGate,
    artifact,
  }
}

module.exports = {
  atomicInstallEngine,
  calculateFileSha256,
  compatibilityManifest,
  downloadAndVerifyArtifact,
  extractArchiveEntry,
  getCompatibilityEntry,
  normalizeSha256,
  recoverInterruptedEngineInstall,
  verifyFileSha256,
}
