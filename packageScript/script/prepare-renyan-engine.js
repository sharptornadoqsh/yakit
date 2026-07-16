const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const AdmZip = require('adm-zip')
const packageJson = require('../../package.json')
const compatibilityManifest = require('../../product/engine-compatibility.json')

const repositoryRoot = path.resolve(__dirname, '../..')
const engineBaseUrl = 'https://yaklang.oss-accelerate.aliyuncs.com/yak/'
const versionPattern = /^[A-Za-z0-9._-]+$/
const supportedAssets = {
  yak_darwin_amd64: { platform: 'darwin', architecture: 'x64' },
  yak_darwin_arm64: { platform: 'darwin', architecture: 'arm64' },
  'yak_windows_amd64.exe': { platform: 'win32', architecture: 'x64' },
  yak_linux_amd64: { platform: 'linux', architecture: 'x64' },
  yak_linux_arm64: { platform: 'linux', architecture: 'arm64' },
}

const normalizePath = (value) => value.replace(/\\/g, '/')

const parseBoolean = (value) => {
  if (`${value}`.toLowerCase() === 'true') return true
  if (`${value}`.toLowerCase() === 'false') return false
  throw new Error(`布尔值无效：${value}`)
}

const parseSha256 = (value) => {
  const matches = `${value || ''}`.match(/\b[0-9a-fA-F]{64}\b/g) || []
  const uniqueMatches = [...new Set(matches.map((item) => item.toLowerCase()))]
  if (uniqueMatches.length !== 1) throw new Error('引擎摘要文件必须包含唯一的 SHA256 值')
  return uniqueMatches[0]
}

const resolveEngineVersion = (
  requestedVersion,
  manifest = compatibilityManifest,
  clientVersion = packageJson.version,
) => {
  const client = manifest.clientVersions.find((item) => item.clientVersion === clientVersion)
  if (!client) throw new Error(`兼容清单缺少客户端版本 ${clientVersion}`)

  const selectedVersion = `${requestedVersion || client.recommendedEngineVersion || ''}`.trim()
  if (!selectedVersion || selectedVersion === 'TBD' || selectedVersion.toLowerCase() === 'latest') {
    throw new Error('无法从兼容清单确定有效的引擎版本')
  }
  if (!versionPattern.test(selectedVersion)) {
    throw new Error('引擎版本只能包含字母、数字、点、横杠和下划线')
  }
  return selectedVersion
}

const getEnginePaths = (asset, root = repositoryRoot) => {
  if (!supportedAssets[asset]) throw new Error(`不支持的引擎工件：${asset}`)
  const archiveName = `${asset.replace(/\.exe$/i, '')}.zip`
  const rawPath = path.join(root, 'bins', asset)
  const archivePath = path.join(root, 'bins', archiveName)
  return {
    rawPath,
    archivePath,
    sidecarPath: `${rawPath}.sha256.txt`,
    verificationPath: `${archivePath}.verified.json`,
  }
}

const calculateSha256 = async (filePath) => {
  const hash = crypto.createHash('sha256')
  await pipeline(fs.createReadStream(filePath), hash)
  return hash.digest('hex')
}

const downloadFile = async (url, destination, fetcher = global.fetch) => {
  const response = await fetcher(url)
  if (!response.ok || !response.body) throw new Error(`下载失败：${url}，状态码 ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination))
}

const writeWorkflowValue = (filePath, name, value) => {
  if (!filePath) return
  fs.appendFileSync(filePath, `${name}=${value}\n`, 'utf8')
}

const archiveEngine = async ({ asset, engineVersion, root = repositoryRoot }) => {
  const mapping = supportedAssets[asset]
  const paths = getEnginePaths(asset, root)
  if (!fs.existsSync(paths.rawPath)) throw new Error(`待归档引擎不存在：${paths.rawPath}`)
  if (!fs.existsSync(paths.sidecarPath)) throw new Error(`引擎摘要文件不存在：${paths.sidecarPath}`)

  const upstreamEngineSha256 = parseSha256(fs.readFileSync(paths.sidecarPath, 'utf8'))
  const packagedEngineSha256 = await calculateSha256(paths.rawPath)
  const zip = new AdmZip()
  zip.addLocalFile(paths.rawPath, 'bins')
  zip.writeZip(paths.archivePath)

  const archiveSha256 = await calculateSha256(paths.archivePath)
  const verification = {
    clientVersion: packageJson.version,
    engineVersion,
    asset,
    platform: mapping.platform,
    architecture: mapping.architecture,
    archivePath: normalizePath(path.relative(root, paths.archivePath)),
    archiveSha256,
    upstreamEngineSha256,
    packagedEngineSha256,
    verifiedAt: new Date().toISOString(),
  }
  fs.writeFileSync(paths.verificationPath, `${JSON.stringify(verification, null, 2)}\n`, 'utf8')
  fs.rmSync(paths.rawPath, { force: true })
  return { ...paths, verification }
}

const prepareEngine = async ({
  asset,
  requestedVersion,
  deferArchive = false,
  root = repositoryRoot,
  fetcher = global.fetch,
}) => {
  const mapping = supportedAssets[asset]
  if (!mapping) throw new Error(`不支持的引擎工件：${asset}`)

  const engineVersion = resolveEngineVersion(requestedVersion)
  const paths = getEnginePaths(asset, root)
  fs.mkdirSync(path.dirname(paths.rawPath), { recursive: true })

  const rawDownloadPath = `${paths.rawPath}.download`
  const sidecarDownloadPath = `${paths.sidecarPath}.download`
  fs.rmSync(rawDownloadPath, { force: true })
  fs.rmSync(sidecarDownloadPath, { force: true })

  try {
    const versionUrl = new URL(`${encodeURIComponent(engineVersion)}/`, engineBaseUrl)
    await downloadFile(new URL(asset, versionUrl).toString(), rawDownloadPath, fetcher)
    await downloadFile(new URL(`${asset}.sha256.txt`, versionUrl).toString(), sidecarDownloadPath, fetcher)

    const expectedSha256 = parseSha256(fs.readFileSync(sidecarDownloadPath, 'utf8'))
    const actualSha256 = await calculateSha256(rawDownloadPath)
    if (actualSha256 !== expectedSha256) throw new Error(`引擎摘要不匹配：${asset}`)

    fs.renameSync(rawDownloadPath, paths.rawPath)
    fs.renameSync(sidecarDownloadPath, paths.sidecarPath)
    if (mapping.platform !== 'win32') fs.chmodSync(paths.rawPath, 0o755)
    fs.writeFileSync(path.join(root, 'bins', 'engine-version.txt'), `${engineVersion}\n`, 'utf8')

    if (!deferArchive) await archiveEngine({ asset, engineVersion, root })
    return { engineVersion, ...paths }
  } finally {
    fs.rmSync(rawDownloadPath, { force: true })
    fs.rmSync(sidecarDownloadPath, { force: true })
  }
}

const run = async () => {
  const command = process.argv[2]
  const asset = process.env.ENGINE_ASSET
  if (!asset) throw new Error('缺少 ENGINE_ASSET')

  if (command === 'prepare') {
    const deferArchive = parseBoolean(process.env.DEFER_ENGINE_ARCHIVE || 'false')
    const result = await prepareEngine({
      asset,
      requestedVersion: process.env.REQUESTED_ENGINE_VERSION,
      deferArchive,
    })
    console.log(`最终引擎版本：${result.engineVersion}`)
    console.log(`引擎平台：${supportedAssets[asset].platform}`)
    console.log(`引擎架构：${supportedAssets[asset].architecture}`)
    writeWorkflowValue(process.env.GITHUB_OUTPUT, 'engine_version', result.engineVersion)
    writeWorkflowValue(process.env.GITHUB_ENV, 'ENGINE_VERSION', result.engineVersion)
    return
  }

  if (command === 'archive') {
    const versionPath = path.join(repositoryRoot, 'bins', 'engine-version.txt')
    if (!fs.existsSync(versionPath)) throw new Error('缺少引擎版本文件')
    const engineVersion = resolveEngineVersion(fs.readFileSync(versionPath, 'utf8').trim())
    await archiveEngine({ asset, engineVersion })
    console.log(`已归档经过签名处理的引擎：${asset}`)
    return
  }

  throw new Error(`不支持的命令：${command}`)
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = {
  archiveEngine,
  calculateSha256,
  getEnginePaths,
  parseBoolean,
  parseSha256,
  prepareEngine,
  resolveEngineVersion,
  supportedAssets,
}
