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
  status: string
  reason?: string
  plugin_id?: number
  revision?: number
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
  items: results.map((item) => ({
    name: item.name,
    status: item.status,
    detail:
      item.reason || (item.plugin_id ? `插件 ${item.plugin_id}，修订 ${item.revision ?? '-'}` : `状态：${item.status}`),
  })),
})
