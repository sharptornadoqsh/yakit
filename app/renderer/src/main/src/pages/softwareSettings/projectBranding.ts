import { productConfig } from '@/config/product'

const DEFAULT_PROJECT_NAME = '[default]'
const LEGACY_DEFAULT_DATA_DIRECTORY = /~[\\/]yakit-projects(?=$|[\\/])/gi
const LEGACY_ENTERPRISE_DATABASE_NAME = /company-default-yakit\.db/gi
const LEGACY_DEFAULT_DATABASE_NAME = /default-yakit\.db/gi

export const getProjectDisplayText = (projectName: string, value?: string) => {
  if (!value || projectName !== DEFAULT_PROJECT_NAME) return value || ''
  return value
    .replace(LEGACY_DEFAULT_DATA_DIRECTORY, `~/${productConfig.defaultDataDirectory}/projects`)
    .replace(LEGACY_ENTERPRISE_DATABASE_NAME, productConfig.enterpriseDefaultDatabaseName)
    .replace(LEGACY_DEFAULT_DATABASE_NAME, productConfig.defaultDatabaseName)
}
