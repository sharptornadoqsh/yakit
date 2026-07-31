/// <reference types="vitest/globals" />

import React from 'react'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { resolve } from 'path'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useStore } from '@/store'
import {
  publishTeamAuthenticationInvalidation,
  publishTeamPermissionInvalidation,
} from '@/pages/teamCollaboration/teamPermissionContext'

const mocks = vi.hoisted(() => ({
  apiQueryYakScriptBase: vi.fn(),
  createPluginCategory: vi.fn(),
  createPluginGroup: vi.fn(),
  createTeamPlugin: vi.fn(),
  deletePluginCategory: vi.fn(),
  deletePluginGroup: vi.fn(),
  deleteTeamPlugin: vi.fn(),
  downloadTeamPlugin: vi.fn(),
  downloadTeamPluginVersion: vi.fn(),
  getMe: vi.fn(),
  getTeamPlugin: vi.fn(),
  importTeamPlugins: vi.fn(),
  ipcInvoke: vi.fn(),
  listPluginCategories: vi.fn(),
  listPluginGroups: vi.fn(),
  listTeamPluginVersions: vi.fn(),
  listTeamPlugins: vi.fn(),
  listTeams: vi.fn(),
  setPluginVisibility: vi.fn(),
  success: vi.fn(),
  updatePluginCategory: vi.fn(),
  updatePluginGroup: vi.fn(),
  updateTeamPlugin: vi.fn(),
  unbindPluginGroup: vi.fn(),
  yakitFailed: vi.fn(),
}))

const createPluginRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 5,
  script_name: 'Plugin A',
  type: 'yak',
  content: 'println(1)',
  description: '初始描述',
  tags: ['baseline'],
  enabled: true,
  category_id: 4,
  group_ids: [9],
  visibility: 'team',
  version: 2,
  revision: 3,
  file_hash: '2'.repeat(64),
  ...overrides,
})

const createPluginListResponse = (overrides: Record<string, unknown> = {}, total = 1) => ({
  data: [createPluginRecord(overrides)],
  paging: { total },
})

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, reject, resolve }
}

const allPluginPermissions = [
  'plugin.read',
  'plugin.manage',
  'plugin.import',
  'plugin_group.read',
  'plugin_group.manage',
]

const createMeResponse = (permissions = allPluginPermissions, teamId = 3, version = 1) => ({
  data: {
    user: { id: 7, name: '测试用户', status: 'active' },
    memberships: [
      {
        member: { id: teamId + 10, team_id: teamId, user_id: 7, status: 'active', version },
        team: { id: teamId, name: `团队 ${teamId}`, status: 'active' },
        roles: [],
        permissions,
        projects: [],
      },
    ],
  },
})

const pluginBody = 'println("historical")'
const pluginBodyBytes = new TextEncoder().encode(pluginBody)
const pluginBodyHash = createHash('sha256').update(pluginBodyBytes).digest('hex')

interface MockSelectOption {
  label: React.ReactNode
  value: string | number
}

type MockTableRecord = Record<string, any> & {
  id: number
  script_name: string
}

vi.mock('@/services/teamCollaboration', () => ({
  createPluginCategory: mocks.createPluginCategory,
  createPluginGroup: mocks.createPluginGroup,
  createTeamPlugin: mocks.createTeamPlugin,
  deletePluginCategory: mocks.deletePluginCategory,
  deletePluginGroup: mocks.deletePluginGroup,
  deleteTeamPlugin: mocks.deleteTeamPlugin,
  downloadTeamPlugin: mocks.downloadTeamPlugin,
  downloadTeamPluginVersion: mocks.downloadTeamPluginVersion,
  getMe: mocks.getMe,
  getTeamPlugin: mocks.getTeamPlugin,
  importTeamPlugins: mocks.importTeamPlugins,
  listPluginCategories: mocks.listPluginCategories,
  listPluginGroups: mocks.listPluginGroups,
  listTeamPluginVersions: mocks.listTeamPluginVersions,
  listTeamPlugins: mocks.listTeamPlugins,
  listTeams: mocks.listTeams,
  setPluginVisibility: mocks.setPluginVisibility,
  updatePluginCategory: mocks.updatePluginCategory,
  updatePluginGroup: mocks.updatePluginGroup,
  updateTeamPlugin: mocks.updateTeamPlugin,
  unbindPluginGroup: mocks.unbindPluginGroup,
}))

vi.mock('../HubListTeam.module.scss', () => ({
  default: new Proxy({}, { get: (_target, property) => String(property) }),
}))

vi.mock('@/components/yakitUI/YakitButton/YakitButton', () => ({
  YakitButton: ({ children, loading, type: _type, ...props }) => (
    <button type="button" {...props} disabled={props.disabled || loading}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/yakitUI/YakitInput/YakitInput', () => {
  const Input = (props) => <input {...props} />
  Input.Search = ({ onSearch: _onSearch, ...props }) => <input {...props} />
  Input.TextArea = (props) => <textarea {...props} />
  return { YakitInput: Input }
})

vi.mock('@/components/yakitUI/YakitModal/YakitModal', () => ({
  YakitModal: ({
    children,
    footer,
    okButtonProps,
    okText = '确定',
    cancelText = '取消',
    onCancel,
    onOk,
    title,
    visible,
  }) =>
    visible ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
        {footer !== undefined ? (
          <div>{footer}</div>
        ) : (
          <div>
            <button type="button" onClick={onCancel}>
              {cancelText}
            </button>
            <button type="button" onClick={onOk} {...okButtonProps}>
              {okText}
            </button>
          </div>
        )}
      </div>
    ) : null,
}))

vi.mock('antd', () => ({
  Select: ({
    allowClear: _allowClear,
    mode,
    onChange,
    options = [] as MockSelectOption[],
    placeholder,
    value,
    ...props
  }) => (
    <select
      {...props}
      multiple={mode === 'multiple'}
      aria-label={props['aria-label'] || placeholder}
      value={value ?? (mode === 'multiple' ? [] : '')}
      onChange={(event) => {
        const values = Array.from(event.currentTarget.selectedOptions).map((option) => {
          const numeric = Number(option.value)
          return Number.isNaN(numeric) ? option.value : numeric
        })
        onChange?.(mode === 'multiple' ? values : values[0])
      }}
    >
      {!mode && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  Table: ({ columns, dataSource = [] as MockTableRecord[], onRow, pagination, rowSelection }) => (
    <>
      <span data-testid="plugin-total">{pagination?.total}</span>
      <table>
        <tbody>
          {dataSource.map((record) => (
            <tr key={record.id} {...onRow?.(record)}>
              {rowSelection ? (
                <td>
                  <input
                    type="checkbox"
                    aria-label={`选择插件 ${record.script_name}`}
                    checked={rowSelection.selectedRowKeys.includes(record.id)}
                    onChange={(event) => rowSelection.onChange(event.target.checked ? [record.id] : [])}
                  />
                </td>
              ) : null}
              {columns.map((column) => (
                <td key={column.key || column.dataIndex}>
                  {column.render ? column.render(record[column.dataIndex], record) : record[column.dataIndex]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  ),
  Switch: ({
    checked,
    checkedChildren: _checkedChildren,
    onChange,
    unCheckedChildren: _unCheckedChildren,
    ...props
  }) => <input {...props} type="checkbox" checked={checked} onChange={(event) => onChange?.(event.target.checked)} />,
  Tag: ({ children }) => <span>{children}</span>,
  Upload: ({ beforeUpload, children }) => (
    <div>
      {children}
      <input
        aria-label="导入插件清单文件"
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file) void beforeUpload?.(file)
        }}
      />
    </div>
  ),
}))

vi.mock('@/utils/notification', () => ({
  success: mocks.success,
  yakitFailed: mocks.yakitFailed,
}))

vi.mock('@/pages/plugins/utils', () => ({
  apiFetchSaveYakScriptGroupLocal: vi.fn(),
  apiQueryYakScriptBase: mocks.apiQueryYakScriptBase,
}))

vi.mock('@/utils/kv', () => ({
  getRemoteValue: vi.fn().mockResolvedValue(''),
  setRemoteValue: vi.fn(),
}))

vi.mock('@/utils/envfile', () => ({
  getRemoteHttpSettingGV: vi.fn().mockReturnValue('remote-http-setting'),
}))

describe('团队插件仓库管理', () => {
  beforeEach(() => {
    publishTeamAuthenticationInvalidation()
    vi.clearAllMocks()
    if (!globalThis.crypto?.subtle) {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: {
          subtle: {
            digest: async (_algorithm: string, content: ArrayBuffer) => {
              const digest = createHash('sha256').update(new Uint8Array(content)).digest()
              return Uint8Array.from(digest).buffer
            },
          },
        },
      })
    }
    useStore.setState({
      userInfo: {
        isLogin: true,
        platform: 'company',
        githubName: null,
        githubHeadImg: null,
        wechatName: null,
        wechatHeadImg: null,
        qqName: null,
        qqHeadImg: null,
        companyName: '测试用户',
        companyHeadImg: null,
        role: null,
        user_id: 7,
        token: 'plugin-token-a',
      },
    })
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: () => ({ ipcRenderer: { invoke: mocks.ipcInvoke } }),
    })
    mocks.listTeams.mockResolvedValue({ data: [{ id: 3, name: '研发团队' }] })
    mocks.getMe.mockResolvedValue({
      data: {
        user: { id: 7, name: '测试用户', status: 'active' },
        memberships: [
          createMeResponse(allPluginPermissions, 3).data.memberships[0],
          createMeResponse(allPluginPermissions, 4).data.memberships[0],
        ],
      },
    })
    mocks.listPluginCategories.mockResolvedValue({
      data: [{ id: 4, name: 'Web', description: 'Web 插件', sort_order: 1, status: 'active' }],
    })
    mocks.listPluginGroups.mockResolvedValue({
      data: [{ id: 9, name: '基线', description: '基线插件', sort_order: 2, status: 'active' }],
    })
    mocks.listTeamPlugins.mockResolvedValue(createPluginListResponse())
    mocks.listTeamPluginVersions.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 52,
          team_id: 3,
          plugin_id: 5,
          version: 2,
          file_hash: '2'.repeat(64),
          change_note: '当前版本',
          created_by: 7,
          created_at: '2026-07-30T12:00:00Z',
        },
        {
          id: 51,
          team_id: 3,
          plugin_id: 5,
          version: 1,
          file_hash: pluginBodyHash,
          change_note: '历史版本',
          created_by: 7,
          created_at: '2026-07-29T12:00:00Z',
        },
      ],
    })
    mocks.downloadTeamPluginVersion.mockResolvedValue(pluginBodyBytes)
    mocks.apiQueryYakScriptBase.mockResolvedValue({
      Data: [{ Id: 17, ScriptName: '本地插件', Type: 'yak', Content: 'println(1)' }],
    })
    mocks.importTeamPlugins.mockResolvedValue({ data: { items: [] } })
    mocks.ipcInvoke.mockImplementation(async (channel) => {
      if (channel === 'QueryYakScript') return { Data: [] }
      if (channel === 'SaveYakScript') return { Id: 71, ScriptName: 'Plugin A', UUID: 'local-plugin-uuid' }
      return undefined
    })
    mocks.getTeamPlugin.mockResolvedValue({ data: createPluginRecord() })
    for (const mock of [
      mocks.createPluginCategory,
      mocks.createPluginGroup,
      mocks.createTeamPlugin,
      mocks.deletePluginCategory,
      mocks.deletePluginGroup,
      mocks.deleteTeamPlugin,
      mocks.importTeamPlugins,
      mocks.updatePluginCategory,
      mocks.updatePluginGroup,
      mocks.updateTeamPlugin,
      mocks.unbindPluginGroup,
    ]) {
      mock.mockResolvedValue({ data: {} })
    }
  })

  const renderPage = async () => {
    const { HubListTeam } = await import('../HubListTeam')
    render(<HubListTeam />)
    expect(await screen.findByText('Plugin A')).toBeInTheDocument()
  }

  const renderShell = async () => {
    const { HubListTeam } = await import('../HubListTeam')
    render(<HubListTeam />)
    await waitFor(() => expect(mocks.getMe).toHaveBeenCalled())
  }

  it('使用响应顶层分页总数', async () => {
    mocks.listTeamPlugins.mockResolvedValue(createPluginListResponse({}, 47))

    await renderPage()

    expect(screen.getByTestId('plugin-total')).toHaveTextContent('47')
  }, 10000)

  it('插件列表请求乱序返回时保留最新响应', async () => {
    await renderPage()
    const olderRequest = createDeferred<ReturnType<typeof createPluginListResponse>>()
    const latestRequest = createDeferred<ReturnType<typeof createPluginListResponse>>()
    mocks.listTeamPlugins
      .mockImplementationOnce(() => olderRequest.promise)
      .mockImplementationOnce(() => latestRequest.promise)

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await act(async () => {
      latestRequest.resolve(createPluginListResponse({ script_name: '最新插件' }))
      await latestRequest.promise
    })
    expect(await screen.findByText('最新插件')).toBeInTheDocument()

    await act(async () => {
      olderRequest.resolve(createPluginListResponse({ script_name: '过期插件' }))
      await olderRequest.promise
    })
    expect(screen.getByText('最新插件')).toBeInTheDocument()
    expect(screen.queryByText('过期插件')).not.toBeInTheDocument()
  }, 15000)

  it('旧插件请求成功晚于新刷新失败时保留当前错误', async () => {
    await renderPage()
    const olderRequest = createDeferred<ReturnType<typeof createPluginListResponse>>()
    mocks.listTeamPlugins
      .mockImplementationOnce(() => olderRequest.promise)
      .mockRejectedValueOnce(new Error('插件刷新失败'))

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑插件 Plugin A' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '编辑远端插件' })).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('更新远端插件已提交，但插件列表刷新失败'))
    await act(async () => {
      olderRequest.resolve(createPluginListResponse({ script_name: '过期插件' }))
      await olderRequest.promise
    })

    expect(screen.getByRole('status')).toHaveTextContent('更新远端插件已提交，但插件列表刷新失败')
    expect(screen.queryByText('过期插件')).not.toBeInTheDocument()
  }, 15000)

  it('分类与分组请求乱序返回时保留最新响应', async () => {
    await renderPage()
    const olderRequest = createDeferred<{ data: Array<Record<string, unknown>> }>()
    const latestRequest = createDeferred<{ data: Array<Record<string, unknown>> }>()
    mocks.listPluginCategories
      .mockImplementationOnce(() => olderRequest.promise)
      .mockImplementationOnce(() => latestRequest.promise)

    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    await act(async () => {
      latestRequest.resolve({
        data: [{ id: 7, name: '最新分类', description: '', sort_order: 0, status: 'active' }],
      })
      await latestRequest.promise
    })
    expect((await screen.findAllByText('最新分类')).length).toBeGreaterThanOrEqual(2)

    await act(async () => {
      olderRequest.resolve({
        data: [{ id: 8, name: '过期分类', description: '', sort_order: 0, status: 'active' }],
      })
      await olderRequest.promise
    })
    expect(screen.getAllByText('最新分类').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('过期分类')).not.toBeInTheDocument()
  }, 15000)

  it('分类读取失败时保留原分类并提交成功的分组响应', async () => {
    await renderPage()
    mocks.listPluginCategories.mockRejectedValueOnce(new Error('分类读取失败'))
    mocks.listPluginGroups.mockResolvedValueOnce({
      data: [{ id: 10, name: '最新分组', description: '', sort_order: 0, status: 'active' }],
    })

    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })

    await waitFor(() => expect(mocks.yakitFailed).toHaveBeenCalledWith('加载插件分类与分组失败：分类读取失败'))
    expect(within(manager).getByText('Web')).toBeInTheDocument()
    expect(within(manager).getByText('最新分组')).toBeInTheDocument()
  })

  it('分组读取失败时保留原分组并提交成功的分类响应', async () => {
    await renderPage()
    mocks.listPluginCategories.mockResolvedValueOnce({
      data: [{ id: 7, name: '最新分类', description: '', sort_order: 0, status: 'active' }],
    })
    mocks.listPluginGroups.mockRejectedValueOnce(new Error('分组读取失败'))

    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })

    await waitFor(() => expect(mocks.yakitFailed).toHaveBeenCalledWith('加载插件分类与分组失败：分组读取失败'))
    expect(within(manager).getByText('最新分类')).toBeInTheDocument()
    expect(within(manager).getByText('基线')).toBeInTheDocument()
  })

  it('创建、完整修改并删除单个远端插件', async () => {
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: '新建远端插件' }))
    const createDialog = screen.getByRole('dialog', { name: '新建远端插件' })
    fireEvent.change(within(createDialog).getByLabelText('插件名称'), { target: { value: 'Plugin B' } })
    fireEvent.change(within(createDialog).getByLabelText('插件类型'), { target: { value: 'yak' } })
    fireEvent.change(within(createDialog).getByLabelText('插件内容'), { target: { value: 'println(2)' } })
    fireEvent.change(within(createDialog).getByLabelText('插件描述'), { target: { value: '新增插件' } })
    fireEvent.change(within(createDialog).getByLabelText('插件标签'), { target: { value: 'web, scanner' } })
    fireEvent.change(within(createDialog).getByLabelText('插件分类'), { target: { value: '4' } })
    fireEvent.click(within(createDialog).getByRole('button', { name: '创建' }))

    await waitFor(() =>
      expect(mocks.createTeamPlugin).toHaveBeenCalledWith(3, {
        script_name: 'Plugin B',
        type: 'yak',
        content: 'println(2)',
        description: '新增插件',
        tags: ['web', 'scanner'],
        enabled: true,
        category_id: 4,
        group_ids: [],
        visibility: 'team',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '编辑插件 Plugin A' }))
    const editDialog = screen.getByRole('dialog', { name: '编辑远端插件' })
    fireEvent.change(within(editDialog).getByLabelText('插件名称'), { target: { value: 'Plugin A v2' } })
    fireEvent.change(within(editDialog).getByLabelText('插件内容'), { target: { value: 'println(3)' } })
    fireEvent.change(within(editDialog).getByLabelText('插件标签'), { target: { value: 'baseline, updated' } })
    fireEvent.change(within(editDialog).getByLabelText('插件分类'), { target: { value: '' } })
    const pluginGroupSelect = within(editDialog).getByLabelText('插件分组') as HTMLSelectElement
    Array.from(pluginGroupSelect.options).forEach((option) => {
      option.selected = false
    })
    fireEvent.change(pluginGroupSelect)
    fireEvent.change(within(editDialog).getByLabelText('修改说明'), { target: { value: '更新检测逻辑' } })
    mocks.listTeamPlugins.mockResolvedValue(
      createPluginListResponse({
        script_name: 'Plugin A v2',
        content: 'println(3)',
        category_id: 0,
        group_ids: [],
        revision: 4,
      }),
    )
    fireEvent.click(within(editDialog).getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mocks.updateTeamPlugin).toHaveBeenCalledWith(3, 5, {
        script_name: 'Plugin A v2',
        type: 'yak',
        content: 'println(3)',
        description: '初始描述',
        tags: ['baseline', 'updated'],
        enabled: true,
        category_id: 0,
        group_ids: [],
        visibility: 'team',
        change_note: '更新检测逻辑',
        revision: 3,
      }),
    )

    mocks.listTeamPlugins.mockResolvedValueOnce({ data: [], paging: { total: 0 } })
    fireEvent.click(await screen.findByRole('button', { name: '删除插件 Plugin A v2' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '删除远端插件' })).getByRole('button', { name: '确认删除' }),
    )
    await waitFor(() => expect(mocks.deleteTeamPlugin).toHaveBeenCalledWith(3, 5, { cascade: true }))
  }, 10000)

  it('使用级联参数原子清除分组引用并删除插件', async () => {
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: '删除插件 Plugin A' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '删除远端插件' })).getByRole('button', { name: '确认删除' }),
    )

    await waitFor(() => expect(mocks.deleteTeamPlugin).toHaveBeenCalledWith(3, 5, { cascade: true }))
    expect(mocks.getTeamPlugin).not.toHaveBeenCalled()
    expect(mocks.unbindPluginGroup).not.toHaveBeenCalled()
  })

  it('插件级联删除失败时保留当前列表', async () => {
    mocks.deleteTeamPlugin.mockRejectedValueOnce(new Error('级联删除失败'))
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: '删除插件 Plugin A' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '删除远端插件' })).getByRole('button', { name: '确认删除' }),
    )

    await waitFor(() => expect(mocks.yakitFailed).toHaveBeenCalledWith('删除远端插件失败：级联删除失败'))
    expect(mocks.deleteTeamPlugin).toHaveBeenCalledWith(3, 5, { cascade: true })
    expect(mocks.unbindPluginGroup).not.toHaveBeenCalled()
    expect(screen.getByText('Plugin A')).toBeInTheDocument()
  })

  it('删除旧团队插件期间切换团队不会修改新团队列表', async () => {
    const deletion = createDeferred<{ data: Record<string, never> }>()
    mocks.listTeams.mockResolvedValue({
      data: [
        { id: 3, name: '研发团队' },
        { id: 4, name: '交付团队' },
      ],
    })
    mocks.listTeamPlugins.mockImplementation((nextTeamId) =>
      Promise.resolve(
        nextTeamId === 4
          ? createPluginListResponse({ id: 15, script_name: 'Plugin B', group_ids: [] }, 8)
          : createPluginListResponse(),
      ),
    )
    mocks.deleteTeamPlugin.mockImplementationOnce(() => deletion.promise)
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: '删除插件 Plugin A' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '删除远端插件' })).getByRole('button', { name: '确认删除' }),
    )
    await waitFor(() => expect(mocks.deleteTeamPlugin).toHaveBeenCalledWith(3, 5, { cascade: true }))

    fireEvent.change(screen.getByLabelText('选择团队'), { target: { value: '4' } })
    expect(await screen.findByText('Plugin B')).toBeInTheDocument()
    expect(screen.getByTestId('plugin-total')).toHaveTextContent('8')
    expect(screen.queryByRole('dialog', { name: '删除远端插件' })).not.toBeInTheDocument()

    await act(async () => {
      deletion.resolve({ data: {} })
      await deletion.promise
    })

    expect(screen.getByText('Plugin B')).toBeInTheDocument()
    expect(screen.getByTestId('plugin-total')).toHaveTextContent('8')
    expect(mocks.success).not.toHaveBeenCalledWith('删除远端插件成功')
  }, 15000)

  it('修改旧团队可见范围期间切换团队不会刷新新团队或提示成功', async () => {
    const visibilityUpdate = createDeferred<{ data: Record<string, never> }>()
    mocks.listTeams.mockResolvedValue({
      data: [
        { id: 3, name: '研发团队' },
        { id: 4, name: '交付团队' },
      ],
    })
    mocks.listTeamPlugins.mockImplementation((nextTeamId) =>
      Promise.resolve(
        nextTeamId === 4
          ? createPluginListResponse({ id: 15, script_name: 'Plugin B', visibility: 'private' }, 8)
          : createPluginListResponse(),
      ),
    )
    mocks.setPluginVisibility.mockImplementationOnce(() => visibilityUpdate.promise)
    await renderPage()

    const visibilitySelect = screen
      .getAllByRole('combobox')
      .find((element) => (element as HTMLSelectElement).value === 'team')
    expect(visibilitySelect).toBeDefined()
    fireEvent.change(visibilitySelect as HTMLSelectElement, { target: { value: 'private' } })
    await waitFor(() => expect(mocks.setPluginVisibility).toHaveBeenCalledWith(3, 5, 'private', 3))

    fireEvent.change(screen.getByLabelText('选择团队'), { target: { value: '4' } })
    expect(await screen.findByText('Plugin B')).toBeInTheDocument()
    expect(screen.getByTestId('plugin-total')).toHaveTextContent('8')

    await act(async () => {
      visibilityUpdate.resolve({ data: {} })
      await visibilityUpdate.promise
    })

    expect(screen.getByText('Plugin B')).toBeInTheDocument()
    expect(screen.getByTestId('plugin-total')).toHaveTextContent('8')
    expect(mocks.listTeamPlugins).toHaveBeenCalledTimes(2)
    expect(mocks.success).not.toHaveBeenCalledWith('插件可见范围已设为私有')
  }, 15000)

  it('修改可见范围期间改变筛选后使用最新查询刷新', async () => {
    const visibilityUpdate = createDeferred<{ data: Record<string, never> }>()
    mocks.setPluginVisibility.mockImplementationOnce(() => visibilityUpdate.promise)
    await renderPage()

    const visibilitySelect = screen
      .getAllByRole('combobox')
      .find((element) => (element as HTMLSelectElement).value === 'team')
    expect(visibilitySelect).toBeDefined()
    fireEvent.change(visibilitySelect as HTMLSelectElement, { target: { value: 'private' } })
    await waitFor(() => expect(mocks.setPluginVisibility).toHaveBeenCalledWith(3, 5, 'private', 3))

    fireEvent.change(screen.getByLabelText('全部分类'), { target: { value: '4' } })
    await waitFor(() => expect(mocks.listTeamPlugins).toHaveBeenCalledTimes(2))

    await act(async () => {
      visibilityUpdate.resolve({ data: {} })
      await visibilityUpdate.promise
    })

    await waitFor(() => expect(mocks.listTeamPlugins).toHaveBeenCalledTimes(3))
    expect(mocks.listTeamPlugins).toHaveBeenLastCalledWith(3, { category_id: 4, page: 1, limit: 20 })
    expect(screen.getByLabelText('全部分类')).toHaveValue('4')
  }, 15000)

  it('分类级联删除只发送一次删除请求且不在客户端预清引用', async () => {
    await renderPage()
    mocks.listTeamPlugins.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })

    fireEvent.click(within(manager).getByRole('button', { name: '删除分类 Web' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '删除分类' })).getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(mocks.deletePluginCategory).toHaveBeenCalledWith(3, 4, { cascade: true }))
    expect(mocks.deletePluginCategory).toHaveBeenCalledTimes(1)
    expect(mocks.updateTeamPlugin).not.toHaveBeenCalled()
    expect(mocks.unbindPluginGroup).not.toHaveBeenCalled()
    expect(mocks.listTeamPlugins).not.toHaveBeenCalled()
  })

  it('分组级联删除只发送一次删除请求且不在客户端预清绑定', async () => {
    await renderPage()
    mocks.listTeamPlugins.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })

    fireEvent.click(within(manager).getByRole('button', { name: '删除分组 基线' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '删除分组' })).getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(mocks.deletePluginGroup).toHaveBeenCalledWith(3, 9, { cascade: true }))
    expect(mocks.deletePluginGroup).toHaveBeenCalledTimes(1)
    expect(mocks.updateTeamPlugin).not.toHaveBeenCalled()
    expect(mocks.unbindPluginGroup).not.toHaveBeenCalled()
    expect(mocks.listTeamPlugins).not.toHaveBeenCalled()
  })

  it.each([
    {
      kind: '分类',
      itemName: 'Web',
      deleteResource: () => mocks.deletePluginCategory,
      expectedPluginReferences: { category_id: 0, group_ids: [9] },
      expectedRevision: 4,
    },
    {
      kind: '分组',
      itemName: '基线',
      deleteResource: () => mocks.deletePluginGroup,
      expectedPluginReferences: { category_id: 4, group_ids: [] },
      expectedRevision: 3,
    },
  ])(
    '删除$kind后继续编辑插件时提交与服务端级联一致的修订号',
    async ({ deleteResource, expectedPluginReferences, expectedRevision, itemName, kind }) => {
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
      const manager = screen.getByRole('dialog', { name: '管理分类与分组' })
      await waitFor(() => expect(mocks.listPluginCategories).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(mocks.listPluginGroups).toHaveBeenCalledTimes(2))

      fireEvent.click(within(manager).getByRole('button', { name: `删除${kind} ${itemName}` }))
      fireEvent.click(
        within(screen.getByRole('dialog', { name: `删除${kind}` })).getByRole('button', { name: '确认删除' }),
      )

      await waitFor(() => expect(deleteResource()).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(within(manager).queryByText(itemName)).not.toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: '编辑插件 Plugin A' }))
      const editor = screen.getByRole('dialog', { name: '编辑远端插件' })
      fireEvent.click(within(editor).getByRole('button', { name: '保存' }))

      await waitFor(() =>
        expect(mocks.updateTeamPlugin).toHaveBeenCalledWith(
          3,
          5,
          expect.objectContaining({
            ...expectedPluginReferences,
            revision: expectedRevision,
          }),
        ),
      )
    },
  )

  it.each([
    {
      kind: '分类',
      itemName: 'Web',
      failDelete: () => mocks.deletePluginCategory.mockRejectedValueOnce(new Error('级联删除失败')),
      deleteResource: () => mocks.deletePluginCategory,
    },
    {
      kind: '分组',
      itemName: '基线',
      failDelete: () => mocks.deletePluginGroup.mockRejectedValueOnce(new Error('级联删除失败')),
      deleteResource: () => mocks.deletePluginGroup,
    },
  ])('$kind级联删除失败时保留管理项和插件引用', async ({ deleteResource, failDelete, itemName, kind }) => {
    await renderPage()
    mocks.listTeamPlugins.mockClear()
    failDelete()
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })

    fireEvent.click(within(manager).getByRole('button', { name: `删除${kind} ${itemName}` }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: `删除${kind}` })).getByRole('button', { name: '确认删除' }),
    )

    await waitFor(() => expect(mocks.yakitFailed).toHaveBeenCalledWith(`删除${kind}失败：级联删除失败`))
    expect(deleteResource()).toHaveBeenCalledTimes(1)
    expect(within(manager).getByText(itemName)).toBeInTheDocument()
    expect(screen.getAllByText(itemName).length).toBeGreaterThanOrEqual(2)
    expect(mocks.updateTeamPlugin).not.toHaveBeenCalled()
    expect(mocks.unbindPluginGroup).not.toHaveBeenCalled()
    expect(mocks.listTeamPlugins).not.toHaveBeenCalled()
  })

  it('创建、修改并删除分类和分组', async () => {
    await renderPage()
    mocks.listTeamPlugins.mockResolvedValue(createPluginListResponse({ category_id: 0, group_ids: [] }))
    fireEvent.click(screen.getByRole('button', { name: '编辑插件 Plugin A' }))
    const pluginEditor = screen.getByRole('dialog', { name: '编辑远端插件' })
    fireEvent.change(within(pluginEditor).getByLabelText('插件分类'), { target: { value: '' } })
    const pluginGroupSelect = within(pluginEditor).getByLabelText('插件分组') as HTMLSelectElement
    Array.from(pluginGroupSelect.options).forEach((option) => {
      option.selected = false
    })
    fireEvent.change(pluginGroupSelect)
    fireEvent.click(within(pluginEditor).getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(mocks.updateTeamPlugin).toHaveBeenCalledWith(
        3,
        5,
        expect.objectContaining({ category_id: 0, group_ids: [] }),
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })

    fireEvent.click(within(manager).getByRole('button', { name: '新建分类' }))
    let editor = screen.getByRole('dialog', { name: '新建分类' })
    fireEvent.change(within(editor).getByLabelText('资源名称'), { target: { value: '漏洞检测' } })
    fireEvent.change(within(editor).getByLabelText('资源描述'), { target: { value: '漏洞检测插件' } })
    fireEvent.change(within(editor).getByLabelText('资源排序'), { target: { value: '6' } })
    fireEvent.click(within(editor).getByRole('button', { name: '创建' }))
    await waitFor(() =>
      expect(mocks.createPluginCategory).toHaveBeenCalledWith(3, {
        name: '漏洞检测',
        description: '漏洞检测插件',
        sort_order: 6,
        status: 'active',
      }),
    )

    fireEvent.click(within(manager).getByRole('button', { name: '编辑分类 Web' }))
    editor = screen.getByRole('dialog', { name: '编辑分类' })
    fireEvent.change(within(editor).getByLabelText('资源名称'), { target: { value: 'Web 安全' } })
    fireEvent.click(within(editor).getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(mocks.updatePluginCategory).toHaveBeenCalledWith(3, 4, {
        name: 'Web 安全',
        description: 'Web 插件',
        sort_order: 1,
        status: 'active',
      }),
    )

    fireEvent.click(within(manager).getByRole('button', { name: '删除分类 Web' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '删除分类' })).getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(mocks.deletePluginCategory).toHaveBeenCalledWith(3, 4, { cascade: true }))

    fireEvent.click(within(manager).getByRole('button', { name: '新建分组' }))
    editor = screen.getByRole('dialog', { name: '新建分组' })
    fireEvent.change(within(editor).getByLabelText('资源名称'), { target: { value: '发布' } })
    fireEvent.click(within(editor).getByRole('button', { name: '创建' }))
    await waitFor(() =>
      expect(mocks.createPluginGroup).toHaveBeenCalledWith(3, {
        name: '发布',
        description: '',
        sort_order: 0,
        status: 'active',
      }),
    )

    fireEvent.click(within(manager).getByRole('button', { name: '编辑分组 基线' }))
    editor = screen.getByRole('dialog', { name: '编辑分组' })
    fireEvent.change(within(editor).getByLabelText('资源名称'), { target: { value: '发布基线' } })
    fireEvent.click(within(editor).getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(mocks.updatePluginGroup).toHaveBeenCalledWith(3, 9, {
        name: '发布基线',
        description: '基线插件',
        sort_order: 2,
        status: 'active',
      }),
    )

    fireEvent.click(within(manager).getByRole('button', { name: '删除分组 基线' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '删除分组' })).getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(mocks.deletePluginGroup).toHaveBeenCalledWith(3, 9, { cascade: true }))
  })

  it('插件仍被分组引用时提示先清空分组', async () => {
    mocks.deleteTeamPlugin.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'plugin_in_use' } },
      message: '插件仍被分组引用',
    })
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: '删除插件 Plugin A' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '删除远端插件' })).getByRole('button', { name: '确认删除' }),
    )

    await waitFor(() =>
      expect(mocks.yakitFailed).toHaveBeenCalledWith('删除远端插件失败：插件仍被分组引用，请编辑插件并清空分组后重试'),
    )
  })

  it('分类和分组仍被插件引用时提示先清空对应引用', async () => {
    mocks.deletePluginCategory.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'category_not_empty' } },
      message: '分类仍包含插件',
    })
    mocks.deletePluginGroup.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'group_in_use' } },
      message: '分组仍被插件引用',
    })
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })

    fireEvent.click(within(manager).getByRole('button', { name: '删除分类 Web' }))
    let deleteDialog = screen.getByRole('dialog', { name: '删除分类' })
    fireEvent.click(within(deleteDialog).getByRole('button', { name: '确认删除' }))
    await waitFor(() =>
      expect(mocks.yakitFailed).toHaveBeenCalledWith('删除分类失败：分类仍包含插件，请先编辑相关插件并清空分类'),
    )
    fireEvent.click(within(deleteDialog).getByRole('button', { name: '取消' }))

    fireEvent.click(within(manager).getByRole('button', { name: '删除分组 基线' }))
    deleteDialog = screen.getByRole('dialog', { name: '删除分组' })
    fireEvent.click(within(deleteDialog).getByRole('button', { name: '确认删除' }))
    await waitFor(() =>
      expect(mocks.yakitFailed).toHaveBeenCalledWith('删除分组失败：分组仍被插件引用，请先编辑相关插件并清空分组'),
    )
  })

  it('写请求成功但插件刷新失败时关闭编辑器且不提示操作成功', async () => {
    await renderPage()
    mocks.listTeamPlugins.mockRejectedValueOnce(new Error('刷新失败'))

    fireEvent.click(screen.getByRole('button', { name: '新建远端插件' }))
    const editor = screen.getByRole('dialog', { name: '新建远端插件' })
    fireEvent.change(within(editor).getByLabelText('插件名称'), { target: { value: 'Plugin B' } })
    fireEvent.change(within(editor).getByLabelText('插件类型'), { target: { value: 'yak' } })
    fireEvent.change(within(editor).getByLabelText('插件内容'), { target: { value: 'println(2)' } })
    fireEvent.click(within(editor).getByRole('button', { name: '创建' }))

    await waitFor(() => expect(mocks.createTeamPlugin).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新建远端插件' })).not.toBeInTheDocument())
    expect(mocks.success).not.toHaveBeenCalledWith('创建远端插件成功')
    expect(mocks.yakitFailed).toHaveBeenCalledWith('加载团队插件失败：刷新失败')
    expect(screen.getByRole('status')).toHaveTextContent(
      '创建远端插件已提交，但插件列表刷新失败，请使用刷新按钮读取最新状态',
    )

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(mocks.listTeamPlugins).toHaveBeenCalledTimes(3))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  }, 10000)

  it('删除插件后取消该插件的列表选择', async () => {
    mocks.listTeamPlugins.mockResolvedValue(createPluginListResponse({ group_ids: [] }))
    await renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: '选择插件 Plugin A' }))
    expect(screen.getByRole('button', { name: '批量安装' })).not.toBeDisabled()
    mocks.listTeamPlugins.mockRejectedValueOnce(new Error('删除后刷新失败'))

    fireEvent.click(screen.getByRole('button', { name: '删除插件 Plugin A' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '删除远端插件' })).getByRole('button', { name: '确认删除' }),
    )

    await waitFor(() => expect(mocks.deleteTeamPlugin).toHaveBeenCalledWith(3, 5, { cascade: true }))
    expect(screen.getByRole('button', { name: '批量安装' })).toBeDisabled()
    expect(screen.queryByText('Plugin A')).not.toBeInTheDocument()
    expect(mocks.success).not.toHaveBeenCalledWith('删除远端插件成功')
    expect(screen.getByRole('status')).toHaveTextContent(
      '删除远端插件已提交，但插件列表刷新失败，请使用刷新按钮读取最新状态',
    )
  })

  it('分类写请求成功但筛选刷新失败时不提示操作成功', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })
    await waitFor(() => expect(mocks.listPluginCategories).toHaveBeenCalledTimes(2))
    mocks.listPluginCategories.mockRejectedValueOnce(new Error('筛选刷新失败'))
    fireEvent.click(within(manager).getByRole('button', { name: '新建分类' }))
    const editor = screen.getByRole('dialog', { name: '新建分类' })
    fireEvent.change(within(editor).getByLabelText('资源名称'), { target: { value: '新增分类' } })
    fireEvent.click(within(editor).getByRole('button', { name: '创建' }))

    await waitFor(() => expect(mocks.createPluginCategory).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新建分类' })).not.toBeInTheDocument())
    expect(mocks.success).not.toHaveBeenCalledWith('创建分类成功')
    expect(mocks.yakitFailed).toHaveBeenCalledWith('加载插件分类与分组失败：筛选刷新失败')
    expect(screen.getByRole('status')).toHaveTextContent(
      '创建分类已提交，但分类与分组刷新失败，请重新打开管理窗口读取最新状态',
    )

    fireEvent.click(within(manager).getByRole('button', { name: '关闭' }))
    mocks.listPluginCategories.mockResolvedValueOnce({
      data: [{ id: 7, name: '最新分类', description: '服务端最新状态', sort_order: 3, status: 'active' }],
    })
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))

    await waitFor(() => expect(mocks.listPluginCategories).toHaveBeenCalledTimes(4))
    const reopenedManager = screen.getByRole('dialog', { name: '管理分类与分组' })
    expect(await within(reopenedManager).findByText('最新分类')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it.each([
    {
      kind: '分类',
      itemName: 'Web',
      deleteResource: () => mocks.deletePluginCategory,
    },
    {
      kind: '分组',
      itemName: '基线',
      deleteResource: () => mocks.deletePluginGroup,
    },
  ])(
    '删除$kind成功后只提交本地状态且不触发额外读取',
    async ({ deleteResource, itemName, kind }) => {
      mocks.listTeamPlugins.mockResolvedValue(createPluginListResponse({ category_id: 0, group_ids: [] }))
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
      const manager = screen.getByRole('dialog', { name: '管理分类与分组' })
      await waitFor(() => expect(mocks.listPluginCategories).toHaveBeenCalledTimes(2))
      mocks.listPluginCategories.mockClear()
      mocks.listPluginGroups.mockClear()
      mocks.listTeamPlugins.mockClear()

      fireEvent.click(within(manager).getByRole('button', { name: `删除${kind} ${itemName}` }))
      fireEvent.click(
        within(screen.getByRole('dialog', { name: `删除${kind}` })).getByRole('button', { name: '确认删除' }),
      )

      await waitFor(() => expect(deleteResource()).toHaveBeenCalledTimes(1))
      expect(within(manager).queryByText(itemName)).not.toBeInTheDocument()
      expect(mocks.listPluginCategories).not.toHaveBeenCalled()
      expect(mocks.listPluginGroups).not.toHaveBeenCalled()
      expect(mocks.listTeamPlugins).not.toHaveBeenCalled()
    },
    10000,
  )

  it('不同操作的刷新失败分别保留并按数据域恢复', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })
    await waitFor(() => expect(mocks.listPluginCategories).toHaveBeenCalledTimes(2))
    mocks.listPluginCategories.mockRejectedValueOnce(new Error('分类刷新失败'))

    fireEvent.click(within(manager).getByRole('button', { name: '新建分类' }))
    const filterEditor = screen.getByRole('dialog', { name: '新建分类' })
    fireEvent.change(within(filterEditor).getByLabelText('资源名称'), { target: { value: '新增分类' } })
    fireEvent.click(within(filterEditor).getByRole('button', { name: '创建' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('创建分类已提交，但分类与分组刷新失败'))

    fireEvent.click(within(manager).getByRole('button', { name: '关闭' }))
    mocks.listTeamPlugins.mockRejectedValueOnce(new Error('插件刷新失败'))
    fireEvent.click(screen.getByRole('button', { name: '编辑插件 Plugin A' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '编辑远端插件' })).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('更新远端插件已提交，但插件列表刷新失败'))
    expect(screen.getByRole('status')).toHaveTextContent('创建分类已提交，但分类与分组刷新失败')

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('创建分类已提交，但分类与分组刷新失败'))
    expect(screen.getByRole('status')).not.toHaveTextContent('更新远端插件已提交')

    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  }, 15000)

  it.each([
    {
      kind: '分类',
      filterLabel: '全部分类',
      itemName: 'Web',
      queryField: 'category_id',
      value: 4,
      deleteResource: () => mocks.deletePluginCategory,
    },
    {
      kind: '分组',
      filterLabel: '全部分组',
      itemName: '基线',
      queryField: 'group_id',
      value: 9,
      deleteResource: () => mocks.deletePluginGroup,
    },
  ])(
    '删除当前$kind后在本地清除筛选且不重新读取插件',
    async ({ deleteResource, filterLabel, itemName, kind, queryField, value }) => {
      mocks.listTeamPlugins.mockResolvedValue(createPluginListResponse({ category_id: 0, group_ids: [] }))
      await renderPage()
      mocks.listTeamPlugins.mockClear()
      fireEvent.change(screen.getByLabelText(filterLabel), { target: { value: String(value) } })
      await waitFor(() =>
        expect(mocks.listTeamPlugins).toHaveBeenLastCalledWith(
          3,
          expect.objectContaining({ [queryField]: value, page: 1, limit: 20 }),
        ),
      )
      mocks.listTeamPlugins.mockClear()

      fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
      const manager = screen.getByRole('dialog', { name: '管理分类与分组' })
      fireEvent.click(within(manager).getByRole('button', { name: `删除${kind} ${itemName}` }))
      const deleteDialog = screen.getByRole('dialog', { name: `删除${kind}` })
      fireEvent.click(within(deleteDialog).getByRole('button', { name: '确认删除' }))

      await waitFor(() => expect(deleteResource()).toHaveBeenCalledTimes(1))
      expect(screen.getByLabelText(filterLabel)).toHaveValue('')
      expect(mocks.listTeamPlugins).not.toHaveBeenCalled()
    },
    10000,
  )

  it.each([
    {
      label: '分类',
      permissions: ['plugin.read'],
      expectedRead: () => mocks.listPluginCategories,
      forbiddenRead: () => mocks.listPluginGroups,
    },
    {
      label: '分组',
      permissions: ['plugin_group.read'],
      expectedRead: () => mocks.listPluginGroups,
      forbiddenRead: () => mocks.listPluginCategories,
    },
  ])('$label读取只使用对应的精确权限', async ({ expectedRead, forbiddenRead, permissions }) => {
    mocks.getMe.mockResolvedValue(createMeResponse(permissions))

    await renderShell()

    await waitFor(() => expect(screen.getByRole('combobox', { name: '选择团队' })).toHaveValue('3'))
    expect(expectedRead()).toHaveBeenCalledWith(3, { page: 1, limit: 200 })
    expect(forbiddenRead()).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: '分类',
      permissions: ['plugin.read', 'plugin.manage'],
      expectedCreate: '新建分类',
      expectedEdit: '编辑分类 Web',
      expectedDelete: '删除分类 Web',
      forbiddenCreate: '新建分组',
    },
    {
      label: '分组',
      permissions: ['plugin.read', 'plugin_group.read', 'plugin_group.manage'],
      expectedCreate: '新建分组',
      expectedEdit: '编辑分组 基线',
      expectedDelete: '删除分组 基线',
      forbiddenCreate: '新建分类',
    },
  ])(
    '$label管理区和写操作只使用对应的精确权限',
    async ({ expectedCreate, expectedDelete, expectedEdit, forbiddenCreate, permissions }) => {
      mocks.getMe.mockResolvedValue(createMeResponse(permissions))

      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
      const manager = screen.getByRole('dialog', { name: '管理分类与分组' })

      expect(within(manager).getByRole('button', { name: expectedCreate })).toBeInTheDocument()
      expect(within(manager).getByRole('button', { name: expectedEdit })).toBeInTheDocument()
      expect(within(manager).getByRole('button', { name: expectedDelete })).toBeInTheDocument()
      expect(within(manager).queryByRole('button', { name: forbiddenCreate })).not.toBeInTheDocument()
    },
  )

  it('插件保存引用已有分类和分组时不额外要求分组管理权限', async () => {
    mocks.getMe.mockResolvedValue(createMeResponse(['plugin.read', 'plugin.manage', 'plugin_group.read']))

    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: '编辑插件 Plugin A' }))
    const editor = screen.getByRole('dialog', { name: '编辑远端插件' })

    expect(within(editor).getByLabelText('插件分类')).not.toBeDisabled()
    expect(within(editor).getByLabelText('插件分组')).not.toBeDisabled()
    fireEvent.click(within(editor).getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mocks.updateTeamPlugin).toHaveBeenCalledWith(
        3,
        5,
        expect.objectContaining({ category_id: 4, group_ids: [9] }),
      ),
    )
  })

  it('上传引用已有分类和分组时仅要求导入权限', async () => {
    mocks.getMe.mockResolvedValue(createMeResponse(['plugin.read', 'plugin.import', 'plugin_group.read']))

    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: '上传本地插件' }))
    const dialog = await screen.findByRole('dialog', { name: '上传本地插件' })
    fireEvent.change(within(dialog).getByRole('listbox', { name: '选择一个或多个本地插件' }), {
      target: { value: '17' },
    })
    const category = within(dialog).getByRole('combobox', { name: '不设置分类' })
    const group = within(dialog).getByRole('listbox', { name: '不设置分组' })
    expect(category).not.toBeDisabled()
    expect(group).not.toBeDisabled()
    fireEvent.change(category, { target: { value: '4' } })
    fireEvent.change(group, { target: { value: '9' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '上传' }))

    await waitFor(() =>
      expect(mocks.importTeamPlugins).toHaveBeenCalledWith(3, {
        plugins: [
          expect.objectContaining({
            script_name: '本地插件',
            category_id: 4,
            group_ids: [9],
            overwrite: false,
          }),
        ],
      }),
    )
  }, 15000)

  it('缺少插件管理权限时覆盖选择器不可用', async () => {
    mocks.getMe.mockResolvedValue(createMeResponse(['plugin.read', 'plugin.import']))

    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: '上传本地插件' }))
    const dialog = await screen.findByRole('dialog', { name: '上传本地插件' })
    const overwrite = within(dialog)
      .getAllByRole('combobox')
      .find((element) => (element as HTMLSelectElement).value === 'skip')

    expect(overwrite).toBeDefined()
    expect(overwrite).toBeDisabled()
  })

  it('同时具有导入和插件管理权限时可上传覆盖项', async () => {
    mocks.getMe.mockResolvedValue(createMeResponse(['plugin.import', 'plugin.manage']))

    await renderShell()
    fireEvent.click(await screen.findByRole('button', { name: '上传本地插件' }))
    const dialog = await screen.findByRole('dialog', { name: '上传本地插件' })
    fireEvent.change(within(dialog).getByRole('listbox', { name: '选择一个或多个本地插件' }), {
      target: { value: '17' },
    })
    const overwrite = within(dialog)
      .getAllByRole('combobox')
      .find((element) => (element as HTMLSelectElement).value === 'skip')
    expect(overwrite).toBeDefined()
    fireEvent.change(overwrite as HTMLSelectElement, { target: { value: 'overwrite' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '上传' }))

    await waitFor(() =>
      expect(mocks.importTeamPlugins).toHaveBeenCalledWith(3, {
        plugins: [expect.objectContaining({ script_name: '本地插件', overwrite: true })],
      }),
    )
  })

  it('覆盖上传计算摘要期间撤销插件管理权限后保持零写请求', async () => {
    const digest = createDeferred<ArrayBuffer>()
    const digestSpy = vi.spyOn(globalThis.crypto.subtle, 'digest').mockReturnValueOnce(digest.promise)
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: '上传本地插件' }))
    const dialog = await screen.findByRole('dialog', { name: '上传本地插件' })
    fireEvent.change(within(dialog).getByRole('listbox', { name: '选择一个或多个本地插件' }), {
      target: { value: '17' },
    })
    const overwrite = within(dialog)
      .getAllByRole('combobox')
      .find((element) => (element as HTMLSelectElement).value === 'skip')
    fireEvent.change(overwrite as HTMLSelectElement, { target: { value: 'overwrite' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '上传' }))
    await waitFor(() => expect(digestSpy).toHaveBeenCalled())

    mocks.getMe.mockResolvedValue(
      createMeResponse(
        allPluginPermissions.filter((permission) => permission !== 'plugin.manage'),
        3,
        2,
      ),
    )
    act(() => publishTeamPermissionInvalidation(3))
    await screen.findByTestId('team-plugin-import')
    await act(async () => {
      digest.resolve(new Uint8Array(32).buffer)
      await digest.promise
    })

    expect(mocks.importTeamPlugins).not.toHaveBeenCalled()
  }, 15000)

  it.each([
    { overwrite: false, permissions: ['plugin.import'], expectedRequests: 1 },
    { overwrite: true, permissions: ['plugin.import'], expectedRequests: 0 },
    { overwrite: true, permissions: ['plugin.import', 'plugin.manage'], expectedRequests: 1 },
  ])(
    '文件导入 overwrite=$overwrite 时按插件导入和管理权限组合决定是否发送',
    async ({ expectedRequests, overwrite, permissions }) => {
      mocks.getMe.mockResolvedValue(createMeResponse(permissions))
      const file = {
        name: 'plugins.json',
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            plugins: [{ script_name: '文件插件', type: 'yak', content: 'println(9)', overwrite }],
          }),
        ),
      } as unknown as File

      await renderShell()
      fireEvent.change(await screen.findByLabelText('导入插件清单文件'), { target: { files: [file] } })

      await waitFor(() => expect(file.text).toHaveBeenCalled())
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(mocks.importTeamPlugins).toHaveBeenCalledTimes(expectedRequests)
      const submittedPlugin = mocks.importTeamPlugins.mock.calls[0]?.[1]?.plugins?.[0]
      expect(submittedPlugin?.script_name).toBe(expectedRequests ? '文件插件' : undefined)
      expect(submittedPlugin?.overwrite).toBe(expectedRequests ? overwrite : undefined)
      expect(submittedPlugin?.source_name).toBe(expectedRequests ? 'plugins.json#1' : undefined)
    },
  )

  it.each([
    {
      label: '插件',
      openDelete: () => {
        fireEvent.click(screen.getByRole('button', { name: '删除插件 Plugin A' }))
        return within(screen.getByRole('dialog', { name: '删除远端插件' })).getByRole('button', {
          name: '确认删除',
        })
      },
      revokedPermissions: allPluginPermissions.filter((permission) => permission !== 'plugin.manage'),
      deleteRequest: () => mocks.deleteTeamPlugin,
    },
    {
      label: '分组',
      openDelete: () => {
        fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
        const manager = screen.getByRole('dialog', { name: '管理分类与分组' })
        fireEvent.click(within(manager).getByRole('button', { name: '删除分组 基线' }))
        return within(screen.getByRole('dialog', { name: '删除分组' })).getByRole('button', {
          name: '确认删除',
        })
      },
      revokedPermissions: allPluginPermissions.filter((permission) => permission !== 'plugin_group.manage'),
      deleteRequest: () => mocks.deletePluginGroup,
    },
  ])('撤销$label删除权限后旧确认回调保持零写请求', async ({ deleteRequest, openDelete, revokedPermissions }) => {
    await renderPage()
    const staleDelete = openDelete()

    mocks.getMe.mockResolvedValue(createMeResponse(revokedPermissions, 3, 2))
    act(() => publishTeamPermissionInvalidation(3))
    await waitFor(() => expect(screen.queryByText('确认删除')).not.toBeInTheDocument())
    fireEvent.click(staleDelete)
    await act(async () => Promise.resolve())

    expect(deleteRequest()).not.toHaveBeenCalled()
  })

  it('覆盖文件读取期间撤销插件管理权限后旧导入回调保持零写请求', async () => {
    const fileText = createDeferred<string>()
    const file = {
      name: 'overwrite.json',
      text: vi.fn(() => fileText.promise),
    } as unknown as File
    await renderPage()

    fireEvent.change(screen.getByLabelText('导入插件清单文件'), { target: { files: [file] } })
    await waitFor(() => expect(file.text).toHaveBeenCalled())
    mocks.getMe.mockResolvedValue(
      createMeResponse(
        allPluginPermissions.filter((permission) => permission !== 'plugin.manage'),
        3,
        2,
      ),
    )
    act(() => publishTeamPermissionInvalidation(3))
    await screen.findByTestId('team-plugin-import')

    await act(async () => {
      fileText.resolve(
        JSON.stringify({
          plugins: [{ script_name: '覆盖插件', type: 'yak', content: 'println(10)', overwrite: true }],
        }),
      )
      await fileText.promise
    })

    expect(mocks.importTeamPlugins).not.toHaveBeenCalled()
  }, 15000)

  it('精确权限控制按钮且列表行和导入入口提供稳定测试标识', async () => {
    mocks.getMe.mockResolvedValue(createMeResponse(['plugin.read', 'plugin_group.read']))

    await renderPage()

    expect(screen.getByTestId('team-plugin-row-5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载到本地' })).toBeInTheDocument()
    expect(screen.queryByTestId('team-plugin-import')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '上传本地插件' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '新建远端插件' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '管理分类与分组' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑插件 Plugin A' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除插件 Plugin A' })).not.toBeInTheDocument()
  })

  it('从版本列表选择历史版本，当前插件漂移后仍下载选中的旧正文', async () => {
    await renderPage()

    expect(screen.getByTestId('team-plugin-import')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下载到本地' }))
    const versionDialog = await screen.findByRole('dialog', { name: '选择插件版本' })
    fireEvent.change(within(versionDialog).getByRole('combobox', { name: '插件历史版本' }), {
      target: { value: '1' },
    })

    mocks.listTeamPlugins.mockResolvedValue(createPluginListResponse({ version: 3, file_hash: '3'.repeat(64) }))
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByText('Plugin A')).toBeInTheDocument()

    fireEvent.click(within(versionDialog).getByRole('button', { name: '安装选中版本' }))

    await waitFor(() => expect(mocks.downloadTeamPluginVersion).toHaveBeenCalledWith(3, 5, 1))
    expect(mocks.downloadTeamPlugin).not.toHaveBeenCalled()
    expect(mocks.ipcInvoke).toHaveBeenCalledWith('SaveYakScript', expect.objectContaining({ Content: pluginBody }))
  }, 15000)

  it('版本请求迟到时切换团队会丢弃旧响应且不打开旧弹窗', async () => {
    mocks.listTeams.mockResolvedValue({
      data: [
        { id: 3, name: '研发团队' },
        { id: 4, name: '外部团队' },
      ],
    })
    mocks.getMe.mockResolvedValue({
      data: {
        user: { id: 7, name: '测试用户', status: 'active' },
        memberships: [
          createMeResponse(allPluginPermissions, 3).data.memberships[0],
          createMeResponse(allPluginPermissions, 4).data.memberships[0],
        ],
      },
    })
    const versions = createDeferred<any>()
    mocks.listTeamPluginVersions.mockReturnValueOnce(versions.promise)

    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: '下载到本地' }))
    await waitFor(() => expect(mocks.listTeamPluginVersions).toHaveBeenCalledWith(3, 5, { page: 1, limit: 200 }))

    fireEvent.change(screen.getByRole('combobox', { name: '选择团队' }), { target: { value: '4' } })
    await act(async () => {
      versions.resolve({
        ok: true,
        data: [
          {
            id: 51,
            team_id: 3,
            plugin_id: 5,
            version: 1,
            file_hash: pluginBodyHash,
            change_note: '历史版本',
            created_by: 7,
            created_at: '2026-07-29T12:00:00Z',
          },
        ],
      })
      await versions.promise
    })

    expect(screen.queryByRole('dialog', { name: '选择插件版本' })).not.toBeInTheDocument()
    expect(mocks.downloadTeamPluginVersion).not.toHaveBeenCalled()
  }, 15000)

  it('撤权后旧插件、上传和分类弹窗的确认回调均保持零写入', async () => {
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: '编辑插件 Plugin A' }))
    const pluginDialog = screen.getByRole('dialog', { name: '编辑远端插件' })
    const stalePluginSave = within(pluginDialog).getByRole('button', { name: '保存' })

    fireEvent.click(screen.getByRole('button', { name: '上传本地插件' }))
    const uploadDialog = await screen.findByRole('dialog', { name: '上传本地插件' })
    const staleUpload = within(uploadDialog).getByRole('button', { name: '上传' })

    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const managerDialog = await screen.findByRole('dialog', { name: '管理分类与分组' })
    fireEvent.click(within(managerDialog).getByRole('button', { name: '新建分类' }))
    const filterDialog = screen.getByRole('dialog', { name: '新建分类' })
    fireEvent.change(within(filterDialog).getByRole('textbox', { name: '资源名称' }), {
      target: { value: '撤权分类' },
    })
    const staleFilterSave = within(filterDialog).getByRole('button', { name: '创建' })

    mocks.getMe.mockResolvedValue(createMeResponse(['plugin.read', 'plugin_group.read']))
    act(() => publishTeamPermissionInvalidation(3))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑远端插件' })).not.toBeInTheDocument())

    fireEvent.click(stalePluginSave)
    fireEvent.click(staleUpload)
    fireEvent.click(staleFilterSave)
    await act(async () => Promise.resolve())

    expect(mocks.updateTeamPlugin).not.toHaveBeenCalled()
    expect(mocks.importTeamPlugins).not.toHaveBeenCalled()
    expect(mocks.createPluginCategory).not.toHaveBeenCalled()
  }, 15000)

  it('批量上传部分失败时不得显示全成功通知', async () => {
    mocks.importTeamPlugins.mockResolvedValue({
      data: {
        items: [
          {
            name: '本地插件',
            plugin_name: '本地插件',
            status: 'created',
            remote_plugin_id: 31,
            version: 1,
            content_hash: '1'.repeat(64),
          },
          {
            name: '失败插件',
            plugin_name: '失败插件',
            status: 'failed',
            error: '摘要校验失败',
            remote_plugin_id: 32,
            version: 2,
          },
        ],
      },
    })

    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: '上传本地插件' }))
    const uploadDialog = await screen.findByRole('dialog', { name: '上传本地插件' })
    fireEvent.change(within(uploadDialog).getByRole('listbox', { name: '选择一个或多个本地插件' }), {
      target: { value: '17' },
    })
    fireEvent.click(within(uploadDialog).getByRole('button', { name: '上传' }))

    await waitFor(() => expect(mocks.yakitFailed).toHaveBeenCalledWith(expect.stringContaining('失败 1')))
    expect(mocks.success).not.toHaveBeenCalledWith(expect.stringContaining('已提交 1 个本地插件'))
  }, 15000)

  it('为十一项工具栏和管理表单提供响应式样式', () => {
    const source = readFileSync(resolve(__dirname, '../HubListTeam.module.scss'), 'utf8')

    expect(source).toContain('repeat(6, max-content)')
    expect(source).toContain('@media (max-width: 1600px)')
    expect(source).toContain('@media (max-width: 760px)')
    for (const className of [
      '.actionGroup',
      '.editorForm',
      '.fullWidth',
      '.filterManager',
      '.managerHeader',
      '.managerList',
      '.managerRow',
      '.filterForm',
    ]) {
      expect(source).toContain(className)
    }
  })
})
