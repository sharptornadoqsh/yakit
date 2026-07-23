export const PROJECT_BUNDLE_SCHEMA = 'yakit.team-project-bundle/v1'
export const PROJECT_BUNDLE_DATA_TYPE = 'project_bundle_chunk'
export const PROJECT_BUNDLE_CHUNK_BYTES = 3 * 1024 * 1024

export interface ProjectBundleManifest {
  schema: typeof PROJECT_BUNDLE_SCHEMA
  bundle_id: string
  file_name: string
  file_size: number
  sha256: string
  chunk_size: number
  chunk_count: number
  source_project: {
    id: number | string
    name: string
  }
  created_at: string
}

export interface ProjectBundleChunkContent {
  schema: typeof PROJECT_BUNDLE_SCHEMA
  bundle_id: string
  index: number
  total: number
  data: string
}

interface ProjectBundleChunkRecord {
  id: number | string
  metadata?: string
}

interface BuildProjectBundleManifestInput {
  bundleId: string
  fileName: string
  fileSize: number
  sha256: string
  chunkSize: number
  chunkCount: number
  localProjectId: number | string
  localProjectName: string
  createdAt: string
}

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

const parseRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value !== 'string') return asRecord(value)
  try {
    return asRecord(JSON.parse(value))
  } catch {
    return undefined
  }
}

const requirePositiveInteger = (value: number, message: string) => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(message)
}

const getBase64ByteLength = (data: string) => {
  if (!data || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new Error('项目归档分块内容不是有效的 Base64')
  }
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return (data.length * 3) / 4 - padding
}

export const getProjectBundleChunkByteLength = (data: string) => getBase64ByteLength(data)

const validateManifest = (value: unknown): ProjectBundleManifest => {
  const manifest = asRecord(value)
  const sourceProject = asRecord(manifest?.source_project)
  if (
    manifest?.schema !== PROJECT_BUNDLE_SCHEMA ||
    typeof manifest.bundle_id !== 'string' ||
    !manifest.bundle_id ||
    typeof manifest.file_name !== 'string' ||
    !manifest.file_name ||
    typeof manifest.file_size !== 'number' ||
    !Number.isSafeInteger(manifest.file_size) ||
    manifest.file_size <= 0 ||
    typeof manifest.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(manifest.sha256) ||
    typeof manifest.chunk_size !== 'number' ||
    !Number.isSafeInteger(manifest.chunk_size) ||
    manifest.chunk_size <= 0 ||
    typeof manifest.chunk_count !== 'number' ||
    !Number.isSafeInteger(manifest.chunk_count) ||
    manifest.chunk_count <= 0 ||
    !sourceProject ||
    (typeof sourceProject.id !== 'number' && typeof sourceProject.id !== 'string') ||
    typeof sourceProject.name !== 'string' ||
    typeof manifest.created_at !== 'string'
  ) {
    throw new Error('项目快照中的归档清单无效')
  }
  return manifest as unknown as ProjectBundleManifest
}

export const buildProjectBundleManifest = (input: BuildProjectBundleManifestInput): ProjectBundleManifest => {
  requirePositiveInteger(input.fileSize, '项目归档大小无效')
  requirePositiveInteger(input.chunkSize, '项目归档分块大小无效')
  requirePositiveInteger(input.chunkCount, '项目归档分块数量无效')
  return validateManifest({
    schema: PROJECT_BUNDLE_SCHEMA,
    bundle_id: input.bundleId,
    file_name: input.fileName,
    file_size: input.fileSize,
    sha256: input.sha256,
    chunk_size: input.chunkSize,
    chunk_count: input.chunkCount,
    source_project: { id: input.localProjectId, name: input.localProjectName },
    created_at: input.createdAt,
  })
}

export const setProjectBundleManifest = (
  snapshot: Record<string, unknown>,
  manifest: ProjectBundleManifest,
): Record<string, unknown> => ({
  ...snapshot,
  project_bundle: validateManifest(manifest),
})

export const getProjectBundleManifest = (snapshot: Record<string, unknown>): ProjectBundleManifest => {
  if (!snapshot.project_bundle) throw new Error('团队项目尚未发布本地归档')
  return validateManifest(snapshot.project_bundle)
}

export const buildProjectBundleChunkInput = (manifest: ProjectBundleManifest, index: number, data: string) => {
  if (!Number.isSafeInteger(index) || index < 0 || index >= manifest.chunk_count) {
    throw new Error('项目归档分块序号无效')
  }
  const descriptor = {
    schema: PROJECT_BUNDLE_SCHEMA,
    bundle_id: manifest.bundle_id,
    index,
    total: manifest.chunk_count,
  }
  return {
    name: `${manifest.file_name} [${index + 1}/${manifest.chunk_count}]`,
    type: PROJECT_BUNDLE_DATA_TYPE,
    metadata: descriptor,
    deduplication_key: `project-bundle:${manifest.bundle_id}:${index}`,
    status: 'ready',
    content: JSON.stringify({ ...descriptor, data }),
  }
}

export const orderProjectBundleChunks = <T extends ProjectBundleChunkRecord>(
  records: T[],
  manifest: ProjectBundleManifest,
): T[] => {
  const matched = records
    .map((record) => ({ record, metadata: parseRecord(record.metadata) }))
    .filter(({ metadata }) => metadata?.schema === PROJECT_BUNDLE_SCHEMA && metadata.bundle_id === manifest.bundle_id)
  if (matched.length !== manifest.chunk_count) throw new Error('项目归档分块数量不完整')

  const byIndex = new Map<number, T>()
  matched.forEach(({ record, metadata }) => {
    const index = metadata?.index
    if (
      typeof index !== 'number' ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= manifest.chunk_count ||
      metadata?.total !== manifest.chunk_count
    ) {
      throw new Error('项目归档分块元数据无效')
    }
    if (byIndex.has(index)) throw new Error('项目归档分块序号重复')
    byIndex.set(index, record)
  })
  if (byIndex.size !== manifest.chunk_count) throw new Error('项目归档分块数量不完整')
  return Array.from({ length: manifest.chunk_count }, (_, index) => byIndex.get(index) as T)
}

export const parseProjectBundleChunk = (
  content: unknown,
  manifest: ProjectBundleManifest,
  expectedIndex: number,
): ProjectBundleChunkContent => {
  const chunk = parseRecord(content)
  if (
    chunk?.schema !== PROJECT_BUNDLE_SCHEMA ||
    chunk.bundle_id !== manifest.bundle_id ||
    chunk.total !== manifest.chunk_count ||
    typeof chunk.data !== 'string'
  ) {
    throw new Error('项目归档分块内容无效')
  }
  if (chunk.index !== expectedIndex) throw new Error('项目归档分块序号不匹配')
  getBase64ByteLength(chunk.data)
  return chunk as unknown as ProjectBundleChunkContent
}
