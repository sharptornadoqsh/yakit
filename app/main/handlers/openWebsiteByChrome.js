const electronFull = require('electron')
const { ipcMain, shell } = electronFull
const { assertTrustedAppSender, normalizeHttpUrl, validateOpenPath } = require('../security')
const { openLegalDocument } = require('../about')

const legalDocuments = {
  license: 'LICENSE.md',
  'third-party': 'THIRD_PARTY_NOTICES.md',
}

module.exports = (win, getClient) => {
  ipcMain.handle('shell-open-external', async (e, url) => {
    assertTrustedAppSender(e, 'shell-open-external')
    await shell.openExternal(normalizeHttpUrl(url))
  })

  ipcMain.handle('shell-open-abs-file', async (e, file) => {
    assertTrustedAppSender(e, 'shell-open-abs-file')
    return shell.openPath(validateOpenPath(file))
  })

  ipcMain.handle('open-product-legal-document', async (e, documentType) => {
    assertTrustedAppSender(e, 'open-product-legal-document')
    const filename = legalDocuments[documentType]
    if (!filename) throw new Error('不支持的法律文档类型')
    return openLegalDocument(filename)
  })
}
