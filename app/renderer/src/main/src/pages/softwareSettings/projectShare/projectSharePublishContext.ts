import type { ProjectSharePublishContext } from './ProjectShareModal'

export interface ProjectSharePluginSelection {
  pluginIds: number[]
  pluginVersion: number
}

export const resolvePublishContext = (
  localProjectId: number,
  selection: ProjectSharePluginSelection,
): Promise<ProjectSharePublishContext> =>
  window.require('electron').ipcRenderer.invoke('ResolveProjectSharePublishContext', { localProjectId, ...selection })

export const listProjectSharePlugins = async (): Promise<{ id: number; name: string; type: string }[]> => {
  const { ipcRenderer } = window.require('electron')
  const plugins: { id: number; name: string; type: string }[] = []
  const ids = new Set<number>()
  for (let page = 1; page <= 100; page++) {
    const response = await ipcRenderer.invoke('QueryYakScript', {
      Pagination: { Page: page, Limit: 100, OrderBy: 'id', Order: 'asc' },
    })
    if (!Array.isArray(response?.Data)) throw new Error('本地插件列表响应无效')
    let added = 0
    for (const item of response.Data) {
      const id = Number(item.Id)
      if (Number.isSafeInteger(id) && id > 0 && !ids.has(id)) {
        plugins.push({ id, name: item.ScriptName, type: item.Type })
        ids.add(id)
        added++
      }
    }
    if (response.Data.length < 100 || plugins.length >= Number(response.Total)) return plugins
    if (!added) throw new Error('本地插件分页未推进，请刷新后重试')
  }
  throw new Error('本地插件超过本次选择列表上限，请先缩小本地插件范围')
}
