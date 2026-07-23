import type { PluginImportEntry, PluginVisibility } from '@/services/teamCollaboration'
import { sha256ArrayBuffer } from './teamPluginInstall'

export interface LocalPluginUploadSource {
  Id: number
  ScriptName: string
  Type: string
  Content: string
  Help?: string
  Tags?: string
}

export interface TeamPluginUploadOptions {
  visibility: PluginVisibility
  categoryId?: number
  groupIds?: number[]
  overwrite?: boolean
}

type TeamPluginContentDigest = (content: string) => Promise<string>

const digestText: TeamPluginContentDigest = (content) => {
  const bytes = new TextEncoder().encode(content)
  return sha256ArrayBuffer(bytes.buffer as ArrayBuffer)
}

const uniquePositiveIntegers = (values: number[] = []) =>
  Array.from(new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0)))

const normalizeTags = (value = '') =>
  Array.from(
    new Set(
      value
        .split(/[,;，；]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  )

export const buildTeamPluginUploadEntries = async (
  plugins: LocalPluginUploadSource[],
  options: TeamPluginUploadOptions,
  digest: TeamPluginContentDigest = digestText,
): Promise<PluginImportEntry[]> => {
  if (!plugins.length) throw new Error('请选择本地插件')
  const groupIds = uniquePositiveIntegers(options.groupIds)

  return Promise.all(
    plugins.map(async (plugin) => {
      const scriptName = plugin.ScriptName.trim()
      const type = plugin.Type.trim()
      const content = plugin.Content
      if (!scriptName || !type || !content.trim()) {
        throw new Error(`本地插件“${scriptName || plugin.Id}”缺少名称、类型或正文`)
      }
      const entry: PluginImportEntry = {
        source_name: scriptName,
        script_name: scriptName,
        type,
        content,
        tags: normalizeTags(plugin.Tags),
        description: plugin.Help?.trim() || '',
        visibility: options.visibility,
        overwrite: Boolean(options.overwrite),
        file_hash: await digest(content),
      }
      if (options.categoryId) entry.category_id = options.categoryId
      if (groupIds.length) entry.group_ids = groupIds
      return entry
    }),
  )
}
