import productSource from '../../../../../product/renyan.json'

export interface ProductConfig {
  displayName: string
  shortName: string
  defaultDataDirectory: string
  clientUpdateEnabled: boolean
  primaryColor: string
  successColor: string
  warningColor: string
  errorColor: string
  tagline: string
}

export const productConfig = Object.freeze(productSource) as Readonly<ProductConfig>
