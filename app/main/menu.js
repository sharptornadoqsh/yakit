const electron = require('electron')
const process = require('process')
const { productConfig } = require('./product')

const isMac = process.platform === 'darwin'

const createMenuTemplate = ({ showAbout, openExternal = (target) => electron.shell.openExternal(target) }) => {
  const macAppMenu = {
    label: productConfig.displayName,
    submenu: [
      { label: `关于 ${productConfig.displayName}`, click: showAbout },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', label: `隐藏 ${productConfig.displayName}` },
      { role: 'hideOthers', label: '隐藏其他窗口' },
      { role: 'unhide', label: '全部显示' },
      { type: 'separator' },
      { role: 'quit', label: `退出 ${productConfig.displayName}` },
    ],
  }

  const viewMenu = {
    label: '视图',
    submenu: [
      { role: 'reload', label: '重新载入', accelerator: '' },
      { role: 'forceReload', label: '强制重新载入', accelerator: '' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
      { role: 'resetZoom', label: '重置缩放' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '切换全屏' },
    ],
  }

  const helpMenu = {
    role: 'help',
    label: '帮助',
    submenu: [
      { label: `关于 ${productConfig.displayName}`, click: showAbout },
      { type: 'separator' },
      { label: '上游开源文档', click: () => openExternal(productConfig.upstreamDocumentationUrl) },
    ],
  }

  return [
    ...(isMac ? [macAppMenu] : []),
    { role: 'editMenu', label: '编辑' },
    viewMenu,
    { role: 'windowMenu', label: '窗口' },
    helpMenu,
  ]
}

module.exports = { createMenuTemplate }
