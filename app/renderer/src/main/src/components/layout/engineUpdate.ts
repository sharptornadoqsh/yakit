import type { YaklangEngineMode } from '@/yakitGVDefine'

export type EngineUpdateStatus = 'not-checked' | 'checking' | 'current' | 'available'

export const shouldCheckEngineUpdate = (engineLink: boolean, engineMode?: YaklangEngineMode) =>
  engineLink && engineMode === 'local'

const compareEngineVersions = (left: string, right: string) => {
  const splitVersion = (version: string) => {
    const normalized = version.trim().replace(/^v/i, '').split('+')[0]
    const separatorIndex = normalized.indexOf('-')
    if (separatorIndex === -1) return { core: normalized, prerelease: '' }
    return {
      core: normalized.slice(0, separatorIndex),
      prerelease: normalized.slice(separatorIndex + 1),
    }
  }

  const leftVersion = splitVersion(left)
  const rightVersion = splitVersion(right)
  const options: Intl.CollatorOptions = { numeric: true, sensitivity: 'base' }
  const coreComparison = leftVersion.core.localeCompare(rightVersion.core, undefined, options)
  if (coreComparison !== 0) return coreComparison
  if (!leftVersion.prerelease && !rightVersion.prerelease) return 0
  if (!leftVersion.prerelease) return 1
  if (!rightVersion.prerelease) return -1
  return leftVersion.prerelease.localeCompare(rightVersion.prerelease, undefined, options)
}

export const resolveEngineUpdateStatus = (currentVersion: string, latestVersion: string): EngineUpdateStatus => {
  if (!currentVersion || !latestVersion) return 'not-checked'
  return compareEngineVersions(latestVersion, currentVersion) > 0 ? 'available' : 'current'
}
