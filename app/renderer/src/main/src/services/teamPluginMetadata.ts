import type { TeamPluginVersion } from './teamCollaboration'

export const normalizePluginNumber = (value: unknown): number => {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return NaN
}

export const requirePluginVersion = (value: unknown, field = 'version'): number => {
  const version = normalizePluginNumber(value)
  if (version === 0) throw new Error(`${field}=0：旧上传记录尚未迁移为正整数分发版本，请更新服务端并完成迁移`)
  if (!Number.isSafeInteger(version) || version <= 0)
    throw new Error(`${field} 必须是正的安全整数，收到 ${String(value)}`)
  return version
}

export const requirePluginHash = (value: unknown, field = 'file_hash'): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${field} 必须是 64 位小写 SHA-256 正文摘要，收到 ${String(value)}`)
  }
  return value
}

export const normalizePluginDistributionFields = <T extends object>(value: T): T => {
  let result = value
  for (const field of ['id', 'team_id', 'plugin_id', 'version', 'revision', 'size_bytes']) {
    if (Object.prototype.hasOwnProperty.call(result, field)) {
      const normalized = normalizePluginNumber(Reflect.get(result, field))
      if (!Object.is(normalized, Reflect.get(result, field))) {
        if (result === value) result = { ...value }
        Reflect.set(result, field, normalized)
      }
    }
  }
  return result
}

export const validateTeamPluginVersion = (
  value: TeamPluginVersion,
  teamId: number,
  pluginId: number,
): TeamPluginVersion => {
  const item = normalizePluginDistributionFields(value)
  for (const [field, expected] of [
    ['team_id', teamId],
    ['plugin_id', pluginId],
  ] as const) {
    if (item[field] !== expected) throw new Error(`${field} 不匹配：期望 ${expected}，收到 ${String(value[field])}`)
  }
  return { ...item, version: requirePluginVersion(value.version), file_hash: requirePluginHash(value.file_hash) }
}
