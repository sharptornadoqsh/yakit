import type {
  CreateProjectShareBundleInput,
  ProjectShareBundleChunk,
  ProjectShareBundleSummary,
  UploadProjectShareBundleChunkInput,
} from '@/services/teamCollaboration'

export const PROJECT_SHARE_BUNDLE_CHUNK_SIZE = 4_194_304 as const

export interface ProjectSharePluginParameter {
  field: string
  fieldVerbose: string
  required: boolean
  typeVerbose: string
  defaultValue: string
  extraSetting: string
  help: string
  group?: string
  methodType?: string
  jsonSchema?: string
  uiSchema?: string
  suggestionDataExpression?: string
}

export interface ProjectSharePluginMetadata {
  author: string
  help: string
  tags: readonly string[]
  params: readonly ProjectSharePluginParameter[]
}

export interface ProjectSharePluginMaterial {
  scriptName: string
  type: string
  version: number
  fileHash: string
  contentBase64: string
  metadata: ProjectSharePluginMetadata
}

export interface ProjectSharePluginSummary extends Omit<ProjectSharePluginMaterial, 'contentBase64'> {
  handle: string
  entry: string
  byteLength: number
  sha256: string
}

export interface ProjectShareBundleExtraction {
  bundleId: string
  projectArchiveHandle: string
  projectArchiveSize: number
  projectArchiveSha256: string
  plugins: readonly ProjectSharePluginSummary[]
}

export interface ProjectSharePluginContent {
  contentBase64: string
  byteLength: number
  sha256: string
}

export interface ProjectShareImportedProject {
  localProjectId: number
  localProjectName: string
}

export interface ProjectShareArchiveHandle {
  handle: string
  fileSize: number
  sha256: string
}

export interface LocalProjectShareBundle {
  handle: string
  bundleId: string
  fileSize: number
  archiveSha256: string
  manifestSha256: string
  chunkSize: typeof PROJECT_SHARE_BUNDLE_CHUNK_SIZE
  chunkCount: number
}

export interface ProjectShareBundleDependencies {
  exportProjectArchive: (
    input: { projectId: number; password: string },
    operationToken: string,
  ) => Promise<ProjectShareArchiveHandle>
  stagePlugin: (input: ProjectSharePluginMaterial) => Promise<ProjectSharePluginSummary>
  createBundle: (input: {
    bundleId: string
    createdAt: string
    engine: {
      version: string
      commit: string
      exportFormat: string
    }
    project: {
      name: string
      archiveHandle: string
    }
    stagedPluginHandles: readonly string[]
  }) => Promise<LocalProjectShareBundle>
  readBundleChunk: (input: { handle: string; index: number }) => Promise<{
    rawBase64: string
    byteLength: number
    sha256: string
  }>
  removeManagedHandle: (handle: string) => Promise<void>
  createRemoteBundle: (
    teamId: number,
    projectId: number,
    input: CreateProjectShareBundleInput,
  ) => Promise<ProjectShareBundleSummary>
  uploadRemoteChunk: (
    teamId: number,
    projectId: number,
    bundleId: string,
    index: number,
    input: UploadProjectShareBundleChunkInput,
  ) => Promise<ProjectShareBundleChunk>
  finalizeRemoteBundle: (teamId: number, projectId: number, bundleId: string) => Promise<ProjectShareBundleSummary>
  sleep?: (milliseconds: number) => Promise<void>
  maxFinalizeWaitMs?: number
}

export interface CreateAndUploadProjectShareBundleInput {
  teamId: number
  onlineProjectId: number
  localProject: {
    id: number
    name: string
  }
  password: string
  engine: {
    version: string
    commit: string
    exportFormat: string
  }
  plugins: readonly ProjectSharePluginMaterial[]
  bundleId: string
  idempotencyKey: string
  operationToken: string
  createdAt: string
}

export interface UploadedProjectShareBundle {
  local: LocalProjectShareBundle
  remote: ProjectShareBundleSummary
  managedHandles: readonly string[]
  dispose: () => Promise<void>
}

const createError = (code: string) => Object.assign(new Error(code), { code })

export const getProjectShareErrorCode = (error: unknown): string => {
  if (!error || typeof error !== 'object') return ''
  const candidate = error as {
    code?: unknown
    response?: { data?: { code?: unknown; error?: { code?: unknown } } }
  }
  const code = candidate.response?.data?.error?.code ?? candidate.response?.data?.code ?? candidate.code
  return typeof code === 'string' ? code : ''
}

const assertPositiveInteger = (value: number, code: string) => {
  if (!Number.isSafeInteger(value) || value <= 0) throw createError(code)
}

const validateBundleIdentity = (
  summary: ProjectShareBundleSummary,
  local: LocalProjectShareBundle,
): ProjectShareBundleSummary => {
  if (
    summary.bundle_id !== local.bundleId ||
    summary.manifest_sha256 !== local.manifestSha256 ||
    summary.archive_sha256 !== local.archiveSha256 ||
    summary.file_size !== local.fileSize ||
    summary.chunk_size !== local.chunkSize ||
    summary.chunk_count !== local.chunkCount
  ) {
    throw createError('project_bundle_summary_mismatch')
  }
  if (summary.status === 'failed') {
    throw createError(summary.failure_code || 'project_bundle_unavailable')
  }
  return summary
}

const uploadMissingChunks = async (
  input: CreateAndUploadProjectShareBundleInput,
  local: LocalProjectShareBundle,
  summary: ProjectShareBundleSummary,
  dependencies: ProjectShareBundleDependencies,
) => {
  const uploaded = new Set(summary.uploaded_chunks)
  if (summary.uploaded_chunks.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= local.chunkCount)) {
    throw createError('project_bundle_uploaded_chunks_invalid')
  }
  for (let index = 0; index < local.chunkCount; index += 1) {
    if (uploaded.has(index)) continue
    const chunk = await dependencies.readBundleChunk({
      handle: local.handle,
      index,
    })
    const response = await dependencies.uploadRemoteChunk(input.teamId, input.onlineProjectId, local.bundleId, index, {
      raw_base64: chunk.rawBase64,
      byte_length: chunk.byteLength,
      sha256: chunk.sha256,
    })
    if (
      response.status !== 'uploaded' ||
      response.bundle_id !== local.bundleId ||
      response.chunk_index !== index ||
      response.byte_length !== chunk.byteLength ||
      response.sha256 !== chunk.sha256
    ) {
      throw createError('project_bundle_chunk_response_invalid')
    }
  }
}

const waitForReadyBundle = async (
  input: CreateAndUploadProjectShareBundleInput,
  local: LocalProjectShareBundle,
  remoteInput: CreateProjectShareBundleInput,
  dependencies: ProjectShareBundleDependencies,
) => {
  const sleep =
    dependencies.sleep || ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const maxWait = dependencies.maxFinalizeWaitMs ?? 5 * 60 * 1000
  let elapsed = 0
  let delay = 250

  while (true) {
    let summary: ProjectShareBundleSummary
    try {
      summary = validateBundleIdentity(
        await dependencies.finalizeRemoteBundle(input.teamId, input.onlineProjectId, local.bundleId),
        local,
      )
    } catch (error) {
      if (getProjectShareErrorCode(error) !== 'bundle_chunks_not_ready') throw error
      const refreshed = validateBundleIdentity(
        await dependencies.createRemoteBundle(input.teamId, input.onlineProjectId, remoteInput),
        local,
      )
      await uploadMissingChunks(input, local, refreshed, dependencies)
      summary = refreshed
    }

    if (summary.status === 'ready') return summary
    if (elapsed >= maxWait) throw createError('project_bundle_finalize_timeout')
    const currentDelay = Math.min(delay, Math.max(0, maxWait - elapsed))
    if (currentDelay <= 0) throw createError('project_bundle_finalize_timeout')
    await sleep(currentDelay)
    elapsed += currentDelay
    delay = Math.min(delay * 2, 5_000)
  }
}

export const createAndUploadProjectShareBundle = async (
  input: CreateAndUploadProjectShareBundleInput,
  dependencies: ProjectShareBundleDependencies,
): Promise<UploadedProjectShareBundle> => {
  assertPositiveInteger(input.teamId, 'project_share_team_invalid')
  assertPositiveInteger(input.onlineProjectId, 'project_share_online_project_invalid')
  assertPositiveInteger(input.localProject.id, 'project_share_local_project_invalid')
  if (!input.localProject.name.trim()) throw createError('project_share_local_project_invalid')

  const managedHandles: string[] = []
  let disposed = false
  const dispose = async () => {
    if (disposed) return
    disposed = true
    await Promise.allSettled([...managedHandles].reverse().map((handle) => dependencies.removeManagedHandle(handle)))
  }

  try {
    const archive = await dependencies.exportProjectArchive(
      {
        projectId: input.localProject.id,
        password: input.password,
      },
      input.operationToken,
    )
    managedHandles.push(archive.handle)

    const stagedPlugins: ProjectSharePluginSummary[] = []
    for (const currentPlugin of input.plugins) {
      const staged = await dependencies.stagePlugin(currentPlugin)
      stagedPlugins.push(staged)
      managedHandles.push(staged.handle)
    }

    const local = await dependencies.createBundle({
      bundleId: input.bundleId,
      createdAt: input.createdAt,
      engine: input.engine,
      project: {
        name: input.localProject.name,
        archiveHandle: archive.handle,
      },
      stagedPluginHandles: stagedPlugins.map((plugin) => plugin.handle),
    })
    if (local.bundleId !== input.bundleId || local.chunkSize !== PROJECT_SHARE_BUNDLE_CHUNK_SIZE) {
      throw createError('project_share_local_bundle_invalid')
    }
    managedHandles.push(local.handle)

    const remoteInput: CreateProjectShareBundleInput = {
      bundle_id: local.bundleId,
      manifest_sha256: local.manifestSha256,
      archive_sha256: local.archiveSha256,
      file_size: local.fileSize,
      chunk_size: local.chunkSize,
      chunk_count: local.chunkCount,
      idempotency_key: input.idempotencyKey,
    }
    const created = validateBundleIdentity(
      await dependencies.createRemoteBundle(input.teamId, input.onlineProjectId, remoteInput),
      local,
    )
    await uploadMissingChunks(input, local, created, dependencies)
    const remote =
      created.status === 'ready' ? created : await waitForReadyBundle(input, local, remoteInput, dependencies)

    return {
      local,
      remote,
      managedHandles: [...managedHandles],
      dispose,
    }
  } catch (error) {
    await dispose()
    throw error
  }
}
