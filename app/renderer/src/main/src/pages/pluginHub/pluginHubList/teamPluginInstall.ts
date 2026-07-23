export interface TeamPluginInstallRecord {
  id: number
  teamId?: number
  scriptName: string
  type?: string
  uuid?: string
  description?: string
  fileHash?: string
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

export type TeamPluginDownloadContent = Blob | ArrayBuffer | Uint8Array | string | { type: 'Buffer'; data: number[] }

interface TeamPluginInstallDependencies {
  onlineBaseUrl?: string
  findLocalPlugin?: (scriptName: string) => Promise<LocalPluginRecord | undefined>
  resolveLocalConflict?: (input: {
    plugin: TeamPluginInstallRecord
    existing: LocalPluginRecord
  }) => Promise<TeamPluginLocalConflictResolution>
  download: () => Promise<TeamPluginDownloadContent>
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

const copyBytes = (view: Uint8Array): ArrayBuffer => view.slice().buffer as ArrayBuffer

const isSerializedBuffer = (content: TeamPluginDownloadContent): content is { type: 'Buffer'; data: number[] } =>
  Boolean(
    content &&
    typeof content === 'object' &&
    'type' in content &&
    content.type === 'Buffer' &&
    'data' in content &&
    Array.isArray(content.data),
  )

const readDownloadArrayBuffer = (content: TeamPluginDownloadContent): Promise<ArrayBuffer> => {
  if (typeof content === 'string') return Promise.resolve(copyBytes(new TextEncoder().encode(content)))
  if (content instanceof ArrayBuffer) return Promise.resolve(content.slice(0))
  if (ArrayBuffer.isView(content)) {
    return Promise.resolve(copyBytes(new Uint8Array(content.buffer, content.byteOffset, content.byteLength)))
  }
  if (isSerializedBuffer(content)) {
    if (!content.data.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
      return Promise.reject(new Error('团队插件字节响应无效'))
    }
    return Promise.resolve(copyBytes(Uint8Array.from(content.data)))
  }
  if (content && typeof (content as Blob).arrayBuffer === 'function') {
    return (content as Blob).arrayBuffer()
  }
  if (typeof FileReader !== 'undefined' && typeof Blob !== 'undefined' && content instanceof Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error || new Error('读取团队插件正文失败'))
      reader.readAsArrayBuffer(content)
    })
  }
  return Promise.reject(new Error('团队插件下载响应格式无效'))
}

export const installTeamPluginDownload = async (
  plugin: TeamPluginInstallRecord,
  dependencies: TeamPluginInstallDependencies,
) => {
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

  const downloadContent = await dependencies.download()
  const bytes = await readDownloadArrayBuffer(downloadContent)
  if (bytes.byteLength === 0) throw new Error('团队插件正文为空')
  const actualHash = (await (dependencies.digest || sha256ArrayBuffer)(bytes)).toLowerCase()
  const expectedHash = plugin.fileHash?.trim().toLowerCase()
  if (expectedHash && actualHash !== expectedHash) throw new Error('插件正文摘要校验失败')

  const content = new TextDecoder().decode(bytes)
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
    revision: plugin.revision,
    fileHash: actualHash,
    categoryId: plugin.categoryId,
    groupIds: plugin.groupIds || [],
    installedAt: (dependencies.now || (() => new Date()))().toISOString(),
  }
  if (dependencies.saveMapping) await dependencies.saveMapping(mapping)

  return { localPlugin, mapping }
}
