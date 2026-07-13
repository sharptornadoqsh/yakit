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

const getExecutableName = (platform = process.platform) =>
  platform === 'linux' ? productConfig.linuxExecutableName : productConfig.executableName

const resolveUserDataPath = (appDataPath) => path.join(appDataPath, productConfig.defaultDataDirectory)

const configureApplicationIdentity = (electronApp, platform = process.platform) => {
  electronApp.setName(productConfig.displayName)
  electronApp.setPath('userData', resolveUserDataPath(electronApp.getPath('appData')))
  if (platform === 'win32') electronApp.setAppUserModelId(productConfig.appId)
}

module.exports = {
  productConfig: Object.freeze({ ...productConfig }),
  getExecutableName,
  resolveUserDataPath,
  configureApplicationIdentity,
}
