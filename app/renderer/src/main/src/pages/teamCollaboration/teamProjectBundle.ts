import {
  PROJECT_BUNDLE_CHUNK_BYTES,
  buildProjectBundleChunkInput,
  buildProjectBundleManifest,
  getProjectBundleChunkByteLength,
  getProjectBundleManifest,
  orderProjectBundleChunks,
  parseProjectBundleChunk,
  setProjectBundleManifest,
  type ProjectBundleManifest,
} from './projectBundleData'

export interface ProjectArchiveInfo {
  fileName: string
  filePath: string
  size: number
  sha256: string
}

export interface ProjectArchiveChunk {
  data: string
  offset: number
  length: number
}

export interface ProjectBundleDataRecord {
  id: number | string
  metadata?: string
  content?: unknown
}

export interface LocalProjectReference {
  id: number | string
  name: string
  type?: string
  backupPath?: string
}

export interface TeamProjectMapping {
  teamId: number | string
  projectId: number | string
  onlineProjectVersion: number
  bundleId: string
  bundleSha256: string
  localProjectId: number | string
  localProjectName: string
  importedAt: string
}

export interface TeamProjectBundleDependencies {
  exportLocalProject: (project: LocalProjectReference) => Promise<string>
  inspectArchive: (filePath: string) => Promise<ProjectArchiveInfo>
  readArchiveChunk: (input: { filePath: string; offset: number; length: number }) => Promise<ProjectArchiveChunk>
  createManagedArchive: (input: { fileName: string }) => Promise<{ fileName: string; filePath: string }>
  writeManagedArchiveChunk: (input: { filePath: string; offset: number; data: string }) => Promise<unknown>
  finalizeManagedArchive: (filePath: string) => Promise<ProjectArchiveInfo>
  importManagedArchive: (filePath: string, localProjectName: string) => Promise<LocalProjectReference>
  replaceLocalProjectFromArchive: (
    filePath: string,
    existingProject: LocalProjectReference,
  ) => Promise<LocalProjectReference>
  removeManagedArchive: (filePath: string) => Promise<unknown>
  getProjectSnapshot: (
    teamId: number | string,
    projectId: number | string,
  ) => Promise<{ snapshot: Record<string, unknown>; version: number }>
  updateProjectSnapshot: (
    teamId: number | string,
    projectId: number | string,
    input: { version: number; snapshot: Record<string, unknown> },
  ) => Promise<{ version: number }>
  createTestData: (
    teamId: number | string,
    projectId: number | string,
    input: ReturnType<typeof buildProjectBundleChunkInput>,
  ) => Promise<{ id: number | string }>
  deleteTestData: (teamId: number | string, projectId: number | string, dataId: number | string) => Promise<unknown>
  listTestData: (teamId: number | string, projectId: number | string) => Promise<ProjectBundleDataRecord[]>
  getTestData: (
    teamId: number | string,
    projectId: number | string,
    dataId: number | string,
  ) => Promise<ProjectBundleDataRecord>
  saveProjectMapping: (mapping: TeamProjectMapping) => Promise<unknown>
  createBundleId: () => string
  now: () => string
}

export interface ProjectBundleProgress {
  stage: 'export' | 'upload' | 'download' | 'import'
  completed: number
  total: number
}

interface PublishTeamProjectBundleInput {
  teamId: number | string
  projectId: number | string
  localProject: LocalProjectReference
  chunkSize?: number
  onProgress?: (progress: ProjectBundleProgress) => void
}

interface RestoreTeamProjectBundleInput {
  teamId: number | string
  projectId: number | string
  localProjectName: string
  overwriteLocalProject?: LocalProjectReference
  onlineProjectVersion?: number
  onProgress?: (progress: ProjectBundleProgress) => void
}

const validateChunkSize = (chunkSize: number) => {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0 || chunkSize > PROJECT_BUNDLE_CHUNK_BYTES) {
    throw new Error('项目归档分块大小无效')
  }
}

const removeCreatedRecords = async (
  dependencies: TeamProjectBundleDependencies,
  teamId: number | string,
  projectId: number | string,
  dataIds: Array<number | string>,
) => {
  await Promise.allSettled(dataIds.map((dataId) => dependencies.deleteTestData(teamId, projectId, dataId)))
}

export const publishTeamProjectBundle = async (
  input: PublishTeamProjectBundleInput,
  dependencies: TeamProjectBundleDependencies,
) => {
  const chunkSize = input.chunkSize ?? PROJECT_BUNDLE_CHUNK_BYTES
  validateChunkSize(chunkSize)
  input.onProgress?.({ stage: 'export', completed: 0, total: 1 })
  const archivePath = await dependencies.exportLocalProject(input.localProject)
  const archive = await dependencies.inspectArchive(archivePath)
  if (!Number.isSafeInteger(archive.size) || archive.size <= 0) throw new Error('导出的项目归档为空')
  input.onProgress?.({ stage: 'export', completed: 1, total: 1 })

  const currentSnapshot = await dependencies.getProjectSnapshot(input.teamId, input.projectId)
  const manifest = buildProjectBundleManifest({
    bundleId: dependencies.createBundleId(),
    fileName: archive.fileName,
    fileSize: archive.size,
    sha256: archive.sha256,
    chunkSize,
    chunkCount: Math.ceil(archive.size / chunkSize),
    localProjectId: input.localProject.id,
    localProjectName: input.localProject.name,
    createdAt: dependencies.now(),
  })
  const createdDataIds: Array<number | string> = []
  let snapshotUpdateAttempted = false

  try {
    for (let index = 0; index < manifest.chunk_count; index += 1) {
      const offset = index * chunkSize
      const expectedLength = Math.min(chunkSize, archive.size - offset)
      const chunk = await dependencies.readArchiveChunk({ filePath: archive.filePath, offset, length: expectedLength })
      if (chunk.offset !== offset || chunk.length !== expectedLength) throw new Error('读取的项目归档分块长度不完整')
      const chunkInput = buildProjectBundleChunkInput(manifest, index, chunk.data)
      if (getProjectBundleChunkByteLength(chunk.data) !== expectedLength) {
        throw new Error('读取的项目归档分块内容不完整')
      }
      const created = await dependencies.createTestData(input.teamId, input.projectId, chunkInput)
      createdDataIds.push(created.id)
      input.onProgress?.({ stage: 'upload', completed: index + 1, total: manifest.chunk_count })
    }

    snapshotUpdateAttempted = true
    const updated = await dependencies.updateProjectSnapshot(input.teamId, input.projectId, {
      version: currentSnapshot.version,
      snapshot: setProjectBundleManifest(currentSnapshot.snapshot, manifest),
    })
    return { manifest, createdDataIds, version: updated.version }
  } catch (error) {
    if (snapshotUpdateAttempted) {
      try {
        const authoritativeSnapshot = await dependencies.getProjectSnapshot(input.teamId, input.projectId)
        const authoritativeManifest = getProjectBundleManifest(authoritativeSnapshot.snapshot)
        if (
          authoritativeManifest.bundle_id === manifest.bundle_id &&
          authoritativeManifest.sha256.toLowerCase() === manifest.sha256.toLowerCase() &&
          authoritativeManifest.file_size === manifest.file_size &&
          authoritativeManifest.chunk_size === manifest.chunk_size &&
          authoritativeManifest.chunk_count === manifest.chunk_count
        ) {
          return { manifest: authoritativeManifest, createdDataIds, version: authoritativeSnapshot.version }
        }
      } catch {}
    }
    await removeCreatedRecords(dependencies, input.teamId, input.projectId, createdDataIds)
    throw error
  }
}

export const restoreTeamProjectBundle = async (
  input: RestoreTeamProjectBundleInput,
  dependencies: TeamProjectBundleDependencies,
) => {
  const currentSnapshot = await dependencies.getProjectSnapshot(input.teamId, input.projectId)
  if (input.onlineProjectVersion !== undefined && currentSnapshot.version !== input.onlineProjectVersion) {
    throw new Error('团队项目版本已变化，请刷新后重试')
  }
  const manifest = getProjectBundleManifest(currentSnapshot.snapshot)
  const records = orderProjectBundleChunks(await dependencies.listTestData(input.teamId, input.projectId), manifest)
  const managedArchive = await dependencies.createManagedArchive({ fileName: manifest.file_name })
  let offset = 0

  try {
    for (let index = 0; index < records.length; index += 1) {
      const record = await dependencies.getTestData(input.teamId, input.projectId, records[index].id)
      const chunk = parseProjectBundleChunk(record.content, manifest, index)
      const chunkLength = getProjectBundleChunkByteLength(chunk.data)
      const expectedLength = Math.min(manifest.chunk_size, manifest.file_size - offset)
      if (chunkLength !== expectedLength) throw new Error('项目归档分块长度与清单不一致')
      await dependencies.writeManagedArchiveChunk({ filePath: managedArchive.filePath, offset, data: chunk.data })
      offset += chunkLength
      input.onProgress?.({ stage: 'download', completed: index + 1, total: manifest.chunk_count })
    }
    if (offset !== manifest.file_size) throw new Error('项目归档大小与清单不一致')

    const finalized = await dependencies.finalizeManagedArchive(managedArchive.filePath)
    if (finalized.size !== manifest.file_size) throw new Error('项目归档大小校验失败')
    if (finalized.sha256.toLowerCase() !== manifest.sha256.toLowerCase()) {
      throw new Error('项目归档摘要校验失败')
    }

    input.onProgress?.({ stage: 'import', completed: 0, total: 1 })
    const localProject = input.overwriteLocalProject
      ? await dependencies.replaceLocalProjectFromArchive(managedArchive.filePath, input.overwriteLocalProject)
      : await dependencies.importManagedArchive(managedArchive.filePath, input.localProjectName)
    await dependencies.saveProjectMapping({
      teamId: input.teamId,
      projectId: input.projectId,
      onlineProjectVersion: currentSnapshot.version,
      bundleId: manifest.bundle_id,
      bundleSha256: manifest.sha256,
      localProjectId: localProject.id,
      localProjectName: localProject.name,
      importedAt: dependencies.now(),
    })
    input.onProgress?.({ stage: 'import', completed: 1, total: 1 })
    return { manifest, localProject }
  } finally {
    await Promise.resolve(dependencies.removeManagedArchive(managedArchive.filePath)).catch(() => undefined)
  }
}

export type { ProjectBundleManifest }
