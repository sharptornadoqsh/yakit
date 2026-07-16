import fs from 'fs'
import os from 'os'
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
      'artifactContainerPrefix',
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
    expect(productSource.shortName).toBe('RuiYan-Pentest')
  })

  it('按操作系统选择可执行文件名', () => {
    expect(getExecutableName('win32')).toBe('RuiYan-Pentest')
    expect(getExecutableName('darwin')).toBe('RuiYan-Pentest')
    expect(getExecutableName('linux')).toBe('ruiyan-pentest')
  })

  it('前端可见英文名称统一使用 RuiYan', () => {
    const packageMetadata = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
    const packageConfigSource = fs.readFileSync(path.resolve('packageScript/electron-builder.config.js'), 'utf8')
    const collectStringValues = (value) => {
      if (typeof value === 'string') return [value]
      if (Array.isArray(value)) return value.flatMap(collectStringValues)
      if (value && typeof value === 'object') return Object.values(value).flatMap(collectStringValues)
      return []
    }
    const localeRoot = path.resolve('app/renderer/src/main/public/locales')
    const displayedJsonFiles = [
      path.resolve('app/renderer/src/main/public/manifest.json'),
      ...fs.readdirSync(localeRoot).flatMap((locale) => {
        const localeDirectory = path.join(localeRoot, locale)
        if (!fs.statSync(localeDirectory).isDirectory()) return []
        return fs
          .readdirSync(localeDirectory)
          .filter((filename) => filename.endsWith('.json'))
          .map((filename) => path.join(localeDirectory, filename))
      }),
    ]
    const displayedValues = displayedJsonFiles.flatMap((filePath) =>
      collectStringValues(JSON.parse(fs.readFileSync(filePath, 'utf8'))),
    )
    expect(productSource.shortName).toBe('RuiYan-Pentest')
    expect(productSource.executableName).toBe('RuiYan-Pentest')
    expect(productSource.defaultDataDirectory).toBe('RuiYan-Pentest')
    expect(packageMetadata.name).toBe('ruiyan-pentest')
    expect(packageConfigSource).toContain("name: 'ruiyan-pentest'")
    expect(displayedValues.join('\n')).not.toMatch(/renyan/i)

    const visibleLogoFiles = [
      'app/renderer/src/main/src/assets/renyan-logo-light.svg',
      'app/renderer/src/main/src/assets/renyan-logo-dark.svg',
      'app/renderer/engine-link-startup/src/assets/renyan-logo-light.svg',
      'app/renderer/engine-link-startup/src/assets/renyan-logo-dark.svg',
      'product/brand/renyan-logo-light.svg',
      'product/brand/renyan-logo-dark.svg',
      'product/brand/renyan-startup-light.svg',
      'product/brand/renyan-startup-dark.svg',
    ]
    visibleLogoFiles.forEach((filePath) => {
      const source = fs.readFileSync(path.resolve(filePath), 'utf8')
      expect(source).toContain('RuiYan-Pentest')
      expect(source).not.toMatch(/renyan/i)
    })

    const brandGenerator = fs.readFileSync(path.resolve('product/scripts/generate_brand_assets.py'), 'utf8')
    expect(brandGenerator).not.toContain("CONFIG['shortName'].upper()")
  })

  it('将用户数据定位到独立产品目录', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ruiyan-product-'))
    const appDataPath = path.join(tempRoot, 'AppData', 'Roaming')
    fs.mkdirSync(appDataPath, { recursive: true })
    expect(resolveUserDataPath(appDataPath)).toBe(path.join(appDataPath, productSource.defaultDataDirectory))

    const calls = []
    const electronApp = {
      getPath: (name) => {
        expect(name).toBe('appData')
        return appDataPath
      },
      setName: (value) => calls.push(['setName', value]),
      setPath: (name, value) => {
        expect(fs.statSync(value).isDirectory()).toBe(true)
        calls.push(['setPath', name, value])
      },
      setAppUserModelId: (value) => calls.push(['setAppUserModelId', value]),
    }
    configureApplicationIdentity(electronApp, 'win32')

    expect(calls).toEqual([
      ['setName', productSource.displayName],
      ['setPath', 'userData', path.join(appDataPath, productSource.defaultDataDirectory)],
      ['setAppUserModelId', productSource.appId],
    ])
    fs.rmSync(tempRoot, { recursive: true, force: true })

    const filePathSource = fs.readFileSync(path.resolve('app/main/filePath.js'), 'utf8')
    expect(filePathSource).not.toContain("getPath('exe')")
    expect(filePathSource).not.toContain("'yakit-projects'")
    expect(filePathSource).toContain('if (!app.isPackaged)')
    expect(filePathSource).toContain('return path.resolve(app.getAppPath(), s)')

    const localCacheSource = fs.readFileSync(path.resolve('app/main/localCache.js'), 'utf8')
    expect(localCacheSource).toContain('productConfig.displayName')
    expect(localCacheSource).not.toContain('关闭 Yakit')

    const auxWindowSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/auxWindow/AuxWindowApp.tsx'),
      'utf8',
    )
    expect(auxWindowSource).toContain("getQueryParam('title') || productConfig.displayName")
  })

  it('首次本地引擎启动等待覆盖慢速数据库初始化', () => {
    const source = fs.readFileSync(path.resolve('app/main/handlers/newEngineStatus.js'), 'utf8')

    expect(source).toContain('const LOCAL_ENGINE_START_TIMEOUT_MS = 180_000')
    expect(source).toContain('}, LOCAL_ENGINE_START_TIMEOUT_MS)')
    expect(source).toContain('${LOCAL_ENGINE_START_TIMEOUT_MS / 1000}s')
  })

  it('普通模式缺少旧系统标记时不记录文件缺失错误', () => {
    const source = fs.readFileSync(path.resolve('app/main/handlers/utils/network.js'), 'utf8')

    expect(source.match(/if \(error\.code !== 'ENOENT'\) console\.log\('error', error\)/g)).toHaveLength(3)
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

  it('启动时只显示品牌提示并在引擎完成后显示系统界面', () => {
    const mainProcessSource = fs.readFileSync(path.resolve('app/main/index.js'), 'utf8')
    expect(mainProcessSource).toMatch(
      /engineLinkWin = new BrowserWindow\(\{[\s\S]*?show: false,[\s\S]*?skipTaskbar: true,/,
    )
    const engineLinkReadyHandler = mainProcessSource.match(
      /engineLinkWin\.once\('ready-to-show', \(\) => \{([\s\S]*?)\n  \}\)/,
    )?.[1]
    expect(engineLinkReadyHandler).toContain('winShow(engineLinkWin, true)')
    expect(mainProcessSource).toContain('const STARTUP_HINT_MINIMUM_VISIBLE_MS = 1200')
    expect(mainProcessSource).toContain('engineLinkShownAt = Date.now()')
    const mainReadyHandler = mainProcessSource.match(/win\.once\('ready-to-show', \(\) => \{([\s\S]*?)\n  \}\)/)?.[1]
    expect(mainReadyHandler).not.toContain('winShow(win, true)')
    expect(mainProcessSource).toContain(
      "ipcMain.handle('engineLinkWin-done', async (event, data) => {\n    const startupHintVisibleMs = engineLinkShownAt ? Date.now() - engineLinkShownAt : 0",
    )
    expect(mainProcessSource).toContain(
      'const startupHintWaitMs = Math.max(0, STARTUP_HINT_MINIMUM_VISIBLE_MS - startupHintVisibleMs)',
    )
    expect(mainProcessSource).toContain(
      'await new Promise((resolve) => setTimeout(resolve, startupHintWaitMs))\n    }\n    winHide(engineLinkWin)\n    winShow(win, readyWinShow)',
    )
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
    expect(startupSource).toContain('<StartupSplash theme={theme} />')
    expect(startupSource).toContain("className={styles['startup-operation-layer']}")
    expect(startupSource).not.toContain('<SoftwareBasics')
    expect(startupSource).not.toContain('<EngineLog')
    expect(startupSource).not.toContain('<EngineLifecyclePanel')
    expect(startupSource).not.toContain('yakitNotify')
    expect(startupSource).toContain('autoConnect={true}')
    expect(startupSource).toContain('headless={true}')
    expect(startupSource).not.toContain('renyan-startup-panel')
    expect(startupSource).not.toContain('startup-wrapper-right')

    const uiLayoutSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/components/layout/UILayout.tsx'),
      'utf8',
    )
    expect(uiLayoutSource).toContain(
      'handleFetchSystem((systemName) => {\n      if (systemName) setSystem(systemName)\n    })',
    )
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
    expect(builderConfig.files).toContain('product/build.js')
    expect(builderConfig.files).toContain('!.claude/**/*')
    expect(builderConfig.files).toContain('!.codegraph/**/*')
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
