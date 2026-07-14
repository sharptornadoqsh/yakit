import type { YaklangEngineMode } from './types'

export const ENGINE_LIFECYCLE_STATES = [
  'checking-local',
  'ready-local',
  'extracting-bundled',
  'missing',
  'incompatible',
  'update-available',
  'downloading',
  'verifying',
  'installing',
  'starting',
  'connected',
  'remote',
  'error',
  'recoverable-error',
] as const

export type EngineLifecycleStateName = (typeof ENGINE_LIFECYCLE_STATES)[number]
export type EngineCompatibility = 'compatible' | 'incompatible' | 'unknown'
export type EngineCapability = 'compatible' | 'incompatible' | 'unknown'

export interface EngineLifecycleState {
  state: EngineLifecycleStateName
  message: string
  progress?: number
  logPath?: string
  error?: string
}

export interface EngineLifecycleTransition {
  type: 'transition'
  state: EngineLifecycleStateName
  message: string
  progress?: number
  logPath?: string
  error?: string
}

export const initialEngineLifecycleState: EngineLifecycleState = {
  state: 'checking-local',
  message: '正在检查本地引擎',
}

export const engineLifecycleReducer = (
  current: EngineLifecycleState,
  transition: EngineLifecycleTransition,
): EngineLifecycleState => ({
  state: transition.state,
  message: transition.message,
  progress:
    transition.progress === undefined ? undefined : Math.max(0, Math.min(100, Number(transition.progress) || 0)),
  logPath: transition.logPath ?? current.logPath,
  error: transition.error,
})

export interface EngineStartupFacts {
  mode: YaklangEngineMode
  local: {
    exists: boolean
    compatibility: EngineCompatibility
    updateAvailable: boolean
  }
  bundled: {
    exists: boolean
  }
}

export type EngineStartupDecision =
  | { state: 'remote'; action: 'connect-remote' }
  | { state: 'checking-local'; action: 'start-local' }
  | { state: 'ready-local'; action: 'start-local' }
  | { state: 'update-available'; action: 'start-local'; backgroundUpdate: true }
  | { state: 'extracting-bundled'; action: 'extract-bundled' }
  | { state: 'incompatible'; action: 'show-recovery' }
  | { state: 'missing'; action: 'await-user' }

export const decideEngineStartup = (facts: EngineStartupFacts): EngineStartupDecision => {
  if (facts.mode === 'remote') return { state: 'remote', action: 'connect-remote' }

  if (facts.local.exists && facts.local.compatibility === 'compatible') {
    if (facts.local.updateAvailable) {
      return { state: 'update-available', action: 'start-local', backgroundUpdate: true }
    }
    return { state: 'ready-local', action: 'start-local' }
  }

  if (facts.local.exists && facts.local.compatibility === 'unknown') {
    return { state: 'checking-local', action: 'start-local' }
  }

  if (facts.bundled.exists) return { state: 'extracting-bundled', action: 'extract-bundled' }
  if (facts.local.exists && facts.local.compatibility === 'incompatible') {
    return { state: 'incompatible', action: 'show-recovery' }
  }
  return { state: 'missing', action: 'await-user' }
}

interface ParsedVersion {
  core: number[]
  prerelease: Array<string | number>
}

const parseEngineVersion = (version?: string): ParsedVersion | undefined => {
  if (!version || version === 'TBD') return undefined
  const normalized = version.trim().replace(/^v/i, '')
  const match = /^(\d+(?:\.\d+)*)(?:[-+]([0-9A-Za-z.-]+))?$/.exec(normalized)
  if (!match) return undefined

  const prerelease = (match[2] || '')
    .split(/[.-]/)
    .filter(Boolean)
    .flatMap((part) => part.match(/[A-Za-z]+|\d+/g) || [part])
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()))

  return {
    core: match[1].split('.').map(Number),
    prerelease,
  }
}

export const compareEngineVersions = (left?: string, right?: string): number | undefined => {
  const leftVersion = parseEngineVersion(left)
  const rightVersion = parseEngineVersion(right)
  if (!leftVersion || !rightVersion) return undefined

  const coreLength = Math.max(leftVersion.core.length, rightVersion.core.length)
  for (let index = 0; index < coreLength; index += 1) {
    const difference = (leftVersion.core[index] || 0) - (rightVersion.core[index] || 0)
    if (difference !== 0) return difference > 0 ? 1 : -1
  }

  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length === 0) return 0
  if (leftVersion.prerelease.length === 0) return 1
  if (rightVersion.prerelease.length === 0) return -1

  const prereleaseLength = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length)
  for (let index = 0; index < prereleaseLength; index += 1) {
    const leftPart = leftVersion.prerelease[index]
    const rightPart = rightVersion.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    if (typeof leftPart === 'number' && typeof rightPart === 'number') return leftPart > rightPart ? 1 : -1
    if (typeof leftPart === 'number') return -1
    if (typeof rightPart === 'number') return 1
    return leftPart > rightPart ? 1 : -1
  }
  return 0
}

export interface EngineCompatibilityInput {
  currentVersion?: string
  capability: EngineCapability
  minimumVersion?: string
  recommendedVersion?: string
  highestVerifiedVersion?: string
}

export interface EngineCompatibilityResult {
  compatibility: EngineCompatibility
  updateAvailable: boolean
  reason?: 'capability-check-failed' | 'version-unavailable' | 'below-minimum' | 'above-verified-range'
}

export const assessEngineCompatibility = (input: EngineCompatibilityInput): EngineCompatibilityResult => {
  const recommendedComparison = compareEngineVersions(input.recommendedVersion, input.currentVersion)
  const updateAvailable = recommendedComparison === 1

  if (input.capability === 'incompatible') {
    return { compatibility: 'incompatible', updateAvailable: false, reason: 'capability-check-failed' }
  }
  if (!parseEngineVersion(input.currentVersion)) {
    return { compatibility: 'unknown', updateAvailable: false, reason: 'version-unavailable' }
  }

  const minimumComparison = compareEngineVersions(input.currentVersion, input.minimumVersion)
  if (minimumComparison === -1) {
    return { compatibility: 'incompatible', updateAvailable, reason: 'below-minimum' }
  }

  const highestComparison = compareEngineVersions(input.currentVersion, input.highestVerifiedVersion)
  if (highestComparison === 1) {
    return {
      compatibility: input.capability === 'unknown' ? 'unknown' : 'compatible',
      updateAvailable,
      reason: 'above-verified-range',
    }
  }

  return {
    compatibility: input.capability === 'unknown' ? 'unknown' : 'compatible',
    updateAvailable,
  }
}
