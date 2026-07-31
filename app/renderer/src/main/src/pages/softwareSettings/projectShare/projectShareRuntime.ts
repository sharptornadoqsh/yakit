import type {
  CreateProjectShareInput,
  ImportProjectShareInput,
  ProjectShareCreation,
  ProjectShareImportReceipt,
} from '@/services/teamCollaboration'
import {
  createProjectShareRecoveryRecord,
  disposeProjectShareRecovery,
  transitionProjectShareRecovery,
  type ProjectShareManagedHandleReference,
  type ProjectShareRecoveryRecord,
} from './projectShareRecovery'
import type {
  CreateAndUploadProjectShareBundleInput,
  ProjectShareBundleExtraction,
  ProjectShareImportedProject,
  ProjectSharePluginContent,
  ProjectSharePluginMaterial,
  ProjectSharePluginSummary,
  UploadedProjectShareBundle,
} from './projectShareBundle'
import { getProjectShareErrorCode } from './projectShareBundle'

export interface ProjectShareClientContext {
  clientId: string
}

export interface ProjectShareRuntimeDependencies {
  createAndUploadBundle: (input: CreateAndUploadProjectShareBundleInput) => Promise<UploadedProjectShareBundle>
  createShare: (teamId: number, projectId: number, input: CreateProjectShareInput) => Promise<ProjectShareCreation>
  prepareImport: (input: ImportProjectShareInput) => Promise<ProjectShareImportReceipt>
  resumeImport: (receiptId: number) => Promise<ProjectShareImportReceipt>
  heartbeatImport: (receiptId: number) => Promise<ProjectShareImportReceipt>
  completeImport: (receiptId: number) => Promise<ProjectShareImportReceipt>
  failImport: (receiptId: number, input: { failure_code: 'local_import_failed' }) => Promise<ProjectShareImportReceipt>
  getClientContext: () => Promise<ProjectShareClientContext>
  listRecoveries: () => Promise<ProjectShareRecoveryRecord[]>
  upsertRecovery: (input: {
    expectedRevision: number
    record: ProjectShareRecoveryRecord
  }) => Promise<ProjectShareRecoveryRecord>
  releaseRecoveryHandle: (input: {
    receiptId: number
    handle: string
    expectedRevision: number
  }) => Promise<ProjectShareRecoveryRecord>
  removeRecovery: (input: { receiptId: number; expectedRevision: number }) => Promise<void>
  downloadImportBundle: (input: { receiptId: number; expectedSize: number; expectedSha256: string }) => Promise<{
    handle: string
    fileSize: number
    archiveSha256: string
  }>
  extractBundle: (handle: string) => Promise<ProjectShareBundleExtraction>
  readPluginContent: (handle: string) => Promise<ProjectSharePluginContent>
  importProjectArchive: (
    input: {
      receiptId: number
      handle: string
      localImportName: string
      finalLocalProjectName: string
      password: string
      folderId: number
      childFolderId: number
      type: string
    },
    operationToken: string,
  ) => Promise<ProjectShareImportedProject>
  resolveImportedProject: (receiptId: number) => Promise<ProjectShareImportedProject | null>
  installPlugin: (input: {
    localProjectId: number
    plugin: ProjectSharePluginSummary
    contentBase64: string
  }) => Promise<void>
  createUUID?: () => string
  createNonce?: () => string
  now?: () => Date
  startHeartbeat?: (heartbeat: () => Promise<void>) => () => void
}

export interface PublishProjectShareInput {
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
  name: string
  expiresAt: Date | null
  maxUses: number
  enabled: boolean
}

export interface ImportProjectShareRuntimeInput {
  token: string
  projectKey: string
  name: string
  localProjectName: string
  password: string
  folderId: number
  childFolderId: number
  projectType: string
}

export interface ImportedProjectShareResult extends ProjectShareImportedProject {
  onlineProjectId: number
}

const createError = (code: string) => Object.assign(new Error(code), { code })
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const defaultUUID = () => globalThis.crypto.randomUUID()
const defaultNonce = () => defaultUUID().replaceAll('-', '')
const defaultNow = () => new Date()
const defaultStartHeartbeat = (heartbeat: () => Promise<void>) => {
  const timer = globalThis.setInterval(() => {
    void heartbeat().catch(() => undefined)
  }, 60_000)
  return () => globalThis.clearInterval(timer)
}

const getRecovery = async (
  receiptId: number,
  dependencies: ProjectShareRuntimeDependencies,
): Promise<ProjectShareRecoveryRecord> => {
  const matches = (await dependencies.listRecoveries()).filter((record) => record.receiptId === receiptId)
  if (matches.length !== 1) throw createError('project_share_recovery_record_missing')
  return matches[0]
}

const recoveryDependencies = (dependencies: ProjectShareRuntimeDependencies) => ({
  upsert: dependencies.upsertRecovery,
  releaseHandle: dependencies.releaseRecoveryHandle,
  remove: dependencies.removeRecovery,
})

const requirePreparedReceipt = (receipt: ProjectShareImportReceipt, now: Date): ProjectShareImportReceipt => {
  const lease = receipt.lease_expires_at ? new Date(receipt.lease_expires_at) : null
  if (receipt.status !== 'prepared' || !lease || Number.isNaN(lease.getTime()) || lease.getTime() <= now.getTime()) {
    throw createError('import_receipt_not_active')
  }
  return receipt
}

const managedHandle = (record: ProjectShareRecoveryRecord, kind: ProjectShareManagedHandleReference['kind']) =>
  record.managedHandles.find((item) => item.kind === kind)

const releaseHandle = async (
  current: ProjectShareRecoveryRecord,
  handle: string,
  dependencies: ProjectShareRuntimeDependencies,
) =>
  dependencies.releaseRecoveryHandle({
    receiptId: current.receiptId,
    handle,
    expectedRevision: current.revision,
  })

const validateDownloadedBundle = (
  downloaded: { handle: string; fileSize: number; archiveSha256: string },
  record: ProjectShareRecoveryRecord,
) => {
  if (downloaded.fileSize !== record.expectedSize || downloaded.archiveSha256 !== record.expectedSha256) {
    throw createError('project_share_download_digest_mismatch')
  }
}

const extractionHandles = (extraction: ProjectShareBundleExtraction): ProjectShareManagedHandleReference[] => [
  {
    kind: 'project_archive',
    handle: extraction.projectArchiveHandle,
    byteLength: extraction.projectArchiveSize,
    sha256: extraction.projectArchiveSha256,
  },
  ...extraction.plugins.map((plugin) => ({
    kind: 'plugin' as const,
    handle: plugin.handle,
    byteLength: plugin.byteLength,
    sha256: plugin.sha256,
    scriptName: plugin.scriptName,
    type: plugin.type,
    version: plugin.version,
    fileHash: plugin.fileHash,
    entry: plugin.entry,
    metadata: plugin.metadata,
  })),
]

const validateExtraction = (extraction: ProjectShareBundleExtraction) => {
  if (
    !isPositiveInteger(extraction.projectArchiveSize) ||
    !/^[0-9a-f]{64}$/.test(extraction.projectArchiveSha256) ||
    extraction.plugins.some(
      (plugin) =>
        !isPositiveInteger(plugin.byteLength) ||
        !isPositiveInteger(plugin.version) ||
        !/^[0-9a-f]{64}$/.test(plugin.fileHash) ||
        plugin.sha256 !== plugin.fileHash,
    )
  ) {
    throw createError('project_share_bundle_invalid')
  }
}

const markRetryableFailure = async (
  current: ProjectShareRecoveryRecord,
  error: unknown,
  completionStarted: boolean,
  dependencies: ProjectShareRuntimeDependencies,
) => {
  const code = getProjectShareErrorCode(error)
  if (completionStarted || code === 'local_import_outcome_unknown' || code === 'project_share_recovery_conflict') {
    return
  }

  try {
    const latest = await getRecovery(current.receiptId, dependencies)
    const status = isPositiveInteger(latest.localProjectId)
      ? 'retryable_failed_after_import'
      : 'retryable_failed_before_import'
    await transitionProjectShareRecovery(recoveryDependencies(dependencies), latest, {
      status,
    } as never)
  } catch {
    return
  }

  await dependencies.failImport(current.receiptId, { failure_code: 'local_import_failed' }).catch(() => undefined)
}

const continuePreparedImport = async (
  initial: ProjectShareRecoveryRecord,
  receipt: ProjectShareImportReceipt,
  password: string | undefined,
  context: ProjectShareClientContext,
  dependencies: ProjectShareRuntimeDependencies,
): Promise<ImportedProjectShareResult> => {
  const now = dependencies.now || defaultNow
  requirePreparedReceipt(receipt, now())
  let current = initial
  let completionStarted = false
  const startHeartbeat = dependencies.startHeartbeat || defaultStartHeartbeat
  const stopHeartbeat = startHeartbeat(async () => {
    await dependencies.heartbeatImport(current.receiptId)
  })

  try {
    if (current.clientId !== context.clientId) {
      current = await transitionProjectShareRecovery(recoveryDependencies(dependencies), current, {
        clientId: context.clientId,
      })
    }

    const completeCurrentImport = async (localProjectId: number): Promise<ImportedProjectShareResult> => {
      completionStarted = true
      const completed = await dependencies.completeImport(current.receiptId)
      if (completed.status !== 'completed' || !completed.project || completed.project.id !== current.onlineProjectId) {
        throw createError('project_share_complete_response_invalid')
      }
      await disposeProjectShareRecovery(recoveryDependencies(dependencies), current)
      return {
        localProjectId,
        localProjectName: current.localProjectName,
        onlineProjectId: current.onlineProjectId,
      }
    }

    if (current.status === 'completing') {
      if (!isPositiveInteger(current.localProjectId)) {
        throw createError('project_share_recovery_state_invalid')
      }
      return await completeCurrentImport(current.localProjectId)
    }

    const existingLocalProjectId = current.localProjectId
    let projectArchive = managedHandle(current, 'project_archive')
    if (!isPositiveInteger(existingLocalProjectId) && !projectArchive) {
      let bundle = managedHandle(current, 'bundle')
      if (!bundle) {
        current = await transitionProjectShareRecovery(recoveryDependencies(dependencies), current, {
          status: 'downloading',
        } as never)
        const downloaded = await dependencies.downloadImportBundle({
          receiptId: current.receiptId,
          expectedSize: current.expectedSize,
          expectedSha256: current.expectedSha256,
        })
        validateDownloadedBundle(downloaded, current)
        bundle = {
          kind: 'bundle',
          handle: downloaded.handle,
          byteLength: downloaded.fileSize,
          sha256: downloaded.archiveSha256,
        }
        current = await transitionProjectShareRecovery(recoveryDependencies(dependencies), current, {
          status: 'downloaded',
          managedHandles: [...current.managedHandles, bundle],
        } as never)
      }

      const extraction = await dependencies.extractBundle(bundle.handle)
      validateExtraction(extraction)
      const extractedHandles = extractionHandles(extraction)
      current = await transitionProjectShareRecovery(recoveryDependencies(dependencies), current, {
        status: 'downloaded',
        managedHandles: [
          ...current.managedHandles,
          ...extractedHandles.filter(
            (item) => !current.managedHandles.some((existing) => existing.handle === item.handle),
          ),
        ],
      } as never)
      current = await releaseHandle(current, bundle.handle, dependencies)
      projectArchive = managedHandle(current, 'project_archive')
    }

    if (!isPositiveInteger(existingLocalProjectId) && !projectArchive) {
      throw createError('project_share_project_archive_missing')
    }

    let importedProject: ProjectShareImportedProject
    if (current.status === 'renaming_project') {
      const resolved = await dependencies.resolveImportedProject(current.receiptId)
      if (!resolved) throw createError('local_import_outcome_unknown')
      importedProject = resolved
      current = await getRecovery(current.receiptId, dependencies)
      if (current.status !== 'project_imported' || current.localProjectId !== importedProject.localProjectId) {
        throw createError('project_share_recovery_state_invalid')
      }
    } else if (isPositiveInteger(existingLocalProjectId)) {
      importedProject = {
        localProjectId: existingLocalProjectId,
        localProjectName: current.localProjectName,
      }
    } else {
      if (!projectArchive) throw createError('project_share_project_archive_missing')
      if (current.status === 'importing_project') {
        const resolved = await dependencies.resolveImportedProject(current.receiptId)
        if (resolved) {
          importedProject = resolved
          current = await getRecovery(current.receiptId, dependencies)
        } else {
          if (password === undefined) throw createError('project_share_import_password_required')
          importedProject = await dependencies.importProjectArchive(
            {
              receiptId: current.receiptId,
              handle: projectArchive.handle,
              localImportName: current.localImportName,
              finalLocalProjectName: current.localProjectName,
              password,
              folderId: current.folderId,
              childFolderId: current.childFolderId,
              type: current.projectType,
            },
            (dependencies.createUUID || defaultUUID)(),
          )
          current = await getRecovery(current.receiptId, dependencies)
        }
      } else {
        if (password === undefined) throw createError('project_share_import_password_required')
        current = await transitionProjectShareRecovery(recoveryDependencies(dependencies), current, {
          status: 'importing_project',
        } as never)
        try {
          importedProject = await dependencies.importProjectArchive(
            {
              receiptId: current.receiptId,
              handle: projectArchive.handle,
              localImportName: current.localImportName,
              finalLocalProjectName: current.localProjectName,
              password,
              folderId: current.folderId,
              childFolderId: current.childFolderId,
              type: current.projectType,
            },
            (dependencies.createUUID || defaultUUID)(),
          )
        } catch (error) {
          if (getProjectShareErrorCode(error) !== 'local_import_outcome_unknown') throw error
          const resolved = await dependencies.resolveImportedProject(current.receiptId)
          if (!resolved) throw error
          importedProject = resolved
        }
        current = await getRecovery(current.receiptId, dependencies)
      }
      if (current.status !== 'project_imported' || current.localProjectId !== importedProject.localProjectId) {
        throw createError('project_share_recovery_state_invalid')
      }
    }

    const currentProjectArchive = managedHandle(current, 'project_archive')
    if (currentProjectArchive) {
      current = await releaseHandle(current, currentProjectArchive.handle, dependencies)
    }
    if (current.status !== 'installing_plugins') {
      current = await transitionProjectShareRecovery(recoveryDependencies(dependencies), current, {
        status: 'installing_plugins',
      } as never)
    }
    const localProjectId = current.localProjectId
    if (!isPositiveInteger(localProjectId)) {
      throw createError('project_share_recovery_state_invalid')
    }

    for (const pluginHandle of current.managedHandles.filter(
      (item): item is Extract<ProjectShareManagedHandleReference, { kind: 'plugin' }> => item.kind === 'plugin',
    )) {
      const content = await dependencies.readPluginContent(pluginHandle.handle)
      if (
        content.byteLength <= 0 ||
        content.byteLength !== pluginHandle.byteLength ||
        content.sha256 !== pluginHandle.fileHash ||
        content.sha256 !== pluginHandle.sha256
      ) {
        throw createError('project_share_plugin_hash_mismatch')
      }
      const extractionPlugin: ProjectSharePluginSummary = {
        handle: pluginHandle.handle,
        scriptName: pluginHandle.scriptName,
        type: pluginHandle.type,
        version: pluginHandle.version,
        fileHash: pluginHandle.fileHash,
        entry: pluginHandle.entry,
        byteLength: pluginHandle.byteLength,
        sha256: pluginHandle.sha256,
        metadata: pluginHandle.metadata,
      }
      await dependencies.installPlugin({
        localProjectId,
        plugin: extractionPlugin,
        contentBase64: content.contentBase64,
      })
      current = await releaseHandle(current, pluginHandle.handle, dependencies)
    }

    current = await transitionProjectShareRecovery(recoveryDependencies(dependencies), current, {
      status: 'completing',
    } as never)
    return await completeCurrentImport(localProjectId)
  } catch (error) {
    await markRetryableFailure(current, error, completionStarted, dependencies)
    throw error
  } finally {
    stopHeartbeat()
  }
}

export const publishProjectShare = async (
  input: PublishProjectShareInput,
  dependencies: ProjectShareRuntimeDependencies,
): Promise<ProjectShareCreation> => {
  const createUUID = dependencies.createUUID || defaultUUID
  const now = dependencies.now || defaultNow
  const prepared = await dependencies.createAndUploadBundle({
    teamId: input.teamId,
    onlineProjectId: input.onlineProjectId,
    localProject: input.localProject,
    password: input.password,
    engine: input.engine,
    plugins: input.plugins,
    bundleId: createUUID(),
    idempotencyKey: createUUID(),
    operationToken: createUUID(),
    createdAt: now().toISOString(),
  })
  try {
    if (prepared.remote.status !== 'ready') throw createError('project_bundle_not_ready')
    return await dependencies.createShare(input.teamId, input.onlineProjectId, {
      bundle_id: prepared.local.bundleId,
      name: input.name.trim(),
      expires_at: input.expiresAt?.toISOString() ?? null,
      max_uses: input.maxUses,
      enabled: input.enabled,
    })
  } finally {
    await prepared.dispose()
  }
}

export const importProjectShare = async (
  input: ImportProjectShareRuntimeInput,
  dependencies: ProjectShareRuntimeDependencies,
): Promise<ImportedProjectShareResult> => {
  const createUUID = dependencies.createUUID || defaultUUID
  const now = dependencies.now || defaultNow
  const context = await dependencies.getClientContext()
  const idempotencyKey = createUUID()
  const prepared = requirePreparedReceipt(
    await dependencies.prepareImport({
      token: input.token.trim(),
      project_key: input.projectKey,
      name: input.name.trim(),
      idempotency_key: idempotencyKey,
    }),
    now(),
  )
  const initial = createProjectShareRecoveryRecord({
    receipt: prepared,
    localProjectName: input.localProjectName.trim(),
    localImportNonce: (dependencies.createNonce || defaultNonce)(),
    folderId: input.folderId,
    childFolderId: input.childFolderId,
    projectType: input.projectType,
    clientId: context.clientId,
    idempotencyKey,
    updatedAt: now().toISOString(),
  })
  const saved = await transitionProjectShareRecovery(recoveryDependencies(dependencies), initial, {})
  return continuePreparedImport(saved, prepared, input.password, context, dependencies)
}

export const resumeProjectShareImport = async (
  receiptId: number,
  input: { password?: string },
  dependencies: ProjectShareRuntimeDependencies,
): Promise<ImportedProjectShareResult> => {
  let current = await getRecovery(receiptId, dependencies)
  const context = await dependencies.getClientContext()
  const resumed = await dependencies.resumeImport(receiptId)
  if (resumed.status === 'completed') {
    const localProjectId = current.localProjectId
    if (!isPositiveInteger(localProjectId)) {
      throw createError('project_share_recovery_state_invalid')
    }
    const result = {
      localProjectId,
      localProjectName: current.localProjectName,
      onlineProjectId: current.onlineProjectId,
    }
    await disposeProjectShareRecovery(recoveryDependencies(dependencies), current)
    return result
  }
  requirePreparedReceipt(resumed, (dependencies.now || defaultNow)())
  if (current.clientId !== context.clientId) {
    current = await transitionProjectShareRecovery(recoveryDependencies(dependencies), current, {
      clientId: context.clientId,
    })
  }
  return continuePreparedImport(current, resumed, input.password, context, dependencies)
}
