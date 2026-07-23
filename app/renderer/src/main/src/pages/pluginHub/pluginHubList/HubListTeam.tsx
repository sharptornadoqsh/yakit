import React, { memo, useEffect, useMemo, useState } from 'react'
import { Select, Table, Tag, Upload } from 'antd'
import { useMemoizedFn } from 'ahooks'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import { YakitInput } from '@/components/yakitUI/YakitInput/YakitInput'
import { YakitModal } from '@/components/yakitUI/YakitModal/YakitModal'
import { success, yakitFailed } from '@/utils/notification'
import * as teamCollaboration from '@/services/teamCollaboration'
import { apiFetchSaveYakScriptGroupLocal, apiQueryYakScriptBase } from '@/pages/plugins/utils'
import { getRemoteValue, setRemoteValue } from '@/utils/kv'
import { getRemoteHttpSettingGV } from '@/utils/envfile'
import {
  buildTeamPluginQuery,
  summarizeTeamPluginImportResults,
  type TeamPluginImportResult,
  type TeamPluginQueryState,
  type TeamPluginVisibility,
} from './teamPluginData'
import {
  installTeamPluginDownload,
  type LocalPluginRecord,
  type TeamPluginDownloadContent,
  type TeamPluginInstallRecord,
  type TeamPluginLocalConflictResolution,
  type TeamPluginLocalMapping,
} from './teamPluginInstall'
import {
  buildTeamPluginUploadEntries,
  type LocalPluginUploadSource,
  type TeamPluginUploadOptions,
} from './teamPluginUpload'
import styles from './HubListTeam.module.scss'

const { ipcRenderer } = window.require('electron')

interface TeamPluginRecord {
  id: number
  script_name: string
  type?: string
  description?: string
  category_id?: number
  category_name?: string
  group_ids?: number[]
  group_names?: string[]
  visibility: TeamPluginVisibility
  revision: number
  uuid?: string
  file_hash?: string
  tags?: string[]
  updated_at?: string
}

interface HubListTeamProps {
  onInstall?: (content: string) => void
}

const service = teamCollaboration as any

const unwrapData = <T,>(response: any): T => (response?.data?.data ?? response?.data ?? response) as T

const unwrapItems = <T,>(response: any, keys: string[] = []): T[] => {
  const data = unwrapData<any>(response)
  if (Array.isArray(data)) return data
  for (const key of [...keys, 'items', 'list', 'data']) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

const getTotal = (response: any, fallback: number) => {
  const data = unwrapData<any>(response)
  return Number(data?.total ?? data?.pagination?.total ?? data?.pagemeta?.total ?? fallback)
}

const readError = (error: any) => ({
  status: Number(error?.status ?? error?.response?.status),
  code: error?.code ?? error?.response?.data?.code ?? error?.response?.data?.error?.code,
  message: error?.message ?? error?.response?.data?.message ?? String(error),
})

const notifyOperationError = (action: string, error: unknown) => {
  const detail = readError(error)
  if (detail.status === 403 || detail.code === 'permission_denied' || detail.code === 'forbidden') {
    yakitFailed(`${action}失败：当前团队角色无权执行此操作`)
    return
  }
  if (detail.status === 409 || detail.code === 'version_conflict' || detail.code === 'revision_conflict') {
    yakitFailed(`${action}失败：插件修订已变更，请刷新后重试`)
    return
  }
  yakitFailed(`${action}失败：${detail.message}`)
}

const getOnlineBaseUrl = async () => {
  const setting = await getRemoteValue(getRemoteHttpSettingGV())
  if (!setting) return ''
  try {
    return String(JSON.parse(setting)?.BaseUrl || '')
  } catch {
    return ''
  }
}

const saveTeamPluginMapping = async (mapping: TeamPluginLocalMapping): Promise<void> => {
  const serverKey = encodeURIComponent(mapping.onlineBaseUrl || 'current')
  const key = `team-plugin-mapping:${serverKey}:${mapping.teamId || 0}:${mapping.teamPluginId}`
  await setRemoteValue(key, JSON.stringify(mapping))
}

export const HubListTeam: React.FC<HubListTeamProps> = memo(({ onInstall }) => {
  const [loading, setLoading] = useState(false)
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([])
  const [teamId, setTeamId] = useState<number>()
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([])
  const [groups, setGroups] = useState<Array<{ id: number; name: string }>>([])
  const [plugins, setPlugins] = useState<TeamPluginRecord[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState<TeamPluginQueryState>({ keyword: '', page: 1, limit: 20 })
  const [importResults, setImportResults] = useState<TeamPluginImportResult[]>([])
  const [uploadVisible, setUploadVisible] = useState(false)
  const [localPlugins, setLocalPlugins] = useState<LocalPluginUploadSource[]>([])
  const [selectedLocalPluginIds, setSelectedLocalPluginIds] = useState<number[]>([])
  const [uploadVisibility, setUploadVisibility] = useState<TeamPluginVisibility>('team')
  const [uploadCategoryId, setUploadCategoryId] = useState<number>()
  const [uploadGroupIds, setUploadGroupIds] = useState<number[]>([])
  const [uploadOverwrite, setUploadOverwrite] = useState(false)
  const [selectedPluginIds, setSelectedPluginIds] = useState<number[]>([])
  const [operationMessage, setOperationMessage] = useState('')
  const [installConflict, setInstallConflict] = useState<{
    plugin: TeamPluginInstallRecord
    existing: LocalPluginRecord
    resolve: (resolution: TeamPluginLocalConflictResolution) => void
  }>()
  const [conflictCopyName, setConflictCopyName] = useState('')

  const importSummary = useMemo(() => summarizeTeamPluginImportResults(importResults), [importResults])

  const loadPlugins = useMemoizedFn(async (nextTeamId = teamId, nextQuery = query) => {
    if (!nextTeamId) {
      setPlugins([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const response = await service.listTeamPlugins(nextTeamId, buildTeamPluginQuery(nextQuery))
      const nextPlugins = unwrapItems<any>(response, ['plugins']).map((item) => ({
        ...item,
        id: Number(item.id ?? item.ID),
        script_name: item.script_name ?? item.name ?? item.ScriptName ?? `#${item.id ?? item.ID}`,
        visibility: item.visibility ?? (item.is_private ? 'private' : 'team'),
        revision: Number(item.revision ?? 1),
        uuid: item.uuid ?? item.UUID,
        file_hash: item.file_hash ?? item.fileHash,
        tags: Array.isArray(item.tags)
          ? item.tags
          : String(item.tags || '')
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
        group_names: item.group_names ?? item.groups?.map((group) => group.name) ?? [],
      }))
      setPlugins(nextPlugins)
      setTotal(getTotal(response, nextPlugins.length))
    } catch (error) {
      notifyOperationError('加载团队插件', error)
    } finally {
      setLoading(false)
    }
  })

  const loadFilters = useMemoizedFn(async (nextTeamId: number) => {
    try {
      const [categoryResponse, groupResponse] = await Promise.all([
        service.listPluginCategories(nextTeamId, { page: 1, limit: 200 }),
        service.listPluginGroups(nextTeamId, { page: 1, limit: 200 }),
      ])
      setCategories(
        unwrapItems<any>(categoryResponse, ['categories']).map((item) => ({
          id: Number(item.id ?? item.ID),
          name: item.name ?? item.category_name ?? `#${item.id ?? item.ID}`,
        })),
      )
      setGroups(
        unwrapItems<any>(groupResponse, ['groups']).map((item) => ({
          id: Number(item.id ?? item.ID),
          name: item.name ?? item.group_name ?? `#${item.id ?? item.ID}`,
        })),
      )
    } catch (error) {
      notifyOperationError('加载插件分类与分组', error)
    }
  })

  const selectTeam = useMemoizedFn(async (nextTeamId: number) => {
    const nextQuery = { ...query, page: 1 }
    setTeamId(nextTeamId)
    setQuery(nextQuery)
    setImportResults([])
    setSelectedPluginIds([])
    setOperationMessage('')
    await Promise.all([loadFilters(nextTeamId), loadPlugins(nextTeamId, nextQuery)])
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
      if (nextTeams[0]?.id) await selectTeam(nextTeams[0].id)
    } catch (error) {
      notifyOperationError('加载团队', error)
    } finally {
      setLoading(false)
    }
  })

  useEffect(() => {
    loadTeams()
  }, [])

  const updateQuery = useMemoizedFn((patch: Partial<TeamPluginQueryState>) => {
    const nextQuery = { ...query, ...patch, page: patch.page ?? 1 }
    setQuery(nextQuery)
    loadPlugins(teamId, nextQuery)
  })

  const resolveInstallConflict = useMemoizedFn(
    (input: { plugin: TeamPluginInstallRecord; existing: LocalPluginRecord }) =>
      new Promise<TeamPluginLocalConflictResolution>((resolve) => {
        setConflictCopyName(`${input.plugin.scriptName}-副本`)
        setInstallConflict({ ...input, resolve })
      }),
  )

  const finishInstallConflict = useMemoizedFn((resolution: TeamPluginLocalConflictResolution) => {
    installConflict?.resolve(resolution)
    setInstallConflict(undefined)
  })

  const findLocalPlugin = useMemoizedFn(async (scriptName: string): Promise<LocalPluginRecord | undefined> => {
    const response = await ipcRenderer.invoke('QueryYakScript', {
      IncludedScriptNames: [scriptName],
      Pagination: { Page: 1, Limit: 10, OrderBy: 'updated_at', Order: 'desc' },
    })
    return (response?.Data || []).find((plugin: LocalPluginRecord) => plugin.ScriptName === scriptName)
  })

  const notifyInstalledPlugin = useMemoizedFn((mapping: TeamPluginLocalMapping) => {
    onInstall?.(
      JSON.stringify({
        name: mapping.localScriptName,
        ...(mapping.localPluginUUID ? { uuid: mapping.localPluginUUID } : {}),
      }),
    )
  })

  const installPlugin = useMemoizedFn(async (plugin: TeamPluginRecord) => {
    if (!teamId) throw new Error('请选择团队')
    const onlineBaseUrl = await getOnlineBaseUrl()
    const categoryName = plugin.category_name || categories.find((item) => item.id === plugin.category_id)?.name
    const groupNames =
      plugin.group_names || plugin.group_ids?.map((id) => groups.find((item) => item.id === id)?.name || `#${id}`) || []
    const result = await installTeamPluginDownload(
      {
        id: plugin.id,
        teamId,
        scriptName: plugin.script_name,
        type: plugin.type,
        uuid: plugin.uuid,
        description: plugin.description,
        fileHash: plugin.file_hash,
        revision: plugin.revision,
        visibility: plugin.visibility,
        categoryId: plugin.category_id,
        categoryName,
        groupIds: plugin.group_ids,
        groupNames,
        tags: plugin.tags,
      },
      {
        onlineBaseUrl,
        findLocalPlugin,
        resolveLocalConflict: resolveInstallConflict,
        download: () => service.downloadTeamPlugin(teamId, plugin.id) as Promise<TeamPluginDownloadContent>,
        savePlugin: (input) => ipcRenderer.invoke('SaveYakScript', input),
        saveGroups: async (scriptName, saveGroups) => {
          await apiFetchSaveYakScriptGroupLocal({
            Filter: {
              IncludedScriptNames: [scriptName],
              Pagination: { Page: 1, Limit: 1, OrderBy: 'updated_at', Order: 'desc' },
            },
            SaveGroup: saveGroups,
            RemoveGroup: [],
          })
        },
        saveMapping: saveTeamPluginMapping,
      },
    )
    return result
  })

  const downloadPlugin = useMemoizedFn(async (plugin: TeamPluginRecord) => {
    setLoading(true)
    setOperationMessage(`正在下载并校验：${plugin.script_name}`)
    try {
      const result = await installPlugin(plugin)
      if ('skipped' in result) {
        setOperationMessage(`已跳过本地同名插件：${plugin.script_name}`)
        success(`已跳过本地同名插件“${plugin.script_name}”`)
      } else {
        setOperationMessage(`摘要校验通过并已安装：${plugin.script_name}`)
        notifyInstalledPlugin(result.mapping)
        success(`插件“${plugin.script_name}”已安装到本地`)
      }
    } catch (error) {
      setOperationMessage(`安装失败：${plugin.script_name}：${readError(error).message}`)
      notifyOperationError('下载团队插件', error)
    } finally {
      setLoading(false)
    }
  })

  const downloadSelectedPlugins = useMemoizedFn(async () => {
    const selected = plugins.filter((plugin) => selectedPluginIds.includes(plugin.id))
    if (!selected.length) {
      yakitFailed('请选择团队插件')
      return
    }
    setLoading(true)
    let installed = 0
    let skipped = 0
    let failed = 0
    let lastInstalledMapping: TeamPluginLocalMapping | undefined
    const failures: string[] = []
    for (let index = 0; index < selected.length; index += 1) {
      const plugin = selected[index]
      setOperationMessage(`批量安装 ${index + 1}/${selected.length}：${plugin.script_name}`)
      try {
        const result = await installPlugin(plugin)
        if ('skipped' in result) skipped += 1
        else {
          installed += 1
          lastInstalledMapping = result.mapping
        }
      } catch (error) {
        failed += 1
        failures.push(`${plugin.script_name}：${readError(error).message}`)
      }
    }
    setLoading(false)
    setSelectedPluginIds([])
    if (lastInstalledMapping) notifyInstalledPlugin(lastInstalledMapping)
    const summary = `批量安装完成：成功 ${installed}，跳过 ${skipped}，失败 ${failed}`
    setOperationMessage(failures.length ? `${summary}；${failures.slice(0, 3).join('；')}` : summary)
    if (failed) yakitFailed(`${summary}；${failures.slice(0, 3).join('；')}`)
    else success(summary)
  })

  const updateVisibility = useMemoizedFn(async (plugin: TeamPluginRecord, visibility: TeamPluginVisibility) => {
    if (!teamId || plugin.visibility === visibility) return
    setLoading(true)
    setOperationMessage('正在读取本地插件')
    try {
      await service.setPluginVisibility(teamId, plugin.id, visibility, plugin.revision)
      await loadPlugins()
      success(`插件可见范围已设为${visibility === 'team' ? '团队' : '私有'}`)
    } catch (error) {
      notifyOperationError('更新插件可见范围', error)
    } finally {
      setLoading(false)
    }
  })

  const openLocalUpload = useMemoizedFn(async () => {
    if (!teamId) {
      yakitFailed('请选择团队')
      return
    }
    setLoading(true)
    try {
      const response = await apiQueryYakScriptBase({
        Pagination: { Page: 1, Limit: 1000, OrderBy: 'updated_at', Order: 'desc' },
        IsHistory: false,
      })
      const candidates = (response.Data || []).filter((plugin) => !plugin.IsHistory)
      if (!candidates.length) throw new Error('本地插件库为空')
      setLocalPlugins(candidates)
      setSelectedLocalPluginIds([])
      setUploadVisibility('team')
      setUploadCategoryId(undefined)
      setUploadGroupIds([])
      setUploadOverwrite(false)
      setUploadVisible(true)
      setOperationMessage(`已读取 ${candidates.length} 个本地插件`)
    } catch (error) {
      notifyOperationError('读取本地插件', error)
    } finally {
      setLoading(false)
    }
  })

  const uploadLocalPlugins = useMemoizedFn(async () => {
    if (!teamId) return
    const selected = localPlugins.filter((plugin) => selectedLocalPluginIds.includes(plugin.Id))
    const options: TeamPluginUploadOptions = {
      visibility: uploadVisibility,
      categoryId: uploadCategoryId,
      groupIds: uploadGroupIds,
      overwrite: uploadOverwrite,
    }
    setLoading(true)
    try {
      setOperationMessage(`正在计算 ${selected.length} 个本地插件的 SHA-256`)
      const entries = await buildTeamPluginUploadEntries(selected, options)
      setOperationMessage(`正在上传 ${entries.length} 个本地插件`)
      const response = await service.importTeamPlugins(teamId, { plugins: entries })
      const results = unwrapItems<TeamPluginImportResult>(response, ['results'])
      setImportResults(results)
      setUploadVisible(false)
      await loadPlugins()
      const summary = summarizeTeamPluginImportResults(results)
      setOperationMessage(`上传完成：成功 ${summary.succeeded}，跳过 ${summary.skipped}，失败 ${summary.failed}`)
      success(`已提交 ${entries.length} 个本地插件`)
    } catch (error) {
      notifyOperationError('上传本地插件', error)
    } finally {
      setLoading(false)
    }
  })

  const importFile = useMemoizedFn(async (file: File) => {
    if (!teamId) {
      yakitFailed('请选择团队')
      return false
    }
    setLoading(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const items = Array.isArray(parsed) ? parsed : parsed.plugins
      if (!Array.isArray(items) || !items.length) throw new Error('文件中没有插件数组')
      const plugins = items.map((item, index) => ({
        ...item,
        source_name: item.source_name || `${file.name}#${index + 1}`,
      }))
      setOperationMessage(`正在导入 ${plugins.length} 个插件条目`)
      const response = await service.importTeamPlugins(teamId, { plugins })
      const results = unwrapItems<TeamPluginImportResult>(response, ['results'])
      setImportResults(results)
      await loadPlugins()
      const summary = summarizeTeamPluginImportResults(results)
      setOperationMessage(`导入完成：成功 ${summary.succeeded}，跳过 ${summary.skipped}，失败 ${summary.failed}`)
    } catch (error) {
      notifyOperationError('批量导入团队插件', error)
    } finally {
      setLoading(false)
    }
    return false
  })

  const columns = [
    {
      title: '插件',
      key: 'plugin',
      render: (_: unknown, record: TeamPluginRecord) => (
        <div className={styles.pluginInfo}>
          <strong>{record.script_name}</strong>
          <span>{record.description || record.type || '-'}</span>
        </div>
      ),
    },
    {
      title: '分类',
      key: 'category_name',
      render: (_: unknown, record: TeamPluginRecord) =>
        record.category_name || categories.find((item) => item.id === record.category_id)?.name || '-',
    },
    {
      title: '分组',
      dataIndex: 'group_names',
      key: 'group_names',
      render: (_: unknown, record: TeamPluginRecord) => {
        const values =
          record.group_names ||
          record.group_ids?.map((id) => groups.find((item) => item.id === id)?.name || `#${id}`) ||
          []
        return values.length ? values.map((value) => <Tag key={value}>{value}</Tag>) : '-'
      },
    },
    {
      title: '可见范围',
      key: 'visibility',
      render: (_: unknown, record: TeamPluginRecord) => (
        <Select
          size="small"
          value={record.visibility}
          options={[
            { value: 'team', label: '团队' },
            { value: 'private', label: '私有' },
          ]}
          onChange={(value) => updateVisibility(record, value)}
        />
      ),
    },
    { title: '修订', dataIndex: 'revision', key: 'revision', width: 76 },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: TeamPluginRecord) => (
        <YakitButton type="outline1" onClick={() => downloadPlugin(record)}>
          下载到本地
        </YakitButton>
      ),
    },
  ]

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <Select
          value={teamId}
          className={styles.teamSelect}
          placeholder="选择团队"
          options={teams.map((item) => ({ value: item.id, label: item.name }))}
          onChange={selectTeam}
        />
        <YakitInput.Search
          value={query.keyword}
          placeholder="搜索插件名称或内容"
          onChange={(event) => setQuery((current) => ({ ...current, keyword: event.target.value }))}
          onSearch={() => updateQuery({ keyword: query.keyword })}
        />
        <Select
          allowClear
          value={query.categoryId}
          placeholder="全部分类"
          options={categories.map((item) => ({ value: item.id, label: item.name }))}
          onChange={(value) => updateQuery({ categoryId: value })}
        />
        <Select
          allowClear
          value={query.groupId}
          placeholder="全部分组"
          options={groups.map((item) => ({ value: item.id, label: item.name }))}
          onChange={(value) => updateQuery({ groupId: value })}
        />
        <Select
          allowClear
          value={query.visibility}
          placeholder="全部可见范围"
          options={[
            { value: 'team', label: '团队' },
            { value: 'private', label: '私有' },
          ]}
          onChange={(value) => updateQuery({ visibility: value })}
        />
        <YakitButton type="primary" onClick={openLocalUpload}>
          上传本地插件
        </YakitButton>
        <YakitButton type="outline1" disabled={!selectedPluginIds.length} onClick={downloadSelectedPlugins}>
          批量安装
        </YakitButton>
        <Upload accept=".json,application/json" showUploadList={false} beforeUpload={importFile}>
          <YakitButton type="outline1">导入插件清单</YakitButton>
        </Upload>
        <YakitButton type="outline1" onClick={() => loadPlugins()}>
          刷新
        </YakitButton>
      </div>

      {operationMessage ? (
        <div className={styles.operationStatus} role="status">
          {operationMessage}
        </div>
      ) : null}

      {importResults.length ? (
        <div className={styles.importResults}>
          <strong>
            导入结果：成功 {importSummary.succeeded}，失败 {importSummary.failed}，跳过 {importSummary.skipped}
          </strong>
          <div className={styles.resultList}>
            {importSummary.items.map((item, index) => (
              <span className={styles[`result-${item.status}`]} key={`${item.name}-${index}`}>
                {item.name}：{item.detail}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <Table<TeamPluginRecord>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={plugins}
        rowSelection={{
          selectedRowKeys: selectedPluginIds,
          onChange: (keys) => setSelectedPluginIds(keys.map((key) => Number(key))),
        }}
        pagination={{
          current: query.page,
          pageSize: query.limit,
          total,
          showSizeChanger: true,
          onChange: (page, limit) => updateQuery({ page, limit }),
        }}
        locale={{ emptyText: '当前团队暂无插件' }}
      />

      <YakitModal
        visible={uploadVisible}
        title="上传本地插件"
        width={640}
        okText="上传"
        cancelText="取消"
        confirmLoading={loading}
        onOk={uploadLocalPlugins}
        onCancel={() => setUploadVisible(false)}
      >
        <div className={styles.uploadForm}>
          <label>
            <span>本地插件</span>
            <Select
              mode="multiple"
              value={selectedLocalPluginIds}
              maxTagCount="responsive"
              placeholder="选择一个或多个本地插件"
              options={localPlugins.map((plugin) => ({ value: plugin.Id, label: plugin.ScriptName }))}
              onChange={setSelectedLocalPluginIds}
            />
          </label>
          <label>
            <span>可见范围</span>
            <Select
              value={uploadVisibility}
              options={[
                { value: 'team', label: '团队' },
                { value: 'private', label: '私有' },
              ]}
              onChange={setUploadVisibility}
            />
          </label>
          <label>
            <span>分类</span>
            <Select
              allowClear
              value={uploadCategoryId}
              placeholder="不设置分类"
              options={categories.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setUploadCategoryId}
            />
          </label>
          <label>
            <span>分组</span>
            <Select
              mode="multiple"
              value={uploadGroupIds}
              placeholder="不设置分组"
              options={groups.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setUploadGroupIds}
            />
          </label>
          <label>
            <span>同名处理</span>
            <Select
              value={uploadOverwrite ? 'overwrite' : 'skip'}
              options={[
                { value: 'skip', label: '跳过重复项' },
                { value: 'overwrite', label: '覆盖为新版本' },
              ]}
              onChange={(value) => setUploadOverwrite(value === 'overwrite')}
            />
          </label>
        </div>
      </YakitModal>

      <YakitModal
        visible={Boolean(installConflict)}
        title="本地同名插件"
        width={520}
        closable={false}
        keyboard={false}
        maskClosable={false}
        footer={[
          <YakitButton key="skip" type="outline1" onClick={() => finishInstallConflict({ action: 'skip' })}>
            跳过
          </YakitButton>,
          <YakitButton
            key="copy"
            type="outline1"
            disabled={!conflictCopyName.trim() || conflictCopyName.trim() === installConflict?.plugin.scriptName}
            onClick={() => finishInstallConflict({ action: 'copy', scriptName: conflictCopyName })}
          >
            保存副本
          </YakitButton>,
          <YakitButton key="overwrite" type="primary" onClick={() => finishInstallConflict({ action: 'overwrite' })}>
            覆盖
          </YakitButton>,
        ]}
      >
        <div className={styles.conflictForm}>
          <span>{installConflict?.plugin.scriptName}</span>
          <YakitInput value={conflictCopyName} onChange={(event) => setConflictCopyName(event.target.value)} />
        </div>
      </YakitModal>
    </div>
  )
})
