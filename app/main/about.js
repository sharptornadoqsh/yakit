const fs = require('fs')
const path = require('path')
const { app, BrowserWindow, dialog, shell } = require('electron')
const packageJson = require('../../package.json')
const { resolveEdition } = require('../../product/build')
const { loadExtraFilePath } = require('./filePath')
const { productConfig } = require('./product')

let aboutWindow = null

const readEngineVersion = () => {
  try {
    return fs.readFileSync(loadExtraFilePath(path.join('bins', 'engine-version.txt')), 'utf8').trim() || 'unknown'
  } catch (error) {
    return 'unknown'
  }
}

const getAboutData = () => ({
  displayName: productConfig.displayName,
  shortName: productConfig.shortName,
  clientVersion: app.getVersion() || packageJson.version,
  engineVersion: readEngineVersion(),
  buildSha: app.isPackaged ? packageJson.buildSha || 'unknown' : process.env.BUILD_SHA || 'development',
  edition:
    packageJson.edition ||
    resolveEdition(
      process.env.RENDER_PLATFORM || process.env.REACT_APP_PLATFORM,
      process.env.REACT_APP_REQUIRE_ENTERPRISE_LICENSE,
    ),
  supportName: productConfig.supportName,
  copyright: productConfig.copyright,
})

const getLegalPath = (filename) =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'legal', filename)
    : path.resolve(
        __dirname,
        '..',
        '..',
        filename === 'LICENSE.md' ? filename : path.join('product', 'legal', filename),
      )

const openLegalDocument = async (filename) => {
  const documentPath = getLegalPath(filename)
  const errorMessage = await shell.openPath(documentPath)
  if (errorMessage) dialog.showErrorBox('无法打开文档', errorMessage)
}

const handleAboutLink = (targetUrl) => {
  if (targetUrl === 'renyan://license') {
    void openLegalDocument('LICENSE.md')
    return true
  }
  if (targetUrl === 'renyan://third-party') {
    void openLegalDocument('THIRD_PARTY_NOTICES.md')
    return true
  }
  return false
}

const showAboutWindow = (parentWindow) => {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.show()
    aboutWindow.focus()
    return aboutWindow
  }

  aboutWindow = new BrowserWindow({
    parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
    width: 560,
    height: 650,
    minWidth: 520,
    minHeight: 600,
    maximizable: false,
    minimizable: false,
    resizable: true,
    autoHideMenuBar: true,
    title: `关于 ${productConfig.displayName}`,
    icon: path.join(__dirname, '../assets/renyan-icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  const query = Object.fromEntries(Object.entries(getAboutData()).map(([key, value]) => [key, `${value}`]))
  aboutWindow.loadFile(path.join(__dirname, 'about.html'), { query })
  aboutWindow.setMenu(null)
  aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
    handleAboutLink(url)
    return { action: 'deny' }
  })
  aboutWindow.webContents.on('will-navigate', (event, url) => {
    if (handleAboutLink(url)) event.preventDefault()
  })
  aboutWindow.on('closed', () => {
    aboutWindow = null
  })
  return aboutWindow
}

module.exports = { getAboutData, getLegalPath, openLegalDocument, showAboutWindow }
