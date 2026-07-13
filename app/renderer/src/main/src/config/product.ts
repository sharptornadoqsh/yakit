import productSource from '../../../../../../product/renyan.json'

export interface ProductConfig {
  displayName: string
  shortName: string
  appId: string
  executableName: string
  linuxExecutableName: string
  artifactPrefix: string
  defaultDataDirectory: string
  updateChannel: string
  supportName: string
  copyright: string
  primaryColor: string
  successColor: string
  warningColor: string
  errorColor: string
  edition: string
  tagline: string
  repositoryUrl: string
  issuesUrl: string
  licenseUrl: string
  thirdPartyNoticesUrl: string
  upstreamDocumentationUrl: string
}

export const productConfig = Object.freeze(productSource) as Readonly<ProductConfig>

export const productBuild = Object.freeze({
  buildSha: process.env.REACT_APP_RENYAN_BUILD_SHA || 'unknown',
  edition: process.env.REACT_APP_RENYAN_EDITION || productSource.edition,
})
