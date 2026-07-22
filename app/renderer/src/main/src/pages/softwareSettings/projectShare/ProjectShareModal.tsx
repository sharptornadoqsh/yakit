import React, { useEffect, useMemo, useState } from 'react'
import { Form, InputNumber, Select, Switch, Table } from 'antd'
import { useMemoizedFn } from 'ahooks'
import { RuiYanButton, RuiYanModal } from '@/components/renyanUI'
import { YakitInput } from '@/components/yakitUI/YakitInput/YakitInput'
import { setClipboardText } from '@/utils/clipboard'
import { success, yakitFailed } from '@/utils/notification'
import * as teamCollaboration from '@/services/teamCollaboration'
import {
  buildProjectShareCreateRequest,
  getProjectSharePreviewItems,
  type ProjectSharePreview,
  type TeamProjectOption,
} from './projectShareData'
import styles from './ProjectShareModal.module.scss'

interface ProjectShareRecord {
  id: number
  name: string
  enabled: boolean
  expires_at?: string
  max_uses?: number
  used_count?: number
  revoked_at?: string
  version?: number
}

interface ProjectShareUseRecord {
  id: number
  imported_project_id?: number
  imported_by_name?: string
  created_at?: string
  result?: string
  client?: string
}

interface ProjectShareModalProps {
  open: boolean
  mode: 'share' | 'import'
  onClose: () => void
  onImported?: (projectId: number) => void
}

const service = teamCollaboration as any

const unwrapData = <T,>(response: any): T => {
  return (response?.data?.data ?? response?.data ?? response) as T
}

const unwrapItems = <T,>(response: any, keys: string[] = []): T[] => {
  const data = unwrapData<any>(response)
  if (Array.isArray(data)) return data
  for (const key of [...keys, 'items', 'list', 'data']) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

const formatDateTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export const ProjectShareModal: React.FC<ProjectShareModalProps> = ({ open, mode, onClose, onImported }) => {
  const [loading, setLoading] = useState(false)
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([])
  const [projects, setProjects] = useState<TeamProjectOption[]>([])
  const [shares, setShares] = useState<ProjectShareRecord[]>([])
  const [uses, setUses] = useState<ProjectShareUseRecord[]>([])
  const [teamId, setTeamId] = useState<number>()
  const [projectId, setProjectId] = useState<number>()
  const [plainToken, setPlainToken] = useState<{ shareId?: number; token: string }>()
  const [selectedShare, setSelectedShare] = useState<ProjectShareRecord>()
  const [shareName, setShareName] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [maxUses, setMaxUses] = useState(1)
  const [enabled, setEnabled] = useState(true)
  const [token, setToken] = useState('')
  const [preview, setPreview] = useState<ProjectSharePreview>()
  const [importedProjectId, setImportedProjectId] = useState<number>()

  const selectedProject = useMemo(() => projects.find((item) => item.id === projectId), [projectId, projects])

  const resetSensitiveState = useMemoizedFn(() => {
    setPlainToken(undefined)
    setToken('')
    setPreview(undefined)
    setImportedProjectId(undefined)
    setUses([])
    setSelectedShare(undefined)
  })

  const close = useMemoizedFn(() => {
    resetSensitiveState()
    onClose()
  })

  const loadShares = useMemoizedFn(async (nextTeamId: number, nextProjectId: number) => {
    const response = await service.listProjectShares(nextTeamId, nextProjectId, { page: 1, limit: 100 })
    setShares(unwrapItems<ProjectShareRecord>(response, ['shares']))
  })

  const loadProjects = useMemoizedFn(async (nextTeamId: number) => {
    setLoading(true)
    try {
      const response = await service.listTeamProjects(nextTeamId, { page: 1, limit: 100 })
      const nextProjects = unwrapItems<any>(response, ['projects']).map((item) => ({
        id: Number(item.id ?? item.ID),
        name: item.name ?? item.project_name ?? item.ProjectName ?? `#${item.id ?? item.ID}`,
        description: item.description ?? item.Description,
      }))
      setProjects(nextProjects)
      const nextProjectId = nextProjects[0]?.id
      setProjectId(nextProjectId)
      setShares([])
      if (nextProjectId) await loadShares(nextTeamId, nextProjectId)
    } catch (error) {
      yakitFailed(`加载团队项目失败：${error}`)
    } finally {
      setLoading(false)
    }
  })

  const loadTeams = useMemoizedFn(async () => {
    setLoading(true)
    try {
      const response = await service.listTeams({ page: 1, limit: 100 })
      const nextTeams = unwrapItems<any>(response, ['teams']).map((item) => ({
        id: Number(item.id ?? item.ID),
        name: item.name ?? item.team_name ?? item.TeamName ?? `#${item.id ?? item.ID}`,
      }))
      setTeams(nextTeams)
      const nextTeamId = nextTeams[0]?.id
      setTeamId(nextTeamId)
      if (nextTeamId) await loadProjects(nextTeamId)
    } catch (error) {
      yakitFailed(`加载团队失败：${error}`)
    } finally {
      setLoading(false)
    }
  })

  useEffect(() => {
    if (!open) {
      resetSensitiveState()
      return
    }
    if (mode === 'share') loadTeams()
  }, [open, mode])

  const createShare = useMemoizedFn(async () => {
    if (!teamId || !selectedProject) {
      yakitFailed('请选择团队项目')
      return
    }
    if (!shareName.trim()) {
      yakitFailed('请填写密令名称')
      return
    }
    setLoading(true)
    try {
      const request = buildProjectShareCreateRequest(selectedProject, {
        name: shareName,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
        maxUses,
        enabled,
      })
      const response = await service.createProjectShare(teamId, request.projectId, request.payload)
      const created = unwrapData<any>(response)
      setPlainToken({ shareId: Number(created.id ?? created.share?.id), token: created.token || '' })
      setShareName('')
      await loadShares(teamId, request.projectId)
      success('项目密令已创建，明文关闭后将清除')
    } catch (error) {
      yakitFailed(`创建项目密令失败：${error}`)
    } finally {
      setLoading(false)
    }
  })

  const updateShareState = useMemoizedFn(async (share: ProjectShareRecord, nextEnabled: boolean) => {
    if (!teamId || !projectId) return
    setLoading(true)
    try {
      await service.updateProjectShare(teamId, projectId, share.id, {
        enabled: nextEnabled,
        version: share.version,
      })
      await loadShares(teamId, projectId)
    } catch (error) {
      yakitFailed(`更新密令状态失败：${error}`)
    } finally {
      setLoading(false)
    }
  })

  const revokeShare = useMemoizedFn(async (share: ProjectShareRecord) => {
    if (!teamId || !projectId) return
    setLoading(true)
    try {
      await service.revokeProjectShare(teamId, projectId, share.id, share.version || 0)
      if (plainToken?.shareId === share.id) setPlainToken(undefined)
      await loadShares(teamId, projectId)
      success('项目密令已撤销')
    } catch (error) {
      yakitFailed(`撤销项目密令失败：${error}`)
    } finally {
      setLoading(false)
    }
  })

  const loadUses = useMemoizedFn(async (share: ProjectShareRecord) => {
    if (!teamId || !projectId) return
    setLoading(true)
    try {
      const response = await service.listProjectShareUses(teamId, projectId, share.id, { page: 1, limit: 100 })
      setSelectedShare(share)
      setUses(unwrapItems<ProjectShareUseRecord>(response, ['uses']))
    } catch (error) {
      yakitFailed(`加载使用记录失败：${error}`)
    } finally {
      setLoading(false)
    }
  })

  const copyToken = useMemoizedFn(() => {
    if (!plainToken?.token) return
    setClipboardText(plainToken.token)
    success('密令已复制')
  })

  const previewToken = useMemoizedFn(async () => {
    const normalizedToken = token.trim()
    if (!normalizedToken) {
      yakitFailed('请输入项目密令')
      return
    }
    setLoading(true)
    setImportedProjectId(undefined)
    try {
      const response = await service.previewProjectShare(normalizedToken)
      setPreview(unwrapData<ProjectSharePreview>(response))
    } catch (error) {
      setPreview(undefined)
      yakitFailed(`项目密令预览失败：${error}`)
    } finally {
      setLoading(false)
    }
  })

  const importProject = useMemoizedFn(async () => {
    if (!preview || !token.trim()) return
    setLoading(true)
    try {
      const response = await service.importProjectShare({ token: token.trim(), name: preview.project_name })
      const imported = unwrapData<any>(response)
      const nextProjectId = Number(imported.project_id ?? imported.id ?? imported.project?.id)
      if (!Number.isFinite(nextProjectId) || nextProjectId <= 0) throw new Error('服务端未返回新项目标识')
      setImportedProjectId(nextProjectId)
      success(`团队项目已复制，新项目标识：${nextProjectId}`)
      onImported?.(nextProjectId)
    } catch (error) {
      yakitFailed(`导入团队项目失败：${error}`)
    } finally {
      setLoading(false)
    }
  })

  const shareColumns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '有效期',
      dataIndex: 'expires_at',
      key: 'expires_at',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '次数',
      key: 'uses',
      render: (_: unknown, record: ProjectShareRecord) => `${record.used_count || 0}/${record.max_uses || '不限'}`,
    },
    {
      title: '状态',
      key: 'enabled',
      render: (_: unknown, record: ProjectShareRecord) => (
        <Switch
          size="small"
          checked={record.enabled && !record.revoked_at}
          disabled={!!record.revoked_at}
          onChange={(checked) => updateShareState(record, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: ProjectShareRecord) => (
        <div className={styles.actions}>
          {plainToken?.shareId === record.id && plainToken.token ? (
            <RuiYanButton variant="secondary" onClick={copyToken}>
              复制
            </RuiYanButton>
          ) : null}
          <RuiYanButton variant="secondary" onClick={() => loadUses(record)}>
            使用记录
          </RuiYanButton>
          <RuiYanButton variant="danger" disabled={!!record.revoked_at} onClick={() => revokeShare(record)}>
            撤销
          </RuiYanButton>
        </div>
      ),
    },
  ]

  const shareContent = (
    <div className={styles.content}>
      <div className={styles.selectorRow}>
        <Form.Item label="团队">
          <Select
            value={teamId}
            options={teams.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => {
              setTeamId(value)
              loadProjects(value)
            }}
          />
        </Form.Item>
        <Form.Item label="团队项目">
          <Select
            value={projectId}
            options={projects.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => {
              setProjectId(value)
              if (teamId) loadShares(teamId, value)
            }}
          />
        </Form.Item>
      </div>

      <div className={styles.createPanel}>
        <Form layout="vertical">
          <div className={styles.formRow}>
            <Form.Item label="密令名称" required>
              <YakitInput value={shareName} onChange={(event) => setShareName(event.target.value)} />
            </Form.Item>
            <Form.Item label="有效天数" required>
              <InputNumber min={1} max={365} value={expiresInDays} onChange={(value) => setExpiresInDays(value || 1)} />
            </Form.Item>
            <Form.Item label="可使用次数" required>
              <InputNumber min={1} max={10000} value={maxUses} onChange={(value) => setMaxUses(value || 1)} />
            </Form.Item>
            <Form.Item label="创建后启用">
              <Switch checked={enabled} onChange={setEnabled} />
            </Form.Item>
          </div>
          <RuiYanButton variant="primary" loading={loading} onClick={createShare}>
            创建密令
          </RuiYanButton>
        </Form>
      </div>

      {plainToken?.token ? (
        <div className={styles.tokenPanel}>
          <strong>密令明文仅展示一次</strong>
          <code>{plainToken.token}</code>
          <RuiYanButton variant="secondary" onClick={copyToken}>
            复制密令
          </RuiYanButton>
        </div>
      ) : null}

      <Table<ProjectShareRecord>
        rowKey="id"
        size="small"
        loading={loading}
        columns={shareColumns}
        dataSource={shares}
        pagination={false}
        locale={{ emptyText: '当前项目暂无密令' }}
      />

      {selectedShare ? (
        <div className={styles.usesPanel}>
          <div className={styles.sectionTitle}>{selectedShare.name}·使用记录</div>
          {uses.length ? (
            uses.map((item) => (
              <div className={styles.useItem} key={item.id}>
                <span>{item.imported_by_name || '未知用户'}</span>
                <span>{formatDateTime(item.created_at)}</span>
                <span>{item.result || '-'}</span>
                <span>{item.imported_project_id ? `新项目 ${item.imported_project_id}` : '-'}</span>
              </div>
            ))
          ) : (
            <div className={styles.emptyText}>暂无使用记录</div>
          )}
        </div>
      ) : null}
    </div>
  )

  const importContent = (
    <div className={styles.content}>
      <Form layout="vertical">
        <Form.Item label="项目密令" required>
          <YakitInput.Password
            value={token}
            autoComplete="off"
            onChange={(event) => {
              setToken(event.target.value)
              setPreview(undefined)
              setImportedProjectId(undefined)
            }}
          />
        </Form.Item>
        <RuiYanButton variant="secondary" loading={loading} onClick={previewToken}>
          预览项目
        </RuiYanButton>
      </Form>

      {preview ? (
        <div className={styles.previewPanel}>
          {getProjectSharePreviewItems(preview).map(([label, value]) => (
            <div className={styles.previewItem} key={label}>
              <span>{label}</span>
              <strong>{label.includes('时间') || label.includes('有效期') ? formatDateTime(value) : value}</strong>
            </div>
          ))}
          <RuiYanButton variant="primary" loading={loading} disabled={!!importedProjectId} onClick={importProject}>
            确认导入为新项目
          </RuiYanButton>
        </div>
      ) : null}

      {importedProjectId ? <div className={styles.successPanel}>新项目标识：{importedProjectId}</div> : null}
    </div>
  )

  return (
    <RuiYanModal
      open={open}
      width={mode === 'share' ? 960 : 720}
      title={mode === 'share' ? '分享当前团队项目' : '通过密令导入'}
      description={
        mode === 'share'
          ? '请从服务端团队项目列表中选择项目，本地项目标识不参与分享。'
          : '预览确认后，服务端将创建独立项目。'
      }
      closeOnBackdrop={false}
      onClose={close}
      footer={
        <RuiYanButton variant="secondary" onClick={close}>
          关闭
        </RuiYanButton>
      }
    >
      {mode === 'share' ? shareContent : importContent}
    </RuiYanModal>
  )
}
