import type { CreateProjectShareInput, ProjectSharePreview } from '@/services/teamCollaboration'

export interface TeamProjectOption {
  id: number
  name: string
  description?: string
}

export interface ProjectShareFormValue {
  name: string
  expiresAt: Date | null
  maxUses: number
  enabled: boolean
}

export const buildProjectShareCreateRequest = (
  bundleId: string,
  value: ProjectShareFormValue,
): CreateProjectShareInput => ({
  bundle_id: bundleId,
  name: value.name.trim(),
  expires_at: value.expiresAt?.toISOString() ?? null,
  max_uses: value.maxUses,
  enabled: value.enabled,
})

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GiB`
}

export const getProjectSharePreviewItems = (preview: ProjectSharePreview): Array<[string, string]> => [
  ['项目名', preview.project_name],
  ['测试数据', `${preview.data_count} 项`],
  ['测试结果', `${preview.result_count} 项`],
  ['项目插件', `${preview.plugin_count} 个`],
  ['归档大小', formatBytes(preview.archive_size)],
  ['归档摘要', preview.archive_sha256],
]

export type { ProjectSharePreview }
