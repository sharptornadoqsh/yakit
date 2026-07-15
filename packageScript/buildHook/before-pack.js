const fs = require('fs')
const packageJson = require('../../package.json')
const productConfig = require('../../product/renyan.json')
const { calculateFileSha256, getCompatibilityEntry, normalizeSha256 } = require('../../app/main/engineLifecycle')

const normalizePath = (value) => `${value || ''}`.replace(/\\/g, '/')

const resolveExpectedArchiveSha256 = (artifact, platform, architecture) => {
  const verificationPath = `${artifact.sourceArchive}.verified.json`
  if (!fs.existsSync(verificationPath)) return normalizeSha256(artifact.archiveSha256)

  const verification = JSON.parse(fs.readFileSync(verificationPath, 'utf8'))
  if (
    verification.platform !== platform ||
    verification.architecture !== architecture ||
    normalizePath(verification.archivePath) !== normalizePath(artifact.sourceArchive)
  ) {
    throw new Error(`预置引擎验证记录与 ${platform}/${architecture} 不匹配`)
  }
  return normalizeSha256(verification.archiveSha256)
}

const validateBundledEngine = async (platform, architecture) => {
  const compatibility = getCompatibilityEntry({
    clientVersion: packageJson.version,
    platform,
    architecture,
  })
  if (!compatibility) throw new Error(`兼容清单缺少 ${platform}/${architecture} 工件`)

  const sourceArchive = compatibility.artifact.sourceArchive
  if (!fs.existsSync(sourceArchive)) throw new Error(`预置引擎压缩包不存在：${sourceArchive}`)

  const expectedSha256 = resolveExpectedArchiveSha256(compatibility.artifact, platform, architecture)
  if (!expectedSha256) throw new Error(`预置引擎 ${platform}/${architecture} 缺少有效摘要`)

  const actualSha256 = await calculateFileSha256(sourceArchive)
  if (actualSha256 !== expectedSha256) {
    throw new Error(`预置引擎压缩包摘要不匹配：${sourceArchive}`)
  }
  return compatibility.artifact
}

const appendEngine = (extraFiles, engineArtifact) => {
  if (!engineArtifact) return extraFiles
  return [
    ...extraFiles,
    {
      from: engineArtifact.sourceArchive,
      to: 'bins/yak.zip',
    },
  ]
}

const resolveRuiYanArtifactName = ({ platform, architecture, productVersion }) => {
  const editionLabels = {
    community: 'Community',
    enterprise: 'Enterprise',
    'enterprise-no-license': 'Enterprise-No-License',
  }
  const editionLabel = editionLabels[process.env.RENYAN_PACKAGE_EDITION]
  if (!editionLabel) return ''

  const platformLabels = {
    darwin: 'darwin',
    win32: 'windows',
    linux: 'linux',
  }
  const platformLabel = platformLabels[platform]
  if (!platformLabel) throw new Error(`不支持的睿眼打包平台：${platform}`)

  return `${productConfig.artifactPrefix}-${editionLabel}-${productVersion}-${platformLabel}-${architecture}.${'${ext}'}`
}

const resolveLegacyArtifactName = ({ platform, architecture, productVersion, isLegacy }) => {
  const legacySuffix = isLegacy ? '-legacy' : ''
  if (platform === 'win32') {
    return `${productConfig.artifactPrefix}-${productVersion}-windows${legacySuffix}-amd64.${'${ext}'}`
  }
  if (platform === 'linux') {
    const architectureLabel = architecture === 'x64' ? 'amd64' : architecture
    return `${productConfig.artifactPrefix}-${productVersion}-linux${legacySuffix}-${architectureLabel}.${'${ext}'}`
  }
  if (platform === 'darwin') {
    return `${productConfig.artifactPrefix}-${productVersion}-darwin${legacySuffix}-${architecture}.${'${ext}'}`
  }
  throw new Error(`不支持的打包平台：${platform}`)
}

const beforePack = async (context) => {
  const isLegacy = process.env.THE_LEGACY == 'true'
  const includeEngine = process.env.INCLUDE_ENGINE !== 'false'
  const archMap = {
    1: 'x64',
    3: 'arm64',
  }
  const architecture = archMap[context.arch]
  if (!architecture) throw new Error(`不支持的构建架构编号：${context.arch}`)

  const platform = context.electronPlatformName
  const engineArtifact = includeEngine ? await validateBundledEngine(platform, architecture) : null
  const baseInfo = context.packager.appInfo
  const productVersion = `${packageJson.version || baseInfo.version}`.replace(/-(ce|ee)$/, '')
  const artifactName =
    resolveRuiYanArtifactName({ platform, architecture, productVersion }) ||
    resolveLegacyArtifactName({ platform, architecture, productVersion, isLegacy })

  const win32Config = platform === 'win32' ? context.packager.config.win : null
  if (win32Config) {
    win32Config.extraFiles = appendEngine(
      [
        { from: 'bins/flag.windows.txt', to: 'bins/flag.windows.txt' },
        { from: 'LICENSE.md', to: 'LICENSE.md' },
      ],
      engineArtifact,
    )
    win32Config.artifactName = artifactName
    context.packager.config.win = win32Config
  }

  const linuxConfig = platform === 'linux' ? context.packager.config.linux : null
  if (linuxConfig) {
    linuxConfig.extraFiles = appendEngine(
      [
        { from: 'bins/flag.linux.txt', to: 'bins/flag.linux.txt' },
        { from: 'LICENSE.md', to: 'LICENSE.md' },
      ],
      engineArtifact,
    )
    linuxConfig.artifactName = artifactName
    context.packager.config.linux = linuxConfig
  }

  const macConfig = platform === 'darwin' ? context.packager.config.mac : null
  if (macConfig) {
    macConfig.extraFiles = appendEngine([{ from: 'bins/flag.darwin.txt', to: 'bins/flag.darwin.txt' }], engineArtifact)
    macConfig.artifactName = artifactName
    context.packager.config.mac = macConfig
  }
}

module.exports = beforePack
module.exports.resolveExpectedArchiveSha256 = resolveExpectedArchiveSha256
module.exports.resolveRuiYanArtifactName = resolveRuiYanArtifactName
