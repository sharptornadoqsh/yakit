import { NetWorkApi } from './fetch'
import {
  publishTeamAuthenticationInvalidation,
  publishTeamPermissionInvalidation,
} from '../pages/teamCollaboration/teamPermissionContext'

export type V2Identifier = number | string
export type V2Timestamp = string | number
export type ProjectAccessLevel = 'read' | 'write' | 'admin'
export type PluginVisibility = 'private' | 'team'

export interface V2Paging {
  page: number
  limit: number
  total: number
  total_pages: number
}

export interface V2Response<T> {
  ok: boolean
  data: T
  paging?: V2Paging
}

export interface V2ListQuery {
  page?: number
  limit?: number
  keyword?: string
  status?: string
  order_by?: string
  order?: 'asc' | 'desc'
  [key: string]: unknown
}

export interface CollaborationUser {
  id: number
  uid: string
  name: string
  nick_name: string
  email: string
  status: string
  legacy_role: string
  from_platform: string
  created_at?: V2Timestamp
  updated_at?: V2Timestamp
}

export interface CollaborationRole {
  id: number
  team_id: number
  code: string
  name: string
  description: string
  status: string
  permissions?: string[]
  created_at?: V2Timestamp
  updated_at?: V2Timestamp
}

export interface TeamMember {
  id: number
  team_id: number
  user_id: number
  status: string
  version: number
  joined_at?: V2Timestamp
  created_at?: V2Timestamp
  updated_at?: V2Timestamp
  user?: CollaborationUser
  roles?: CollaborationRole[]
}

export interface CollaborationTeam {
  id: number
  name: string
  slug: string
  description: string
  owner_user_id: number
  status: string
  version: number
  created_at?: V2Timestamp
  updated_at?: V2Timestamp
}

export interface CollaborationProject {
  id: number
  team_id: number
  project_key: string
  name: string
  description: string
  status: string
  snapshot?: Record<string, unknown>
  snapshot_hash?: string
  version: number
  created_by: number
  updated_by: number
  created_at?: V2Timestamp
  updated_at?: V2Timestamp
}

export interface CurrentMembership {
  member: TeamMember
  team: CollaborationTeam
  roles: CollaborationRole[]
  permissions: string[]
  projects: CollaborationProject[]
}

export interface CurrentCollaborationUser {
  user: CollaborationUser
  memberships: CurrentMembership[]
}

export interface CreateTeamInput {
  name: string
  slug: string
  description?: string
  status?: string
}

export interface UpdateTeamInput {
  name?: string
  slug?: string
  description?: string
  status?: string
}

export interface CreateTeamMemberInput {
  user_id: number
  role_ids?: number[]
  status?: string
}

export interface UpdateTeamMemberInput {
  role_ids?: number[]
  status?: string
}

export interface CreateTeamProjectInput {
  project_key: string
  name: string
  description?: string
  status?: string
}

export interface UpdateTeamProjectInput {
  version: number
  name?: string
  description?: string
  status?: string
}

export interface ProjectMember {
  id: number
  team_id: number
  project_id: number
  user_id: number
  access_level: ProjectAccessLevel
  status: string
  created_by: number
  created_at?: V2Timestamp
  updated_at?: V2Timestamp
}

export interface CreateProjectMemberInput {
  user_id: number
  access_level: ProjectAccessLevel
  status?: string
}

export interface UpdateProjectMemberInput {
  access_level?: ProjectAccessLevel
  status?: string
}

export interface ProjectSnapshot {
  snapshot: Record<string, unknown>
  snapshot_hash: string
  version: number
  updated_at?: V2Timestamp
}

export interface UpdateProjectSnapshotInput {
  version: number
  snapshot: Record<string, unknown>
}

export interface TestDataRecord {
  id: number
  team_id: number
  project_id: number
  name: string
  data_type: string
  metadata: string
  file_size: number
  content_hash: string
  deduplication_key: string
  content?: string
  created_by: number
  source_client_id: string
  status: string
  version: number
  updated_by: number
  created_at?: V2Timestamp
  updated_at?: V2Timestamp
}

export interface CreateTestDataInput {
  name: string
  type: string
  metadata?: Record<string, unknown>
  deduplication_key?: string
  source_client_id?: string
  status?: string
  content: string
}

export interface UpdateTestDataInput extends Partial<CreateTestDataInput> {
  version: number
}

export interface TestResultRecord {
  id: number
  team_id: number
  project_id: number
  test_data_id: number
  name: string
  result_type: string
  severity: string
  metadata: string
  file_size: number
  content_hash: string
  deduplication_key: string
  content?: string
  created_by: number
  source_client_id: string
  status: string
  version: number
  updated_by: number
  created_at?: V2Timestamp
  updated_at?: V2Timestamp
}

export interface CreateTestResultInput {
  test_data_id?: number
  name: string
  type: string
  severity?: string
  metadata?: Record<string, unknown>
  deduplication_key?: string
  source_client_id?: string
  status?: string
  content: string
}

export interface UpdateTestResultInput extends Partial<CreateTestResultInput> {
  version: number
}

export interface ProjectSyncTombstone {
  id: number
  deleted_at: string
}

export interface ProjectSyncTombstones {
  project_members: ProjectSyncTombstone[]
  test_data: ProjectSyncTombstone[]
  test_results: ProjectSyncTombstone[]
}

export interface ProjectSync {
  server_time: string
  project?: CollaborationProject
  project_members: ProjectMember[]
  test_data: TestDataRecord[]
  test_results: TestResultRecord[]
  tombstones?: ProjectSyncTombstones
}

export interface AuditLog {
  id: number
  team_id: number
  project_id?: number
  user_id: number
  action: string
  resource_type: string
  resource_id: string
  ip_address: string
  request_id: string
  status: string
  details?: Record<string, unknown>
  created_at?: V2Timestamp
}

export interface PluginCategory {
  id: number
  team_id: number
  name: string
  description: string
  sort_order: number
  status: string
  created_at?: V2Timestamp
  updated_at?: V2Timestamp
}

export interface SavePluginCategoryInput {
  name?: string
  description?: string
  sort_order?: number
  status?: string
}

export interface PluginGroup {
  id: number
  team_id: number
  name: string
  description: string
  sort_order: number
  status: string
  created_by: number
  created_at?: V2Timestamp
  updated_at?: V2Timestamp
}

export interface SavePluginGroupInput {
  name?: string
  description?: string
  sort_order?: number
  status?: string
}

export interface CascadeDeleteOptions {
  cascade?: boolean
}

export interface TeamPlugin {
  id: number
  team_id: number
  category_id?: number
  uuid: string
  script_name: string
  type: string
  content: string
  tags: string[]
  description: string
  enabled: boolean
  file_hash: string
  version: number
  revision: number
  visibility: PluginVisibility
  group_ids?: number[]
  import_batch_id?: string
  created_by: number
  updated_by: number
  created_at?: V2Timestamp
  updated_at?: V2Timestamp
}

export interface TeamPluginVersion {
  id: number
  team_id: number
  plugin_id: number
  version: number
  file_hash: string
  change_note: string
  created_by: number
  created_at: string
}

export interface OfflinePluginManifestItem {
  id: number
  team_id: number
  script_name: string
  type: string
  version: number
  size_bytes: number
  file_hash: string
  hash_algorithm: 'sha256'
  dependencies: string[]
  engine_min_version: string
  engine_max_version: string
  download_url: string
  updated_at: string
}

export interface TeamPluginDownloadSummary {
  body: ArrayBuffer
  sha256: string
  version: number
}

const sha256ArrayBuffer = async (content: ArrayBuffer) => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', content)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export interface CreateTeamPluginInput {
  category_id?: number
  source_name?: string
  script_name: string
  type: string
  content: string
  tags?: string[]
  description?: string
  enabled?: boolean
  file_hash?: string
  change_note?: string
  visibility?: PluginVisibility
  group_ids?: number[]
}

export interface UpdateTeamPluginInput extends Partial<CreateTeamPluginInput> {
  revision: number
}

export interface PluginImportEntry extends CreateTeamPluginInput {
  overwrite?: boolean
  revision?: number
}

export interface ImportTeamPluginsInput {
  plugins: PluginImportEntry[]
}

export type PluginImportItemStatus = 'created' | 'updated' | 'skipped' | 'failed'

export interface PluginImportResult {
  total: number
  success: number
  failed: number
  duplicates: number
  batch_id: string
  items: Array<{
    name: string
    source_name: string
    plugin_name: string
    status: PluginImportItemStatus
    message: string
    error?: string
    reason?: string
    skipped?: boolean
    overwritten?: boolean
    plugin_id?: number
    remote_plugin_id: number
    version: number
    content_hash: string
    conflict_type: string
  }>
  failures: Array<{ index: number; script_name: string; reason: string }>
}

export interface ProjectShareSnapshot {
  project_name: string
  data_count: number
  result_count: number
  plugin_count: number
  archive_size: number
  archive_sha256: string
}

export interface ProjectShare {
  id: number
  team_id: number
  project_id: number
  snapshot_id?: number
  binding_version: 1 | 2
  name: string
  expires_at: string | null
  max_uses: number
  used_count: number
  enabled: boolean
  revoked_at: string | null
  invalidated_at: string | null
  invalidated_reason: string
  created_by: number
  version: number
  created_at: V2Timestamp
  updated_at: V2Timestamp
  snapshot?: ProjectShareSnapshot
}

export interface ProjectShareCreation {
  share: ProjectShare
  token: string
}

export interface CreateProjectShareInput {
  bundle_id: string
  name: string
  expires_at: string | null
  max_uses: number
  enabled: boolean
}

export interface UpdateProjectShareInput {
  version: number
  name?: string
  expires_at?: string
  max_uses?: number
  enabled?: boolean
}

export interface ProjectSharePreview {
  share_id: number
  snapshot_id: number
  project_name: string
  data_count: number
  result_count: number
  plugin_count: number
  archive_size: number
  archive_sha256: string
  media_type: 'application/vnd.yakit.team-project-bundle.v2+zip'
}

export interface ImportProjectShareInput {
  token: string
  project_key: string
  name: string
  idempotency_key: string
}

export interface ProjectShareBundleSummary {
  id: number
  team_id: number
  source_project_id: number
  bundle_id: string
  status: 'staging' | 'finalizing' | 'ready' | 'failed'
  failure_code: string
  manifest_sha256: string
  archive_sha256: string
  file_size: number
  chunk_size: number
  chunk_count: number
  uploaded_chunks: number[]
  version: number
  created_at: string
  updated_at: string
}

export interface CreateProjectShareBundleInput {
  bundle_id: string
  manifest_sha256: string
  archive_sha256: string
  file_size: number
  chunk_size: 4194304
  chunk_count: number
  idempotency_key: string
}

export interface UploadProjectShareBundleChunkInput {
  raw_base64: string
  byte_length: number
  sha256: string
}

export interface ProjectShareBundleChunk {
  bundle_id: string
  chunk_index: number
  byte_length: number
  sha256: string
  status: 'uploaded'
}

export interface ProjectShareImportReceipt {
  receipt_id: number
  share_id: number
  snapshot_id: number
  project_id: number
  project_key: string
  name: string
  status: 'prepared' | 'failed' | 'abandoned' | 'completed'
  failure_code: string
  lease_expires_at: string | null
  bundle: {
    file_size: number
    archive_sha256: string
    media_type: 'application/vnd.yakit.team-project-bundle.v2+zip'
  }
  project?: {
    id: number
    team_id: number
    project_key: string
    name: string
    status: 'active'
  }
  version: number
}

export interface ProjectShareUse {
  id: number
  share_id: number
  team_id: number
  source_project_id: number
  imported_by: number
  imported_project_id: number
  used_at: string
  client_id: string
  ip_address: string
  result: string
  failure_reason?: string
  created_at?: V2Timestamp
  updated_at?: V2Timestamp
}

const getErrorStatus = (error: unknown): number => {
  if (!error || typeof error !== 'object') return 0
  const response = 'response' in error ? error.response : undefined
  const responseStatus =
    response && typeof response === 'object' && 'status' in response ? Number(response.status) : undefined
  return responseStatus || ('status' in error ? Number(error.status) : 0)
}

const rethrowV2Error = (url: string, error: unknown): never => {
  const status = getErrorStatus(error)
  if (status === 401) {
    publishTeamAuthenticationInvalidation()
  } else if (status === 403) {
    const match = /^v2\/teams\/([1-9][0-9]*)(?:\/|$)/.exec(url)
    if (match) publishTeamPermissionInvalidation(Number(match[1]))
  }
  throw error
}

const getV2 = <P extends Record<string, unknown>, R>(url: string, params: P) =>
  NetWorkApi<P, R>({ method: 'get', url, params }).catch((error) => rethrowV2Error(url, error))

const writeV2 = <P, R>(method: 'post' | 'patch' | 'put' | 'delete', url: string, data?: P) =>
  NetWorkApi<P, R>({ method, url, data }).catch((error) => rethrowV2Error(url, error))

export const getMe = () => getV2<Record<string, never>, V2Response<CurrentCollaborationUser>>('v2/me', {})

export const listTeams = (params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<CollaborationTeam[]>>('v2/teams', params)

export const getTeam = (teamId: V2Identifier) =>
  getV2<Record<string, never>, V2Response<CollaborationTeam>>(`v2/teams/${teamId}`, {})

export const createTeam = (data: CreateTeamInput) =>
  writeV2<CreateTeamInput, V2Response<CollaborationTeam>>('post', 'v2/teams', data)

export const updateTeam = (teamId: V2Identifier, data: UpdateTeamInput) =>
  writeV2<UpdateTeamInput, V2Response<CollaborationTeam>>('patch', `v2/teams/${teamId}`, data)

export const deleteTeam = (teamId: V2Identifier) =>
  writeV2<undefined, V2Response<{ deleted: boolean }>>('delete', `v2/teams/${teamId}`)

export const listTeamMembers = (teamId: V2Identifier, params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<TeamMember[]>>(`v2/teams/${teamId}/members`, params)

export const getTeamMember = (teamId: V2Identifier, memberId: V2Identifier) =>
  getV2<Record<string, never>, V2Response<TeamMember>>(`v2/teams/${teamId}/members/${memberId}`, {})

export const createTeamMember = (teamId: V2Identifier, data: CreateTeamMemberInput) =>
  writeV2<CreateTeamMemberInput, V2Response<TeamMember>>('post', `v2/teams/${teamId}/members`, data)

export const updateTeamMember = (teamId: V2Identifier, memberId: V2Identifier, data: UpdateTeamMemberInput) =>
  writeV2<UpdateTeamMemberInput, V2Response<TeamMember>>('patch', `v2/teams/${teamId}/members/${memberId}`, data)

export const deleteTeamMember = (teamId: V2Identifier, memberId: V2Identifier) =>
  writeV2<undefined, V2Response<{ deleted: boolean }>>('delete', `v2/teams/${teamId}/members/${memberId}`)

export const listTeamProjects = (teamId: V2Identifier, params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<CollaborationProject[]>>(`v2/teams/${teamId}/projects`, params)

export const getTeamProject = (teamId: V2Identifier, projectId: V2Identifier) =>
  getV2<Record<string, never>, V2Response<CollaborationProject>>(`v2/teams/${teamId}/projects/${projectId}`, {})

export const createTeamProject = (teamId: V2Identifier, data: CreateTeamProjectInput) =>
  writeV2<CreateTeamProjectInput, V2Response<CollaborationProject>>('post', `v2/teams/${teamId}/projects`, data)

export const updateTeamProject = (teamId: V2Identifier, projectId: V2Identifier, data: UpdateTeamProjectInput) =>
  writeV2<UpdateTeamProjectInput, V2Response<CollaborationProject>>(
    'patch',
    `v2/teams/${teamId}/projects/${projectId}`,
    data,
  )

export const deleteTeamProject = (teamId: V2Identifier, projectId: V2Identifier) =>
  writeV2<undefined, V2Response<{ deleted: boolean }>>('delete', `v2/teams/${teamId}/projects/${projectId}`)

export const listProjectMembers = (teamId: V2Identifier, projectId: V2Identifier, params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<ProjectMember[]>>(`v2/teams/${teamId}/projects/${projectId}/members`, params)

export const getProjectMember = (teamId: V2Identifier, projectId: V2Identifier, memberId: V2Identifier) =>
  getV2<Record<string, never>, V2Response<ProjectMember>>(
    `v2/teams/${teamId}/projects/${projectId}/members/${memberId}`,
    {},
  )

export const createProjectMember = (teamId: V2Identifier, projectId: V2Identifier, data: CreateProjectMemberInput) =>
  writeV2<CreateProjectMemberInput, V2Response<ProjectMember>>(
    'post',
    `v2/teams/${teamId}/projects/${projectId}/members`,
    data,
  )

export const updateProjectMember = (
  teamId: V2Identifier,
  projectId: V2Identifier,
  memberId: V2Identifier,
  data: UpdateProjectMemberInput,
) =>
  writeV2<UpdateProjectMemberInput, V2Response<ProjectMember>>(
    'patch',
    `v2/teams/${teamId}/projects/${projectId}/members/${memberId}`,
    data,
  )

export const deleteProjectMember = (teamId: V2Identifier, projectId: V2Identifier, memberId: V2Identifier) =>
  writeV2<undefined, V2Response<{ deleted: boolean }>>(
    'delete',
    `v2/teams/${teamId}/projects/${projectId}/members/${memberId}`,
  )

export const getProjectSnapshot = (teamId: V2Identifier, projectId: V2Identifier) =>
  getV2<Record<string, never>, V2Response<ProjectSnapshot>>(`v2/teams/${teamId}/projects/${projectId}/snapshot`, {})

export const updateProjectSnapshot = (
  teamId: V2Identifier,
  projectId: V2Identifier,
  data: UpdateProjectSnapshotInput,
) =>
  writeV2<UpdateProjectSnapshotInput, V2Response<CollaborationProject>>(
    'patch',
    `v2/teams/${teamId}/projects/${projectId}/snapshot`,
    data,
  )

export const getProjectSync = (teamId: V2Identifier, projectId: V2Identifier, since?: string) =>
  getV2<{ since?: string }, V2Response<ProjectSync>>(
    `v2/teams/${teamId}/projects/${projectId}/sync`,
    since ? { since } : {},
  )

export const listTestData = (teamId: V2Identifier, projectId: V2Identifier, params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<TestDataRecord[]>>(`v2/teams/${teamId}/projects/${projectId}/test-data`, params)

export const createTestData = (teamId: V2Identifier, projectId: V2Identifier, data: CreateTestDataInput) =>
  writeV2<CreateTestDataInput, V2Response<TestDataRecord>>(
    'post',
    `v2/teams/${teamId}/projects/${projectId}/test-data`,
    data,
  )

export const getTestData = (teamId: V2Identifier, projectId: V2Identifier, dataId: V2Identifier) =>
  getV2<Record<string, never>, V2Response<TestDataRecord>>(
    `v2/teams/${teamId}/projects/${projectId}/test-data/${dataId}`,
    {},
  )

export const updateTestData = (
  teamId: V2Identifier,
  projectId: V2Identifier,
  dataId: V2Identifier,
  data: UpdateTestDataInput,
) =>
  writeV2<UpdateTestDataInput, V2Response<TestDataRecord>>(
    'patch',
    `v2/teams/${teamId}/projects/${projectId}/test-data/${dataId}`,
    data,
  )

export const deleteTestData = (teamId: V2Identifier, projectId: V2Identifier, dataId: V2Identifier) =>
  writeV2<undefined, V2Response<{ deleted: boolean }>>(
    'delete',
    `v2/teams/${teamId}/projects/${projectId}/test-data/${dataId}`,
  )

export const listTestResults = (teamId: V2Identifier, projectId: V2Identifier, params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<TestResultRecord[]>>(`v2/teams/${teamId}/projects/${projectId}/test-results`, params)

export const createTestResult = (teamId: V2Identifier, projectId: V2Identifier, data: CreateTestResultInput) =>
  writeV2<CreateTestResultInput, V2Response<TestResultRecord>>(
    'post',
    `v2/teams/${teamId}/projects/${projectId}/test-results`,
    data,
  )

export const getTestResult = (teamId: V2Identifier, projectId: V2Identifier, resultId: V2Identifier) =>
  getV2<Record<string, never>, V2Response<TestResultRecord>>(
    `v2/teams/${teamId}/projects/${projectId}/test-results/${resultId}`,
    {},
  )

export const updateTestResult = (
  teamId: V2Identifier,
  projectId: V2Identifier,
  resultId: V2Identifier,
  data: UpdateTestResultInput,
) =>
  writeV2<UpdateTestResultInput, V2Response<TestResultRecord>>(
    'patch',
    `v2/teams/${teamId}/projects/${projectId}/test-results/${resultId}`,
    data,
  )

export const deleteTestResult = (teamId: V2Identifier, projectId: V2Identifier, resultId: V2Identifier) =>
  writeV2<undefined, V2Response<{ deleted: boolean }>>(
    'delete',
    `v2/teams/${teamId}/projects/${projectId}/test-results/${resultId}`,
  )

export const listAuditLogs = (teamId: V2Identifier, params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<AuditLog[]>>(`v2/teams/${teamId}/audit-logs`, params)

export const listTeamPlugins = (teamId: V2Identifier, params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<TeamPlugin[]>>(`v2/teams/${teamId}/plugins`, params)

export const listOfflinePluginManifest = (teamId: V2Identifier, params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<OfflinePluginManifestItem[]>>(`v2/teams/${teamId}/plugins/offline-manifest`, params)

export const getTeamPlugin = (teamId: V2Identifier, pluginId: V2Identifier) =>
  getV2<Record<string, never>, V2Response<TeamPlugin>>(`v2/teams/${teamId}/plugins/${pluginId}`, {})

export const listTeamPluginVersions = (teamId: V2Identifier, pluginId: V2Identifier, params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<TeamPluginVersion[]>>(`v2/teams/${teamId}/plugins/${pluginId}/versions`, params)

export const createTeamPlugin = (teamId: V2Identifier, data: CreateTeamPluginInput) =>
  writeV2<CreateTeamPluginInput, V2Response<TeamPlugin>>('post', `v2/teams/${teamId}/plugins`, data)

export const updateTeamPlugin = (teamId: V2Identifier, pluginId: V2Identifier, data: UpdateTeamPluginInput) =>
  writeV2<UpdateTeamPluginInput, V2Response<TeamPlugin>>('patch', `v2/teams/${teamId}/plugins/${pluginId}`, data)

export const deleteTeamPlugin = (teamId: V2Identifier, pluginId: V2Identifier, options: CascadeDeleteOptions = {}) =>
  writeV2<undefined, V2Response<{ deleted: boolean }>>(
    'delete',
    `v2/teams/${teamId}/plugins/${pluginId}${options.cascade ? '?cascade=true' : ''}`,
  )

export const listPluginCategories = (teamId: V2Identifier, params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<PluginCategory[]>>(`v2/teams/${teamId}/plugin-categories`, params)

export const getPluginCategory = (teamId: V2Identifier, categoryId: V2Identifier) =>
  getV2<Record<string, never>, V2Response<PluginCategory>>(`v2/teams/${teamId}/plugin-categories/${categoryId}`, {})

export const createPluginCategory = (teamId: V2Identifier, data: SavePluginCategoryInput) =>
  writeV2<SavePluginCategoryInput, V2Response<PluginCategory>>('post', `v2/teams/${teamId}/plugin-categories`, data)

export const updatePluginCategory = (teamId: V2Identifier, categoryId: V2Identifier, data: SavePluginCategoryInput) =>
  writeV2<SavePluginCategoryInput, V2Response<PluginCategory>>(
    'patch',
    `v2/teams/${teamId}/plugin-categories/${categoryId}`,
    data,
  )

export const deletePluginCategory = (
  teamId: V2Identifier,
  categoryId: V2Identifier,
  options: CascadeDeleteOptions = {},
) =>
  writeV2<undefined, V2Response<{ deleted: boolean }>>(
    'delete',
    `v2/teams/${teamId}/plugin-categories/${categoryId}${options.cascade ? '?cascade=true' : ''}`,
  )

export const listPluginGroups = (teamId: V2Identifier, params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<PluginGroup[]>>(`v2/teams/${teamId}/plugin-groups`, params)

export const getPluginGroup = (teamId: V2Identifier, groupId: V2Identifier) =>
  getV2<Record<string, never>, V2Response<PluginGroup>>(`v2/teams/${teamId}/plugin-groups/${groupId}`, {})

export const createPluginGroup = (teamId: V2Identifier, data: SavePluginGroupInput) =>
  writeV2<SavePluginGroupInput, V2Response<PluginGroup>>('post', `v2/teams/${teamId}/plugin-groups`, data)

export const updatePluginGroup = (teamId: V2Identifier, groupId: V2Identifier, data: SavePluginGroupInput) =>
  writeV2<SavePluginGroupInput, V2Response<PluginGroup>>('patch', `v2/teams/${teamId}/plugin-groups/${groupId}`, data)

export const deletePluginGroup = (teamId: V2Identifier, groupId: V2Identifier, options: CascadeDeleteOptions = {}) =>
  writeV2<undefined, V2Response<{ deleted: boolean }>>(
    'delete',
    `v2/teams/${teamId}/plugin-groups/${groupId}${options.cascade ? '?cascade=true' : ''}`,
  )

export const bindPluginGroup = (teamId: V2Identifier, pluginId: V2Identifier, groupId: V2Identifier) =>
  writeV2<undefined, V2Response<{ plugin_id: number; group_id: number }>>(
    'put',
    `v2/teams/${teamId}/plugins/${pluginId}/groups/${groupId}`,
  )

export const unbindPluginGroup = (teamId: V2Identifier, pluginId: V2Identifier, groupId: V2Identifier) =>
  writeV2<undefined, V2Response<{ deleted: boolean }>>(
    'delete',
    `v2/teams/${teamId}/plugins/${pluginId}/groups/${groupId}`,
  )

export const importTeamPlugins = (teamId: V2Identifier, data: ImportTeamPluginsInput) =>
  writeV2<ImportTeamPluginsInput, V2Response<PluginImportResult>>('post', `v2/teams/${teamId}/plugins/import`, data)

export const downloadTeamPlugin = (teamId: V2Identifier, pluginId: V2Identifier) => {
  const url = `v2/teams/${teamId}/plugins/${pluginId}/download`
  return NetWorkApi<Record<string, never>, ArrayBuffer>({
    method: 'get',
    url,
    params: {},
    responseType: 'arraybuffer',
  }).catch((error) => rethrowV2Error(url, error))
}

export const downloadTeamPluginVersion = (
  teamId: V2Identifier,
  pluginId: V2Identifier,
  version: number,
): Promise<ArrayBuffer> => {
  return downloadTeamPluginVersionWithSummary(teamId, pluginId, version).then(({ body }) => body)
}

export const downloadTeamPluginVersionWithSummary = async (
  teamId: V2Identifier,
  pluginId: V2Identifier,
  version: number,
): Promise<TeamPluginDownloadSummary> => {
  const url = `v2/teams/${teamId}/plugins/${pluginId}/versions/${version}/download`
  const response = await NetWorkApi<Record<string, never>, { body: ArrayBuffer; headers?: Record<string, string> }>({
    method: 'get',
    url,
    params: {},
    responseType: 'arraybuffer',
    includeResponseHeaders: true,
  }).catch((error) => rethrowV2Error(url, error))
  const sha256 = `${response.headers?.['x-content-sha256'] || ''}`.trim().toLowerCase()
  const responseVersion = Number(response.headers?.['x-plugin-version'])
  if (
    !(response.body instanceof ArrayBuffer) ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    !Number.isSafeInteger(responseVersion) ||
    responseVersion !== version
  ) {
    throw new Error('团队插件下载摘要或版本无效')
  }
  if ((await sha256ArrayBuffer(response.body)) !== sha256) throw new Error('插件正文摘要校验失败')
  return { body: response.body, sha256, version: responseVersion }
}

export const setPluginVisibility = (
  teamId: V2Identifier,
  pluginId: V2Identifier,
  visibility: PluginVisibility,
  revision: number,
) =>
  writeV2<{ visibility: PluginVisibility; revision: number }, V2Response<TeamPlugin>>(
    'patch',
    `v2/teams/${teamId}/plugins/${pluginId}/visibility`,
    { visibility, revision },
  )

export const createProjectShareBundle = (
  teamId: V2Identifier,
  projectId: V2Identifier,
  data: CreateProjectShareBundleInput,
) =>
  writeV2<CreateProjectShareBundleInput, V2Response<ProjectShareBundleSummary>>(
    'post',
    `v2/teams/${teamId}/projects/${projectId}/share-bundles`,
    data,
  )

export const uploadProjectShareBundleChunk = (
  teamId: V2Identifier,
  projectId: V2Identifier,
  bundleId: string,
  index: number,
  data: UploadProjectShareBundleChunkInput,
) =>
  writeV2<UploadProjectShareBundleChunkInput, V2Response<ProjectShareBundleChunk>>(
    'put',
    `v2/teams/${teamId}/projects/${projectId}/share-bundles/${bundleId}/chunks/${index}`,
    data,
  )

export const finalizeProjectShareBundle = (teamId: V2Identifier, projectId: V2Identifier, bundleId: string) =>
  writeV2<undefined, V2Response<ProjectShareBundleSummary>>(
    'post',
    `v2/teams/${teamId}/projects/${projectId}/share-bundles/${bundleId}/finalize`,
  )

export const listProjectShares = (teamId: V2Identifier, projectId: V2Identifier, params: V2ListQuery = {}) =>
  getV2<V2ListQuery, V2Response<ProjectShare[]>>(`v2/teams/${teamId}/projects/${projectId}/shares`, params)

export const createProjectShare = (teamId: V2Identifier, projectId: V2Identifier, data: CreateProjectShareInput) =>
  writeV2<CreateProjectShareInput, V2Response<ProjectShareCreation>>(
    'post',
    `v2/teams/${teamId}/projects/${projectId}/shares`,
    data,
  )

export const updateProjectShare = (
  teamId: V2Identifier,
  projectId: V2Identifier,
  shareId: V2Identifier,
  data: UpdateProjectShareInput,
) =>
  writeV2<UpdateProjectShareInput, V2Response<ProjectShare>>(
    'patch',
    `v2/teams/${teamId}/projects/${projectId}/shares/${shareId}`,
    data,
  )

export const revokeProjectShare = (
  teamId: V2Identifier,
  projectId: V2Identifier,
  shareId: V2Identifier,
  version: number,
) => {
  const url = `v2/teams/${teamId}/projects/${projectId}/shares/${shareId}`
  return NetWorkApi<{ version: number }, V2Response<ProjectShare>>({
    method: 'delete',
    url,
    params: { version },
  }).catch((error) => rethrowV2Error(url, error))
}

export const previewProjectShare = (token: string) =>
  writeV2<{ token: string }, V2Response<ProjectSharePreview>>('post', 'v2/project-shares/preview', { token })

export const prepareProjectShareImport = (data: ImportProjectShareInput) =>
  writeV2<ImportProjectShareInput, V2Response<ProjectShareImportReceipt>>('post', 'v2/project-shares/import', data)

export const importProjectShare = prepareProjectShareImport

export const resumeProjectShareImport = (receiptId: V2Identifier) =>
  writeV2<undefined, V2Response<ProjectShareImportReceipt>>('post', `v2/project-share-imports/${receiptId}/resume`)

export const heartbeatProjectShareImport = (receiptId: V2Identifier) =>
  writeV2<undefined, V2Response<ProjectShareImportReceipt>>('post', `v2/project-share-imports/${receiptId}/heartbeat`)

export const completeProjectShareImport = (receiptId: V2Identifier) =>
  writeV2<undefined, V2Response<ProjectShareImportReceipt>>('post', `v2/project-share-imports/${receiptId}/complete`)

export const failProjectShareImport = (receiptId: V2Identifier, data: { failure_code: 'local_import_failed' }) =>
  writeV2<{ failure_code: 'local_import_failed' }, V2Response<ProjectShareImportReceipt>>(
    'post',
    `v2/project-share-imports/${receiptId}/fail`,
    data,
  )

export const listProjectShareUses = (
  teamId: V2Identifier,
  projectId: V2Identifier,
  shareId: V2Identifier,
  params: V2ListQuery = {},
) =>
  getV2<V2ListQuery, V2Response<ProjectShareUse[]>>(
    `v2/teams/${teamId}/projects/${projectId}/shares/${shareId}/uses`,
    params,
  )
