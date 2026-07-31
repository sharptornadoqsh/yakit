import React, { useEffect, useRef, useState } from 'react'
import { NewHTTPPacketEditor } from '@/utils/editors'
import { ParsedSharedHTTPFlow, ParsedSharedRisk, parseSharedHTTPFlow, parseSharedRisk } from './sharedRecordAdapters'

export interface SharedHTTPFlowDetailProps {
  httpContent: string
  riskContent?: string
}

export interface TeamSharedRecordsRefreshDetail {
  teamId: number
  projectId: number
}

export const TEAM_SHARED_RECORDS_REFRESH_EVENT = 'yakit:team-shared-records-refresh'

declare global {
  interface WindowEventMap {
    'yakit:team-shared-records-refresh': CustomEvent<TeamSharedRecordsRefreshDetail>
  }
}

export const dispatchTeamSharedRecordsRefresh = (detail: TeamSharedRecordsRefreshDetail) => {
  window.dispatchEvent(new CustomEvent<TeamSharedRecordsRefreshDetail>(TEAM_SHARED_RECORDS_REFRESH_EVENT, { detail }))
}

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; http: ParsedSharedHTTPFlow; risk?: ParsedSharedRisk; riskPayloadText?: string }

const bytesToText = (value: Uint8Array): string => new TextDecoder().decode(value)

const decodeRiskPayload = (value: Uint8Array): string => {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(value)
  } catch {
    throw new Error('共享 Risk 载荷不是合法 UTF-8')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('共享 Risk 载荷不是合法 JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('共享 Risk 载荷根值必须是对象')
  }
  return text
}

export const SharedHTTPFlowDetail: React.FC<SharedHTTPFlowDetailProps> = ({ httpContent, riskContent }) => {
  const requestSequenceRef = useRef(0)
  const [state, setState] = useState<DetailState>({ status: 'loading' })

  useEffect(() => {
    const requestSequence = requestSequenceRef.current + 1
    requestSequenceRef.current = requestSequence
    setState({ status: 'loading' })

    const load = async () => {
      try {
        const http = await parseSharedHTTPFlow(httpContent)
        const risk = riskContent ? await parseSharedRisk(riskContent) : undefined
        if (risk && risk.flowKey !== http.flowKey) throw new Error('Risk 与 HTTP Flow 的关联标识不匹配')
        const riskPayloadText = risk ? decodeRiskPayload(risk.payload) : undefined
        if (requestSequenceRef.current === requestSequence) setState({ status: 'ready', http, risk, riskPayloadText })
      } catch (error) {
        if (requestSequenceRef.current === requestSequence) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : '共享记录无效',
          })
        }
      }
    }

    void load()
    return () => {
      if (requestSequenceRef.current === requestSequence) requestSequenceRef.current += 1
    }
  }, [httpContent, riskContent])

  if (state.status === 'loading') return <div role="status">正在校验共享记录…</div>
  if (state.status === 'error') return <div role="alert">{state.message}</div>

  return (
    <div>
      <div>
        <strong>{state.http.summary.method}</strong>
        <span>{state.http.summary.url}</span>
        <span>{state.http.summary.status_code}</span>
      </div>
      <NewHTTPPacketEditor
        title="请求"
        originValue={bytesToText(state.http.request)}
        originalPackage={state.http.request}
        readOnly={true}
        onlyBasicMenu={true}
        noPacketModifier={true}
        noOpenPacketNewWindow={true}
        noSendToComparer={true}
        showDownBodyMenu={false}
      />
      <NewHTTPPacketEditor
        title="响应"
        originValue={bytesToText(state.http.response)}
        originalPackage={state.http.response}
        isResponse={true}
        readOnly={true}
        onlyBasicMenu={true}
        noPacketModifier={true}
        noOpenPacketNewWindow={true}
        noSendToComparer={true}
        showDownBodyMenu={false}
      />
      {state.risk && (
        <section>
          <h4>{state.risk.summary.title}</h4>
          <div>{state.risk.summary.severity}</div>
          <div>{state.risk.summary.risk_type}</div>
          <pre>{state.riskPayloadText}</pre>
        </section>
      )}
    </div>
  )
}
