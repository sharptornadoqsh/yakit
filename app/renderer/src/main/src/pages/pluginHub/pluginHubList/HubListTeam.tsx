import React, { memo, useEffect, useMemo, useState } from 'react'
import { Select, Table, Tag, Upload } from 'antd'
import { useMemoizedFn } from 'ahooks'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import { YakitInput } from '@/components/yakitUI/YakitInput/YakitInput'
import { success, yakitFailed } from '@/utils/notification'
import * as teamCollaboration from '@/services/teamCollaboration'
import {
  buildTeamPluginQuery,
  summarizeTeamPluginImportResults,
  type TeamPluginImportResult,
  type TeamPluginQueryState,
  type TeamPluginVisibility,
} from './teamPluginData'
import styles from './HubListTeam.module.scss'

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

  const downloadPlugin = useMemoizedFn(async (plugin: TeamPluginRecord) => {
    if (!teamId) return
    setLoading(true)
    try {
      const response = (await service.downloadTeamPlugin(teamId, plugin.id)) as Blob
      const text = await response.text()
      let downloaded: any = { content: text }
      try {
        downloaded = JSON.parse(text)
      } catch {}
      onInstall?.(
        JSON.stringify({
          ScriptName: downloaded.script_name ?? plugin.script_name,
          Type: downloaded.type ?? plugin.type ?? 'yak',
          Content: downloaded.content ?? '',
          UUID: downloaded.uuid ?? '',
        }),
      )
      success(`插件“${plugin.script_name}”已下载，本地列表将更新`)
    } catch (error) {
      notifyOperationError('下载团队插件', error)
    } finally {
      setLoading(false)
    }
  })

  const updateVisibility = useMemoizedFn(async (plugin: TeamPluginRecord, visibility: TeamPluginVisibility) => {
    if (!teamId || plugin.visibility === visibility) return
    setLoading(true)
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
      const response = await service.importTeamPlugins(teamId, { plugins: items })
      const results = unwrapItems<TeamPluginImportResult>(response, ['results'])
      setImportResults(results)
      await loadPlugins()
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
        <Upload accept=".json,application/json" showUploadList={false} beforeUpload={importFile}>
          <YakitButton type="primary">批量导入</YakitButton>
        </Upload>
        <YakitButton type="outline1" onClick={() => loadPlugins()}>
          刷新
        </YakitButton>
      </div>

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
        pagination={{
          current: query.page,
          pageSize: query.limit,
          total,
          showSizeChanger: true,
          onChange: (page, limit) => updateQuery({ page, limit }),
        }}
        locale={{ emptyText: '当前团队暂无插件' }}
      />
    </div>
  )
})
