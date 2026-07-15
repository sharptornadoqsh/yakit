import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import productSource from '../../../product/renyan.json'
import { configureApplicationIdentity, getExecutableName, resolveUserDataPath } from '../product'
import { normalizeSha, resolveBuildSha, resolveEdition } from '../../../product/build'
import builderConfig from '../../../packageScript/electron-builder.config'
import compatibilityManifest from '../../../product/engine-compatibility.json'
import packageJson from '../../../package.json'

describe('睿眼产品配置', () => {
  it('包含应用各层所需的必填字段', () => {
    const requiredFields = [
      'displayName',
      'shortName',
      'appId',
      'executableName',
      'linuxExecutableName',
      'artifactPrefix',
      'defaultDataDirectory',
      'updateChannel',
      'supportName',
      'copyright',
      'primaryColor',
      'successColor',
      'warningColor',
      'errorColor',
      'licenseUrl',
      'thirdPartyNoticesUrl',
    ]

    requiredFields.forEach((field) => expect(productSource[field]).toBeTypeOf('string'))
  })

  it('按操作系统选择可执行文件名', () => {
    expect(getExecutableName('win32')).toBe('RenYan-Pentest')
    expect(getExecutableName('darwin')).toBe('RenYan-Pentest')
    expect(getExecutableName('linux')).toBe('renyan-pentest')
  })

  it('将用户数据定位到独立产品目录', () => {
    const appDataPath = path.join('C:', 'Users', 'tester', 'AppData', 'Roaming')
    expect(resolveUserDataPath(appDataPath)).toBe(path.join(appDataPath, productSource.defaultDataDirectory))

    const calls = []
    const electronApp = {
      getPath: (name) => {
        expect(name).toBe('appData')
        return appDataPath
      },
      setName: (value) => calls.push(['setName', value]),
      setPath: (name, value) => calls.push(['setPath', name, value]),
      setAppUserModelId: (value) => calls.push(['setAppUserModelId', value]),
    }
    configureApplicationIdentity(electronApp, 'win32')

    expect(calls).toEqual([
      ['setName', productSource.displayName],
      ['setPath', 'userData', path.join(appDataPath, productSource.defaultDataDirectory)],
      ['setAppUserModelId', productSource.appId],
    ])

    const filePathSource = fs.readFileSync(path.resolve('app/main/filePath.js'), 'utf8')
    expect(filePathSource).not.toContain("getPath('exe')")
    expect(filePathSource).not.toContain("'yakit-projects'")

    const localCacheSource = fs.readFileSync(path.resolve('app/main/localCache.js'), 'utf8')
    expect(localCacheSource).toContain('productConfig.displayName')
    expect(localCacheSource).not.toContain('关闭 Yakit')

    const auxWindowSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/auxWindow/AuxWindowApp.tsx'),
      'utf8',
    )
    expect(auxWindowSource).toContain("getQueryParam('title') || productConfig.displayName")
  })

  it('关于窗口包含版本、类别与法律文档入口', () => {
    const aboutHtml = fs.readFileSync(path.resolve('app/main/about.html'), 'utf8')
    expect(aboutHtml).toContain('客户端版本')
    expect(aboutHtml).toContain('引擎版本')
    expect(aboutHtml).toContain('构建版本')
    expect(aboutHtml).toContain('版本类别')
    expect(aboutHtml).toContain('renyan://license')
    expect(aboutHtml).toContain('renyan://third-party')

    const rendererAbout = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/components/layout/HelpDoc/HelpDoc.tsx'),
      'utf8',
    )
    expect(rendererAbout).not.toContain('megavector.cn/aboutUs')
    expect(rendererAbout).toContain('productConfig.licenseUrl')
    expect(rendererAbout).toContain('productConfig.thirdPartyNoticesUrl')
  })

  it('启动时直接显示系统界面并使用睿眼文件名称', () => {
    const mainProcessSource = fs.readFileSync(path.resolve('app/main/index.js'), 'utf8')
    expect(mainProcessSource).toMatch(
      /engineLinkWin = new BrowserWindow\(\{[\s\S]*?show: false,[\s\S]*?skipTaskbar: true,/,
    )
    expect(mainProcessSource).toMatch(/win\.once\('ready-to-show',[\s\S]*?winShow\(win, true\)/)
    expect(mainProcessSource).toContain(
      'engineLinkWin.webContents.reload()\n    winHide(engineLinkWin)\n    setTimeout(() => {\n      winShow(win, readyWinShow)',
    )
    expect(mainProcessSource).toContain(
      'engineLinkWin.webContents.reloadIgnoringCache()\n    winHide(engineLinkWin)\n    setTimeout(() => {\n      winShow(win, readyWinShow)',
    )

    const startupSource = fs.readFileSync(
      path.resolve('app/renderer/engine-link-startup/src/pages/StartupPage/index.tsx'),
      'utf8',
    )
    expect(startupSource).not.toContain('renyan-startup-panel')
    expect(startupSource).not.toContain('startup-wrapper-right')
    const retiredAssets = [
      'app/renderer/engine-link-startup/src/assets/YakitLogo.png',
      'app/renderer/engine-link-startup/src/assets/yakit-right.png',
      'app/renderer/engine-link-startup/src/assets/renyan-startup-panel-light.svg',
      'app/renderer/src/main/src/assets/yakitCattle.png',
      'app/renderer/src/main/src/assets/yakitLogo.png',
    ]
    retiredAssets.forEach((assetPath) => expect(fs.existsSync(path.resolve(assetPath))).toBe(false))

    const certificateSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/pages/mitm/MITMServerStartForm/MITMCertificateDownloadModal.tsx'),
      'utf8',
    )
    expect(certificateSource).toContain('RuiYan-MITM-CA.pem')
    expect(certificateSource).toContain('RuiYan-MITM-GM-CA.pem')

    const ruleExportSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/pages/mitm/MITMRule/MITMRuleConfigure/MITMRuleConfigure.tsx'),
      'utf8',
    )
    expect(ruleExportSource).toContain('RuiYan-MITM-Replacer-Rules-Config.json')

    const flowExportSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/components/HTTPFlowTable/HTTPFlowTable.tsx'),
      'utf8',
    )
    expect(flowExportSource).toContain('RuiYan-HTTP-Flows-')

    const historyExportSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/pages/hTTPHistoryAnalysis/HTTPHistory/HTTPHistoryFilter.tsx'),
      'utf8',
    )
    expect(historyExportSource).toContain("`RuiYan-${!toWebFuzzer ? 'History' : 'WebFuzzer'}-${Date.now()}`")

    const remoteEngineSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/components/layout/RemoteEngine/RemoteEngine.tsx'),
      'utf8',
    )
    expect(remoteEngineSource).toContain('@/assets/renyan-icon.svg')
    expect(remoteEngineSource).not.toContain('@/assets/yakitEE.png')
    expect(remoteEngineSource).not.toContain('@/assets/yakitSE.png')

    const zhLayout = JSON.parse(
      fs.readFileSync(path.resolve('app/renderer/src/main/public/locales/zh/layout.json'), 'utf8'),
    )
    expect(zhLayout.GlobalState.mcp).toBe('RuiYan MCP')
    expect(zhLayout.McpHook.MCPStopped).toBe('RuiYan MCP 服务已停用')
    expect(zhLayout.PerformanceDisplay.localYakProcessManagement).toBe('本地 RuiYan Engine 进程管理')
  })
})

describe('构建元数据', () => {
  it('规范化构建提交标识并保留版本类别', () => {
    expect(normalizeSha(' ABCDEF123 ')).toBe('ABCDEF123')
    expect(normalizeSha('invalid')).toBe('')
    expect(resolveBuildSha({ env: { BUILD_SHA: '1234567' } })).toBe('1234567')
    expect(resolveEdition()).toBe('社区版')
    expect(resolveEdition('yakitEE')).toBe('企业版')
    expect(resolveEdition('enterprise')).toBe('企业版')
    expect(resolveEdition('enterprise', 'false')).toBe('企业版（免许可证）')

    const rendererBuildConfig = fs.readFileSync(path.resolve('app/renderer/src/main/config-overrides.js'), 'utf8')
    const rendererProductConfig = fs.readFileSync(path.resolve('app/renderer/src/main/src/config/product.ts'), 'utf8')
    expect(rendererBuildConfig).toContain('REACT_APP_RENYAN_EDITION')
    expect(rendererProductConfig).toContain('REACT_APP_RENYAN_EDITION')
  })

  it('打包配置仅使用睿眼身份和原创图标', () => {
    expect(builderConfig.appId).toBe(productSource.appId)
    expect(builderConfig.productName).toBe(productSource.displayName)
    expect(builderConfig.executableName).toBe(productSource.executableName)
    expect(builderConfig.extraMetadata.author.name).toBe(productSource.supportName)
    expect(builderConfig.win.icon).toBe('app/assets/renyan-icon.ico')
    expect(builderConfig.mac.icon).toBe('app/assets/renyan-icon.icns')
    expect(builderConfig.linux.executableName).toBe(productSource.linuxExecutableName)
    expect(builderConfig.nsis.shortcutName).toBe(productSource.displayName)
    expect(builderConfig.nsis.include).toBeUndefined()
    expect(builderConfig.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to: 'legal/LICENSE.md' }),
        expect.objectContaining({ to: 'legal/THIRD_PARTY_NOTICES.md' }),
      ]),
    )
    expect(builderConfig.files).toContain('product/engine-compatibility.json')
  })
})

describe('引擎兼容清单', () => {
  it('为当前客户端声明版本边界和各平台预置工件', () => {
    const client = compatibilityManifest.clientVersions.find((item) => item.clientVersion === packageJson.version)

    expect(client).toBeDefined()
    expect(client.minimumEngineVersion).toBe('TBD')
    expect(client.recommendedEngineVersion).toBe('1.4.8-beta3')
    expect(client.highestVerifiedEngineVersion).toBe('1.4.8-beta3')
    expect(client.compatibilityGate).toBe('check-secret-local-grpc')
    expect(client.artifacts).toHaveLength(5)

    client.artifacts.forEach((artifact) => {
      expect(artifact.sourceArchive).toMatch(/^bins\/yak_/)
      expect(artifact.packagedArchive).toBe('bins/yak.zip')
      expect(artifact.archiveEntry).toMatch(/^bins\/yak_/)
      expect(artifact.archiveSha256 === 'TBD' || /^[A-F0-9]{64}$/.test(artifact.archiveSha256)).toBe(true)
      expect(artifact.engineSha256 === 'TBD' || /^[A-F0-9]{64}$/.test(artifact.engineSha256)).toBe(true)
    })
  })
})
