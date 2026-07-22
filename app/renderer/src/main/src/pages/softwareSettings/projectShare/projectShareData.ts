export interface TeamProjectOption {
  id: number
  name: string
  description?: string
}

export interface ProjectShareFormValue {
  name: string
  expiresAt: Date
  maxUses: number
  enabled: boolean
}

export interface ProjectSharePreview {
  project_name?: string
  creator_name?: string
  team_name?: string
  created_at?: string
  expires_at?: string
  summary?: string
  content_summary?: string
  description?: string
  project_description?: string
  team_id?: number
  created_by?: number
  test_data_count?: number
  test_result_count?: number
}

export const buildProjectShareCreateRequest = (project: TeamProjectOption, value: ProjectShareFormValue) => ({
  projectId: project.id,
  payload: {
    name: value.name.trim(),
    expires_at: value.expiresAt.toISOString(),
    max_uses: value.maxUses,
    enabled: value.enabled,
  },
})

export const getProjectSharePreviewItems = (preview: ProjectSharePreview): Array<[string, string]> => [
  ['项目名', preview.project_name || '-'],
  ['创建人', preview.creator_name || (preview.created_by ? `用户 ${preview.created_by}` : '-')],
  ['团队', preview.team_name || (preview.team_id ? `团队 ${preview.team_id}` : '-')],
  ['创建时间', preview.created_at || '-'],
  ['有效期至', preview.expires_at || '-'],
  [
    '内容摘要',
    preview.summary ||
      preview.content_summary ||
      preview.project_description ||
      preview.description ||
      `测试数据 ${preview.test_data_count || 0} 项，测试结果 ${preview.test_result_count || 0} 项`,
  ],
]
