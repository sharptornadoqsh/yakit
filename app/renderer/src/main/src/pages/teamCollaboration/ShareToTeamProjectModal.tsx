import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { YakitModal } from '@/components/yakitUI/YakitModal/YakitModal'
import { YakitSelect } from '@/components/yakitUI/YakitSelect/YakitSelect'
import {
  CollaborationProject,
  CurrentCollaborationUser,
  TestDataRecord,
  TestResultRecord,
  createTestData,
  createTestResult,
  getMe,
} from '@/services/teamCollaboration'
import { useStore } from '@/store'
import { subscribeTeamAuthenticationInvalidation, subscribeTeamPermissionInvalidation } from './teamPermissionContext'
import {
  PreparedSharedHTTPFlow,
  PreparedSharedRisk,
  PreparedTeamShare,
  createSharedHTTPFlowPayload,
  createSharedRiskPayload,
  getCollaborationClientID,
  parseSharedHTTPFlow,
  parseSharedRisk,
} from './sharedRecordAdapters'
import { SharedRecordError, sha256Hex } from './binaryPayload'
import styles from './ShareToTeamProjectModal.module.scss'

export interface ShareProjectTarget {
  id: number
  name: string
}

export interface ShareTeamTarget {
  id: number
  name: string
  memberVersion: number
  canShareHTTPFlow: boolean
  canShareRisk: boolean
  projects: ShareProjectTarget[]
}

export interface ShareTargetCapabilities {
  canShareHTTPFlow: boolean
  canShareRisk: boolean
  teams: ShareTeamTarget[]
}

export interface ShareToTeamProjectSuccess {
  teamId: number
  projectId: number
  flowKey: string
  riskKey?: string
  httpRecord: TestDataRecord
  riskRecord?: TestResultRecord
}

export interface ShareToTeamProjectModalProps {
  visible: boolean
  prepared: PreparedTeamShare
  onCancel: () => void
  onSuccess: (result: ShareToTeamProjectSuccess) => void
}

const EMPTY_CAPABILITIES: ShareTargetCapabilities = {
  canShareHTTPFlow: false,
  canShareRisk: false,
  teams: [],
}

const isPositiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0

const getActiveProjects = (projects: readonly CollaborationProject[], teamId: number): ShareProjectTarget[] =>
  projects
    .filter(
      (project) =>
        isPositiveInteger(project.id) &&
        project.team_id === teamId &&
        project.status === 'active' &&
        typeof project.name === 'string' &&
        Boolean(project.name),
    )
    .map((project) => ({ id: project.id, name: project.name }))

export const getShareTargetCapabilities = (currentUser: CurrentCollaborationUser): ShareTargetCapabilities => {
  if (
    !currentUser ||
    !currentUser.user ||
    currentUser.user.status !== 'active' ||
    !isPositiveInteger(currentUser.user.id) ||
    !Array.isArray(currentUser.memberships)
  ) {
    return EMPTY_CAPABILITIES
  }

  const teams = currentUser.memberships.flatMap((membership): ShareTeamTarget[] => {
    const { member, team } = membership
    if (
      !member ||
      !team ||
      member.status !== 'active' ||
      team.status !== 'active' ||
      !isPositiveInteger(member.version) ||
      !isPositiveInteger(team.id) ||
      member.team_id !== team.id ||
      member.user_id !== currentUser.user.id ||
      !Array.isArray(membership.permissions) ||
      !Array.isArray(membership.projects)
    ) {
      return []
    }
    const projects = getActiveProjects(membership.projects, team.id)
    if (projects.length === 0) return []
    const permissions = new Set(
      membership.permissions.filter((permission) => typeof permission === 'string' && Boolean(permission)),
    )
    const canShareHTTPFlow = permissions.has('test_data.write')
    const canShareRisk = canShareHTTPFlow && permissions.has('test_result.write')
    return [
      {
        id: team.id,
        name: team.name,
        memberVersion: member.version,
        canShareHTTPFlow,
        canShareRisk,
        projects,
      },
    ]
  })

  return {
    canShareHTTPFlow: teams.some((team) => team.canShareHTTPFlow),
    canShareRisk: teams.some((team) => team.canShareRisk),
    teams,
  }
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

export const matchDuplicateHTTPRecord = (
  value: unknown,
  teamId: number,
  projectId: number,
  prepared: PreparedSharedHTTPFlow,
): value is TestDataRecord => {
  const record = asRecord(value)
  return Boolean(
    record &&
    isPositiveInteger(record.id) &&
    record.team_id === teamId &&
    record.project_id === projectId &&
    record.name === prepared.name &&
    record.data_type === 'http_flow' &&
    record.content_hash === prepared.contentHash &&
    record.deduplication_key === `http-flow:${prepared.flowKey}` &&
    record.source_client_id === prepared.sourceClientId &&
    record.status === 'active',
  )
}

export const matchDuplicateRiskRecord = (
  value: unknown,
  teamId: number,
  projectId: number,
  testDataId: number,
  prepared: PreparedSharedRisk,
): value is TestResultRecord => {
  const record = asRecord(value)
  return Boolean(
    record &&
    isPositiveInteger(record.id) &&
    record.team_id === teamId &&
    record.project_id === projectId &&
    record.test_data_id === testDataId &&
    record.name === prepared.name &&
    record.result_type === 'risk' &&
    record.severity === prepared.summary.severity &&
    record.content_hash === prepared.contentHash &&
    record.deduplication_key === `risk:${prepared.riskKey}` &&
    record.source_client_id === prepared.sourceClientId &&
    record.status === 'active',
  )
}

const getErrorStatus = (error: unknown): number => {
  const record = asRecord(error)
  const response = asRecord(record?.response)
  return Number(response?.status || record?.status || 0)
}

const getConflictRecord = (error: unknown, expectedCode: 'duplicate_data' | 'duplicate_result'): unknown => {
  const errorRecord = asRecord(error)
  const response = asRecord(errorRecord?.response)
  if (Number(response?.status) !== 409 || errorRecord?.code !== expectedCode) return undefined
  return asRecord(response?.data)?.data
}

const contentHash = (content: string) => sha256Hex(new TextEncoder().encode(content))

const matchesBytesPayload = (
  left: PreparedSharedHTTPFlow['request'] | PreparedSharedRisk['payload'],
  right: PreparedSharedHTTPFlow['request'] | PreparedSharedRisk['payload'],
) => left.raw_base64 === right.raw_base64 && left.byte_length === right.byte_length && left.sha256 === right.sha256

const matchesHTTPFlowSummary = (left: PreparedSharedHTTPFlow['summary'], right: PreparedSharedHTTPFlow['summary']) =>
  left.method === right.method &&
  left.url === right.url &&
  left.host === right.host &&
  left.status_code === right.status_code

const matchesRiskSummary = (left: PreparedSharedRisk['summary'], right: PreparedSharedRisk['summary']) =>
  left.title === right.title && left.severity === right.severity && left.risk_type === right.risk_type

const validatePreparedShare = async (prepared: PreparedTeamShare): Promise<void> => {
  const clientId = await getCollaborationClientID()
  const parsedHTTP = await parseSharedHTTPFlow(prepared.http.content)
  const expectedHTTP = await createSharedHTTPFlowPayload({
    clientId,
    localFlowId: prepared.http.localFlowId,
    capturedAt: parsedHTTP.capturedAt,
    request: parsedHTTP.request,
    response: parsedHTTP.response,
    summary: parsedHTTP.summary,
  })
  if (
    prepared.http.sourceClientId !== clientId ||
    prepared.http.name !== `HTTP Flow ${prepared.http.localFlowId}` ||
    prepared.http.content !== JSON.stringify(expectedHTTP) ||
    prepared.http.flowKey !== expectedHTTP.flow_key ||
    !matchesBytesPayload(prepared.http.request, expectedHTTP.request) ||
    !matchesBytesPayload(prepared.http.response, expectedHTTP.response) ||
    !matchesHTTPFlowSummary(prepared.http.summary, expectedHTTP.summary) ||
    (await contentHash(prepared.http.content)) !== prepared.http.contentHash
  ) {
    throw new Error('invalid_prepared_http_flow')
  }
  if (prepared.kind === 'risk') {
    const parsedRisk = await parseSharedRisk(prepared.risk.content)
    const expectedRisk = await createSharedRiskPayload({
      clientId,
      localRiskId: prepared.risk.localRiskId,
      flowKey: expectedHTTP.flow_key,
      payload: parsedRisk.payload,
      summary: parsedRisk.summary,
    })
    if (
      prepared.risk.sourceClientId !== clientId ||
      prepared.risk.name !== `Risk ${prepared.risk.localRiskId}` ||
      prepared.risk.content !== JSON.stringify(expectedRisk) ||
      prepared.risk.riskKey !== expectedRisk.risk_key ||
      prepared.risk.flowKey !== expectedHTTP.flow_key ||
      !matchesBytesPayload(prepared.risk.payload, expectedRisk.payload) ||
      !matchesRiskSummary(prepared.risk.summary, expectedRisk.summary) ||
      (await contentHash(prepared.risk.content)) !== prepared.risk.contentHash
    ) {
      throw new Error('invalid_prepared_risk')
    }
  }
}

const getActiveTarget = (
  capabilities: ShareTargetCapabilities,
  kind: PreparedTeamShare['kind'],
  teamId: number,
  projectId: number,
): { team: ShareTeamTarget; project: ShareProjectTarget } | undefined => {
  const team = capabilities.teams.find(
    (candidate) => candidate.id === teamId && (kind === 'risk' ? candidate.canShareRisk : candidate.canShareHTTPFlow),
  )
  const project = team?.projects.find((candidate) => candidate.id === projectId)
  return team && project ? { team, project } : undefined
}

const createOrRecoverHTTPRecord = async (
  teamId: number,
  projectId: number,
  prepared: PreparedSharedHTTPFlow,
): Promise<TestDataRecord> => {
  try {
    const response = await createTestData(teamId, projectId, {
      name: prepared.name,
      type: 'http_flow',
      content: prepared.content,
      deduplication_key: `http-flow:${prepared.flowKey}`,
      source_client_id: prepared.sourceClientId,
    })
    if (!matchDuplicateHTTPRecord(response.data, teamId, projectId, prepared)) {
      throw new Error('invalid_shared_http_flow_response')
    }
    return response.data
  } catch (error) {
    const duplicate = getConflictRecord(error, 'duplicate_data')
    if (matchDuplicateHTTPRecord(duplicate, teamId, projectId, prepared)) return duplicate
    throw error
  }
}

const createOrRecoverRiskRecord = async (
  teamId: number,
  projectId: number,
  testDataId: number,
  prepared: PreparedSharedRisk,
): Promise<TestResultRecord> => {
  try {
    const response = await createTestResult(teamId, projectId, {
      test_data_id: testDataId,
      name: prepared.name,
      type: 'risk',
      severity: prepared.summary.severity,
      content: prepared.content,
      deduplication_key: `risk:${prepared.riskKey}`,
      source_client_id: prepared.sourceClientId,
    })
    if (!matchDuplicateRiskRecord(response.data, teamId, projectId, testDataId, prepared)) {
      throw new Error('invalid_shared_risk_response')
    }
    return response.data
  } catch (error) {
    const duplicate = getConflictRecord(error, 'duplicate_result')
    if (matchDuplicateRiskRecord(duplicate, teamId, projectId, testDataId, prepared)) return duplicate
    throw error
  }
}

export const ShareToTeamProjectModal: React.FC<ShareToTeamProjectModalProps> = ({
  visible,
  prepared,
  onCancel,
  onSuccess,
}) => {
  const userInfo = useStore((state) => state.userInfo)
  const authenticatedUserId = Number(userInfo.user_id)
  const authenticationSessionKey = `${
    userInfo.isLogin ? 'authenticated' : 'logged-out'
  }\u0000${authenticatedUserId}\u0000${userInfo.token}`
  const [capabilities, setCapabilities] = useState<ShareTargetCapabilities>(EMPTY_CAPABILITIES)
  const [teamId, setTeamId] = useState(0)
  const [projectId, setProjectId] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const contextRef = useRef({
    visible,
    authenticationSessionKey,
    teamId,
    projectId,
    prepared,
  })
  const loadSequence = useRef(0)
  const operationSequence = useRef(0)
  const onSuccessRef = useRef(onSuccess)

  contextRef.current = { visible, authenticationSessionKey, teamId, projectId, prepared }
  onSuccessRef.current = onSuccess

  const invalidate = useCallback((message = '') => {
    loadSequence.current += 1
    operationSequence.current += 1
    contextRef.current.teamId = 0
    contextRef.current.projectId = 0
    setCapabilities(EMPTY_CAPABILITIES)
    setTeamId(0)
    setProjectId(0)
    setLoading(false)
    setSubmitting(false)
    setErrorMessage(message)
  }, [])

  useEffect(() => {
    const unsubscribeAuthentication = subscribeTeamAuthenticationInvalidation(() => {
      invalidate('登录状态已失效，请重新登录')
    })
    const unsubscribePermission = subscribeTeamPermissionInvalidation((invalidatedTeamId) => {
      if (
        contextRef.current.teamId === invalidatedTeamId ||
        capabilities.teams.some((team) => team.id === invalidatedTeamId)
      ) {
        invalidate('团队权限已失效，请重新选择')
      }
    })
    return () => {
      unsubscribeAuthentication()
      unsubscribePermission()
    }
  }, [capabilities.teams, invalidate])

  useEffect(() => {
    const requestSequence = ++loadSequence.current
    operationSequence.current += 1
    setCapabilities(EMPTY_CAPABILITIES)
    setTeamId(0)
    setProjectId(0)
    setErrorMessage('')
    setSubmitting(false)
    if (!visible) {
      setLoading(false)
      return
    }
    if (!userInfo.isLogin || !isPositiveInteger(authenticatedUserId)) {
      setLoading(false)
      setErrorMessage('请先登录后再分享')
      return
    }

    setLoading(true)
    const boundSession = authenticationSessionKey
    getMe()
      .then((response) => {
        if (
          loadSequence.current !== requestSequence ||
          !contextRef.current.visible ||
          contextRef.current.authenticationSessionKey !== boundSession ||
          response.data.user.id !== authenticatedUserId
        ) {
          return
        }
        const next = getShareTargetCapabilities(response.data)
        const teams = next.teams.filter((team) =>
          prepared.kind === 'risk' ? team.canShareRisk : team.canShareHTTPFlow,
        )
        const filtered = {
          canShareHTTPFlow: teams.some((team) => team.canShareHTTPFlow),
          canShareRisk: teams.some((team) => team.canShareRisk),
          teams,
        }
        const firstTeam = teams[0]
        const firstProject = firstTeam?.projects[0]
        contextRef.current.teamId = firstTeam?.id || 0
        contextRef.current.projectId = firstProject?.id || 0
        setCapabilities(filtered)
        setTeamId(firstTeam?.id || 0)
        setProjectId(firstProject?.id || 0)
        if (!firstTeam || !firstProject) setErrorMessage('没有可写入的活动团队项目')
      })
      .catch(() => {
        if (loadSequence.current === requestSequence) invalidate('无法加载团队项目')
      })
      .finally(() => {
        if (loadSequence.current === requestSequence) setLoading(false)
      })
  }, [authenticatedUserId, authenticationSessionKey, invalidate, prepared, userInfo.isLogin, visible])

  const selectedTeam = useMemo(
    () => capabilities.teams.find((team) => team.id === teamId),
    [capabilities.teams, teamId],
  )

  const handleTeamChange = (value: string) => {
    operationSequence.current += 1
    const nextTeamId = Number(value)
    const nextTeam = capabilities.teams.find((team) => team.id === nextTeamId)
    const nextProjectId = nextTeam?.projects[0]?.id || 0
    contextRef.current.teamId = nextTeam?.id || 0
    contextRef.current.projectId = nextProjectId
    setTeamId(nextTeam?.id || 0)
    setProjectId(nextProjectId)
    setSubmitting(false)
    setErrorMessage('')
  }

  const handleProjectChange = (value: string) => {
    operationSequence.current += 1
    const nextProjectId = Number(value)
    const validProjectId = selectedTeam?.projects.some((project) => project.id === nextProjectId) ? nextProjectId : 0
    contextRef.current.projectId = validProjectId
    setProjectId(validProjectId)
    setSubmitting(false)
    setErrorMessage('')
  }

  const handleCancel = () => {
    invalidate()
    onCancel()
  }

  const handleSubmit = async () => {
    if (!visible || !isPositiveInteger(teamId) || !isPositiveInteger(projectId) || submitting) return
    const requestSequence = ++operationSequence.current
    const boundSession = authenticationSessionKey
    const boundTeamId = teamId
    const boundProjectId = projectId
    const boundPrepared = prepared
    const isCurrent = () =>
      operationSequence.current === requestSequence &&
      contextRef.current.visible &&
      contextRef.current.authenticationSessionKey === boundSession &&
      contextRef.current.teamId === boundTeamId &&
      contextRef.current.projectId === boundProjectId &&
      contextRef.current.prepared === boundPrepared

    setSubmitting(true)
    setErrorMessage('')
    try {
      await validatePreparedShare(boundPrepared)
      if (!isCurrent()) return
      const fresh = await getMe()
      if (!isCurrent()) return
      if (fresh.data.user.id !== authenticatedUserId) throw new Error('authentication_changed')
      const freshCapabilities = getShareTargetCapabilities(fresh.data)
      if (!getActiveTarget(freshCapabilities, boundPrepared.kind, boundTeamId, boundProjectId)) {
        invalidate('团队权限或项目状态已变化，请重新选择')
        return
      }

      const httpRecord = await createOrRecoverHTTPRecord(boundTeamId, boundProjectId, boundPrepared.http)
      if (!isCurrent()) return

      let riskRecord: TestResultRecord | undefined
      if (boundPrepared.kind === 'risk') {
        riskRecord = await createOrRecoverRiskRecord(boundTeamId, boundProjectId, httpRecord.id, boundPrepared.risk)
        if (!isCurrent()) return
      }

      onSuccessRef.current({
        teamId: boundTeamId,
        projectId: boundProjectId,
        flowKey: boundPrepared.http.flowKey,
        riskKey: boundPrepared.kind === 'risk' ? boundPrepared.risk.riskKey : undefined,
        httpRecord,
        riskRecord,
      })
    } catch (error) {
      if (!isCurrent()) return
      if (error instanceof SharedRecordError && error.code === 'shared_record_payload_too_large') {
        setErrorMessage('该流量超过团队共享上限')
        return
      }
      const status = getErrorStatus(error)
      if (status === 401 || status === 403) {
        invalidate('团队权限或登录状态已失效，请重新选择')
        return
      }
      setErrorMessage('分享失败，请重试')
    } finally {
      if (isCurrent()) setSubmitting(false)
    }
  }

  const disabled =
    loading ||
    submitting ||
    !isPositiveInteger(teamId) ||
    !isPositiveInteger(projectId) ||
    !getActiveTarget(capabilities, prepared.kind, teamId, projectId)

  return (
    <YakitModal
      visible={visible}
      title={prepared.kind === 'risk' ? '分享 Risk 到团队项目' : '分享 HTTP Flow 到团队项目'}
      okText="分享"
      cancelText="取消"
      confirmLoading={submitting}
      okButtonProps={{ disabled }}
      onCancel={handleCancel}
      onCloseX={handleCancel}
      onOk={handleSubmit}
    >
      <div className={styles['share-form']}>
        <label className={styles['share-field']}>
          <span>团队</span>
          <YakitSelect
            placeholder="团队"
            value={teamId > 0 ? String(teamId) : undefined}
            disabled={loading || submitting}
            options={capabilities.teams.map((team) => ({ value: String(team.id), label: team.name }))}
            onChange={(value) => handleTeamChange(String(value))}
          />
        </label>
        <label className={styles['share-field']}>
          <span>项目</span>
          <YakitSelect
            placeholder="项目"
            value={projectId > 0 ? String(projectId) : undefined}
            disabled={loading || submitting || !selectedTeam}
            options={(selectedTeam?.projects || []).map((project) => ({
              value: String(project.id),
              label: project.name,
            }))}
            onChange={(value) => handleProjectChange(String(value))}
          />
        </label>
        {errorMessage ? (
          <div role="alert" className={styles['share-error']}>
            {errorMessage}
          </div>
        ) : null}
      </div>
    </YakitModal>
  )
}
