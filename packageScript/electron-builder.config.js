const productConfig = require('../product/renyan.json')
const { resolveBuildSha, resolveEdition } = require('../product/build')

const platform = process.env.PLATFORM
const buildSha = resolveBuildSha()
const edition = resolveEdition(platform)
const includeEngine = process.env.INCLUDE_ENGINE !== 'false'

const configOption = {
  appId: productConfig.appId,
  productName: productConfig.displayName,
  executableName: productConfig.executableName,
  artifactName: `${productConfig.artifactPrefix}-${'${version}'}-${'${os}'}-${'${arch}'}.${'${ext}'}`,
  copyright: productConfig.copyright,
  extraMetadata: {
    name: 'ruiyan-pentest',
    author: {
      name: productConfig.supportName,
    },
    description: productConfig.tagline,
    buildSha,
    edition,
    updateChannel: productConfig.updateChannel,
  },
  extraFiles: [
    { from: 'bins/scripts/auto-install-cert.zip', to: 'bins/scripts/auto-install-cert.zip' },
    { from: 'bins/scripts/start-engine.zip', to: 'bins/scripts/start-engine.zip' },
    { from: 'bins/scripts/google-chrome-plugin.zip', to: 'bins/scripts/google-chrome-plugin.zip' },
    { from: 'bins/flag.txt', to: 'bins/flag.txt' },
    {
      from: 'bins/resources',
      to: 'bins/resources',
      filter: ['**/*', '*.txt'],
    },
    {
      from: 'bins/database/',
      to: 'bins/database/',
      filter: ['**/*', '*.txt', '*.gzip', '!*.db'],
    },
    {
      from: 'report/template.zip',
      to: 'report/template.zip',
    },
  ],
  extraResources: [
    { from: 'LICENSE.md', to: 'legal/LICENSE.md' },
    { from: 'product/legal/THIRD_PARTY_NOTICES.md', to: 'legal/THIRD_PARTY_NOTICES.md' },
  ],
  directories: {
    buildResources: 'resources',
    output: 'release/',
    app: '.',
  },
  files: [
    '**/*',
    '!app/assets/**/*',
    'app/assets/renyan-*',
    'app/assets/导入模板.xlsx',
    '!bins/**/*',
    '!.github/**/*',
    '!.claude/**/*',
    '!.codegraph/**/*',
    '!multibuilder/**/*',
    '!scripts/**/*',
    '!buildutil/**/*',
    '!buildHooks/**/*',
    '!build/**/*',
    '!backups/**/*',
    '!product/**/*',
    'product/renyan.json',
    'product/engine-compatibility.json',
    'product/build.js',
    '!app/renderer/src/**/*',
    '!app/renderer/engine-link-startup/**/*',
    'app/renderer/engine-link-startup/dist/**/*',
    '!cli/*',
    '!**/*.p12',
    '!imgs/**/*',
    '!vitest.config.ts',
    '!package.json.pre-commit.bak',
    '!prettier.config.js',
    '!ELECTRON_GUIDE.md',
    '!README*',
  ],
  asar: true,
  mac: {
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'packageScript/plist/entitlements.mac.plist',
    entitlementsInherit: 'packageScript/plist/entitlements.mac.plist',
    target: ['dmg'],
    executableName: productConfig.executableName,
    icon: 'app/assets/renyan-icon.icns',
    extendInfo: {
      CFBundleDisplayName: productConfig.displayName,
      CFBundleName: productConfig.shortName,
    },
  },
  linux: {
    target: ['AppImage'],
    executableName: productConfig.linuxExecutableName,
    icon: 'product/brand/icons',
    category: 'Development',
    desktop: {
      entry: {
        Name: productConfig.displayName,
        Comment: productConfig.tagline,
        StartupWMClass: productConfig.appId,
      },
    },
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    executableName: productConfig.executableName,
    icon: 'app/assets/renyan-icon.ico',
    legalTrademarks: productConfig.supportName,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    deleteAppDataOnUninstall: true,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'app/assets/renyan-icon.ico',
    uninstallerIcon: 'app/assets/renyan-icon.ico',
    installerHeaderIcon: 'app/assets/renyan-icon.ico',
    shortcutName: productConfig.displayName,
    uninstallDisplayName: `${productConfig.displayName} ${'${version}'}`,
    unicode: true,
    license: 'LICENSE.md',
    warningsAsErrors: false,
    createDesktopShortcut: false,
    createStartMenuShortcut: true,
  },
  beforePack: 'packageScript/buildHook/before-pack.js',
  toolsets: {
    appimage: '1.0.3',
  },
  releaseInfo: {
    releaseName: '${version}',
    releaseNotes: `${productConfig.displayName} 版本更新`,
  },
}

if (includeEngine) {
  configOption.extraFiles.push({ from: 'bins/engine-version.txt', to: 'bins/engine-version.txt' })
}

const isLegacy = process.env.THE_LEGACY == 'true'
if (isLegacy) {
  configOption.extraFiles.push({
    from: 'bins/yakit-system-mode.txt',
    to: 'bins/ruiyan-system-mode.txt',
  })
}

const autoDiscoveryIdentity = process.env.CSC_IDENTITY_AUTO_DISCOVERY
if (autoDiscoveryIdentity == 'true') {
  const { APPLE_ID, APPLE_TEAM_ID, APPLE_APP_SPECIFIC_PASSWORD, CERT_BASE64, CERT_PASSWORD } = process.env
  if (APPLE_ID && APPLE_TEAM_ID && APPLE_APP_SPECIFIC_PASSWORD && CERT_BASE64 && CERT_PASSWORD) {
    configOption.afterSign = 'packageScript/buildHook/after-sign.js'
  }
}

module.exports = { ...configOption }
