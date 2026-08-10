import type { CacheDataHistoryProps } from '@/components/yakitUI/utils'
import { CacheDropDownGV } from '@/yakitGV'

interface ChromeProfileCacheMigrationResult {
  cache: CacheDataHistoryProps
  changed: boolean
}

interface ChromeProfileCacheStore {
  read: (key: string) => Promise<CacheDataHistoryProps>
  write: (key: string, value: string) => Promise<unknown>
}

const legacyChromeProfilePattern = /(?:^|[\\/])Yakit[\\/]yakit-projects[\\/]chrome-profile[\\/]?$/i

export const migrateLegacyChromeProfileCache = (
  cache: CacheDataHistoryProps,
  productChromeProfilePath: string,
): ChromeProfileCacheMigrationResult => {
  if (!productChromeProfilePath) return { cache, changed: false }

  let changed = false
  const defaultValue = legacyChromeProfilePattern.test(cache.defaultValue)
    ? productChromeProfilePath
    : cache.defaultValue
  if (defaultValue !== cache.defaultValue) changed = true

  const options = cache.options.map((option) => {
    const value = legacyChromeProfilePattern.test(option.value) ? productChromeProfilePath : option.value
    const label =
      typeof option.label === 'string' && legacyChromeProfilePattern.test(option.label)
        ? productChromeProfilePath
        : option.label

    if (value === option.value && label === option.label) return option
    changed = true
    return { ...option, value, label }
  })

  if (!changed) return { cache, changed: false }
  return {
    cache: { ...cache, defaultValue, options },
    changed: true,
  }
}

export const migrateLegacyChromeProfileRemoteCache = async (
  productChromeProfilePath: string,
  store: ChromeProfileCacheStore,
): Promise<boolean> => {
  const cacheKey = CacheDropDownGV.MITMSaveUserDataDir
  const cache = await store.read(cacheKey)
  const migration = migrateLegacyChromeProfileCache(cache, productChromeProfilePath)
  if (!migration.changed) return false

  await store.write(
    cacheKey,
    JSON.stringify({
      options: migration.cache.options,
      defaultValue: migration.cache.defaultValue,
    }),
  )
  return true
}
