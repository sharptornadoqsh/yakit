const fs = require('fs')
const path = require('path')
const productConfig = require('../../product/renyan.json')

const requiredFields = [
  'displayName',
  'shortName',
  'appId',
  'executableName',
  'linuxExecutableName',
  'artifactPrefix',
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

requiredFields.forEach((field) => {
  if (typeof productConfig[field] !== 'string' || !productConfig[field].trim()) {
    throw new Error(`Product configuration field is required: ${field}`)
  }
})

if (typeof productConfig.clientUpdateEnabled !== 'boolean') {
  throw new Error('Product configuration field must be boolean: clientUpdateEnabled')
}

const getExecutableName = (platform = process.platform) =>
  platform === 'linux' ? productConfig.linuxExecutableName : productConfig.executableName

const resolveUserDataPath = (appDataPath) => path.join(appDataPath, productConfig.defaultDataDirectory)

const configureApplicationIdentity = (electronApp, platform = process.platform) => {
  const userDataPath = resolveUserDataPath(electronApp.getPath('appData'))
  fs.mkdirSync(userDataPath, { recursive: true })
  electronApp.setName(productConfig.displayName)
  electronApp.setPath('userData', userDataPath)
  if (platform === 'win32') electronApp.setAppUserModelId(productConfig.appId)
}

module.exports = {
  productConfig: Object.freeze({ ...productConfig }),
  getExecutableName,
  resolveUserDataPath,
  configureApplicationIdentity,
}
