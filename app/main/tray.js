const path = require('path')
const electron = require('electron')
const { productConfig } = require('./product')

let productTray = null

const createProductTray = (
  { showMainWindow, hideWindows, openLogDirectory, showAbout, quitApplication },
  electronApi = electron,
) => {
  if (productTray && !productTray.isDestroyed()) return productTray

  const { Menu, Tray, nativeImage } = electronApi
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/renyan-tray.png'))
  if (process.platform === 'darwin') icon.setTemplateImage(true)

  productTray = new Tray(icon)
  productTray.setToolTip(productConfig.displayName)
  productTray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: showMainWindow },
      { label: '隐藏', click: hideWindows },
      { type: 'separator' },
      { label: '打开日志目录', click: openLogDirectory },
      { label: '关于', click: showAbout },
      { type: 'separator' },
      { label: '退出', click: quitApplication },
    ]),
  )
  productTray.on('click', showMainWindow)
  productTray.on('double-click', showMainWindow)
  return productTray
}

const destroyProductTray = () => {
  if (productTray && !productTray.isDestroyed()) productTray.destroy()
  productTray = null
}

module.exports = { createProductTray, destroyProductTray }
