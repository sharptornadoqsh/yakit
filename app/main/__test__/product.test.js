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
      'defaultDatabaseName',
      'enterpriseDefaultDatabaseName',
      'updateChannel',
      'supportName',
      'copyright',
      'primaryColor',
      'successColor',
      'warningColor',
      'errorColor',
    ]

    requiredFields.forEach((field) => expect(productSource[field]).toBeTypeOf('string'))
    expect(productSource.clientUpdateEnabled).toBeTypeOf('boolean')
    expect(productSource.shortName).toBe('RuiYan-Pentest')
    expect(productSource.defaultDatabaseName).toBe('default-RuiYan.db')
    expect(productSource.enterpriseDefaultDatabaseName).toBe('company-default-RuiYan.db')
  })

  it('缺少睿眼发布渠道时禁用客户端在线更新', () => {
    const upgradeSource = fs.readFileSync(path.resolve('app/main/handlers/upgradeUtil.js'), 'utf8')
    const legacyVersionSource = fs.readFileSync(path.resolve('app/main/uiOperate/yaklangAndYakit.js'), 'utf8')
    const currentVersionSource = fs.readFileSync(path.resolve('app/main/newUiOperate/yaklangAndYakit.js'), 'utf8')
    const funcDomainSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/components/layout/FuncDomain.tsx'),
      'utf8',
    )
    const uiLayoutSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/components/layout/UILayout.tsx'),
      'utf8',
    )

    expect(productSource.clientUpdateEnabled).toBe(false)
    expect(upgradeSource).toContain('assertClientUpdateEnabled()')
    expect(upgradeSource).not.toContain('download-enpriTrace-latest-yakit')
    expect(legacyVersionSource).toContain('productConfig.clientUpdateEnabled')
    expect(currentVersionSource).toContain('productConfig.clientUpdateEnabled')
    expect(funcDomainSource).toContain('productConfig.clientUpdateEnabled')
    expect(uiLayoutSource).toContain('productConfig.clientUpdateEnabled')
  })

  it('项目入口、默认数据库与外部产品身份统一使用睿眼名称', () => {
    const uiLayoutSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/components/layout/UILayout.tsx'),
      'utf8',
    )
    const projectManageSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/pages/softwareSettings/ProjectManage.tsx'),
      'utf8',
    )
    const projectManageStyles = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/pages/softwareSettings/ProjectManage.module.scss'),
      'utf8',
    )
    const yakLocalSource = fs.readFileSync(path.resolve('app/main/handlers/yakLocal.js'), 'utf8')
    const defaultDatabaseSource = fs.readFileSync(path.resolve('app/main/defaultDatabase.js'), 'utf8')
    const engineStatusSource = fs.readFileSync(path.resolve('app/main/handlers/engineStatus.js'), 'utf8')
    const newEngineStatusSource = fs.readFileSync(path.resolve('app/main/handlers/newEngineStatus.js'), 'utf8')
    const aboutHtml = fs.readFileSync(path.resolve('app/main/about.html'), 'utf8')
    const zhLayout = JSON.parse(
      fs.readFileSync(path.resolve('app/renderer/src/main/public/locales/zh/layout.json'), 'utf8'),
    )
    const enLayout = JSON.parse(
      fs.readFileSync(path.resolve('app/renderer/src/main/public/locales/en/layout.json'), 'utf8'),
    )
    const zhTwLayout = JSON.parse(
      fs.readFileSync(path.resolve('app/renderer/src/main/public/locales/zh-TW/layout.json'), 'utf8'),
    )

    expect(uiLayoutSource).toContain("title={t('UILayout.projectWorkspaceTitle')}")
    expect(uiLayoutSource).toContain("description={t('UILayout.projectWorkspaceDescription')}")
    expect(projectManageSource).not.toContain("styles['title-copy']")
    expect(projectManageSource).toContain("styles['project-toolbar']")
    expect(projectManageSource).toContain('<RuiYanIcon name="download" />')
    expect(projectManageSource).toContain('getProjectDisplayText')
    expect(projectManageSource).toContain('getProjectDisplayText(data.ProjectName, data.DatabasePath')
    expect(projectManageSource).toContain(
      'getProjectDisplayText(selectedProject.ProjectName, selectedProject.DatabasePath',
    )
    expect(projectManageSource).not.toContain('<span>{selectedProject.DatabasePath')
    expect(projectManageStyles).toContain('grid-template-columns: 168px minmax(0, 1fr)')
    expect(projectManageStyles).toContain('height: 36px')
    expect(yakLocalSource).toContain('getDefaultDatabaseName')
    expect(yakLocalSource).not.toContain("let dbFile = 'default-yakit.db'")
    expect(yakLocalSource).toContain('getDefaultDatabaseEnvironment')
    expect(yakLocalSource).not.toContain('YAK_DEFAULT_DATABASE_NAME')
    expect(defaultDatabaseSource).toContain('YAK_DEFAULT_PROJECT_DATABASE_NAME')
    expect(engineStatusSource).toContain('getDefaultDatabaseEnvironment')
    expect(newEngineStatusSource).toContain('getDefaultDatabaseEnvironment')
    expect(zhLayout.UILayout.enterProjectManageConfirmTitle).toBe('进入睿眼项目工作区')
    expect(zhLayout.UILayout.enterProjectManageConfirmContent).toBe(
      '睿眼项目工作区统一管理项目数据、任务记录与分析结果；进入后，当前运行中的任务将停止，请确认是否继续。',
    )
    expect(zhLayout.UILayout.projectWorkspaceTitle).toBe('睿眼项目工作区')
    expect(enLayout.UILayout.projectWorkspaceTitle).toBe('RuiYan Project Workspace')
    expect(zhTwLayout.UILayout.projectWorkspaceTitle).toBe('睿眼專案工作區')

    expect(aboutHtml).not.toMatch(/yakit/i)
    expect(
      [
        productSource.displayName,
        productSource.shortName,
        productSource.executableName,
        productSource.linuxExecutableName,
        productSource.artifactPrefix,
        productSource.defaultDataDirectory,
        productSource.defaultDatabaseName,
        productSource.enterpriseDefaultDatabaseName,
      ].join('\n'),
    ).not.toMatch(/yakit/i)
  })

  it('按操作系统选择可执行文件名', () => {
    expect(getExecutableName('win32')).toBe('RuiYan-Pentest')
    expect(getExecutableName('darwin')).toBe('RuiYan-Pentest')
    expect(getExecutableName('linux')).toBe('ruiyan-pentest')
  })

  it('前端可见英文名称统一使用 RuiYan', () => {
    const packageMetadata = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
    const packageConfigSource = fs.readFileSync(path.resolve('packageScript/electron-builder.config.js'), 'utf8')
    const networkSource = fs.readFileSync(path.resolve('app/main/handlers/utils/network.js'), 'utf8')
    const upgradeSource = fs.readFileSync(path.resolve('app/main/handlers/upgradeUtil.js'), 'utf8')
    const chromeLauncherSource = fs.readFileSync(path.resolve('app/main/handlers/chromelauncher.js'), 'utf8')
    const artifactSource = fs.readFileSync(path.resolve('app/main/applicationArtifact.js'), 'utf8')
    const hardwareSource = fs.readFileSync(path.resolve('app/main/uiOperate/hardware.js'), 'utf8')
    const assetHandlerSource = fs.readFileSync(path.resolve('app/main/handlers/assets.js'), 'utf8')
    const funcDomainSource = fs.readFileSync(
      path.resolve('app/renderer/src/main/src/components/layout/FuncDomain.tsx'),
      'utf8',
    )
    const websiteSource = fs.readFileSync(path.resolve('app/renderer/src/main/src/enums/website.ts'), 'utf8')
    const visiblePluginIconFiles = [
      'app/renderer/src/main/src/components/yakChat/chatCS.tsx',
      'app/renderer/src/main/src/pages/aiForge/defaultConstant.tsx',
      'app/renderer/src/main/src/pages/plugins/builtInData.tsx',
      'app/renderer/src/main/src/pages/plugins/funcTemplate.tsx',
    ]
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
    expect(packageConfigSource).toContain("to: 'bins/ruiyan-system-mode.txt'")
    expect(packageConfigSource).not.toContain("to: 'bins/yakit-system-mode.txt'")
    expect(networkSource).toContain("const SYSTEM_MODE_MARKER = 'ruiyan-system-mode.txt'")
    expect(upgradeSource).toContain('resolveApplicationDownloadPath')
    expect(upgradeSource).toContain('fs.readFileSync(getRemoteLinkFile())')
    expect(upgradeSource).not.toContain("path.join(getRemoteLinkDir(), 'yakit-remote.json')")
    expect(artifactSource).toContain('productConfig.artifactPrefix')
    expect(hardwareSource).toContain('resolveApplicationDownloadPath(getYakitInstallDir(), filePath)')
    expect(assetHandlerSource).toContain('ruiyan-report-pdf-')
    expect(assetHandlerSource).not.toContain('yakit-report-pdf-')
    expect(chromeLauncherSource).toContain('${productConfig.shortName} Proxy')
    expect(chromeLauncherSource).not.toContain('"name": "YakitProxy"')
    expect(chromeLauncherSource).not.toContain("const tempFile = 'yakit-proxy'")
    expect(funcDomainSource).toContain('`${productConfig.artifactPrefix}-${cleanVersion}`')
    expect(funcDomainSource).not.toContain('getReleaseEditionCompatibilityName().replace')
    expect(funcDomainSource).not.toContain('YakitHistoryVersionAddress')
    expect(websiteSource).not.toMatch(/github\.com\/yaklang\/yakit\/releases/i)
    visiblePluginIconFiles.forEach((filePath) => {
      const source = fs.readFileSync(path.resolve(filePath), 'utf8')
      expect(source).toContain('RuiYanIcon')
      expect(source).not.toMatch(/SolidYakitPlugin(?:Gray)?Icon/)
    })

    const visibleTemplateFiles = [
      'app/renderer/src/main/src/defaultConstants/HTTPFuzzerPage.ts',
      'app/renderer/src/main/src/defaultConstants/mitm.ts',
      'app/renderer/src/main/src/store/globalHotPatch.ts',
      'app/renderer/src/main/src/pages/pluginDebugger/defaultData.tsx',
      'app/renderer/src/main/src/pages/invoker/data/MITMPluginTamplate.ts',
    ]
    visibleTemplateFiles.forEach((filePath) => {
      const visibleLegacyLines = fs
        .readFileSync(path.resolve(filePath), 'utf8')
        .split(/\r?\n/)
        .filter((line) => /[\u3400-\u9fff]|X-Yakit/i.test(line))
        .filter((line) => /\byakit\b(?!\.)/i.test(line))
      expect(visibleLegacyLines, filePath).toEqual([])
    })
    const visibleScriptErrors = [
      'app/renderer/src/main/src/pages/invoker/batch/consts_importConfigYakCode.ts',
      'app/renderer/src/main/src/pages/customizeMenu/CustomizeMenu.tsx',
    ].map((filePath) => fs.readFileSync(path.resolve(filePath), 'utf8'))
    expect(visibleScriptErrors.join('\n')).not.toMatch(/Load Yakit Plugin Config Failed|Yak Script yakitFailed/i)
    expect(displayedValues.join('\n')).not.toMatch(/renyan/i)
    expect(displayedValues.join('\n')).not.toMatch(/yakit/i)

    const visiblePathCopyFiles = [
      'app/renderer/engine-link-startup/src/pages/StartupPage/components/QuestionModal/index.tsx',
      'app/renderer/src/main/src/components/layout/update/InstallEngine.tsx',
      'app/renderer/src/main/src/pages/cve/CVETable.tsx',
      'app/renderer/src/main/src/pages/fingerprintManage/ImportExportModal/ImportExportModal.tsx',
      'app/renderer/src/main/src/pages/ai-agent/aiModelList/AIModelList.tsx',
    ]
    visiblePathCopyFiles.forEach((filePath) => {
      expect(fs.readFileSync(path.resolve(filePath), 'utf8')).not.toMatch(/yakit-projects/i)
    })

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
    expect(filePathSource).toContain("'ruiyan-local.json'")
    expect(filePathSource).toContain("'ruiyan-extra-local.json'")
    expect(filePathSource).toContain("'ruiyan-remote.json'")
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

  it('本地引擎能力检查为系统冷启动保留等待时间', () => {
    const source = fs.readFileSync(path.resolve('app/main/handlers/newEngineStatus.js'), 'utf8')

    expect(source).toContain('const LOCAL_ENGINE_CHECK_TIMEOUT_MS = 60_000')
    expect(source).toContain('}, LOCAL_ENGINE_CHECK_TIMEOUT_MS)')
    expect(source).toContain('${LOCAL_ENGINE_CHECK_TIMEOUT_MS / 1000}s')
  })

  it('免许可开发脚本跳过启动期类型检查', () => {
    const commandSource = fs.readFileSync(path.resolve('start-enterprise-no-license-dev.cmd'), 'utf8')
    const rendererConfigSource = fs.readFileSync(path.resolve('app/renderer/src/main/config-overrides.js'), 'utf8')

    expect(commandSource).toContain('set "REACT_APP_SKIP_DEV_TYPE_CHECK=true"')
    expect(rendererConfigSource).toContain("process.env.REACT_APP_SKIP_DEV_TYPE_CHECK === 'true'")
    expect(rendererConfigSource).toContain("plugin.constructor?.name !== 'ForkTsCheckerWebpackPlugin'")
    expect(rendererConfigSource).toContain('writeToDisk: !skipDevTypeCheck')
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
    const preloadSource = fs.readFileSync(path.resolve('app/main/preload.js'), 'utf8')
    const openWebsiteHandler = fs.readFileSync(path.resolve('app/main/handlers/openWebsiteByChrome.js'), 'utf8')
    expect(rendererAbout).not.toContain('megavector.cn/aboutUs')
    expect(rendererAbout).not.toContain('productConfig.repositoryUrl')
    expect(rendererAbout).not.toContain('productConfig.issuesUrl')
    expect(rendererAbout).toContain("yakitShell.openLegalDocument('license')")
    expect(rendererAbout).toContain("yakitShell.openLegalDocument('third-party')")
    expect(rendererAbout).not.toContain('productConfig.licenseUrl')
    expect(rendererAbout).not.toContain('productConfig.thirdPartyNoticesUrl')
    expect(preloadSource).toContain(
      "openLegalDocument: (documentType) => invoke('open-product-legal-document', documentType)",
    )
    expect(openWebsiteHandler).toContain("ipcMain.handle('open-product-legal-document'")
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
    const installedFlagContent = [
      'bins/flag.windows.txt',
      'bins/flag.linux.txt',
      'bins/flag.darwin.txt',
      'bins/resources/flag.txt',
    ]
      .map((filePath) => fs.readFileSync(path.resolve(filePath), 'utf8'))
      .join('\n')

    expect(builderConfig.appId).toBe(productSource.appId)
    expect(builderConfig.productName).toBe(productSource.displayName)
    expect(builderConfig.executableName).toBe(productSource.executableName)
    expect(builderConfig.extraMetadata.author.name).toBe(productSource.supportName)
    expect(builderConfig.win.icon).toBe('app/assets/renyan-icon.ico')
    expect(builderConfig.mac.icon).toBe('app/assets/renyan-icon.icns')
    expect(builderConfig.linux.executableName).toBe(productSource.linuxExecutableName)
    expect(builderConfig.nsis.shortcutName).toBe(productSource.displayName)
    expect(builderConfig.releaseInfo.releaseNotes).toContain(productSource.displayName)
    expect(builderConfig.publish).toBeUndefined()
    expect(installedFlagContent).toMatch(/RuiYan/i)
    expect(installedFlagContent).not.toMatch(/Yakit/i)
    expect(
      [
        builderConfig.productName,
        builderConfig.executableName,
        builderConfig.artifactName,
        builderConfig.nsis.shortcutName,
        builderConfig.nsis.uninstallDisplayName,
        builderConfig.releaseInfo.releaseNotes,
        productSource.defaultDataDirectory,
      ].join('\n'),
    ).not.toMatch(/yakit/i)
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
