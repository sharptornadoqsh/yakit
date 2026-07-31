import type { ProjectShareImportReceipt } from '@/services/teamCollaboration'
import type { ProjectSharePluginMetadata } from './projectShareBundle'

export interface ProjectShareManagedHandleBase {
  handle: string
  byteLength: number
  sha256: string
}

export type ProjectShareManagedHandleReference =
  | (ProjectShareManagedHandleBase & {
      kind: 'bundle' | 'project_archive'
    })
  | (ProjectShareManagedHandleBase & {
      kind: 'plugin'
      scriptName: string
      type: string
      version: number
      fileHash: string
      entry: string
      metadata: ProjectSharePluginMetadata
    })

export interface ProjectShareRecoveryBase {
  schema: 'yakit.project-share-recovery/v1'
  receiptId: number
  shareId: number
  snapshotId: number
  onlineProjectId: number
  projectKey: string
  name: string
  localProjectName: string
  localImportName: string
  folderId: number
  childFolderId: number
  projectType: string
  managedHandles: readonly ProjectShareManagedHandleReference[]
  expectedSize: number
  expectedSha256: string
  clientId: string
  idempotencyKey: string
  revision: number
  lastHeartbeatAt?: string
  updatedAt: string
}

export interface ProjectShareRecoveryBeforeLocalImport extends ProjectShareRecoveryBase {
  status: 'prepared' | 'downloading' | 'downloaded' | 'importing_project' | 'retryable_failed_before_import'
  localProjectId?: never
}

export interface ProjectShareRecoveryAfterLocalImport extends ProjectShareRecoveryBase {
  status:
    | 'renaming_project'
    | 'project_imported'
    | 'installing_plugins'
    | 'completing'
    | 'retryable_failed_after_import'
  localProjectId: number
}

export type ProjectShareRecoveryRecord = ProjectShareRecoveryBeforeLocalImport | ProjectShareRecoveryAfterLocalImport

export interface ProjectShareRecoveryDependencies {
  upsert: (input: {
    expectedRevision: number
    record: ProjectShareRecoveryRecord
  }) => Promise<ProjectShareRecoveryRecord>
  releaseHandle: (input: {
    receiptId: number
    handle: string
    expectedRevision: number
  }) => Promise<ProjectShareRecoveryRecord>
  remove: (input: { receiptId: number; expectedRevision: number }) => Promise<void>
}

export interface CreateProjectShareRecoveryRecordInput {
  receipt: ProjectShareImportReceipt
  localProjectName: string
  localImportNonce: string
  folderId: number
  childFolderId: number
  projectType: string
  clientId: string
  idempotencyKey: string
  updatedAt: string
}

type RecoveryPatch = Omit<Partial<ProjectShareRecoveryRecord>, 'schema' | 'receiptId' | 'revision' | 'updatedAt'>

const createError = (code: string) => Object.assign(new Error(code), { code })

const isPositiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0
const isNonNegativeInteger = (value: number) => Number.isSafeInteger(value) && value >= 0

export const createProjectShareRecoveryRecord = ({
  receipt,
  localProjectName,
  localImportNonce,
  folderId,
  childFolderId,
  projectType,
  clientId,
  idempotencyKey,
  updatedAt,
}: CreateProjectShareRecoveryRecordInput): ProjectShareRecoveryBeforeLocalImport => {
  if (
    receipt.status !== 'prepared' ||
    !isPositiveInteger(receipt.receipt_id) ||
    !isPositiveInteger(receipt.share_id) ||
    !isPositiveInteger(receipt.snapshot_id) ||
    !isPositiveInteger(receipt.project_id) ||
    !isPositiveInteger(receipt.bundle.file_size) ||
    !/^[0-9a-f]{64}$/.test(receipt.bundle.archive_sha256) ||
    !localProjectName.trim() ||
    localProjectName.trim() !== localProjectName ||
    !/^[0-9a-f]{32}$/.test(localImportNonce) ||
    !isNonNegativeInteger(folderId) ||
    !isNonNegativeInteger(childFolderId) ||
    !projectType.trim() ||
    !clientId.trim() ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey) ||
    Number.isNaN(Date.parse(updatedAt))
  ) {
    throw createError('project_share_recovery_record_invalid')
  }

  return {
    schema: 'yakit.project-share-recovery/v1',
    receiptId: receipt.receipt_id,
    shareId: receipt.share_id,
    snapshotId: receipt.snapshot_id,
    onlineProjectId: receipt.project_id,
    projectKey: receipt.project_key,
    name: receipt.name,
    localProjectName,
    localImportName: `__yakit_share_${receipt.receipt_id}_${localImportNonce}`,
    folderId,
    childFolderId,
    projectType,
    managedHandles: [],
    expectedSize: receipt.bundle.file_size,
    expectedSha256: receipt.bundle.archive_sha256,
    clientId,
    idempotencyKey,
    status: 'prepared',
    revision: 0,
    updatedAt,
  }
}

export const transitionProjectShareRecovery = async (
  dependencies: Pick<ProjectShareRecoveryDependencies, 'upsert'>,
  current: ProjectShareRecoveryRecord,
  patch: RecoveryPatch,
): Promise<ProjectShareRecoveryRecord> => {
  const record = {
    ...current,
    ...patch,
    schema: current.schema,
    receiptId: current.receiptId,
    revision: current.revision,
    updatedAt: current.updatedAt,
  } as ProjectShareRecoveryRecord
  return dependencies.upsert({
    expectedRevision: current.revision,
    record,
  })
}

export const disposeProjectShareRecovery = async (
  dependencies: Pick<ProjectShareRecoveryDependencies, 'releaseHandle' | 'remove'>,
  initial: ProjectShareRecoveryRecord,
): Promise<void> => {
  let current = initial
  while (current.managedHandles.length > 0) {
    const handle = current.managedHandles[0].handle
    const next = await dependencies.releaseHandle({
      receiptId: current.receiptId,
      handle,
      expectedRevision: current.revision,
    })
    if (next.revision <= current.revision || next.managedHandles.some((item) => item.handle === handle)) {
      throw createError('project_share_recovery_state_invalid')
    }
    current = next
  }
  await dependencies.remove({
    receiptId: current.receiptId,
    expectedRevision: current.revision,
  })
}
