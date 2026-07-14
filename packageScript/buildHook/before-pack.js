const fs = require('fs')
const packageJson = require('../../package.json')
const productConfig = require('../../product/renyan.json')
const { calculateFileSha256, getCompatibilityEntry, normalizeSha256 } = require('../../app/main/engineLifecycle')

const validateBundledEngine = async (platform, architecture) => {
  const compatibility = getCompatibilityEntry({
    clientVersion: packageJson.version,
    platform,
    architecture,
  })
  if (!compatibility) throw new Error(`兼容清单缺少 ${platform}/${architecture} 工件`)

  const expectedSha256 = normalizeSha256(compatibility.artifact.archiveSha256)
  if (!expectedSha256) throw new Error(`兼容清单中的 ${platform}/${architecture} 预置工件摘要仍为待定`)

  const sourceArchive = compatibility.artifact.sourceArchive
  if (!fs.existsSync(sourceArchive)) throw new Error(`预置引擎压缩包不存在：${sourceArchive}`)
  const actualSha256 = await calculateFileSha256(sourceArchive)
  if (actualSha256 !== expectedSha256) {
    throw new Error(`预置引擎压缩包摘要不匹配：${sourceArchive}`)
  }
  return compatibility.artifact
}

module.exports = async function (context) {
  const isLegacy = process.env.THE_LEGACY == 'true'

  const archMap = {
    1: 'x64',
    3: 'arm64',
  }
  const arch = archMap[context.arch]
  if (!arch) throw new Error(`不支持的构建架构编号：${context.arch}`)
  const engineArtifact = await validateBundledEngine(context.electronPlatformName, arch)
  const baseInfo = context.packager.appInfo
  let productVersion = packageJson.version || baseInfo.version
  // CE
  if (productVersion.endsWith('-ce')) {
    productVersion = productVersion.replace('-ce', '')
  }
  // EE
  if (productVersion.endsWith('-ee')) {
    productVersion = productVersion.replace('-ee', '')
  }

  const artifactName = productConfig.artifactPrefix

  /** win32 */
  const win32Config = context.electronPlatformName === 'win32' ? context.packager.config.win : null
  if (win32Config) {
    win32Config.extraFiles = [
      {
        from: 'bins/flag.windows.txt',
        to: 'bins/flag.windows.txt',
      },
      {
        from: engineArtifact.sourceArchive,
        to: 'bins/yak.zip',
      },
      {
        from: 'LICENSE.md',
        to: 'LICENSE.md',
      },
    ]
    win32Config.artifactName = `${artifactName}-${productVersion}-windows${isLegacy ? '-legacy' : ''}-amd64.${'${ext}'}`
    context.packager.config.win = win32Config
  }

  /**linux */
  /** 1:x64 3:arm64 */
  const linuxConfig = context.electronPlatformName === 'linux' ? context.packager.config.linux : null
  if (linuxConfig) {
    const linuxExtraFiles = [
      {
        from: 'bins/flag.linux.txt',
        to: 'bins/flag.linux.txt',
      },
      {
        from: 'LICENSE.md',
        to: 'LICENSE.md',
      },
    ]
    switch (arch) {
      case 'arm64':
        linuxConfig.artifactName = `${artifactName}-${productVersion}-linux${
          isLegacy ? '-legacy' : ''
        }-arm64.${'${ext}'}`
        linuxConfig.extraFiles = [
          ...linuxExtraFiles,
          {
            from: engineArtifact.sourceArchive,
            to: 'bins/yak.zip',
          },
        ]
        break
      case 'x64':
        linuxConfig.artifactName = `${artifactName}-${productVersion}-linux${
          isLegacy ? '-legacy' : ''
        }-amd64.${'${ext}'}`
        linuxConfig.extraFiles = [
          ...linuxExtraFiles,
          {
            from: engineArtifact.sourceArchive,
            to: 'bins/yak.zip',
          },
        ]
        break

      default:
        break
    }
    context.packager.config.linux = linuxConfig
  }

  /**mac */
  /** 1:x64 3:arm64 */
  const macConfig = context.electronPlatformName === 'darwin' ? context.packager.config.mac : null
  if (macConfig) {
    const darwinExtraFiles = [
      {
        from: 'bins/flag.darwin.txt',
        to: 'bins/flag.darwin.txt',
      },
    ]
    macConfig.artifactName = `${artifactName}-${productVersion}-darwin${
      isLegacy ? '-legacy' : ''
    }-${'${arch}'}.${'${ext}'}`
    switch (arch) {
      case 'arm64':
        macConfig.extraFiles = [
          ...darwinExtraFiles,
          {
            from: engineArtifact.sourceArchive,
            to: 'bins/yak.zip',
          },
        ]
        break
      case 'x64':
        macConfig.extraFiles = [
          ...darwinExtraFiles,
          {
            from: engineArtifact.sourceArchive,
            to: 'bins/yak.zip',
          },
        ]
        break

      default:
        break
    }
    context.packager.config.mac = macConfig
  }
}
