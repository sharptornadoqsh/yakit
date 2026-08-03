// @vitest-environment node

import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'
import { afterEach, describe, expect, it } from 'vitest'
import * as buildMetadataModule from '../../../packageScript/script/create-renyan-build-metadata'
import packageJson from '../../../package.json'
import productConfig from '../../../product/renyan.json'

const require = createRequire(import.meta.url)
const releaseScriptPath = path.resolve('packageScript/script/publish-renyan-release.js')
const releaseModule = fs.existsSync(releaseScriptPath) ? require(releaseScriptPath) : {}
const temporaryRoots = []

const createTemporaryRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'renyan-release-'))
  temporaryRoots.push(root)
  return root
}

const createContext = (overrides = {}) => ({
  productName: productConfig.displayName,
  packageVersion: packageJson.version,
  releaseTag: `renyan-v${packageJson.version}`,
  releaseTitle: `${productConfig.displayName} ${packageJson.version}`,
  edition: 'community',
  requestedTarget: 'windows-x64',
  successfulTargets: ['windows-x64'],
  includeEngine: true,
  requestedEngineVersion: '',
  signInstallers: false,
  releaseDraft: false,
  releasePrerelease: false,
  overwriteReleaseAssets: false,
  gitBranch: 'qsh',
  gitSha: 'a'.repeat(40),
  repository: 'sharptornadoqsh/yakit',
  workflowName: 'RuiYan Multi-Platform Package',
  workflowRunId: '12345',
  workflowRunAttempt: '2',
  workflowRunUrl: 'https://github.com/sharptornadoqsh/yakit/actions/runs/12345/attempts/2',
  actor: 'release-tester',
  buildTime: '2026-08-03T08:00:00.000Z',
  ...overrides,
})

const createNeeds = (successfulTargets) => {
  const selected = new Set(successfulTargets)
  return Object.fromEntries(
    Object.keys(buildMetadataModule.targetDefinitions).map((target) => [
      `build-${target}`,
      { result: selected.has(target) ? 'success' : 'skipped', outputs: {} },
    ]),
  )
}

const requireFunction = (name) => {
  expect(releaseModule[name], `发布脚本应导出 ${name}`).toBeTypeOf('function')
  return releaseModule[name]
}

afterEach(() => {
  temporaryRoots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }))
})

describe('睿眼 Release Tag', () => {
  it('根据 package.json 版本生成默认 Tag', () => {
    const resolveReleaseTag = requireFunction('resolveReleaseTag')
    if (!resolveReleaseTag) return

    expect(resolveReleaseTag('', packageJson.version)).toBe(`renyan-v${packageJson.version}`)
  })

  it('接受安全的自定义 Tag 并拒绝空白、错误前缀和注入字符', () => {
    const resolveReleaseTag = requireFunction('resolveReleaseTag')
    if (!resolveReleaseTag) return

    expect(resolveReleaseTag('renyan-v2.0.0-rc.1', packageJson.version)).toBe('renyan-v2.0.0-rc.1')
    expect(() => resolveReleaseTag('   ', packageJson.version)).toThrow('空白')
    expect(() => resolveReleaseTag('v2.0.0', packageJson.version)).toThrow('renyan-v')
    expect(() => resolveReleaseTag('renyan-v2.0.0;echo', packageJson.version)).toThrow('字符')
    expect(() => resolveReleaseTag('renyan-v2.0.0\nmain', packageJson.version)).toThrow('字符')
    expect(() => resolveReleaseTag('renyan-v2..0', packageJson.version)).toThrow('Git Tag')
    expect(() => resolveReleaseTag('renyan-v2/0', packageJson.version)).toThrow('字符')
  })
})

describe('睿眼 Release 目标与客户端映射', () => {
  it('复用三种 edition 映射和安装文件命名规则', () => {
    expect(buildMetadataModule.editionLabels).toEqual({
      community: 'Community',
      enterprise: 'Enterprise',
      'enterprise-no-license': 'Enterprise-No-License',
    })
    expect(buildMetadataModule.createArtifactIdentity({ edition: 'community', target: 'macos-x64' }).artifactName).toBe(
      `RuiYan-Pentest-Community-${packageJson.version}-darwin-x64.dmg`,
    )
    expect(
      buildMetadataModule.createArtifactIdentity({ edition: 'enterprise', target: 'linux-x64' }).artifactName,
    ).toBe(`RuiYan-Pentest-Enterprise-${packageJson.version}-linux-x64.AppImage`)
    expect(
      buildMetadataModule.createArtifactIdentity({
        edition: 'enterprise-no-license',
        target: 'windows-x64',
      }).artifactName,
    ).toBe(`RuiYan-Pentest-Enterprise-No-License-${packageJson.version}-windows-x64.exe`)
  })

  it('把单目标、macos-both 和 all 展开为精确的构建目标', () => {
    expect(buildMetadataModule.resolveRequestedTargets).toBeTypeOf('function')
    if (!buildMetadataModule.resolveRequestedTargets) return

    expect(buildMetadataModule.resolveRequestedTargets('windows-x64')).toEqual(['windows-x64'])
    expect(buildMetadataModule.resolveRequestedTargets('macos-both')).toEqual(['macos-x64', 'macos-arm64'])
    expect(buildMetadataModule.resolveRequestedTargets('all')).toEqual([
      'macos-x64',
      'macos-arm64',
      'windows-x64',
      'linux-x64',
      'linux-arm64',
    ])
    expect(() => buildMetadataModule.resolveRequestedTargets('unknown')).toThrow('不支持的构建目标')
  })

  it('只接受本次请求中全部成功且未异常跳过的构建 Job', () => {
    const validateBuildResults = requireFunction('validateBuildResults')
    if (!validateBuildResults) return

    expect(
      validateBuildResults({
        requestedTarget: 'macos-both',
        needs: createNeeds(['macos-x64', 'macos-arm64']),
      }),
    ).toEqual(['macos-x64', 'macos-arm64'])

    const failedNeeds = createNeeds(['macos-x64'])
    failedNeeds['build-macos-arm64'].result = 'failure'
    expect(() => validateBuildResults({ requestedTarget: 'macos-both', needs: failedNeeds })).toThrow(
      'build-macos-arm64=failure',
    )

    const cancelledNeeds = createNeeds(['windows-x64'])
    cancelledNeeds['build-windows-x64'].result = 'cancelled'
    expect(() => validateBuildResults({ requestedTarget: 'windows-x64', needs: cancelledNeeds })).toThrow(
      'build-windows-x64=cancelled',
    )

    expect(() => validateBuildResults({ requestedTarget: 'windows-x64', needs: createNeeds([]) })).toThrow('没有成功')
  })
})

describe('睿眼 Release 工作流上下文', () => {
  it('只接受 qsh 的本次检出提交并安全写入 GITHUB_OUTPUT', () => {
    const validateReleaseContext = requireFunction('validateReleaseContext')
    const writeContextOutputs = requireFunction('writeContextOutputs')
    if (!validateReleaseContext || !writeContextOutputs) return

    const gitSha = 'a'.repeat(40)
    const env = {
      GITHUB_REF_NAME: 'qsh',
      GITHUB_SHA: gitSha,
      GITHUB_REPOSITORY: 'sharptornadoqsh/yakit',
      GITHUB_RUN_ID: '12345',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_WORKFLOW: 'RuiYan Multi-Platform Package',
      GITHUB_ACTOR: 'release-tester',
      REQUESTED_TARGET: 'windows-x64',
      PACKAGE_EDITION: 'enterprise-no-license',
      INCLUDE_ENGINE: 'true',
      REQUESTED_ENGINE_VERSION: '',
      SIGN_INSTALLERS: 'false',
      RELEASE_DRAFT: 'false',
      RELEASE_PRERELEASE: 'false',
      OVERWRITE_RELEASE_ASSETS: 'false',
      RELEASE_TAG_INPUT: '',
      BUILD_RESULTS_JSON: JSON.stringify(createNeeds(['windows-x64'])),
    }
    const context = validateReleaseContext({
      env,
      executeGit: () => `${gitSha}\n`,
      buildTime: '2026-08-03T08:00:00.000Z',
    })

    expect(context).toMatchObject({
      releaseTag: `renyan-v${packageJson.version}`,
      releaseTitle: `${productConfig.displayName} ${packageJson.version}`,
      edition: 'enterprise-no-license',
      requestedTarget: 'windows-x64',
      successfulTargets: ['windows-x64'],
      releasePrerelease: false,
      gitBranch: 'qsh',
      gitSha,
    })

    const outputPath = path.join(createTemporaryRoot(), 'github-output.txt')
    writeContextOutputs(context, outputPath)
    expect(fs.readFileSync(outputPath, 'utf8')).toBe(
      `release_tag=renyan-v${packageJson.version}\n` +
        `release_title=${productConfig.displayName} ${packageJson.version}\n` +
        `package_version=${packageJson.version}\n`,
    )
    expect(() => buildMetadataModule.writeWorkflowValue(outputPath, 'unsafe', 'value\nnext=value')).toThrow('换行')
    expect(() => validateReleaseContext({ env: { ...env, GITHUB_REF_NAME: 'master' } })).toThrow('qsh')
    expect(() => validateReleaseContext({ env, executeGit: () => `${'b'.repeat(40)}\n` })).toThrow('与工作流提交')
  })
})

describe('睿眼 Release 附件准备', () => {
  it('生成逐文件 SHA-256、运行专属构建信息 JSON 和 Release 说明', async () => {
    const prepareReleaseAssets = requireFunction('prepareReleaseAssets')
    if (!prepareReleaseAssets) return

    const root = createTemporaryRoot()
    const downloadedDirectory = path.join(root, 'downloaded-artifacts')
    const assetsDirectory = path.join(root, 'release-assets')
    const workDirectory = path.join(root, 'release-work')
    const identity = buildMetadataModule.createArtifactIdentity({ edition: 'community', target: 'windows-x64' })
    fs.mkdirSync(downloadedDirectory, { recursive: true })
    fs.writeFileSync(path.join(downloadedDirectory, identity.artifactName), 'installer-content')

    const result = await prepareReleaseAssets({
      context: createContext(),
      downloadedDirectory,
      assetsDirectory,
      workDirectory,
    })

    const expectedSha256 = '2672993d8bb0a8de53807c2f0b7d75fad9e668a984c39d0b766b4c3d9b28b756'
    const checksumName = `${identity.artifactName}.sha256`
    const buildInfoName = 'RuiYan-release-build-12345.json'
    expect(result.assetPaths.map((item) => path.basename(item)).sort()).toEqual(
      [identity.artifactName, checksumName, buildInfoName].sort(),
    )
    expect(fs.readFileSync(path.join(assetsDirectory, checksumName), 'utf8')).toBe(
      `${expectedSha256}  ${identity.artifactName}\n`,
    )

    const buildInfo = JSON.parse(fs.readFileSync(path.join(assetsDirectory, buildInfoName), 'utf8'))
    expect(buildInfo).toMatchObject({
      productName: productConfig.displayName,
      packageVersion: packageJson.version,
      releaseTag: `renyan-v${packageJson.version}`,
      edition: 'community',
      requestedTarget: 'windows-x64',
      includeEngine: true,
      requestedEngineVersion: '',
      signInstallers: false,
      gitBranch: 'qsh',
      gitSha: 'a'.repeat(40),
      repository: 'sharptornadoqsh/yakit',
      workflowName: 'RuiYan Multi-Platform Package',
      workflowRunId: '12345',
      workflowRunAttempt: '2',
      workflowRunUrl: 'https://github.com/sharptornadoqsh/yakit/actions/runs/12345/attempts/2',
      actor: 'release-tester',
      buildTime: '2026-08-03T08:00:00.000Z',
    })
    expect(buildInfo.files).toEqual([
      {
        fileName: identity.artifactName,
        size: 17,
        sha256: expectedSha256,
        target: 'windows-x64',
        platform: 'windows',
        architecture: 'x64',
      },
    ])
    expect(fs.readFileSync(result.notesPath, 'utf8')).toContain('使用兼容清单推荐版本')
    expect(fs.readFileSync(result.notesPath, 'utf8')).toContain(identity.artifactName)
    expect(fs.readFileSync(result.planPath, 'utf8')).not.toContain('GH_TOKEN')
  })

  it.each([
    ['版本不一致', 'RuiYan-Pentest-Community-9.9.9-windows-x64.exe'],
    ['客户端类型不一致', `RuiYan-Pentest-Enterprise-${packageJson.version}-windows-x64.exe`],
    ['平台或架构不一致', `RuiYan-Pentest-Community-${packageJson.version}-linux-x64.AppImage`],
  ])('拒绝%s的安装文件', async (message, fileName) => {
    const prepareReleaseAssets = requireFunction('prepareReleaseAssets')
    if (!prepareReleaseAssets) return

    const root = createTemporaryRoot()
    const downloadedDirectory = path.join(root, 'downloaded-artifacts')
    fs.mkdirSync(downloadedDirectory, { recursive: true })
    fs.writeFileSync(path.join(downloadedDirectory, fileName), 'installer')

    await expect(
      prepareReleaseAssets({
        context: createContext(),
        downloadedDirectory,
        assetsDirectory: path.join(root, 'release-assets'),
        workDirectory: path.join(root, 'release-work'),
      }),
    ).rejects.toThrow(message)
  })

  it('拒绝空目录、非预期文件、重复文件和空安装文件', async () => {
    const prepareReleaseAssets = requireFunction('prepareReleaseAssets')
    if (!prepareReleaseAssets) return

    const identity = buildMetadataModule.createArtifactIdentity({ edition: 'community', target: 'windows-x64' })
    const runPrepare = async (populate) => {
      const root = createTemporaryRoot()
      const downloadedDirectory = path.join(root, 'downloaded-artifacts')
      fs.mkdirSync(downloadedDirectory, { recursive: true })
      populate(downloadedDirectory)
      return prepareReleaseAssets({
        context: createContext(),
        downloadedDirectory,
        assetsDirectory: path.join(root, 'release-assets'),
        workDirectory: path.join(root, 'release-work'),
      })
    }

    await expect(runPrepare(() => {})).rejects.toThrow('没有安装文件')
    await expect(runPrepare((directory) => fs.writeFileSync(path.join(directory, 'build.log'), 'log'))).rejects.toThrow(
      '非预期安装文件',
    )
    await expect(
      runPrepare((directory) => {
        fs.mkdirSync(path.join(directory, 'one'))
        fs.mkdirSync(path.join(directory, 'two'))
        fs.writeFileSync(path.join(directory, 'one', identity.artifactName), 'one')
        fs.writeFileSync(path.join(directory, 'two', identity.artifactName), 'two')
      }),
    ).rejects.toThrow('重复')
    await expect(
      runPrepare((directory) => fs.writeFileSync(path.join(directory, identity.artifactName), '')),
    ).rejects.toThrow('为空')
  })
})

describe('睿眼 Release 远端决策', () => {
  const assetNames = ['installer.exe', 'installer.exe.sha256', 'RuiYan-release-build-12345.json']

  it('分页读取已有 Release 的全部附件后再检查冲突', () => {
    const fetchReleaseWithAssets = requireFunction('fetchReleaseWithAssets')
    if (!fetchReleaseWithAssets) return

    const firstPage = Array.from({ length: 100 }, (_, index) => ({ name: `existing-${index}.dmg` }))
    const calls = []
    const release = fetchReleaseWithAssets(
      'sharptornadoqsh/yakit',
      `renyan-v${packageJson.version}`,
      (args) => {
        calls.push(args)
        if (calls.length === 1) return JSON.stringify({ id: 9876, assets: [] })
        if (calls.length === 2) return JSON.stringify(firstPage)
        return JSON.stringify([{ name: 'installer.exe' }])
      },
      {},
    )

    expect(release.assets).toHaveLength(101)
    expect(release.assets.at(-1).name).toBe('installer.exe')
    expect(calls[1]).toContain('/repos/sharptornadoqsh/yakit/releases/9876/assets?per_page=100&page=1')
    expect(calls[2]).toContain('/repos/sharptornadoqsh/yakit/releases/9876/assets?per_page=100&page=2')
  })

  it('把轻量 Tag 和附注 Tag 都解析为实际提交', () => {
    const resolveRemoteTagCommit = requireFunction('resolveRemoteTagCommit')
    if (!resolveRemoteTagCommit) return

    const gitSha = 'a'.repeat(40)
    expect(
      resolveRemoteTagCommit(
        'sharptornadoqsh/yakit',
        `renyan-v${packageJson.version}`,
        (args) => JSON.stringify({ object: { type: 'commit', sha: gitSha } }),
        {},
      ),
    ).toBe(gitSha)

    const tagObjectSha = 'b'.repeat(40)
    const calls = []
    expect(
      resolveRemoteTagCommit(
        'sharptornadoqsh/yakit',
        `renyan-v${packageJson.version}`,
        (args) => {
          calls.push(args)
          return JSON.stringify(
            calls.length === 1
              ? { object: { type: 'tag', sha: tagObjectSha } }
              : { object: { type: 'commit', sha: gitSha } },
          )
        },
        {},
      ),
    ).toBe(gitSha)
    expect(calls[1]).toContain(`/repos/sharptornadoqsh/yakit/git/tags/${tagObjectSha}`)
  })

  it('拒绝 Tag 异提交和已有附件冲突，并允许新增附件或精确覆盖', () => {
    const decideReleaseOperation = requireFunction('decideReleaseOperation')
    if (!decideReleaseOperation) return

    expect(() =>
      decideReleaseOperation({
        tagCommit: 'b'.repeat(40),
        release: null,
        gitSha: 'a'.repeat(40),
        assetNames,
        overwriteReleaseAssets: false,
      }),
    ).toThrow('Tag 指向的提交')

    const release = { assets: [{ name: 'installer.exe' }, { name: 'existing.dmg' }] }
    expect(() =>
      decideReleaseOperation({
        tagCommit: 'a'.repeat(40),
        release,
        gitSha: 'a'.repeat(40),
        assetNames,
        overwriteReleaseAssets: false,
      }),
    ).toThrow('installer.exe')
    expect(
      decideReleaseOperation({
        tagCommit: 'a'.repeat(40),
        release: { assets: [{ name: 'existing.dmg' }] },
        gitSha: 'a'.repeat(40),
        assetNames,
        overwriteReleaseAssets: false,
      }),
    ).toEqual({ kind: 'upload-existing', conflicts: [], clobber: false })
    expect(
      decideReleaseOperation({
        tagCommit: 'a'.repeat(40),
        release,
        gitSha: 'a'.repeat(40),
        assetNames,
        overwriteReleaseAssets: true,
      }),
    ).toEqual({ kind: 'upload-existing', conflicts: ['installer.exe'], clobber: true })
  })

  it('区分新 Tag、已有 Tag 无 Release 与已有 Release 的发布命令', () => {
    const decideReleaseOperation = requireFunction('decideReleaseOperation')
    const buildCreateReleaseArguments = requireFunction('buildCreateReleaseArguments')
    const buildUploadReleaseArguments = requireFunction('buildUploadReleaseArguments')
    if (!decideReleaseOperation || !buildCreateReleaseArguments || !buildUploadReleaseArguments) return

    expect(
      decideReleaseOperation({
        tagCommit: null,
        release: null,
        gitSha: 'a'.repeat(40),
        assetNames,
        overwriteReleaseAssets: false,
      }).kind,
    ).toBe('create-new-tag')
    expect(
      decideReleaseOperation({
        tagCommit: 'a'.repeat(40),
        release: null,
        gitSha: 'a'.repeat(40),
        assetNames,
        overwriteReleaseAssets: false,
      }).kind,
    ).toBe('create-existing-tag')

    const plan = {
      context: createContext({ releaseDraft: true, releasePrerelease: true }),
      notesPath: '/workspace/release-work/release-notes.md',
      assetPaths: ['/workspace/release-assets/installer.exe'],
    }
    expect(buildCreateReleaseArguments(plan, false)).toEqual([
      'release',
      'create',
      '--target',
      'a'.repeat(40),
      '--title',
      `${productConfig.displayName} ${packageJson.version}`,
      '--notes-file',
      '/workspace/release-work/release-notes.md',
      '--draft',
      '--prerelease',
      '--',
      `renyan-v${packageJson.version}`,
      '/workspace/release-assets/installer.exe',
    ])
    expect(buildUploadReleaseArguments(plan, true)).toEqual([
      'release',
      'upload',
      '--clobber',
      '--',
      `renyan-v${packageJson.version}`,
      '/workspace/release-assets/installer.exe',
    ])
    expect(buildCreateReleaseArguments(plan, true)).toEqual([
      'release',
      'create',
      '--verify-tag',
      '--title',
      `${productConfig.displayName} ${packageJson.version}`,
      '--notes-file',
      '/workspace/release-work/release-notes.md',
      '--draft',
      '--prerelease',
      '--',
      `renyan-v${packageJson.version}`,
      '/workspace/release-assets/installer.exe',
    ])
    expect(buildUploadReleaseArguments(plan, false)).not.toContain('--clobber')
    expect(buildUploadReleaseArguments(plan, false)).not.toContain('--title')
    expect(buildUploadReleaseArguments(plan, false)).not.toContain('--notes-file')
  })
})
