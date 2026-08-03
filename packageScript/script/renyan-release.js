const fs = require('fs')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
const { isDeepStrictEqual } = require('util')
const packageJson = require('../../package.json')
const productConfig = require('../../product/renyan.json')
const {
  calculateSha256,
  createArtifactIdentity,
  editionLabels,
  parseArtifactIdentity,
  parseBoolean,
  resolveRequestedTargets,
  targetDefinitions,
} = require('./create-renyan-build-metadata')

const repositoryRoot = path.resolve(__dirname, '../..')
const releaseTagPattern = /^renyan-v[A-Za-z0-9][A-Za-z0-9._+-]*$/
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const shaPattern = /^[0-9a-f]{40}$/i
const numericPattern = /^[1-9][0-9]*$/
const safeTextPattern = /^[^\u0000-\u001f\u007f]+$/
const engineVersionPattern = /^[A-Za-z0-9._-]*$/

const assertSafeText = (value, label) => {
  const normalized = `${value || ''}`
  if (!normalized || !safeTextPattern.test(normalized)) throw new Error(`${label} 无效`)
  return normalized
}

const assertSha = (value, label = 'Git 提交') => {
  const normalized = `${value || ''}`.trim()
  if (!shaPattern.test(normalized)) throw new Error(`${label}必须是完整的 40 位提交 SHA`)
  return normalized.toLowerCase()
}

const assertBoolean = (value, label) => {
  if (typeof value !== 'boolean') throw new Error(`${label}必须是布尔值`)
  return value
}

const validateReleaseTag = (releaseTag) => {
  if (!`${releaseTag || ''}`.startsWith('renyan-v')) throw new Error('Release Tag 必须以 renyan-v 开头')
  if (!releaseTagPattern.test(releaseTag)) throw new Error('Release Tag 包含不允许的字符')
  if (releaseTag.includes('..') || releaseTag.endsWith('.') || releaseTag.endsWith('.lock')) {
    throw new Error('Release Tag 不是安全的 Git Tag')
  }
  if (Buffer.byteLength(releaseTag, 'utf8') > 128) throw new Error('Release Tag 长度超过限制')
  return releaseTag
}

const resolveReleaseTag = (customTag, packageVersion = packageJson.version) => {
  const requestedTag = customTag === undefined || customTag === null ? '' : `${customTag}`
  if (requestedTag !== '' && requestedTag.trim() === '') throw new Error('自定义 Release Tag 不能为空白字符')
  return validateReleaseTag(requestedTag || `renyan-v${packageVersion}`)
}

const parseNeeds = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(`${value || ''}`)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('不是对象')
    return parsed
  } catch (error) {
    throw new Error('构建 Job 结果不是合法 JSON 对象')
  }
}

const validateBuildResults = ({ requestedTarget, needs }) => {
  const expectedTargets = resolveRequestedTargets(requestedTarget)
  const expectedSet = new Set(expectedTargets)
  const normalizedNeeds = parseNeeds(needs)
  const failures = []
  const successfulTargets = []

  Object.keys(targetDefinitions).forEach((target) => {
    const jobName = `build-${target}`
    const result = normalizedNeeds[jobName]?.result || 'missing'
    if (expectedSet.has(target)) {
      if (result === 'success') successfulTargets.push(target)
      else failures.push(`${jobName}=${result}`)
      return
    }
    if (result !== 'skipped') failures.push(`${jobName}=${result}（未选择）`)
  })

  if (successfulTargets.length === 0) {
    throw new Error(`没有成功的构建 Job，禁止发布 Release：${failures.join(', ') || '无构建结果'}`)
  }
  if (failures.length > 0) throw new Error(`构建结果不完整，禁止发布 Release：${failures.join(', ')}`)
  return successfulTargets
}

const validateBuildTime = (value) => {
  const normalized = `${value || ''}`
  if (!normalized || Number.isNaN(Date.parse(normalized))) throw new Error('构建时间无效')
  return normalized
}

const validateServerUrl = (value) => {
  let serverUrl
  try {
    serverUrl = new URL(`${value || ''}`)
  } catch (error) {
    throw new Error('GitHub Server URL 无效')
  }
  if (serverUrl.protocol !== 'https:') throw new Error('GitHub Server URL 必须使用 HTTPS')
  return serverUrl.origin
}

const validateContextShape = (context) => {
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new Error('Release 上下文无效')
  if (context.productName !== productConfig.displayName) throw new Error('产品名称与产品配置不一致')
  if (context.packageVersion !== packageJson.version) throw new Error('Release 上下文版本与 package.json 不一致')
  if (context.releaseTitle !== `${productConfig.displayName} ${packageJson.version}`) {
    throw new Error('Release 标题与产品配置不一致')
  }
  if (resolveReleaseTag(context.releaseTag, context.packageVersion) !== context.releaseTag) {
    throw new Error('Release Tag 无效')
  }
  if (!editionLabels[context.edition]) throw new Error(`不支持的客户端类型：${context.edition}`)

  const expectedTargets = resolveRequestedTargets(context.requestedTarget)
  if (!Array.isArray(context.successfulTargets) || !isDeepStrictEqual(context.successfulTargets, expectedTargets)) {
    throw new Error('成功构建目标与请求目标不一致')
  }
  assertBoolean(context.includeEngine, 'includeEngine')
  assertBoolean(context.signInstallers, 'signInstallers')
  assertBoolean(context.releaseDraft, 'releaseDraft')
  assertBoolean(context.releasePrerelease, 'releasePrerelease')
  assertBoolean(context.overwriteReleaseAssets, 'overwriteReleaseAssets')
  if (!engineVersionPattern.test(`${context.requestedEngineVersion || ''}`)) throw new Error('请求的引擎版本无效')
  if (context.gitBranch !== 'qsh') throw new Error('只允许从 qsh 分支发布 Release')
  assertSha(context.gitSha)
  if (!repositoryPattern.test(`${context.repository || ''}`)) throw new Error('GitHub 仓库名称无效')
  assertSafeText(context.workflowName, '工作流名称')
  if (!numericPattern.test(`${context.workflowRunId || ''}`)) throw new Error('工作流运行 ID 无效')
  if (!numericPattern.test(`${context.workflowRunAttempt || ''}`)) throw new Error('工作流运行尝试次数无效')
  if (!/^https:\/\//.test(`${context.workflowRunUrl || ''}`)) throw new Error('工作流运行链接无效')
  assertSafeText(context.actor, '触发用户')
  validateBuildTime(context.buildTime)
  return context
}

const validateReleaseContext = ({
  env = process.env,
  root = repositoryRoot,
  executeGit = execFileSync,
  buildTime = new Date().toISOString(),
} = {}) => {
  const gitBranch = `${env.GITHUB_REF_NAME || ''}`
  if (gitBranch !== 'qsh') throw new Error('只允许从 qsh 分支发布 Release')

  const gitSha = assertSha(env.GITHUB_SHA)
  const checkedOutSha = assertSha(
    executeGit('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    '当前检出提交',
  )
  if (checkedOutSha !== gitSha) throw new Error(`当前检出提交 ${checkedOutSha} 与工作流提交 ${gitSha} 不一致`)

  const requestedTarget = `${env.REQUESTED_TARGET || ''}`
  const edition = `${env.PACKAGE_EDITION || ''}`
  const successfulTargets = validateBuildResults({
    requestedTarget,
    needs: env.BUILD_RESULTS_JSON,
  })
  createArtifactIdentity({ edition, target: successfulTargets[0] })

  const requestedEngineVersion = `${env.REQUESTED_ENGINE_VERSION || ''}`.trim()
  if (!engineVersionPattern.test(requestedEngineVersion)) throw new Error('请求的引擎版本包含不允许的字符')
  const repository = `${env.GITHUB_REPOSITORY || ''}`
  if (!repositoryPattern.test(repository)) throw new Error('GitHub 仓库名称无效')
  const workflowRunId = `${env.GITHUB_RUN_ID || ''}`
  const workflowRunAttempt = `${env.GITHUB_RUN_ATTEMPT || ''}`
  if (!numericPattern.test(workflowRunId)) throw new Error('工作流运行 ID 无效')
  if (!numericPattern.test(workflowRunAttempt)) throw new Error('工作流运行尝试次数无效')
  const serverUrl = validateServerUrl(env.GITHUB_SERVER_URL || 'https://github.com')

  return validateContextShape({
    productName: productConfig.displayName,
    packageVersion: packageJson.version,
    releaseTag: resolveReleaseTag(env.RELEASE_TAG_INPUT, packageJson.version),
    releaseTitle: `${productConfig.displayName} ${packageJson.version}`,
    edition,
    requestedTarget,
    successfulTargets,
    includeEngine: parseBoolean(env.INCLUDE_ENGINE),
    requestedEngineVersion,
    signInstallers: parseBoolean(env.SIGN_INSTALLERS),
    releaseDraft: parseBoolean(env.RELEASE_DRAFT),
    releasePrerelease: parseBoolean(env.RELEASE_PRERELEASE),
    overwriteReleaseAssets: parseBoolean(env.OVERWRITE_RELEASE_ASSETS),
    gitBranch,
    gitSha,
    repository,
    workflowName: assertSafeText(env.GITHUB_WORKFLOW, '工作流名称'),
    workflowRunId,
    workflowRunAttempt,
    workflowRunUrl: `${serverUrl}/${repository}/actions/runs/${workflowRunId}/attempts/${workflowRunAttempt}`,
    actor: assertSafeText(env.GITHUB_ACTOR, '触发用户'),
    buildTime: validateBuildTime(buildTime),
  })
}

const collectFiles = (directory) => {
  const resolvedDirectory = path.resolve(directory)
  if (!fs.existsSync(resolvedDirectory)) throw new Error('Artifact 下载目录不存在')
  if (!fs.lstatSync(resolvedDirectory).isDirectory()) throw new Error('Artifact 下载路径不是目录')

  const files = []
  const visit = (currentDirectory) => {
    fs.readdirSync(currentDirectory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((entry) => {
        const entryPath = path.join(currentDirectory, entry.name)
        const stats = fs.lstatSync(entryPath)
        if (stats.isSymbolicLink()) throw new Error(`Artifact 中不允许符号链接：${entry.name}`)
        if (stats.isDirectory()) {
          visit(entryPath)
          return
        }
        if (!stats.isFile()) throw new Error(`Artifact 中出现非普通文件：${entry.name}`)
        files.push({ path: entryPath, name: entry.name, size: stats.size })
      })
  }
  visit(resolvedDirectory)
  return files
}

const assertEmptyDirectory = (directory, label) => {
  const resolvedDirectory = path.resolve(directory)
  if (fs.existsSync(resolvedDirectory)) {
    const stats = fs.lstatSync(resolvedDirectory)
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`${label}不是安全目录`)
    if (fs.readdirSync(resolvedDirectory).length > 0) throw new Error(`${label}必须为空`)
    return resolvedDirectory
  }
  fs.mkdirSync(resolvedDirectory, { recursive: true })
  return resolvedDirectory
}

const validateDownloadedInstallers = (context, downloadedDirectory) => {
  validateContextShape(context)
  const downloadedFiles = collectFiles(downloadedDirectory)
  if (downloadedFiles.length === 0) throw new Error('没有安装文件，禁止发布空 Release')

  const names = new Map()
  downloadedFiles.forEach((file) => {
    const normalizedName = file.name.toLowerCase()
    if (names.has(normalizedName)) throw new Error(`检测到重复安装文件名：${file.name}`)
    names.set(normalizedName, file.path)
  })

  const expectedTargets = new Set(context.successfulTargets)
  const seenTargets = new Set()
  const installers = downloadedFiles.map((file) => {
    const identity = parseArtifactIdentity(file.name)
    if (!identity) throw new Error(`出现非预期安装文件：${file.name}`)
    if (identity.version !== context.packageVersion) {
      throw new Error(`安装文件版本不一致：${file.name}`)
    }
    if (identity.edition !== context.edition) {
      throw new Error(`安装文件客户端类型不一致：${file.name}`)
    }
    if (!expectedTargets.has(identity.target)) {
      throw new Error(`安装文件平台或架构不一致：${file.name}`)
    }
    if (file.size === 0) throw new Error(`安装文件为空：${file.name}`)
    if (seenTargets.has(identity.target)) throw new Error(`同一平台和架构出现重复安装文件：${identity.target}`)

    const expectedName = createArtifactIdentity({
      edition: context.edition,
      target: identity.target,
      version: context.packageVersion,
    }).artifactName
    if (expectedName !== file.name) throw new Error(`安装文件名不符合项目规则：${file.name}`)
    seenTargets.add(identity.target)
    return { ...file, identity }
  })

  const missingTargets = context.successfulTargets.filter((target) => !seenTargets.has(target))
  if (missingTargets.length > 0 || installers.length !== context.successfulTargets.length) {
    throw new Error(`Artifact 下载不完整，缺少安装文件：${missingTargets.join(', ') || '数量不一致'}`)
  }

  return context.successfulTargets.map((target) => installers.find((item) => item.identity.target === target))
}

const createReleaseMetadata = (context, files) => ({
  productName: context.productName,
  packageVersion: context.packageVersion,
  releaseTag: context.releaseTag,
  edition: context.edition,
  requestedTarget: context.requestedTarget,
  includeEngine: context.includeEngine,
  requestedEngineVersion: context.requestedEngineVersion,
  signInstallers: context.signInstallers,
  gitBranch: context.gitBranch,
  gitSha: context.gitSha,
  repository: context.repository,
  workflowName: context.workflowName,
  workflowRunId: context.workflowRunId,
  workflowRunAttempt: context.workflowRunAttempt,
  workflowRunUrl: context.workflowRunUrl,
  actor: context.actor,
  buildTime: context.buildTime,
  files,
})

const createReleaseNotes = (context, files) => {
  const engineVersion = context.requestedEngineVersion || '使用兼容清单推荐版本'
  const installerLines = files.map(
    (file) => `- \`${file.fileName}\`（${file.platform} / ${file.architecture}，SHA-256：\`${file.sha256}\`）`,
  )
  return [
    `# ${context.releaseTitle}`,
    '',
    `- 产品名称：${context.productName}`,
    `- 应用版本：${context.packageVersion}`,
    `- Git 提交：\`${context.gitSha}\``,
    `- 构建分支：\`${context.gitBranch}\``,
    `- 客户端类型：\`${context.edition}\``,
    `- 请求的构建目标：\`${context.requestedTarget}\``,
    `- 是否预置 Yak 引擎：${context.includeEngine ? '是' : '否'}`,
    `- 请求的引擎版本：${engineVersion}`,
    `- 是否启用安装文件签名：${context.signInstallers ? '是' : '否'}`,
    `- GitHub Actions Run：[查看本次构建](${context.workflowRunUrl})`,
    '',
    '## 本次发布的安装文件',
    '',
    ...installerLines,
    '',
    '## SHA-256 校验',
    '',
    '每个安装文件都附带同名的 `.sha256` 文件，可使用 `sha256sum -c <文件名>.sha256` 复验。',
    '',
  ].join('\n')
}

const prepareReleaseAssets = async ({ context, downloadedDirectory, assetsDirectory, workDirectory }) => {
  const installers = validateDownloadedInstallers(context, downloadedDirectory)
  const preparedFiles = []

  for (const installer of installers) {
    preparedFiles.push({
      fileName: installer.name,
      size: installer.size,
      sha256: await calculateSha256(installer.path),
      target: installer.identity.target,
      platform: installer.identity.definition.platform,
      architecture: installer.identity.definition.architecture,
      sourcePath: installer.path,
    })
  }

  const resolvedAssetsDirectory = assertEmptyDirectory(assetsDirectory, 'Release 附件目录')
  const resolvedWorkDirectory = assertEmptyDirectory(workDirectory, 'Release 工作目录')
  const assetPaths = []

  preparedFiles.forEach((file) => {
    const installerPath = path.join(resolvedAssetsDirectory, file.fileName)
    const checksumPath = `${installerPath}.sha256`
    fs.copyFileSync(file.sourcePath, installerPath, fs.constants.COPYFILE_EXCL)
    fs.writeFileSync(checksumPath, `${file.sha256}  ${file.fileName}\n`, { encoding: 'utf8', flag: 'wx' })
    assetPaths.push(installerPath, checksumPath)
  })

  const publicFiles = preparedFiles.map(({ sourcePath, ...file }) => file)
  const releaseMetadata = createReleaseMetadata(context, publicFiles)
  const buildInfoPath = path.join(resolvedAssetsDirectory, `RuiYan-release-build-${context.workflowRunId}.json`)
  fs.writeFileSync(buildInfoPath, `${JSON.stringify(releaseMetadata, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  assetPaths.push(buildInfoPath)

  const notesPath = path.join(resolvedWorkDirectory, 'release-notes.md')
  fs.writeFileSync(notesPath, createReleaseNotes(context, publicFiles), { encoding: 'utf8', flag: 'wx' })
  const plan = {
    schemaVersion: 1,
    context,
    files: publicFiles,
    assetsDirectory: resolvedAssetsDirectory,
    assetPaths,
    buildInfoPath,
    notesPath,
  }
  const planPath = path.join(resolvedWorkDirectory, 'release-plan.json')
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return { ...plan, planPath, releaseMetadata }
}

const isPathInside = (parentDirectory, candidatePath) => {
  const relativePath = path.relative(parentDirectory, candidatePath)
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

const validateRegularFile = (filePath, label) => {
  if (!fs.existsSync(filePath)) throw new Error(`${label}不存在：${path.basename(filePath)}`)
  const stats = fs.lstatSync(filePath)
  if (stats.isSymbolicLink() || !stats.isFile())
    throw new Error(`${label}不是安全的普通文件：${path.basename(filePath)}`)
  if (stats.size === 0) throw new Error(`${label}为空：${path.basename(filePath)}`)
  return stats
}

const validatePreparedPlan = async (planPath) => {
  const resolvedPlanPath = path.resolve(planPath)
  validateRegularFile(resolvedPlanPath, 'Release 计划')

  let plan
  try {
    plan = JSON.parse(fs.readFileSync(resolvedPlanPath, 'utf8'))
  } catch (error) {
    throw new Error('Release 计划 JSON 无效')
  }
  if (plan.schemaVersion !== 1) throw new Error('Release 计划版本无效')
  validateContextShape(plan.context)
  if (!Array.isArray(plan.files) || plan.files.length === 0) throw new Error('Release 计划没有安装文件')

  const assetsDirectory = path.resolve(plan.assetsDirectory)
  if (!fs.existsSync(assetsDirectory) || !fs.lstatSync(assetsDirectory).isDirectory()) {
    throw new Error('Release 附件目录不存在')
  }
  if (!Array.isArray(plan.assetPaths) || plan.assetPaths.length === 0) throw new Error('Release 计划没有附件')

  const assetNames = new Set()
  plan.assetPaths.forEach((assetPath) => {
    const resolvedAssetPath = path.resolve(assetPath)
    if (!isPathInside(assetsDirectory, resolvedAssetPath)) throw new Error('Release 附件路径越界')
    validateRegularFile(resolvedAssetPath, 'Release 附件')
    const name = path.basename(resolvedAssetPath).toLowerCase()
    if (assetNames.has(name)) throw new Error(`Release 附件名称重复：${path.basename(resolvedAssetPath)}`)
    assetNames.add(name)
  })

  const expectedAssetPaths = []
  for (const file of plan.files) {
    const identity = parseArtifactIdentity(file.fileName)
    if (
      !identity ||
      identity.version !== plan.context.packageVersion ||
      identity.edition !== plan.context.edition ||
      identity.target !== file.target ||
      identity.definition.platform !== file.platform ||
      identity.definition.architecture !== file.architecture
    ) {
      throw new Error(`Release 计划中的安装文件身份无效：${file.fileName}`)
    }
    const installerPath = path.join(assetsDirectory, file.fileName)
    const checksumPath = `${installerPath}.sha256`
    const stats = validateRegularFile(installerPath, '安装文件')
    if (stats.size !== file.size) throw new Error(`安装文件大小发生变化：${file.fileName}`)
    const actualSha256 = await calculateSha256(installerPath)
    if (actualSha256 !== file.sha256) throw new Error(`安装文件 SHA-256 发生变化：${file.fileName}`)
    if (fs.readFileSync(checksumPath, 'utf8') !== `${file.sha256}  ${file.fileName}\n`) {
      throw new Error(`安装文件摘要文件无效：${file.fileName}.sha256`)
    }
    expectedAssetPaths.push(installerPath, checksumPath)
  }

  const expectedBuildInfoPath = path.join(assetsDirectory, `RuiYan-release-build-${plan.context.workflowRunId}.json`)
  if (path.resolve(plan.buildInfoPath) !== expectedBuildInfoPath) throw new Error('构建信息文件路径无效')
  validateRegularFile(expectedBuildInfoPath, '构建信息文件')
  let buildInfo
  try {
    buildInfo = JSON.parse(fs.readFileSync(expectedBuildInfoPath, 'utf8'))
  } catch (error) {
    throw new Error('构建信息 JSON 无效')
  }
  if (!isDeepStrictEqual(buildInfo, createReleaseMetadata(plan.context, plan.files))) {
    throw new Error('构建信息 JSON 与 Release 计划不一致')
  }
  expectedAssetPaths.push(expectedBuildInfoPath)

  const actualAssetPaths = plan.assetPaths.map((item) => path.resolve(item)).sort()
  if (!isDeepStrictEqual(actualAssetPaths, expectedAssetPaths.map((item) => path.resolve(item)).sort())) {
    throw new Error('Release 附件列表不完整或包含非预期文件')
  }
  const directoryEntries = fs
    .readdirSync(assetsDirectory)
    .map((name) => path.join(assetsDirectory, name))
    .sort()
  if (!isDeepStrictEqual(directoryEntries, expectedAssetPaths.sort())) {
    throw new Error('Release 附件目录包含非预期文件')
  }

  const notesPath = path.resolve(plan.notesPath)
  validateRegularFile(notesPath, 'Release 说明')
  if (fs.readFileSync(notesPath, 'utf8') !== createReleaseNotes(plan.context, plan.files)) {
    throw new Error('Release 说明与发布计划不一致')
  }
  return { ...plan, assetPaths: actualAssetPaths, buildInfoPath: expectedBuildInfoPath, notesPath }
}

const assertMatchingTagCommit = (tagCommit, gitSha) => {
  const normalizedGitSha = assertSha(gitSha)
  const normalizedTagCommit = tagCommit === null ? null : assertSha(tagCommit, 'Tag 指向的提交')
  if (normalizedTagCommit && normalizedTagCommit !== normalizedGitSha) {
    throw new Error(`Tag 指向的提交 ${normalizedTagCommit} 与本次构建提交 ${normalizedGitSha} 不一致`)
  }
  return normalizedTagCommit
}

const decideReleaseOperation = ({ tagCommit, release, gitSha, assetNames, overwriteReleaseAssets }) => {
  const normalizedTagCommit = assertMatchingTagCommit(tagCommit, gitSha)
  if (release && !normalizedTagCommit) throw new Error('Release 已存在但远端 Tag 不存在，禁止修改')
  if (!Array.isArray(assetNames) || assetNames.length === 0) throw new Error('没有待发布附件')

  const existingNames = new Set((release?.assets || []).map((asset) => asset.name))
  const conflicts = assetNames.filter((name) => existingNames.has(name)).sort()
  if (conflicts.length > 0 && !overwriteReleaseAssets) {
    throw new Error(`以下 Release 附件已存在，未上传任何文件：${conflicts.join(', ')}`)
  }
  if (release) return { kind: 'upload-existing', conflicts, clobber: conflicts.length > 0 }
  if (normalizedTagCommit) return { kind: 'create-existing-tag', conflicts: [], clobber: false }
  return { kind: 'create-new-tag', conflicts: [], clobber: false }
}

const buildCreateReleaseArguments = (plan, tagExists) => {
  const args = ['release', 'create']
  if (tagExists) args.push('--verify-tag')
  else args.push('--target', plan.context.gitSha)
  args.push('--title', plan.context.releaseTitle, '--notes-file', plan.notesPath)
  if (plan.context.releaseDraft) args.push('--draft')
  if (plan.context.releasePrerelease) args.push('--prerelease')
  args.push('--', plan.context.releaseTag, ...plan.assetPaths)
  return args
}

const buildUploadReleaseArguments = (plan, clobber) => {
  const args = ['release', 'upload']
  if (clobber) args.push('--clobber')
  args.push('--', plan.context.releaseTag, ...plan.assetPaths)
  return args
}

const executeGh = (args, { capture = false, allowNotFound = false, cwd = repositoryRoot, env = process.env } = {}) => {
  const result = spawnSync('gh', args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    maxBuffer: 10 * 1024 * 1024,
  })
  if (result.error) throw new Error(`无法执行 GitHub CLI：${result.error.message}`)
  if (result.status !== 0) {
    const diagnostic = `${result.stderr || ''}\n${result.stdout || ''}`
    if (allowNotFound && /HTTP 404/i.test(diagnostic)) return null
    throw new Error(`GitHub CLI 命令失败：${args.slice(0, 2).join(' ')}，退出码 ${result.status}`)
  }
  return capture ? result.stdout : ''
}

const fetchOptionalJson = (endpoint, ghRunner, options) => {
  const output = ghRunner(['api', '--method', 'GET', endpoint], { ...options, capture: true, allowNotFound: true })
  if (output === null) return null
  try {
    return JSON.parse(output)
  } catch (error) {
    throw new Error('GitHub API 返回了无效 JSON')
  }
}

const fetchRequiredJson = (endpoint, ghRunner, options) => {
  const output = ghRunner(['api', '--method', 'GET', endpoint], { ...options, capture: true })
  try {
    return JSON.parse(output)
  } catch (error) {
    throw new Error('GitHub API 返回了无效 JSON')
  }
}

const fetchReleaseWithAssets = (repository, releaseTag, ghRunner, options) => {
  const release = fetchOptionalJson(
    `/repos/${repository}/releases/tags/${encodeURIComponent(releaseTag)}`,
    ghRunner,
    options,
  )
  if (!release) return null
  if (!Number.isSafeInteger(release.id) || release.id <= 0) throw new Error('GitHub Release ID 无效')

  const assets = []
  for (let page = 1; page <= 100; page += 1) {
    const pageAssets = fetchRequiredJson(
      `/repos/${repository}/releases/${release.id}/assets?per_page=100&page=${page}`,
      ghRunner,
      options,
    )
    if (!Array.isArray(pageAssets)) throw new Error('GitHub Release 附件列表无效')
    pageAssets.forEach((asset) => assertSafeText(asset?.name, 'GitHub Release 附件名称'))
    assets.push(...pageAssets)
    if (pageAssets.length < 100) return { ...release, assets }
  }
  throw new Error('GitHub Release 附件数量超过安全检查上限')
}

const resolveRemoteTagCommit = (repository, releaseTag, ghRunner, options) => {
  const encodedTag = encodeURIComponent(releaseTag)
  const reference = fetchOptionalJson(`/repos/${repository}/git/ref/tags/${encodedTag}`, ghRunner, options)
  if (!reference) return null

  let object = reference.object
  for (let depth = 0; depth < 10; depth += 1) {
    if (!object || !shaPattern.test(`${object.sha || ''}`)) throw new Error('远端 Tag 对象无效')
    if (object.type === 'commit') return object.sha.toLowerCase()
    if (object.type !== 'tag') throw new Error(`远端 Tag 指向不支持的对象类型：${object.type}`)
    const tagObject = fetchOptionalJson(`/repos/${repository}/git/tags/${object.sha}`, ghRunner, options)
    if (!tagObject?.object) throw new Error('无法解析附注 Tag 指向的提交')
    object = tagObject.object
  }
  throw new Error('附注 Tag 嵌套层级超过限制')
}

const printAuditSummary = (context, files) => {
  console.log(`Release Tag：${context.releaseTag}`)
  console.log(`应用版本：${context.packageVersion}`)
  console.log(`Git 提交：${context.gitSha}`)
  console.log(`客户端类型：${context.edition}`)
  console.log(`请求目标：${context.requestedTarget}`)
  files.forEach((file) => {
    console.log(`附件：${file.fileName}，大小：${file.size}，SHA-256：${file.sha256}`)
  })
}

const publishRelease = async ({
  planPath,
  env = process.env,
  root = repositoryRoot,
  executeGit = execFileSync,
  ghRunner = executeGh,
} = {}) => {
  if (!env.GH_TOKEN) throw new Error('缺少 GitHub Actions 提供的 GH_TOKEN')
  const plan = await validatePreparedPlan(planPath)
  const currentContext = validateReleaseContext({
    env,
    root,
    executeGit,
    buildTime: plan.context.buildTime,
  })
  if (!isDeepStrictEqual(currentContext, plan.context)) throw new Error('当前发布上下文与已准备的 Release 计划不一致')

  printAuditSummary(plan.context, plan.files)
  const ghOptions = { cwd: root, env }
  const tagCommit = resolveRemoteTagCommit(plan.context.repository, plan.context.releaseTag, ghRunner, ghOptions)
  assertMatchingTagCommit(tagCommit, plan.context.gitSha)
  const release = fetchReleaseWithAssets(plan.context.repository, plan.context.releaseTag, ghRunner, ghOptions)
  const operation = decideReleaseOperation({
    tagCommit,
    release,
    gitSha: plan.context.gitSha,
    assetNames: plan.assetPaths.map((item) => path.basename(item)),
    overwriteReleaseAssets: plan.context.overwriteReleaseAssets,
  })

  if (operation.kind === 'upload-existing') {
    ghRunner(buildUploadReleaseArguments(plan, operation.clobber), ghOptions)
    return operation
  }

  ghRunner(buildCreateReleaseArguments(plan, operation.kind === 'create-existing-tag'), ghOptions)
  return operation
}

module.exports = {
  buildCreateReleaseArguments,
  buildUploadReleaseArguments,
  createReleaseMetadata,
  createReleaseNotes,
  decideReleaseOperation,
  executeGh,
  fetchReleaseWithAssets,
  prepareReleaseAssets,
  printAuditSummary,
  publishRelease,
  resolveReleaseTag,
  resolveRemoteTagCommit,
  validateBuildResults,
  validatePreparedPlan,
  validateReleaseContext,
}
