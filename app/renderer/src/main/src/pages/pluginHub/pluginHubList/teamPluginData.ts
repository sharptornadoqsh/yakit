export type TeamPluginVisibility = 'private' | 'team'

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
  status: string
  message?: string
  reason?: string
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

export const summarizeTeamPluginImportResults = (results: TeamPluginImportResult[]) => ({
  succeeded: results.filter((item) => ['created', 'updated', 'success'].includes(item.status)).length,
  failed: results.filter((item) => item.status === 'failed').length,
  skipped: results.filter((item) => item.status === 'skipped').length,
  items: results.map((item) => {
    const pluginId = item.remote_plugin_id || item.plugin_id
    const version = item.version || item.revision
    const details = [
      item.message || item.reason,
      pluginId ? `远端插件 ${pluginId}` : '',
      version ? `版本 ${version}` : '',
      item.conflict_type ? `冲突 ${item.conflict_type}` : '',
    ].filter(Boolean)
    return {
      name: item.plugin_name || item.name || item.source_name || '未命名插件',
      status: item.status,
      detail: details.join('；') || `状态：${item.status}`,
    }
  }),
})
