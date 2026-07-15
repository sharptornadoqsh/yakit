const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { pipeline } = require('stream/promises')
const packageJson = require('../../package.json')
const productConfig = require('../../product/renyan.json')

const repositoryRoot = path.resolve(__dirname, '../..')
const targetDefinitions = {
  'macos-x64': { platform: 'darwin', architecture: 'x64', extension: 'dmg', containerPlatform: 'macOS' },
  'macos-arm64': { platform: 'darwin', architecture: 'arm64', extension: 'dmg', containerPlatform: 'macOS' },
  'windows-x64': { platform: 'windows', architecture: 'x64', extension: 'exe', containerPlatform: 'Windows' },
  'linux-x64': { platform: 'linux', architecture: 'x64', extension: 'AppImage', containerPlatform: 'Linux' },
}
const editionLabels = {
  community: 'Community',
  enterprise: 'Enterprise',
}

const parseBoolean = (value) => {
  if (`${value}`.toLowerCase() === 'true') return true
  if (`${value}`.toLowerCase() === 'false') return false
  throw new Error(`布尔值无效：${value}`)
}

const resolveGitValue = (environmentValue, args, root) => {
  if (environmentValue) return environmentValue
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

const calculateSha256 = async (filePath) => {
  const hash = crypto.createHash('sha256')
  await pipeline(fs.createReadStream(filePath), hash)
  return hash.digest('hex')
}

const createArtifactIdentity = ({ edition, target }) => {
  const definition = targetDefinitions[target]
  const editionLabel = editionLabels[edition]
  if (!definition) throw new Error(`不支持的安装目标：${target}`)
  if (!editionLabel) throw new Error(`不支持的客户端类别：${edition}`)

  return {
    definition,
    editionLabel,
    artifactName: `${productConfig.artifactPrefix}-${editionLabel}-${packageJson.version}-${definition.platform}-${definition.architecture}.${definition.extension}`,
  }
}

const createBuildMetadata = async ({
  edition,
  target,
  signed,
  includeEngine,
  root = repositoryRoot,
  env = process.env,
  buildTime = new Date().toISOString(),
}) => {
  const { definition, editionLabel, artifactName } = createArtifactIdentity({ edition, target })
  const releaseDirectory = path.join(root, 'release')
  if (!fs.existsSync(releaseDirectory)) throw new Error('安装文件输出目录不存在')

  const releaseFiles = fs.readdirSync(releaseDirectory).sort()
  console.log(`安装文件输出目录：${releaseFiles.join(', ')}`)
  const artifactPath = path.join(releaseDirectory, artifactName)
  if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
    throw new Error(`未找到预期安装文件：${artifactName}`)
  }

  const engineVersionPath = path.join(root, 'bins', 'engine-version.txt')
  const engineVersion = includeEngine
    ? fs.existsSync(engineVersionPath)
      ? fs.readFileSync(engineVersionPath, 'utf8').trim()
      : ''
    : null
  if (includeEngine && !engineVersion) throw new Error('预置引擎已启用，但缺少最终引擎版本')

  const artifactSha256 = await calculateSha256(artifactPath)
  const gitBranch = resolveGitValue(env.GITHUB_REF_NAME, ['branch', '--show-current'], root)
  const gitSha = resolveGitValue(env.GITHUB_SHA, ['rev-parse', 'HEAD'], root)
  const manifest = {
    productName: productConfig.displayName,
    shortName: productConfig.shortName,
    artifactPrefix: productConfig.artifactPrefix,
    version: packageJson.version,
    edition,
    gitBranch,
    gitSha,
    target,
    platform: definition.platform,
    architecture: definition.architecture,
    signed,
    includeEngine,
    engineVersion,
    nodeVersion: process.version,
    electronVersion: packageJson.devDependencies.electron,
    electronBuilderVersion: packageJson.devDependencies['electron-builder'],
    workflowRunId: env.GITHUB_RUN_ID || 'local',
    buildTime,
    artifactFile: artifactName,
    artifactSha256,
  }

  const manifestPath = path.join(releaseDirectory, 'build-manifest.json')
  const checksumPath = path.join(releaseDirectory, 'SHA256SUMS.txt')
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  fs.writeFileSync(checksumPath, `${artifactSha256}  ${artifactName}\n`, 'utf8')

  const signatureLabel = signed ? 'signed' : 'unsigned'
  const artifactContainer = `${productConfig.artifactContainerPrefix}-${editionLabel}-${definition.containerPlatform}-${definition.architecture}-${signatureLabel}`
  return {
    manifest,
    artifactPath,
    manifestPath,
    checksumPath,
    artifactContainer,
  }
}

const writeWorkflowValue = (filePath, name, value) => {
  if (!filePath) return
  fs.appendFileSync(filePath, `${name}=${value}\n`, 'utf8')
}

const run = async () => {
  const result = await createBuildMetadata({
    edition: process.env.PACKAGE_EDITION,
    target: process.env.PACKAGE_TARGET,
    signed: parseBoolean(process.env.PACKAGE_SIGNED),
    includeEngine: parseBoolean(process.env.INCLUDE_ENGINE),
  })
  const manifest = result.manifest

  console.log(`产品名称：${manifest.productName}`)
  console.log(`产品短名称：${manifest.shortName}`)
  console.log(`应用版本：${manifest.version}`)
  console.log(`客户端类别：${manifest.edition}`)
  console.log(`Git 分支：${manifest.gitBranch}`)
  console.log(`Git 提交：${manifest.gitSha}`)
  console.log(`构建目标：${manifest.target}`)
  console.log(`目标系统：${manifest.platform}`)
  console.log(`目标架构：${manifest.architecture}`)
  console.log(`执行环境系统：${process.env.RUNNER_OS || process.platform}`)
  console.log(`执行环境架构：${process.env.RUNNER_ARCH || process.arch}`)
  console.log(`预置引擎：${manifest.includeEngine}`)
  console.log(`引擎版本：${manifest.engineVersion || '未预置'}`)
  console.log(`安装文件签名：${manifest.signed}`)

  const relativeArtifactPath = path.relative(repositoryRoot, result.artifactPath).replace(/\\/g, '/')
  writeWorkflowValue(process.env.GITHUB_OUTPUT, 'artifact_path', relativeArtifactPath)
  writeWorkflowValue(process.env.GITHUB_OUTPUT, 'artifact_container', result.artifactContainer)
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = {
  calculateSha256,
  createArtifactIdentity,
  createBuildMetadata,
  parseBoolean,
  targetDefinitions,
}
