export interface TeamPluginInstallRecord {
  id: number
  teamId?: number
  scriptName: string
  type?: string
  uuid?: string
  description?: string
  fileHash: string
  version: number
  revision: number
  visibility?: 'private' | 'team'
  categoryId?: number
  categoryName?: string
  groupIds?: number[]
  groupNames?: string[]
  tags?: string[]
}

export interface TeamPluginLocalMapping {
  schemaVersion: 1
  onlineBaseUrl: string
  teamId?: number
  teamPluginId: number
  localPluginId?: number
  localPluginUUID?: string
  localScriptName: string
  version: number
  revision: number
  fileHash: string
  categoryId?: number
  groupIds: number[]
  installedAt: string
}

export interface LocalPluginRecord {
  Id?: number
  ScriptName?: string
  UUID?: string
}

export type TeamPluginLocalConflictResolution =
  | { action: 'skip' }
  | { action: 'overwrite' }
  | { action: 'copy'; scriptName: string }

export type TeamPluginDownloadContent = ArrayBuffer | Uint8Array

interface TeamPluginInstallDependencies {
  onlineBaseUrl?: string
  findLocalPlugin?: (scriptName: string) => Promise<LocalPluginRecord | undefined>
  resolveLocalConflict?: (input: {
    plugin: TeamPluginInstallRecord
    existing: LocalPluginRecord
  }) => Promise<TeamPluginLocalConflictResolution>
  download: (version: number) => Promise<TeamPluginDownloadContent>
  digest?: (content: ArrayBuffer) => Promise<string>
  savePlugin: (input: Record<string, unknown>) => Promise<LocalPluginRecord>
  saveGroups?: (scriptName: string, groupNames: string[]) => Promise<void>
  saveMapping?: (mapping: TeamPluginLocalMapping) => Promise<void>
  now?: () => Date
}

export const sha256ArrayBuffer = async (content: ArrayBuffer) => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', content)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

const uniqueNames = (values: Array<string | undefined>) =>
  Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))

export const normalizeDownloadedPluginBytes = (value: ArrayBuffer | Uint8Array): ArrayBuffer => {
  if (value instanceof ArrayBuffer) return value.slice(0)
  return Uint8Array.from(value).buffer as ArrayBuffer
}

export const installTeamPluginDownload = async (
  plugin: TeamPluginInstallRecord,
  dependencies: TeamPluginInstallDependencies,
) => {
  if (!Number.isSafeInteger(plugin.version) || plugin.version <= 0) {
    throw new Error('插件版本无效')
  }
  const expectedHash = plugin.fileHash.trim()
  if (!/^[0-9a-f]{64}$/.test(expectedHash)) {
    throw new Error('插件版本缺少有效正文摘要')
  }

  let targetScriptName = plugin.scriptName
  let targetPluginId: number | undefined
  let targetPluginUUID = plugin.uuid || ''
  if (dependencies.findLocalPlugin) {
    const existing = await dependencies.findLocalPlugin(plugin.scriptName)
    if (existing) {
      if (!dependencies.resolveLocalConflict) throw new Error('本地已存在同名插件，必须选择处理方式')
      const resolution = await dependencies.resolveLocalConflict({ plugin, existing })
      if (resolution.action === 'skip') return { skipped: true as const }
      if (resolution.action === 'overwrite') {
        if (!Number.isSafeInteger(existing.Id) || Number(existing.Id) <= 0) {
          throw new Error('本地同名插件缺少有效标识，无法覆盖')
        }
        targetPluginId = existing.Id
        targetPluginUUID = existing.UUID || targetPluginUUID
      } else {
        targetScriptName = resolution.scriptName.trim()
        if (!targetScriptName || targetScriptName === plugin.scriptName) {
          throw new Error('插件副本名称无效')
        }
        if (await dependencies.findLocalPlugin(targetScriptName)) {
          throw new Error('插件副本名称已存在')
        }
        targetPluginUUID = ''
      }
    }
  }

  const downloadContent = await dependencies.download(plugin.version)
  const bytes = normalizeDownloadedPluginBytes(downloadContent)
  if (bytes.byteLength === 0) throw new Error('团队插件正文为空')
  const actualHash = await (dependencies.digest || sha256ArrayBuffer)(bytes)
  if (!/^[0-9a-f]{64}$/.test(actualHash)) throw new Error('插件正文摘要格式无效')
  if (actualHash !== expectedHash) throw new Error('插件正文摘要校验失败')

  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new Error('插件正文不是有效 UTF-8')
  }
  const originalBytes = new Uint8Array(bytes)
  const roundTripBytes = new TextEncoder().encode(content)
  if (
    roundTripBytes.byteLength !== originalBytes.byteLength ||
    roundTripBytes.some((byte, index) => byte !== originalBytes[index])
  ) {
    throw new Error('插件正文 UTF-8 重编码校验失败')
  }
  if (!content.trim()) throw new Error('团队插件正文为空')

  const groupNames = uniqueNames([plugin.categoryName, ...(plugin.groupNames || [])])
  const onlineBaseUrl = dependencies.onlineBaseUrl?.trim() || ''
  const localPluginInput: Record<string, unknown> = {
    ScriptName: targetScriptName,
    Type: plugin.type || 'yak',
    Content: content,
    Help: plugin.description || '',
    UUID: targetPluginUUID,
    Tags: (plugin.tags || []).join(','),
    OnlineId: plugin.id,
    OnlineScriptName: plugin.scriptName,
    OnlineBaseUrl: onlineBaseUrl,
    OnlineIsPrivate: plugin.visibility === 'private',
    OnlineGroup: groupNames.join(','),
  }
  if (targetPluginId) localPluginInput.Id = targetPluginId
  const localPlugin = await dependencies.savePlugin(localPluginInput)

  const localScriptName = localPlugin.ScriptName || targetScriptName
  if (groupNames.length && dependencies.saveGroups) await dependencies.saveGroups(localScriptName, groupNames)

  const mapping: TeamPluginLocalMapping = {
    schemaVersion: 1,
    onlineBaseUrl,
    teamId: plugin.teamId,
    teamPluginId: plugin.id,
    localPluginId: localPlugin.Id,
    localPluginUUID: localPlugin.UUID,
    localScriptName,
    version: plugin.version,
    revision: plugin.revision,
    fileHash: actualHash,
    categoryId: plugin.categoryId,
    groupIds: plugin.groupIds || [],
    installedAt: (dependencies.now || (() => new Date()))().toISOString(),
  }
  if (dependencies.saveMapping) await dependencies.saveMapping(mapping)

  return { localPlugin, mapping }
}
