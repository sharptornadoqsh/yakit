import {
  TeamShareRequestContext,
  CollaborationProject,
  CurrentCollaborationUser,
  TestDataRecord,
  TestResultRecord,
  createTestData,
  createTestResult,
  getMe,
} from '@/services/teamCollaboration'
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
import { sha256Hex } from './binaryPayload'

const loadShareRuntime = () => Promise.all([import('@/utils/kv'), import('@/utils/envfile')])
let shareRuntime: ReturnType<typeof loadShareRuntime> | undefined

export const readTeamShareBaseUrl = async (): Promise<string> => {
  const [{ getRemoteValue }, { getRemoteHttpSettingGV }] = await (shareRuntime ||= loadShareRuntime())
  const baseUrl = JSON.parse((await getRemoteValue(getRemoteHttpSettingGV())) || '{}').BaseUrl
  if (typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) throw new Error('请先确认团队服务地址')
  return baseUrl
}

export interface TeamRecordUploadTarget {
  teamId: number
  projectId: number
  userId: number
  request: TeamShareRequestContext
  check: () => Promise<void>
}

export class TeamShareStoppedError extends Error {}

export const sharePreparedTeamRecord = async (
  prepared: PreparedTeamShare,
  target: TeamRecordUploadTarget,
): Promise<ShareToTeamProjectSuccess & { duplicate: boolean }> => {
  const { teamId, projectId, check, request } = target
  await check()
  if (!request.headers.Authorization || !isPositiveInteger(teamId) || !isPositiveInteger(projectId)) {
    throw new TeamShareStoppedError('登录或目标项目无效，请重新选择')
  }
  await validatePreparedShare(prepared)
  await check()
  const fresh = await getMe(request)
  await check()
  if (
    fresh.data.user.id !== target.userId ||
    !getActiveTarget(getShareTargetCapabilities(fresh.data), prepared.kind, teamId, projectId)
  ) {
    throw new TeamShareStoppedError('团队权限或项目状态已变化，请重新选择')
  }
  const http = await createOrRecoverHTTPRecord(teamId, projectId, prepared.http, request)
  // A confirmed HTTP write may survive cancellation; retry recovers its server ID.
  if (prepared.kind === 'http-flow') {
    return { teamId, projectId, flowKey: prepared.http.flowKey, httpRecord: http.record, duplicate: http.duplicate }
  }
  await check()
  const risk = await createOrRecoverRiskRecord(teamId, projectId, http.record.id, prepared.risk, request)
  return {
    teamId,
    projectId,
    flowKey: prepared.http.flowKey,
    riskKey: prepared.risk.riskKey,
    httpRecord: http.record,
    riskRecord: risk.record,
    duplicate: risk.duplicate,
  }
}

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

export const EMPTY_CAPABILITIES: ShareTargetCapabilities = {
  canShareHTTPFlow: false,
  canShareRisk: false,
  teams: [],
}

export const isPositiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0

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

export const getErrorStatus = (error: unknown): number => {
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

export const getActiveTarget = (
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
  context?: TeamShareRequestContext,
): Promise<{ record: TestDataRecord; duplicate: boolean }> => {
  try {
    const response = await createTestData(
      teamId,
      projectId,
      {
        name: prepared.name,
        type: 'http_flow',
        content: prepared.content,
        deduplication_key: `http-flow:${prepared.flowKey}`,
        source_client_id: prepared.sourceClientId,
        metadata: { ...prepared.summary },
      },
      context,
    )
    if (response.ok === false || !matchDuplicateHTTPRecord(response.data, teamId, projectId, prepared)) {
      throw new Error('invalid_shared_http_flow_response')
    }
    return { record: response.data, duplicate: false }
  } catch (error) {
    const duplicate = getConflictRecord(error, 'duplicate_data')
    if (matchDuplicateHTTPRecord(duplicate, teamId, projectId, prepared)) return { record: duplicate, duplicate: true }
    throw error
  }
}

const createOrRecoverRiskRecord = async (
  teamId: number,
  projectId: number,
  testDataId: number,
  prepared: PreparedSharedRisk,
  context?: TeamShareRequestContext,
): Promise<{ record: TestResultRecord; duplicate: boolean }> => {
  try {
    const response = await createTestResult(
      teamId,
      projectId,
      {
        test_data_id: testDataId,
        name: prepared.name,
        type: 'risk',
        severity: prepared.summary.severity,
        content: prepared.content,
        deduplication_key: `risk:${prepared.riskKey}`,
        source_client_id: prepared.sourceClientId,
        metadata: { ...prepared.summary },
      },
      context,
    )
    if (response.ok === false || !matchDuplicateRiskRecord(response.data, teamId, projectId, testDataId, prepared)) {
      throw new Error('invalid_shared_risk_response')
    }
    return { record: response.data, duplicate: false }
  } catch (error) {
    const duplicate = getConflictRecord(error, 'duplicate_result')
    if (matchDuplicateRiskRecord(duplicate, teamId, projectId, testDataId, prepared))
      return { record: duplicate, duplicate: true }
    throw error
  }
}
