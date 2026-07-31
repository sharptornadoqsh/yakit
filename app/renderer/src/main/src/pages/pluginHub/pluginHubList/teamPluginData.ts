import type { PluginImportItemStatus } from '@/services/teamCollaboration'

export type TeamPluginVisibility = 'private' | 'team'
export type { PluginImportItemStatus } from '@/services/teamCollaboration'

export interface TeamPluginQueryState {
  keyword: string
  categoryId?: number
  groupId?: number
  visibility?: TeamPluginVisibility
  page: number
  limit: number
}

export interface TeamPluginImportResult {
  name: string
  source_name?: string
  plugin_name?: string
  status: PluginImportItemStatus
  message?: string
  reason?: string
  error?: string
  plugin_id?: number
  remote_plugin_id?: number
  version?: number
  revision?: number
  content_hash?: string
  conflict_type?: string
}

export const buildTeamPluginQuery = (state: TeamPluginQueryState) => {
  const query: Record<string, string | number> = { page: state.page, limit: state.limit }
  if (state.keyword.trim()) query.keyword = state.keyword.trim()
  if (state.categoryId) query.category_id = state.categoryId
  if (state.groupId) query.group_id = state.groupId
  if (state.visibility) query.visibility = state.visibility
  return query
}

const importStatuses = new Set<PluginImportItemStatus>(['created', 'updated', 'skipped', 'failed'])

export const summarizeTeamPluginImportResults = (results: TeamPluginImportResult[]) => {
  const items = results.map((item) => {
    const originalStatus = item.status as string
    const status: PluginImportItemStatus = importStatuses.has(item.status) ? item.status : 'failed'
    const pluginId = item.plugin_id ?? item.remote_plugin_id
    const version = Number.isSafeInteger(item.version) && Number(item.version) > 0 ? item.version : undefined
    const error =
      status === 'failed'
        ? importStatuses.has(item.status)
          ? item.error || item.reason || item.message
          : `未知导入状态：${originalStatus}`
        : undefined
    const fileHash = item.content_hash
    const details = [
      error || item.message || item.reason,
      pluginId ? `远端插件 ${pluginId}` : '',
      version ? `版本 ${version}` : '',
      item.conflict_type ? `冲突 ${item.conflict_type}` : '',
    ].filter(Boolean)
    return {
      name: item.plugin_name || item.name || item.source_name || '未命名插件',
      pluginId,
      version,
      status,
      error,
      fileHash,
      detail: details.join('；') || `状态：${item.status}`,
    }
  })
  return {
    succeeded: items.filter((item) => item.status === 'created' || item.status === 'updated').length,
    failed: items.filter((item) => item.status === 'failed').length,
    skipped: items.filter((item) => item.status === 'skipped').length,
    items,
  }
}
