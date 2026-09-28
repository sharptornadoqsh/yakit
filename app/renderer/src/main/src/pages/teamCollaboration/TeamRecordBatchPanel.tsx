import React, { useEffect, useRef, useState } from 'react'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import { isIRify } from '@/utils/envfile'
import { BatchShareResult, LocalShareItem, runTeamRecordBatch } from './sharedRecordBatch'
import { subscribeTeamAuthenticationInvalidation, subscribeTeamPermissionInvalidation } from './teamPermissionContext'

interface Props {
  teamId: number
  projectId: number
  localProjectId: number
  localProjectName: string
  baseUrl: string
  userId: number
  token: string
  canShareHTTP: boolean
  canShareRisk: boolean
  disabled: boolean
  onShared?: () => void
}

export const TeamRecordBatchPanel: React.FC<Props> = (props) => {
  const [open, setOpen] = useState(false)
  const [http, setHTTP] = useState(false)
  const [risk, setRisk] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BatchShareResult>()
  const controller = useRef<AbortController>()
  const contextKey = JSON.stringify([
    props.teamId,
    props.projectId,
    props.localProjectId,
    props.baseUrl,
    props.userId,
    props.token,
    props.canShareHTTP,
    props.canShareRisk,
  ])
  const context = useRef(contextKey)
  context.current = contextKey
  const resultContext = useRef('')
  const mounted = useRef(true)
  useEffect(() => {
    const stop = () => controller.current?.abort()
    const offAuth = subscribeTeamAuthenticationInvalidation(stop)
    const offPermission = subscribeTeamPermissionInvalidation((teamId) => {
      if (teamId === props.teamId) stop()
    })
    return () => {
      stop()
      offAuth()
      offPermission()
    }
  }, [contextKey, props.teamId])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
    }
  }, [])

  const start = async (retryItems?: LocalShareItem[]) => {
    if (controller.current || props.disabled || !props.canShareHTTP) return
    const kinds: LocalShareItem['kind'][] = []
    if (http) kinds.push('http-flow')
    if (risk && props.canShareRisk) kinds.push('risk')
    if (!kinds.length) return
    const bound = contextKey
    const task = new AbortController()
    controller.current = task
    resultContext.current = bound
    setRunning(true)
    setResult(undefined)
    try {
      const outcome = await runTeamRecordBatch({
        localProjectId: props.localProjectId,
        projectType: isIRify() ? 'ssa_project' : 'project',
        kinds,
        retryItems,
        signal: task.signal,
        isCurrent: () => mounted.current && context.current === bound,
        target: {
          teamId: props.teamId,
          projectId: props.projectId,
          userId: props.userId,
          request: { diyHome: props.baseUrl, headers: { Authorization: props.token } },
        },
        onProgress: (value) => {
          if (mounted.current) setResult(value)
        },
      })
      if (mounted.current && context.current === bound && outcome.success + outcome.duplicate > 0) props.onShared?.()
    } finally {
      controller.current = undefined
      if (mounted.current) setRunning(false)
    }
  }
  const remaining = result ? result.total - result.success - result.duplicate - result.failures.length : 0
  const sameContext = resultContext.current === contextKey
  return (
    <section aria-label="逐条共享流量与漏洞">
      <YakitButton onClick={() => setOpen(!open)} disabled={running || props.disabled || !props.canShareHTTP}>
        共享流量/漏洞到团队
      </YakitButton>
      {open && (
        <div>
          <p>
            手动共享本地项目 {props.localProjectName}（ID {props.localProjectId}）到团队 {props.teamId} / 项目{' '}
            {props.projectId}。请先在客户端打开该本地项目；这里不会切换工作项目。
          </p>
          <label>
            <input type="checkbox" checked={http} disabled={running} onChange={(e) => setHTTP(e.target.checked)} />
            该本地项目的全部 HTTP 流量
          </label>
          <label>
            <input
              type="checkbox"
              checked={risk}
              disabled={running || !props.canShareRisk}
              onChange={(e) => setRisk(e.target.checked)}
            />
            该本地项目的全部漏洞（含唯一关联流量）
          </label>
          <p>
            仅逐条共享所选内容，不发布归档，不启动后台上传。漏洞共享先写流量，失败或取消时已确认的关联流量会保留，重试时复用。成功和重复均以服务端确认为准；漏洞缺失关联或多重关联会列入失败清单。
          </p>
          <YakitButton
            onClick={() => void start()}
            disabled={running || props.disabled || !props.canShareHTTP || (!http && !risk)}
          >
            确认逐条共享
          </YakitButton>
          {running && <YakitButton onClick={() => controller.current?.abort()}>取消共享</YakitButton>}
          {result && (
            <div role="status">
              {!sameContext && <p>以下为旧任务结果，目标已切换；重新选择内容开始新任务。</p>}
              {result.phase === 'query' && <p>正在分页收集本地记录，尚未上传。</p>}
              <p>
                共 {result.total} 条；成功 {result.success}，重复 {result.duplicate}，失败 {result.failures.length}
                ，待处理 {remaining}。
              </p>
              {result.stoppedReason && <p role="alert">{result.stoppedReason}</p>}
              <ul>
                {result.failures.map((item) => (
                  <li key={`${item.kind}:${item.id}`}>
                    {item.kind === 'risk' ? '漏洞' : '流量'} #{item.id}：{item.message}
                  </li>
                ))}
              </ul>
              <YakitButton
                disabled={running || !sameContext || !result.failures.length || props.disabled}
                onClick={() => void start(result.failures)}
              >
                仅重试失败记录
              </YakitButton>
              <YakitButton
                disabled={running || !sameContext || !result.pending.length || props.disabled}
                onClick={() => void start(result.pending)}
              >
                继续待处理记录
              </YakitButton>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
