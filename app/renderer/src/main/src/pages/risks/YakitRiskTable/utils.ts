import { yakitNotify } from '@/utils/notification'
import type { QueryRisksByIdsRequest, QueryRisksRequest, QueryRisksResponse } from './YakitRiskTableType'
import type { Risk } from '../schema'
import type { FieldName, Fields } from '../RiskTable'
import { defQueryRisksRequest } from './constants'
import i18n from '@/i18n/i18n'
import {
  prepareSharedRisk,
  resolveShareableRiskHTTPFlowId,
  serializeSharedRisk,
} from '@/pages/teamCollaboration/sharedRecordAdapters'
import type { PreparedTeamShare } from '@/pages/teamCollaboration/sharedRecordAdapters'
import { prepareHTTPFlowForTeamShare } from '@/components/HTTPFlowTable/useHTTPFlowTableContextMenu'
const tOriginal = i18n.getFixedT(null, ['yakitUi', 'risk'])

const { ipcRenderer } = window.require('electron')
/** QueryRisks */
export function apiQueryRisks(query?: QueryRisksRequest): Promise<QueryRisksResponse>
export function apiQueryRisks(query: QueryRisksByIdsRequest): Promise<QueryRisksResponse>
export function apiQueryRisks(query?: QueryRisksRequest | QueryRisksByIdsRequest): Promise<QueryRisksResponse> {
  return new Promise((resolve, reject) => {
    ipcRenderer
      .invoke('QueryRisks', query)
      .then(resolve)
      .catch((e) => {
        yakitNotify('error', tOriginal('YakitNotification.queryFailed', { error: e + '' }))
        reject(e)
      })
  })
}

export const apiQueryUniqueRiskById = async (riskId: number): Promise<Risk> => {
  if (!Number.isSafeInteger(riskId) || riskId <= 0) throw new Error('Risk 标识无效')
  const response = await apiQueryRisks({ Ids: [riskId] })
  if (!Array.isArray(response.Data) || response.Data.length !== 1 || response.Data[0]?.Id !== riskId) {
    throw new Error('无法获取唯一且匹配的 Risk')
  }
  return response.Data[0]
}

export const prepareRiskForTeamShare = async (
  riskId: number,
  isCurrent: () => boolean,
): Promise<PreparedTeamShare | undefined> => {
  if (!isCurrent()) return undefined
  const risk = await apiQueryUniqueRiskById(riskId)
  if (!isCurrent()) return undefined
  if (
    typeof risk.Title !== 'string' ||
    !risk.Title ||
    typeof risk.Severity !== 'string' ||
    !risk.Severity ||
    typeof risk.RiskType !== 'string' ||
    !risk.RiskType
  ) {
    throw new Error('Risk 摘要字段不完整')
  }
  const flowId = resolveShareableRiskHTTPFlowId(risk)
  if (!isCurrent()) return undefined
  const preparedHTTP = await prepareHTTPFlowForTeamShare(flowId, isCurrent)
  if (!preparedHTTP || preparedHTTP.kind !== 'http-flow' || !isCurrent()) return undefined
  const payload = await serializeSharedRisk(risk)
  if (!isCurrent()) return undefined
  const preparedRisk = await prepareSharedRisk({
    clientId: preparedHTTP.http.sourceClientId,
    localRiskId: String(risk.Id),
    flowKey: preparedHTTP.http.flowKey,
    payload,
    summary: {
      title: risk.Title,
      severity: risk.Severity,
      risk_type: risk.RiskType,
    },
  })
  if (!isCurrent()) return undefined
  return { kind: 'risk', http: preparedHTTP.http, risk: preparedRisk }
}
/** 获取漏洞与风险的总数 通过RuntimeId */
export const apiQueryRisksTotalByRuntimeId: (RuntimeId: string) => Promise<QueryRisksResponse> = (RuntimeId) => {
  return new Promise((resolve, reject) => {
    const params: QueryRisksRequest = {
      ...defQueryRisksRequest,
      Pagination: {
        ...defQueryRisksRequest.Pagination,
        Page: 1,
        Limit: 1,
      },
      RuntimeId,
    }
    ipcRenderer
      .invoke('QueryRisks', params)
      .then(resolve)
      .catch((e) => {
        yakitNotify('error', tOriginal('YakitRiskTable.queryRisksTotalFailed') + `${e}`)
        reject(e)
      })
  })
}
/** 获取漏洞与风险的总数 通过RuntimeIds */
export const apiQueryRisksTotalByRuntimeIds: (RuntimeIds: string[]) => Promise<QueryRisksResponse> = (RuntimeIds) => {
  return new Promise((resolve, reject) => {
    const params: QueryRisksRequest = {
      ...defQueryRisksRequest,
      Pagination: {
        ...defQueryRisksRequest.Pagination,
        Page: 1,
        Limit: 1,
      },
      RuntimeIds,
    }
    ipcRenderer
      .invoke('QueryRisks', params)
      .then(resolve)
      .catch((e) => {
        yakitNotify('error', tOriginal('YakitRiskTable.queryRisksTotalFailed') + `${e}`)
        reject(e)
      })
  })
}
/**
 * @description QueryRisks 获取降序的增量数据
 */
export const apiQueryRisksIncrementOrderDesc: (params: QueryRisksRequest) => Promise<QueryRisksResponse> = (params) => {
  const newParams: QueryRisksRequest = { ...params, UntilId: 0 }
  return apiQueryRisks(newParams)
}
export interface NewRiskReadRequest {
  /**@deprecated */
  AfterId?: string
  /**传空数组代表全部已读 */
  Ids?: number[]
  Filter?: QueryRisksRequest
}
export const apiNewRiskRead: (query?: NewRiskReadRequest) => Promise<null> = (query) => {
  return new Promise((resolve, reject) => {
    ipcRenderer
      .invoke('set-risk-info-read', query)
      .then(resolve)
      .catch((e) => {
        yakitNotify('error', tOriginal('YakitNotification.readFailed', { error: e + '' }))
        reject(e)
      })
  })
}

export interface DeleteRiskRequest {
  Id?: number
  Hash?: string
  Filter?: QueryRisksRequest
  Ids?: number[]
  DeleteAll?: boolean
  DeleteRepetition?: boolean
}
/** DeleteRisk */
export const apiDeleteRisk: (query?: DeleteRiskRequest) => Promise<null> = (query) => {
  return new Promise((resolve, reject) => {
    ipcRenderer
      .invoke('DeleteRisk', query)
      .then(resolve)
      .catch((e) => {
        yakitNotify('error', tOriginal('YakitNotification.deleteFailed', { error: e + '' }))
        reject(e)
      })
  })
}
export interface ExportHtmlProps {
  htmlContent: string
  fileName: string
  data: Risk[]
}
/** export-risk-html */
export const apiExportHtml: (params: ExportHtmlProps) => Promise<string> = (params) => {
  return new Promise((resolve, reject) => {
    ipcRenderer
      .invoke('export-risk-html', params)
      .then(resolve)
      .catch((e) => {
        yakitNotify('error', tOriginal('YakitNotification.exportFailed', { error: e + '' }))
        reject(e)
      })
  })
}

export interface QueryRiskTagsResponse {
  RiskTags: FieldGroup[]
}
export interface FieldGroup {
  Name: string
  Total: number
}
/** QueryRiskTags */
export const apiQueryRiskTags: () => Promise<QueryRiskTagsResponse> = () => {
  return new Promise((resolve, reject) => {
    ipcRenderer
      .invoke('QueryRiskTags')
      .then(resolve)
      .catch((e) => {
        yakitNotify('error', tOriginal('YakitRiskTable.queryRiskTagsFailed') + `${e}`)
        reject(e)
      })
  })
}

/** QueryAvailableRiskType */
export const apiQueryAvailableRiskType: () => Promise<FieldName[]> = () => {
  return new Promise((resolve, reject) => {
    ipcRenderer
      .invoke('QueryAvailableRiskType')
      .then((res: Fields) => {
        const { Values = [] } = res
        if (Values.length > 0) {
          const data = Values.sort((a, b) => b.Total - a.Total)
          resolve(data)
        } else {
          resolve([])
        }
      })
      .catch((e) => {
        yakitNotify('error', tOriginal('YakitRiskTable.queryAvailableRiskTypeFailed') + `${e}`)
        reject(e)
      })
  })
}

export interface SetTagForRiskRequest {
  Id: number
  Hash: string
  Tags: string[]
}
/** SetTagForRisk */
export const apiSetTagForRisk: (params: SetTagForRiskRequest) => Promise<SetTagForRiskRequest> = (params) => {
  return new Promise((resolve, reject) => {
    ipcRenderer
      .invoke('SetTagForRisk', params)
      .then(resolve)
      .catch((e) => {
        yakitNotify('error', tOriginal('YakitNotification.settingFailed', { error: e + '' }))
        reject(e)
      })
  })
}

export interface RiskFieldGroupResponse {
  RiskIPGroup: FieldGroup[]
  RiskLevelGroup: FieldName[]
  RiskTypeGroup: FieldName[]
}
/** RiskFieldGroup */
export const apiRiskFieldGroup: () => Promise<RiskFieldGroupResponse> = () => {
  return new Promise((resolve, reject) => {
    ipcRenderer
      .invoke('RiskFieldGroup')
      .then(resolve)
      .catch((e) => {
        yakitNotify('error', tOriginal('YakitNotification.queryFailed', { error: e + '' }))
        reject(e)
      })
  })
}

export interface UploadRiskToOnlineRequest {
  Token: string
  ProjectName?: string
  Hash: string[]
}
/** RiskFeedbackToOnline */
export const apiRiskFeedbackToOnline: (params: UploadRiskToOnlineRequest) => Promise<unknown> = (params) => {
  return new Promise((resolve, reject) => {
    ipcRenderer
      .invoke('RiskFeedbackToOnline', params)
      .then(resolve)
      .catch((e) => {
        yakitNotify('error', tOriginal('YakitNotification.feedbackFailed', { error: e + '' }))
        reject(e)
      })
  })
}
