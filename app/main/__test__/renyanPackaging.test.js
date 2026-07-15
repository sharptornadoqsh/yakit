import fs from 'fs'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import beforePack from '../../../packageScript/buildHook/before-pack'
import { createArtifactIdentity, createBuildMetadata } from '../../../packageScript/script/create-renyan-build-metadata'
import {
  archiveEngine,
  calculateSha256 as calculateEngineSha256,
  getEnginePaths,
  parseSha256,
  resolveEngineVersion,
} from '../../../packageScript/script/prepare-renyan-engine'
import packageJson from '../../../package.json'

const originalEnvironment = { ...process.env }

afterEach(() => {
  Object.keys(process.env).forEach((key) => {
    if (!(key in originalEnvironment)) delete process.env[key]
  })
  Object.assign(process.env, originalEnvironment)
})

describe('睿眼多平台安装文件工作流', () => {
  it('只公开目标任务所需的六项输入和四个原生任务', () => {
    const source = fs.readFileSync(path.resolve('.github/workflows/multi-platform-build.yml'), 'utf8')
    const workflow = parseYaml(source)

    expect(workflow.name).toBe('RuiYan Multi-Platform Package')
    expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual([
      'target',
      'edition',
      'include_engine',
      'engine_version',
      'sign_installers',
      'retention_days',
    ])
    expect([...new Set([...source.matchAll(/inputs\.([a-z_]+)/g)].map((match) => match[1]))].sort()).toEqual(
      ['target', 'edition', 'include_engine', 'engine_version', 'sign_installers', 'retention_days'].sort(),
    )
    expect(Object.keys(workflow.jobs)).toEqual([
      'build-macos-x64',
      'build-macos-arm64',
      'build-windows-x64',
      'build-linux-x64',
    ])
    expect(workflow.jobs['build-macos-x64']['runs-on']).toBe('macos-15-intel')
    expect(workflow.jobs['build-macos-arm64']['runs-on']).toBe('macos-15')
    expect(workflow.jobs['build-windows-x64']['runs-on']).toBe('windows-2022')
    expect(workflow.jobs['build-linux-x64']['runs-on']).toBe('ubuntu-22.04')
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.on.workflow_dispatch.inputs.target).toMatchObject({
      default: 'macos-both',
      options: ['macos-x64', 'macos-arm64', 'macos-both', 'windows-x64', 'linux-x64', 'all'],
    })
    expect(workflow.on.workflow_dispatch.inputs.edition).toMatchObject({
      default: 'community',
      options: ['community', 'enterprise'],
    })
    expect(workflow.jobs['build-macos-x64'].if).toContain("inputs.target == 'macos-both'")
    expect(workflow.jobs['build-macos-arm64'].if).toContain("inputs.target == 'macos-both'")
    expect(workflow.jobs['build-windows-x64'].if).not.toContain('macos-both')
    expect(workflow.jobs['build-linux-x64'].if).not.toContain('macos-both')

    Object.values(workflow.jobs).forEach((job) => {
      const setupNode = job.steps.find((step) => step.uses === 'actions/setup-node@v4')
      const uploadArtifact = job.steps.find((step) => step.uses === 'actions/upload-artifact@v4')
      expect(job.steps.some((step) => step.uses === 'actions/checkout@v4')).toBe(true)
      expect(setupNode.with['node-version']).toBe('22.12.0')
      expect(setupNode.with['cache-dependency-path']).toContain('app/renderer/src/main/yarn.lock')
      expect(setupNode.with['cache-dependency-path']).toContain('app/renderer/engine-link-startup/yarn.lock')
      expect(uploadArtifact.with['if-no-files-found']).toBe('error')
      expect(uploadArtifact.with['retention-days']).toBe('${{ inputs.retention_days }}')

      job.steps
        .filter((step) => JSON.stringify(step).includes('${{ secrets.'))
        .forEach((step) => expect(step.if).toContain('inputs.sign_installers'))
    })

    expect(source).toContain('yarn build-renders-enterprise')
    expect(source).not.toMatch(/build-renders-enterprise-/)
    expect(source).not.toContain('skipEnterpriseLicense')
    expect(source).not.toContain('build-renders-simple-enterprise')
    expect(source).not.toContain('build-renders-irify')
    expect(source).not.toContain('build-renders-memfit')
    expect(source).not.toContain('yarn add')
    expect(source).not.toContain('http://')
    expect(source).not.toContain('git push')
    expect(source).not.toContain('gh release')
  })

  it('固定签名工具版本并提供全部睿眼打包命令', () => {
    const signingAction = fs.readFileSync(path.resolve('.github/actions/sign-windows/action.yml'), 'utf8')
    const packageEnvironments = JSON.parse(fs.readFileSync(path.resolve('packageScript/.env-cmdrc'), 'utf8'))
    expect(signingAction).toContain('dotnet tool install --global AzureSignTool --version 7.0.1')
    expect(packageEnvironments.renyanCommunityUnsigned).toEqual({
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      RENYAN_PACKAGE_EDITION: 'community',
    })
    expect(packageEnvironments.renyanEnterpriseUnsigned).toEqual({
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      RENYAN_PACKAGE_EDITION: 'enterprise',
      PLATFORM: 'yakitEE',
    })
    expect(packageEnvironments.renyanEnterpriseSigned).not.toHaveProperty('REACT_APP_REQUIRE_ENTERPRISE_LICENSE')

    const requiredScripts = [
      'pack-renyan-mac-x64-unsigned',
      'pack-renyan-mac-arm64-unsigned',
      'pack-renyan-win-x64-unsigned',
      'pack-renyan-linux-x64-unsigned',
      'pack-renyan-mac-x64-enterprise-unsigned',
      'pack-renyan-mac-arm64-enterprise-unsigned',
      'pack-renyan-win-x64-enterprise-unsigned',
      'pack-renyan-linux-x64-enterprise-unsigned',
      'pack-renyan-mac-x64-signed',
      'pack-renyan-mac-arm64-signed',
      'pack-renyan-mac-x64-enterprise-signed',
      'pack-renyan-mac-arm64-enterprise-signed',
    ]
    requiredScripts.forEach((name) => {
      expect(packageJson.scripts[name]).toBeTypeOf('string')
      expect(packageJson.scripts[name]).toContain('--publish never')
    })
  })
})

describe('睿眼预置引擎准备', () => {
  it('从兼容清单读取推荐版本并拒绝不安全版本', () => {
    expect(resolveEngineVersion('')).toBe('1.4.8-beta3')
    expect(resolveEngineVersion('1.4.8_beta3')).toBe('1.4.8_beta3')
    expect(() => resolveEngineVersion('latest')).toThrow('无法从兼容清单确定有效的引擎版本')
    expect(() => resolveEngineVersion('1.0;echo')).toThrow('引擎版本只能包含')
  })

  it('只接受唯一摘要并保持引擎内部文件名', () => {
    const sha256 = 'a'.repeat(64)
    expect(parseSha256(`${sha256}  yak_linux_amd64`)).toBe(sha256)
    expect(() => parseSha256(`${sha256}\n${'b'.repeat(64)}`)).toThrow('必须包含唯一')

    const windowsPaths = getEnginePaths('yak_windows_amd64.exe', 'C:\\workspace')
    expect(windowsPaths.rawPath).toContain('yak_windows_amd64.exe')
    expect(windowsPaths.archivePath).toContain('yak_windows_amd64.zip')
    expect(() => getEnginePaths('yak_linux_arm64')).toThrow('不支持的引擎工件')
  })

  it('归档已校验引擎并生成可复验记录', async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'renyan-engine-package-'))
    try {
      const paths = getEnginePaths('yak_linux_amd64', temporaryRoot)
      fs.mkdirSync(path.dirname(paths.rawPath), { recursive: true })
      fs.writeFileSync(paths.rawPath, 'engine')
      const upstreamSha256 = await calculateEngineSha256(paths.rawPath)
      fs.writeFileSync(paths.sidecarPath, `${upstreamSha256}\n`)

      const result = await archiveEngine({
        asset: 'yak_linux_amd64',
        engineVersion: '1.4.8-beta3',
        root: temporaryRoot,
      })

      expect(fs.existsSync(paths.rawPath)).toBe(false)
      expect(fs.existsSync(paths.archivePath)).toBe(true)
      expect(new AdmZip(paths.archivePath).getEntries().map((entry) => entry.entryName)).toEqual([
        'bins/yak_linux_amd64',
      ])
      expect(result.verification).toMatchObject({
        engineVersion: '1.4.8-beta3',
        asset: 'yak_linux_amd64',
        platform: 'linux',
        architecture: 'x64',
        upstreamEngineSha256: upstreamSha256,
        packagedEngineSha256: upstreamSha256,
      })
      expect(result.verification.archiveSha256).toBe(await calculateEngineSha256(paths.archivePath))
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })
})

describe('睿眼安装文件元数据', () => {
  it('生成类别化文件名、构建清单和非空摘要', async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'renyan-package-'))
    try {
      fs.mkdirSync(path.join(temporaryRoot, 'release'), { recursive: true })
      const identity = createArtifactIdentity({ edition: 'enterprise', target: 'windows-x64' })
      fs.writeFileSync(path.join(temporaryRoot, 'release', identity.artifactName), 'installer')

      const result = await createBuildMetadata({
        edition: 'enterprise',
        target: 'windows-x64',
        signed: true,
        includeEngine: false,
        root: temporaryRoot,
        env: {
          GITHUB_REF_NAME: 'qsh',
          GITHUB_SHA: 'a'.repeat(40),
          GITHUB_RUN_ID: '1234',
        },
        buildTime: '2026-07-15T00:00:00.000Z',
      })

      expect(identity.artifactName).toBe(`RuiYan-Pentest-Enterprise-${packageJson.version}-windows-x64.exe`)
      expect(result.artifactContainer).toBe('RuiYan-Enterprise-Windows-x64-signed')
      expect(result.manifest).toMatchObject({
        edition: 'enterprise',
        gitBranch: 'qsh',
        target: 'windows-x64',
        platform: 'windows',
        architecture: 'x64',
        signed: true,
        includeEngine: false,
        engineVersion: null,
      })
      expect(fs.readFileSync(result.checksumPath, 'utf8')).toMatch(
        /^[0-9a-f]{64}  RuiYan-Pentest-Enterprise-.+-windows-x64\.exe\n$/,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('无引擎打包不会读取预置工件', async () => {
    process.env.INCLUDE_ENGINE = 'false'
    process.env.RENYAN_PACKAGE_EDITION = 'community'
    const context = {
      arch: 1,
      electronPlatformName: 'darwin',
      packager: {
        appInfo: { version: packageJson.version },
        config: { mac: {} },
      },
    }

    await beforePack(context)

    expect(context.packager.config.mac.artifactName).toBe(
      `RuiYan-Pentest-Community-${packageJson.version}-darwin-x64.${'${ext}'}`,
    )
    expect(context.packager.config.mac.extraFiles).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ to: 'bins/yak.zip' })]),
    )
  })
})
