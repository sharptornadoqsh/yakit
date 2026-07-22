// @vitest-environment node

import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import electronBuilderConfig from '../../../packageScript/electron-builder.config'
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
  it('只公开目标任务所需的六项输入和五个原生任务', () => {
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
      'build-linux-arm64',
    ])
    expect(workflow.jobs['build-macos-x64']['runs-on']).toBe('macos-15-intel')
    expect(workflow.jobs['build-macos-arm64']['runs-on']).toBe('macos-15')
    expect(workflow.jobs['build-windows-x64']['runs-on']).toBe('windows-2022')
    expect(workflow.jobs['build-linux-x64']['runs-on']).toBe('ubuntu-22.04')
    expect(workflow.jobs['build-linux-arm64']['runs-on']).toBe('ubuntu-22.04-arm')
    expect(workflow.jobs['build-macos-x64'].env.RENYAN_PACKAGE_ARCHITECTURE).toBe('x64')
    expect(workflow.jobs['build-macos-arm64'].env.RENYAN_PACKAGE_ARCHITECTURE).toBe('arm64')
    expect(workflow.jobs['build-windows-x64'].env.RENYAN_PACKAGE_ARCHITECTURE).toBe('x64')
    expect(workflow.jobs['build-linux-x64'].env.RENYAN_PACKAGE_ARCHITECTURE).toBe('x64')
    expect(workflow.jobs['build-linux-arm64'].env.RENYAN_PACKAGE_ARCHITECTURE).toBe('arm64')
    const extensionArchivePath = path.resolve('bins/scripts/google-chrome-plugin.zip')
    const extensionArchiveSha256 = crypto
      .createHash('sha256')
      .update(fs.readFileSync(extensionArchivePath))
      .digest('hex')
    expect(workflow.env).not.toHaveProperty('RUIYAN_CHROME_EXTENSION_URL')
    expect(workflow.env.RUIYAN_CHROME_EXTENSION_SHA256).toBe(extensionArchiveSha256)
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.on.workflow_dispatch.inputs.target).toMatchObject({
      default: 'macos-both',
      options: ['macos-x64', 'macos-arm64', 'macos-both', 'windows-x64', 'linux-x64', 'linux-arm64', 'all'],
    })
    expect(workflow.on.workflow_dispatch.inputs.edition).toMatchObject({
      default: 'community',
      options: ['community', 'enterprise', 'enterprise-no-license'],
    })
    expect(workflow.on.workflow_dispatch.inputs.include_engine).toMatchObject({
      type: 'boolean',
      default: false,
    })
    expect(workflow.on.workflow_dispatch.inputs.sign_installers).toMatchObject({
      type: 'boolean',
      default: false,
    })
    expect(workflow.jobs['build-macos-x64'].if).toContain("inputs.target == 'macos-both'")
    expect(workflow.jobs['build-macos-arm64'].if).toContain("inputs.target == 'macos-both'")
    expect(workflow.jobs['build-windows-x64'].if).not.toContain('macos-both')
    expect(workflow.jobs['build-linux-x64'].if).not.toContain('macos-both')
    expect(workflow.jobs['build-linux-arm64'].if).not.toContain('macos-both')

    const linuxArm64Job = JSON.stringify(workflow.jobs['build-linux-arm64'])
    expect(linuxArm64Job).toContain('yak_linux_arm64')
    expect(linuxArm64Job).toContain('pack-renyan-linux-arm64-unsigned')
    expect(linuxArm64Job).toContain('pack-renyan-linux-arm64-enterprise-unsigned')
    expect(linuxArm64Job).toContain('pack-renyan-linux-arm64-enterprise-no-license-unsigned')
    expect(linuxArm64Job).toContain('PACKAGE_TARGET":"linux-arm64')

    Object.values(workflow.jobs).forEach((job) => {
      const setupNode = job.steps.find((step) => step.uses === 'actions/setup-node@v6')
      const uploadArtifact = job.steps.find((step) => step.uses === 'actions/upload-artifact@v7')
      const verifyChromeExtension = job.steps.find((step) => step.name === '校验仓库内置浏览器扩展')
      expect(job.steps.some((step) => step.uses === 'actions/checkout@v7')).toBe(true)
      expect(setupNode.with['node-version']).toBe('22.12.0')
      expect(setupNode.with['cache-dependency-path']).toContain('app/renderer/src/main/yarn.lock')
      expect(setupNode.with['cache-dependency-path']).toContain('app/renderer/engine-link-startup/yarn.lock')
      expect(uploadArtifact.with['if-no-files-found']).toBe('error')
      expect(uploadArtifact.with['retention-days']).toBe('${{ inputs.retention_days }}')
      expect(uploadArtifact.with.path).toBe('${{ steps.metadata.outputs.artifact_path }}')
      expect(uploadArtifact.with.archive).toBe(false)
      expect(uploadArtifact.with).not.toHaveProperty('name')
      expect(verifyChromeExtension.run).toContain('bins/scripts/google-chrome-plugin.zip')
      expect(verifyChromeExtension.run).toContain('RUIYAN_CHROME_EXTENSION_SHA256')
      expect(verifyChromeExtension.run).not.toContain('curl')
      expect(verifyChromeExtension.run).not.toContain('RUIYAN_CHROME_EXTENSION_URL')

      job.steps
        .filter((step) => JSON.stringify(step).includes('${{ secrets.'))
        .forEach((step) => expect(step.if).toContain('inputs.sign_installers'))
    })

    expect(source.match(/^\s+yarn build-renders-enterprise$/gm)).toHaveLength(5)
    expect(source.match(/^\s+yarn build-renders-enterprise-no-license$/gm)).toHaveLength(5)
    expect(source).not.toContain('skipEnterpriseLicense')
    expect(source).not.toContain('build-renders-simple-enterprise')
    expect(source).not.toContain('build-renders-irify')
    expect(source).not.toContain('build-renders-memfit')
    expect(source).not.toContain('yarn add')
    expect(source).not.toContain('http://')
    expect(source).not.toContain('yakit-chrome-extension')
    expect(source).not.toContain('git push')
    expect(source).not.toContain('gh release')
  })

  it('仓库内置浏览器扩展仅包含睿眼可见身份', () => {
    const archivePath = path.resolve('bins/scripts/google-chrome-plugin.zip')
    const archive = new AdmZip(fs.readFileSync(archivePath))
    const entries = archive.getEntries()
    const entryNames = entries.map((entry) => entry.entryName)
    const entryByName = new Map(entries.map((entry) => [entry.entryName, entry]))
    const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ruiyan-extension-test-'))
    const extractedPath = (entryName) => path.join(extractRoot, ...entryName.split('/'))

    try {
      archive.extractAllTo(extractRoot, true)
      const readEntry = (entryName) => fs.readFileSync(extractedPath(entryName), 'utf8')

      expect(entryNames).toEqual([...entryNames].sort())
      expect(entryNames.join('\n')).not.toMatch(/yakit/i)
      expect(entryByName.has('images/ruiyan-logo.png')).toBe(true)
      expect(entryByName.has('images/ruiyan-icon.svg')).toBe(true)
      expect(entryByName.has('images/yakitlogo.png')).toBe(false)
      expect(entryByName.has('images/yak.svg')).toBe(false)

      const manifest = JSON.parse(readEntry('manifest.json'))
      expect(manifest.name).toBe('RuiYan Chrome Endpoint')
      expect(manifest.description).toBe('Browser endpoint for RuiYan MITM and proxy workflows')
      expect(manifest.web_accessible_resources.flatMap((item) => item.resources)).toContain('images/ruiyan-icon.svg')
      expect(readEntry('index.html')).toContain('<title>RuiYan Proxy</title>')
      expect(readEntry('sidepanel.html')).toContain('<title>RuiYan Proxy</title>')
      expect(readEntry('proxy/options.html')).toContain('<title>RuiYan 代理设置</title>')
      expect(readEntry('proxy.js')).toContain('RuiYan MITM')
      expect(readEntry('proxy.js')).not.toContain('Yakit MITM')

      const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt'])
      const textPayload = entries
        .filter((entry) => !entry.isDirectory && textExtensions.has(path.extname(entry.entryName)))
        .map((entry) => readEntry(entry.entryName))
        .join('\n')
      const legacyTokens = [...new Set(textPayload.match(/yakit[\w-]*/gi) || [])].sort()
      expect(legacyTokens).toEqual(['yakit_badge', 'yakit_inject_script', 'yakit_to_extension_page'])
      expect(textPayload).not.toMatch(
        /#f28b44|#f4a061|#e87633|#fff5eb|#fff7e6|#ff6b00|#ffd591|rgba\(242,\s*139,\s*68|rgba\(255,\s*107,\s*0/i,
      )

      const expectedAssets = [
        ['images/icon16.png', 'product/brand/icons/16x16.png'],
        ['images/icon48.png', 'product/brand/icons/48x48.png'],
        ['images/icon128.png', 'product/brand/icons/128x128.png'],
        ['images/ruiyan-logo.png', 'product/brand/renyan-logo-light.png'],
        ['images/ruiyan-icon.svg', 'product/brand/renyan-icon.svg'],
      ]
      expectedAssets.forEach(([entryName, sourcePath]) => {
        expect(fs.readFileSync(extractedPath(entryName)).equals(fs.readFileSync(path.resolve(sourcePath)))).toBe(true)
      })
    } finally {
      fs.rmSync(extractRoot, { recursive: true, force: true })
    }
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
    expect(packageEnvironments.renyanEnterpriseNoLicenseUnsigned).toEqual({
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      RENYAN_PACKAGE_EDITION: 'enterprise-no-license',
      PLATFORM: 'yakitEE',
      REACT_APP_REQUIRE_ENTERPRISE_LICENSE: 'false',
    })
    expect(packageEnvironments.renyanEnterpriseNoLicenseSigned).toEqual({
      CSC_IDENTITY_AUTO_DISCOVERY: 'true',
      RENYAN_PACKAGE_EDITION: 'enterprise-no-license',
      PLATFORM: 'yakitEE',
      REACT_APP_REQUIRE_ENTERPRISE_LICENSE: 'false',
    })

    const requiredScripts = [
      'pack-renyan-mac-x64-unsigned',
      'pack-renyan-mac-arm64-unsigned',
      'pack-renyan-win-x64-unsigned',
      'pack-renyan-linux-x64-unsigned',
      'pack-renyan-linux-arm64-unsigned',
      'pack-renyan-mac-x64-enterprise-unsigned',
      'pack-renyan-mac-arm64-enterprise-unsigned',
      'pack-renyan-win-x64-enterprise-unsigned',
      'pack-renyan-linux-x64-enterprise-unsigned',
      'pack-renyan-linux-arm64-enterprise-unsigned',
      'pack-renyan-mac-x64-enterprise-no-license-unsigned',
      'pack-renyan-mac-arm64-enterprise-no-license-unsigned',
      'pack-renyan-win-x64-enterprise-no-license-unsigned',
      'pack-renyan-linux-x64-enterprise-no-license-unsigned',
      'pack-renyan-linux-arm64-enterprise-no-license-unsigned',
      'pack-renyan-mac-x64-signed',
      'pack-renyan-mac-arm64-signed',
      'pack-renyan-mac-x64-enterprise-signed',
      'pack-renyan-mac-arm64-enterprise-signed',
      'pack-renyan-mac-x64-enterprise-no-license-signed',
      'pack-renyan-mac-arm64-enterprise-no-license-signed',
    ]
    requiredScripts.forEach((name) => {
      expect(packageJson.scripts[name]).toBeTypeOf('string')
      expect(packageJson.scripts[name]).toContain('--publish never')
    })
  })

  it('由单架构命令选择目标架构且平台配置不重复声明架构集合', () => {
    expect(electronBuilderConfig.mac.target).toEqual(['dmg'])
    expect(electronBuilderConfig.linux.target).toEqual(['AppImage'])

    const architectureScripts = {
      'pack-renyan-mac-x64-unsigned': '--mac --x64',
      'pack-renyan-mac-arm64-unsigned': '--mac --arm64',
      'pack-renyan-linux-x64-unsigned': '--linux --x64',
      'pack-renyan-linux-arm64-unsigned': '--linux --arm64',
      'pack-renyan-mac-x64-enterprise-unsigned': '--mac --x64',
      'pack-renyan-mac-arm64-enterprise-unsigned': '--mac --arm64',
      'pack-renyan-linux-x64-enterprise-unsigned': '--linux --x64',
      'pack-renyan-linux-arm64-enterprise-unsigned': '--linux --arm64',
      'pack-renyan-mac-x64-enterprise-no-license-unsigned': '--mac --x64',
      'pack-renyan-mac-arm64-enterprise-no-license-unsigned': '--mac --arm64',
      'pack-renyan-linux-x64-enterprise-no-license-unsigned': '--linux --x64',
      'pack-renyan-linux-arm64-enterprise-no-license-unsigned': '--linux --arm64',
      'pack-renyan-mac-x64-signed': '--mac --x64',
      'pack-renyan-mac-arm64-signed': '--mac --arm64',
      'pack-renyan-mac-x64-enterprise-signed': '--mac --x64',
      'pack-renyan-mac-arm64-enterprise-signed': '--mac --arm64',
      'pack-renyan-mac-x64-enterprise-no-license-signed': '--mac --x64',
      'pack-renyan-mac-arm64-enterprise-no-license-signed': '--mac --arm64',
    }
    Object.entries(architectureScripts).forEach(([name, flags]) => {
      expect(packageJson.scripts[name]).toContain(flags)
    })
  })
})

describe('睿眼预置引擎准备', () => {
  it('优先使用固定任务声明的目标架构', () => {
    expect(beforePack.resolveBuildArchitecture(1)).toBe('x64')
    expect(beforePack.resolveBuildArchitecture(3)).toBe('arm64')
    expect(beforePack.resolveBuildArchitecture(1, 'arm64')).toBe('arm64')
    expect(() => beforePack.resolveBuildArchitecture(1, 'ia32')).toThrow('不支持的显式构建架构')
  })

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
    const linuxArm64Paths = getEnginePaths('yak_linux_arm64', '/workspace')
    expect(linuxArm64Paths.rawPath).toContain('yak_linux_arm64')
    expect(linuxArm64Paths.archivePath).toContain('yak_linux_arm64.zip')
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
  it('生成免许可证企业类别文件名、构建清单和非空摘要', async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'renyan-package-'))
    try {
      fs.mkdirSync(path.join(temporaryRoot, 'release'), { recursive: true })
      const standardIdentity = createArtifactIdentity({ edition: 'enterprise', target: 'windows-x64' })
      const identity = createArtifactIdentity({ edition: 'enterprise-no-license', target: 'windows-x64' })
      const linuxArm64Identity = createArtifactIdentity({ edition: 'community', target: 'linux-arm64' })
      fs.writeFileSync(path.join(temporaryRoot, 'release', identity.artifactName), 'installer')

      const result = await createBuildMetadata({
        edition: 'enterprise-no-license',
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

      expect(standardIdentity.artifactName).toBe(`RuiYan-Pentest-Enterprise-${packageJson.version}-windows-x64.exe`)
      expect(identity.artifactName).toBe(`RuiYan-Pentest-Enterprise-No-License-${packageJson.version}-windows-x64.exe`)
      expect(linuxArm64Identity.artifactName).toBe(
        `RuiYan-Pentest-Community-${packageJson.version}-linux-arm64.AppImage`,
      )
      expect(result.artifactContainer).toBe('RuiYan-Enterprise-No-License-Windows-x64-signed')
      expect(result.manifest).toMatchObject({
        edition: 'enterprise-no-license',
        gitBranch: 'qsh',
        target: 'windows-x64',
        platform: 'windows',
        architecture: 'x64',
        signed: true,
        includeEngine: false,
        engineVersion: null,
      })
      expect(fs.readFileSync(result.checksumPath, 'utf8')).toMatch(
        /^[0-9a-f]{64}  RuiYan-Pentest-Enterprise-No-License-.+-windows-x64\.exe\n$/,
      )
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('无引擎打包不会读取预置工件', async () => {
    process.env.INCLUDE_ENGINE = 'false'
    process.env.RENYAN_PACKAGE_EDITION = 'community'
    process.env.RENYAN_PACKAGE_ARCHITECTURE = 'x64'
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

    process.env.RENYAN_PACKAGE_ARCHITECTURE = 'arm64'
    const linuxContext = {
      arch: 3,
      electronPlatformName: 'linux',
      packager: {
        appInfo: { version: packageJson.version },
        config: { linux: {} },
      },
    }

    await beforePack(linuxContext)

    expect(linuxContext.packager.config.linux.artifactName).toBe(
      `RuiYan-Pentest-Community-${packageJson.version}-linux-arm64.${'${ext}'}`,
    )
    expect(linuxContext.packager.config.linux.extraFiles).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ to: 'bins/yak.zip' })]),
    )
  })

  it('免许可证企业打包使用独立文件名', async () => {
    process.env.INCLUDE_ENGINE = 'false'
    process.env.RENYAN_PACKAGE_EDITION = 'enterprise-no-license'
    const context = {
      arch: 3,
      electronPlatformName: 'darwin',
      packager: {
        appInfo: { version: packageJson.version },
        config: { mac: {} },
      },
    }

    await beforePack(context)

    expect(context.packager.config.mac.artifactName).toBe(
      `RuiYan-Pentest-Enterprise-No-License-${packageJson.version}-darwin-arm64.${'${ext}'}`,
    )
  })
})
