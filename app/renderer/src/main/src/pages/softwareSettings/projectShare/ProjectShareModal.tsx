import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Form, InputNumber, Select, Switch, Table } from 'antd'
import { useMemoizedFn } from 'ahooks'
import { RuiYanButton, RuiYanModal } from '@/components/renyanUI'
import { YakitInput } from '@/components/yakitUI/YakitInput/YakitInput'
import { setClipboardText } from '@/utils/clipboard'
import { success, yakitFailed } from '@/utils/notification'
import { isIRify } from '@/utils/envfile'
import * as teamCollaboration from '@/services/teamCollaboration'
import type {
  CollaborationProject,
  CollaborationTeam,
  ProjectShare,
  ProjectSharePreview,
} from '@/services/teamCollaboration'
import { importProjectShare, publishProjectShare, resumeProjectShareImport } from './projectShareRuntime'
import { createElectronProjectShareRuntimeDependencies } from './projectShareElectronRuntime'
import type { ProjectSharePluginMaterial } from './projectShareBundle'
import type { ProjectShareRecoveryRecord } from './projectShareRecovery'
import { getProjectSharePreviewItems } from './projectShareData'
import { listProjectSharePlugins, type ProjectSharePluginSelection } from './projectSharePublishContext'
import styles from './ProjectShareModal.module.scss'

export interface ProjectSharePublishContext {
  engine: {
    version: string
    commit: string
    exportFormat: string
  }
  plugins: readonly ProjectSharePluginMaterial[]
}

interface ProjectShareModalProps {
  open: boolean
  mode: 'share' | 'import'
  localProject?: {
    id: number
    name: string
  }
  onClose: () => void
  onImported?: (projectId: number) => void
  initialTarget?: { teamId: number; projectId: number }
  resolvePublishContext?: (
    localProjectId: number,
    selection: ProjectSharePluginSelection,
  ) => Promise<ProjectSharePublishContext>
}

const unwrapData = <T,>(response: { data?: T } | T): T => {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data: T }).data
  }
  return response as T
}

const formatDateTime = (value?: string | number | null) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

const errorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message
  return String(error || '未知错误')
}

const recoveryNeedsPassword = (record: ProjectShareRecoveryRecord) =>
  !('localProjectId' in record) &&
  ['prepared', 'downloading', 'downloaded', 'importing_project', 'retryable_failed_before_import'].includes(
    record.status,
  )

export const ProjectShareModal: React.FC<ProjectShareModalProps> = ({
  open,
  mode,
  localProject,
  onClose,
  onImported,
  resolvePublishContext,
  initialTarget,
}) => {
  const targetRef = useRef('')
  const runtime = useMemo(
    () =>
      createElectronProjectShareRuntimeDependencies({
        assertTarget: async () => {
          const target = await window.require('electron').ipcRenderer.invoke('GetProjectShareTarget')
          if (!targetRef.current || target.baseUrl !== targetRef.current)
            throw new Error('目标服务已变化，请重新打开分享窗口')
        },
      }),
    [],
  )
  const [loading, setLoading] = useState(false)
  const [teams, setTeams] = useState<CollaborationTeam[]>([])
  const [projects, setProjects] = useState<CollaborationProject[]>([])
  const [shares, setShares] = useState<ProjectShare[]>([])
  const [recoveries, setRecoveries] = useState<ProjectShareRecoveryRecord[]>([])
  const [teamId, setTeamId] = useState<number>()
  const [projectId, setProjectId] = useState<number>()
  const [shareName, setShareName] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [maxUses, setMaxUses] = useState(1)
  const [enabled, setEnabled] = useState(true)
  const [pluginOptions, setPluginOptions] = useState<{ id: number; name: string; type: string }[]>([])
  const [pluginIds, setPluginIds] = useState<number[]>([])
  const [pluginVersion, setPluginVersion] = useState(1)
  const [baseUrl, setBaseUrl] = useState('')
  const [publishedVersion, setPublishedVersion] = useState('')
  const session = useRef(0)
  const projectRequest = useRef(0)
  const shareRequest = useRef(0)
  const [plainToken, setPlainToken] = useState('')
  const [token, setToken] = useState('')
  const [preview, setPreview] = useState<ProjectSharePreview>()
  const [localProjectName, setLocalProjectName] = useState('')
  const [archivePassword, setArchivePassword] = useState('')
  const [importedProject, setImportedProject] = useState<{
    localProjectId: number
    localProjectName: string
    onlineProjectId: number
  }>()

  const selectedOnlineProject = useMemo(
    () => projects.find((project) => project.id === projectId),
    [projectId, projects],
  )

  const resetSensitiveState = useMemoizedFn(() => {
    setPlainToken('')
    setToken('')
    setPreview(undefined)
    setArchivePassword('')
    setImportedProject(undefined)
  })

  const loadShares = useMemoizedFn(async (nextTeamId: number, nextProjectId: number) => {
    const current = session.current
    const request = ++shareRequest.current
    const response = await teamCollaboration.listProjectShares(nextTeamId, nextProjectId, {
      page: 1,
      limit: 100,
    })
    if (current === session.current && request === shareRequest.current) setShares(unwrapData(response))
  })

  const loadProjects = useMemoizedFn(async (nextTeamId: number) => {
    const current = session.current
    const request = ++projectRequest.current
    shareRequest.current += 1
    setProjects([])
    setProjectId(undefined)
    setShares([])
    const response = await teamCollaboration.listTeamProjects(nextTeamId, {
      page: 1,
      limit: 100,
    })
    const nextProjects = unwrapData(response)
    if (current !== session.current || request !== projectRequest.current) return
    setProjects(nextProjects)
    const requestedProject = initialTarget?.teamId === nextTeamId ? initialTarget.projectId : undefined
    if (requestedProject && !nextProjects.some((project) => project.id === requestedProject)) {
      throw new Error('预选远端项目已不可用，请重新确认发布目标')
    }
    const nextProjectId = requestedProject || nextProjects[0]?.id
    setProjectId(nextProjectId)
    setShares([])
    if (nextProjectId) await loadShares(nextTeamId, nextProjectId)
  })

  const loadShareMode = useMemoizedFn(async () => {
    const current = session.current
    setLoading(true)
    try {
      const [target, plugins] = await Promise.all([
        window.require('electron').ipcRenderer.invoke('GetProjectShareTarget'),
        listProjectSharePlugins(),
      ])
      if (session.current !== current) return
      if (!target?.baseUrl) throw new Error('目标服务尚未配置')
      setBaseUrl(target.baseUrl)
      targetRef.current = target.baseUrl
      setPluginOptions(plugins)
      const response = await teamCollaboration.listTeams({ page: 1, limit: 100 })
      if (session.current !== current) return
      const nextTeams = unwrapData(response)
      setTeams(nextTeams)
      if (initialTarget && !nextTeams.some((team) => team.id === initialTarget.teamId)) {
        throw new Error('预选团队已不可用，请重新确认发布目标')
      }
      const nextTeamId = initialTarget?.teamId || nextTeams[0]?.id
      setTeamId(nextTeamId)
      if (nextTeamId) await loadProjects(nextTeamId)
    } catch (error) {
      if (session.current === current) yakitFailed(`加载团队项目失败：${errorMessage(error)}`)
    } finally {
      if (session.current === current) setLoading(false)
    }
  })

  const loadRecoveries = useMemoizedFn(async () => {
    const current = session.current
    try {
      const target = await window.require('electron').ipcRenderer.invoke('GetProjectShareTarget')
      const records = await runtime.listRecoveries()
      if (session.current !== current) return
      if (targetRef.current && targetRef.current !== target.baseUrl)
        throw new Error('恢复目标服务已变化，请重新打开窗口并核对恢复记录')
      targetRef.current = target.baseUrl
      setBaseUrl(target.baseUrl)
      setRecoveries(records)
    } catch (error) {
      if (session.current === current) yakitFailed(`加载未完成恢复记录失败：${errorMessage(error)}`)
    }
  })

  useEffect(() => {
    session.current += 1
    if (!open) {
      resetSensitiveState()
      setLoading(false)
      setTeams([])
      setProjects([])
      setShares([])
      setTeamId(undefined)
      setProjectId(undefined)
      setPluginOptions([])
      setPluginIds([])
      setPublishedVersion('')
      setBaseUrl('')
      targetRef.current = ''
      return
    }
    if (mode === 'share') void loadShareMode()
    else void loadRecoveries()
    return () => {
      session.current += 1
    }
  }, [open, mode, loadRecoveries, loadShareMode, resetSensitiveState])

  const close = useMemoizedFn(() => {
    resetSensitiveState()
    onClose()
  })

  const createShare = useMemoizedFn(async () => {
    if (loading) return
    if (!resolvePublishContext) {
      yakitFailed('当前入口未接入引擎插件引用能力；普通项目归档请使用“发布到团队项目”')
      return
    }
    if (!teamId || !selectedOnlineProject || !localProject) {
      yakitFailed('请选择团队项目，并确认当前本地项目有效')
      return
    }
    if (!shareName.trim()) {
      yakitFailed('请填写密令名称')
      return
    }
    if (!pluginIds.length) {
      yakitFailed('请选择需要携带的插件；只含数据库的项目请使用普通归档发布')
      return
    }
    const current = session.current
    setLoading(true)
    try {
      const assertTarget = async () => {
        const target = await window.require('electron').ipcRenderer.invoke('GetProjectShareTarget')
        if (!baseUrl || target.baseUrl !== baseUrl || session.current !== current) {
          throw new Error('发布目标或弹窗会话已变化，请重新确认；未记录发布成功')
        }
      }
      await assertTarget()
      const publishContext = await resolvePublishContext(localProject.id, { pluginIds, pluginVersion })
      await assertTarget()
      if (publishContext.plugins.length !== pluginIds.length) throw new Error('所选插件材料不完整，请重新选择')
      const created = await publishProjectShare(
        {
          teamId,
          onlineProjectId: selectedOnlineProject.id,
          localProject,
          password: '',
          engine: publishContext.engine,
          plugins: publishContext.plugins,
          name: shareName.trim(),
          expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
          maxUses,
          enabled,
        },
        runtime,
      )
      await assertTarget()
      setPlainToken(created.token)
      setPublishedVersion(
        `快照 #${created.share.snapshot_id ?? '未返回'} / 密令版本 ${created.share.version} / 插件快照版本 ${pluginVersion} / 引擎 ${publishContext.engine.version}`,
      )
      setShareName('')
      await loadShares(teamId, selectedOnlineProject.id).catch((error) => {
        if (session.current === current) yakitFailed(`环境已发布，但刷新密令列表失败：${errorMessage(error)}`)
      })
      if (session.current === current) success('完整项目环境已发布，密令明文关闭后将清除')
    } catch (error) {
      if (session.current === current) yakitFailed(`发布项目密令失败：${errorMessage(error)}`)
    } finally {
      if (session.current === current) setLoading(false)
    }
  })

  const updateShareState = useMemoizedFn(async (share: ProjectShare, nextEnabled: boolean) => {
    if (!teamId || !projectId) return
    setLoading(true)
    try {
      await teamCollaboration.updateProjectShare(teamId, projectId, share.id, {
        enabled: nextEnabled,
        version: share.version,
      })
      await loadShares(teamId, projectId)
    } catch (error) {
      yakitFailed(`更新密令状态失败：${errorMessage(error)}`)
    } finally {
      setLoading(false)
    }
  })

  const revokeShare = useMemoizedFn(async (share: ProjectShare) => {
    if (!teamId || !projectId) return
    setLoading(true)
    try {
      await teamCollaboration.revokeProjectShare(teamId, projectId, share.id, share.version)
      setPlainToken('')
      await loadShares(teamId, projectId)
      success('项目密令已撤销')
    } catch (error) {
      yakitFailed(`撤销项目密令失败：${errorMessage(error)}`)
    } finally {
      setLoading(false)
    }
  })

  const copyToken = useMemoizedFn(() => {
    if (!plainToken) return
    setClipboardText(plainToken)
    success('密令已复制')
  })

  const previewToken = useMemoizedFn(async () => {
    const normalizedToken = token.trim()
    if (!normalizedToken) {
      yakitFailed('请输入项目密令')
      return
    }
    setLoading(true)
    setImportedProject(undefined)
    try {
      const response = await teamCollaboration.previewProjectShare(normalizedToken)
      const nextPreview = unwrapData(response)
      setPreview(nextPreview)
      setLocalProjectName(`${nextPreview.project_name}-本地副本`)
    } catch (error) {
      setPreview(undefined)
      yakitFailed(`项目密令预览失败：${errorMessage(error)}`)
    } finally {
      setLoading(false)
    }
  })

  const importTokenProject = useMemoizedFn(async () => {
    if (!preview || !token.trim() || !localProjectName.trim()) return
    setLoading(true)
    try {
      const suffix = globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12)
      const imported = await importProjectShare(
        {
          token: token.trim(),
          projectKey: `import-${preview.snapshot_id}-${suffix}`,
          name: preview.project_name,
          localProjectName: localProjectName.trim(),
          password: archivePassword,
          folderId: 0,
          childFolderId: 0,
          projectType: isIRify() ? 'ssa_project' : 'project',
        },
        runtime,
      )
      setImportedProject(imported)
      setRecoveries([])
      success(`完整项目环境已导入：${imported.localProjectName}`)
      onImported?.(imported.onlineProjectId)
    } catch (error) {
      await loadRecoveries()
      yakitFailed(`导入完整项目环境失败：${errorMessage(error)}`)
    } finally {
      setLoading(false)
    }
  })

  const resumeRecovery = useMemoizedFn(async (record: ProjectShareRecoveryRecord) => {
    setLoading(true)
    try {
      const imported = await resumeProjectShareImport(
        record.receiptId,
        recoveryNeedsPassword(record) ? { password: archivePassword } : {},
        runtime,
      )
      setImportedProject(imported)
      await loadRecoveries()
      success(`项目恢复已完成：${imported.localProjectName}`)
      onImported?.(imported.onlineProjectId)
    } catch (error) {
      await loadRecoveries()
      yakitFailed(`继续项目恢复失败：${errorMessage(error)}`)
    } finally {
      setLoading(false)
    }
  })

  const shareColumns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '快照',
      key: 'snapshot',
      render: (_: unknown, record: ProjectShare) =>
        record.binding_version === 2 && record.snapshot
          ? `${record.snapshot.data_count} 数据 / ${record.snapshot.result_count} 结果 / ${record.snapshot.plugin_count} 插件`
          : '旧密令（需重建）',
    },
    {
      title: '有效期',
      dataIndex: 'expires_at',
      key: 'expires_at',
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: '次数',
      key: 'uses',
      render: (_: unknown, record: ProjectShare) => `${record.used_count}/${record.max_uses}`,
    },
    {
      title: '状态',
      key: 'enabled',
      render: (_: unknown, record: ProjectShare) => (
        <Switch
          size="small"
          checked={record.enabled && !record.revoked_at && !record.invalidated_at}
          disabled={Boolean(record.revoked_at || record.invalidated_at)}
          onChange={(checked) => updateShareState(record, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: ProjectShare) => (
        <RuiYanButton variant="danger" disabled={Boolean(record.revoked_at)} onClick={() => revokeShare(record)}>
          撤销
        </RuiYanButton>
      ),
    },
  ]

  const shareContent = (
    <div className={styles.content}>
      <p>
        目标服务：{baseUrl || '正在读取'}；本地项目：{localProject?.name}（本地 ID {localProject?.id}）； 团队 ID{' '}
        {teamId}；远端项目：{selectedOnlineProject?.name}（远端 ID {projectId}）。
      </p>
      <p>
        完整环境包含项目数据库与下方明确选定的插件源码和参数；不自动推断所有历史依赖，不进行双向合并。
        历史数据同步、自动归档上传及普通团队归档均不替代此步骤。
      </p>
      {publishedVersion && <p role="status">已发布版本：{publishedVersion}</p>}
      <div className={styles.selectorRow}>
        <Form.Item label="当前本地项目">
          <YakitInput value={localProject?.name || '当前没有可分享的本地项目'} disabled />
        </Form.Item>
        <Form.Item label="团队">
          <Select
            data-testid="project-share-team-selector"
            value={teamId}
            disabled={loading}
            options={teams.map((team) => ({ value: team.id, label: team.name }))}
            onChange={(value) => {
              setTeamId(value)
              void loadProjects(value)
            }}
          />
        </Form.Item>
        <Form.Item label="目标团队项目">
          <Select
            data-testid="project-share-project-selector"
            value={projectId}
            disabled={loading}
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            onChange={(value) => {
              setProjectId(value)
              if (teamId) void loadShares(teamId, value)
            }}
          />
        </Form.Item>
      </div>

      <div className={styles.createPanel} data-testid="project-share-create">
        {!resolvePublishContext && (
          <p role="status">
            当前入口未接入引擎插件引用能力，完整环境密令暂不可发布。普通归档请从本地项目列表选择“发布到团队项目”；归档发布不包含完整插件环境。
          </p>
        )}
        <Form layout="vertical">
          <Form.Item label="携带的本地插件（按用户选择）" required>
            <Select
              mode="multiple"
              aria-label="携带的本地插件"
              value={pluginIds}
              disabled={loading}
              options={pluginOptions.map((plugin) => ({ value: plugin.id, label: `${plugin.name} (${plugin.type})` }))}
              optionFilterProp="label"
              onChange={setPluginIds}
            />
          </Form.Item>
          <Form.Item
            label="本次插件快照版本"
            help="包内快照版本由发布者指定，不冒充在线插件分发版本；正文另以 SHA-256 精确锁定。"
          >
            <InputNumber
              min={1}
              precision={0}
              value={pluginVersion}
              disabled={loading}
              onChange={(value) => setPluginVersion(value || 1)}
            />
          </Form.Item>
          <div className={styles.formRow}>
            <Form.Item label="密令名称" required>
              <YakitInput value={shareName} onChange={(event) => setShareName(event.target.value)} />
            </Form.Item>
            <Form.Item label="有效天数" required>
              <InputNumber min={1} max={365} value={expiresInDays} onChange={(value) => setExpiresInDays(value || 1)} />
            </Form.Item>
            <Form.Item label="可使用次数" required>
              <InputNumber min={1} max={10_000} value={maxUses} onChange={(value) => setMaxUses(value || 1)} />
            </Form.Item>
            <Form.Item label="创建后启用">
              <Switch checked={enabled} onChange={setEnabled} />
            </Form.Item>
          </div>
          <RuiYanButton
            variant="primary"
            loading={loading}
            disabled={
              !resolvePublishContext || !localProject || !selectedOnlineProject || !pluginIds.length || !baseUrl
            }
            onClick={createShare}
          >
            发布完整环境并创建密令
          </RuiYanButton>
        </Form>
      </div>

      {plainToken ? (
        <div className={styles.tokenPanel} data-testid="project-share-token">
          <strong>密令明文仅展示一次</strong>
          <code>{plainToken}</code>
          <RuiYanButton variant="secondary" onClick={copyToken}>
            复制密令
          </RuiYanButton>
        </div>
      ) : null}

      <Table<ProjectShare>
        rowKey="id"
        size="small"
        loading={loading}
        columns={shareColumns}
        dataSource={shares}
        pagination={false}
        locale={{ emptyText: '当前团队项目暂无密令' }}
      />
    </div>
  )

  const importContent = (
    <div className={styles.content} data-testid="project-share-import">
      <p>目标服务：{baseUrl || '正在读取'}；按固定快照恢复为独立本地项目，不覆盖当前项目。</p>
      <Form layout="vertical">
        <Form.Item label="项目密令" required>
          <YakitInput.Password
            value={token}
            autoComplete="off"
            onChange={(event) => {
              setToken(event.target.value)
              setPreview(undefined)
              setImportedProject(undefined)
            }}
          />
        </Form.Item>
        <RuiYanButton variant="secondary" loading={loading} onClick={previewToken}>
          预览不可变快照
        </RuiYanButton>
      </Form>

      {preview ? (
        <div className={styles.previewPanel}>
          {getProjectSharePreviewItems(preview).map(([label, value]) => (
            <div className={styles.previewItem} key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
          <Form.Item label="本地项目名称" required>
            <YakitInput value={localProjectName} onChange={(event) => setLocalProjectName(event.target.value)} />
          </Form.Item>
          <Form.Item label="归档密码">
            <YakitInput.Password
              value={archivePassword}
              autoComplete="off"
              onChange={(event) => setArchivePassword(event.target.value)}
            />
          </Form.Item>
          <RuiYanButton
            variant="primary"
            loading={loading}
            disabled={!localProjectName.trim()}
            onClick={importTokenProject}
          >
            导入完整项目环境
          </RuiYanButton>
        </div>
      ) : null}

      {recoveries.length ? (
        <div className={styles.usesPanel}>
          <div className={styles.sectionTitle}>未完成的项目恢复</div>
          {recoveries.map((record) => (
            <div className={styles.useItem} key={record.receiptId}>
              <span>{record.localProjectName}</span>
              <span>{record.status}</span>
              <span>{formatDateTime(record.updatedAt)}</span>
              <RuiYanButton variant="secondary" loading={loading} onClick={() => resumeRecovery(record)}>
                继续恢复
              </RuiYanButton>
            </div>
          ))}
        </div>
      ) : null}

      {importedProject ? (
        <div className={styles.successPanel} data-testid="project-import-ready">
          本地项目：{importedProject.localProjectName}（#{importedProject.localProjectId}）
        </div>
      ) : null}
    </div>
  )

  return (
    <RuiYanModal
      open={open}
      width={mode === 'share' ? 960 : 720}
      title={mode === 'share' ? '发布当前项目完整环境' : '通过密令导入完整项目环境'}
      description={
        mode === 'share'
          ? '项目由本地 yak.exe 导出；Online 只保存团队快照、分块归档和密令。'
          : '预览确认后下载固定快照，再由本地 yak.exe 导入项目并恢复精确插件。'
      }
      closeOnBackdrop={false}
      closable={!loading}
      onClose={close}
      footer={
        <RuiYanButton variant="secondary" disabled={loading} onClick={close}>
          关闭
        </RuiYanButton>
      }
    >
      {mode === 'share' ? shareContent : importContent}
    </RuiYanModal>
  )
}
