import type { Risk } from '@/pages/risks/schema'
import {
  getCollaborationClientID,
  prepareSharedHTTPFlow,
  prepareSharedRisk,
  readFullHTTPFlowBytes,
  resolveShareableRiskHTTPFlowId,
  serializeSharedRisk,
  PreparedTeamShare,
} from './sharedRecordAdapters'
import {
  getErrorStatus,
  readTeamShareBaseUrl,
  sharePreparedTeamRecord,
  TeamRecordUploadTarget,
  TeamShareStoppedError,
} from './sharedRecordUpload'

export interface LocalShareItem {
  kind: 'http-flow' | 'risk'
  id: number
}

export interface BatchShareResult {
  phase: 'query' | 'upload' | 'done'
  total: number
  success: number
  duplicate: number
  failures: Array<LocalShareItem & { message: string }>
  pending: LocalShareItem[]
  stoppedReason: string
}

export interface BatchShareOptions {
  localProjectId: number
  projectType: string
  target: Omit<TeamRecordUploadTarget, 'check'>
  kinds: LocalShareItem['kind'][]
  retryItems?: LocalShareItem[]
  isCurrent: () => boolean
  signal: AbortSignal
  onProgress: (result: BatchShareResult) => void
}

type Invoke = (channel: string, input?: any) => Promise<any>
const invokeEngine: Invoke = (channel, input) => window.require('electron').ipcRenderer.invoke(channel, input)
const validId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const prepareLocalTeamRecord = async (item: LocalShareItem, invoke: Invoke): Promise<PreparedTeamShare> => {
  if (!validId(item.id)) throw new Error('本地记录标识无效')
  let risk: Risk | undefined
  let flowId = item.id
  if (item.kind === 'risk') {
    const response = await invoke('QueryRisks', { Ids: [item.id] })
    if (!Array.isArray(response?.Data) || response.Data.length !== 1 || response.Data[0]?.Id !== item.id) {
      throw new Error('未读取到唯一且匹配的漏洞')
    }
    risk = response.Data[0]
    flowId = resolveShareableRiskHTTPFlowId(risk!)
  }
  const flow = await invoke('GetHTTPFlowById', { Id: flowId })
  if (flow?.Id !== flowId || !validId(flow.CreatedAt)) throw new Error('未读取到匹配的 HTTP 流量')
  const bytes = await readFullHTTPFlowBytes(flowId, invoke)
  const clientId = await getCollaborationClientID(invoke)
  const http = await prepareSharedHTTPFlow({
    clientId,
    localFlowId: String(flowId),
    capturedAt: new Date(flow.CreatedAt * 1000).toISOString(),
    ...bytes,
    summary: { method: flow.Method, url: flow.Url, host: flow.HostPort || '', status_code: flow.StatusCode },
  })
  if (!risk) return { kind: 'http-flow', http }
  if (typeof risk.Severity !== 'string' || !risk.Severity) throw new Error('漏洞等级字段不完整')
  return {
    kind: 'risk',
    http,
    risk: await prepareSharedRisk({
      clientId,
      localRiskId: String(risk.Id),
      flowKey: http.flowKey,
      payload: await serializeSharedRisk(risk),
      summary: { title: risk.Title, severity: risk.Severity, risk_type: risk.RiskType },
    }),
  }
}

export const runTeamRecordBatch = async (options: BatchShareOptions): Promise<BatchShareResult> => {
  const result: BatchShareResult = {
    phase: 'query',
    total: 0,
    success: 0,
    duplicate: 0,
    failures: [],
    pending: [],
    stoppedReason: '',
  }
  const items: LocalShareItem[] = []
  let index = 0
  let enumerated = false
  const checkCurrent = () => {
    if (options.signal.aborted) throw new TeamShareStoppedError('已取消；在途请求确认后停止，可重试未完成记录')
    if (!options.isCurrent()) throw new TeamShareStoppedError('账号、团队或项目已变化，旧任务已停止')
  }
  const check = async () => {
    checkCurrent()
    if ((await readTeamShareBaseUrl()) !== options.target.request.diyHome) {
      throw new TeamShareStoppedError('服务地址已变化，旧任务已停止')
    }
    checkCurrent()
    const project = await invokeEngine('GetCurrentProjectEx', { Type: options.projectType })
    checkCurrent()
    if (Number(project?.Id) !== options.localProjectId) {
      throw new TeamShareStoppedError(
        `所选本地项目 ${options.localProjectId} 与引擎当前项目 ${project?.Id ?? '未知'} 不一致，请先打开所选项目`,
      )
    }
  }
  const invoke: Invoke = async (channel, input) => {
    await check()
    const value = await invokeEngine(channel, input)
    await check()
    return value
  }
  const report = () => options.onProgress({ ...result, failures: [...result.failures], pending: [] })
  try {
    if (!validId(options.localProjectId) || !options.kinds.length) throw new Error('请明确选择本地项目和共享内容')
    await check()
    if (options.retryItems) {
      items.push(...options.retryItems)
    } else {
      // Collect IDs before writing and reject detectable pagination drift.
      for (const kind of Array.from(new Set(options.kinds))) {
        let total: number | undefined
        const seen = new Set<number>()
        for (let page = 1; ; page += 1) {
          const response = await invoke(kind === 'http-flow' ? 'QueryHTTPFlows' : 'QueryRisks', {
            Pagination: { Page: page, Limit: 100, OrderBy: 'id', Order: 'asc' },
          })
          const count = Number(response?.Total)
          if (!Number.isSafeInteger(count) || count < 0 || !Array.isArray(response?.Data))
            throw new Error('本地分页响应无效')
          if (total !== undefined && count !== total) throw new Error('本地记录数量在分页期间变化，请重新开始共享')
          if (total === undefined) result.total += count
          total = count
          for (const record of response.Data) {
            if (!validId(record.Id) || seen.has(record.Id))
              throw new Error('本地分页出现重复或无效标识，请重新开始共享')
            seen.add(record.Id)
            items.push({ kind, id: record.Id })
          }
          report()
          if (seen.size === total) break
          if (seen.size > total || !response.Data.length) throw new Error('本地分页不完整，请重新开始共享')
        }
      }
    }
    enumerated = true
    result.phase = 'upload'
    result.total = items.length
    report()
    for (; index < items.length; index += 1) {
      await check()
      const item = items[index]
      try {
        const prepared = await prepareLocalTeamRecord(item, invoke)
        const response = await sharePreparedTeamRecord(prepared, { ...options.target, check })
        if (response.duplicate) result.duplicate += 1
        else result.success += 1
      } catch (error) {
        if (error instanceof TeamShareStoppedError) throw error
        await check()
        result.failures.push({ ...item, message: messageOf(error) })
        if ([401, 403].includes(getErrorStatus(error))) {
          index += 1
          throw new TeamShareStoppedError('团队权限或登录状态已失效，旧任务已停止')
        }
      }
      report()
    }
  } catch (error) {
    result.stoppedReason = messageOf(error)
  }
  result.pending = enumerated ? items.slice(index) : []
  result.phase = 'done'
  options.onProgress(result)
  return result
}
