import React from 'react'
import { readFileSync } from 'fs'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createPluginCategory: vi.fn(),
  createPluginGroup: vi.fn(),
  createTeamPlugin: vi.fn(),
  deletePluginCategory: vi.fn(),
  deletePluginGroup: vi.fn(),
  deleteTeamPlugin: vi.fn(),
  getTeamPlugin: vi.fn(),
  ipcInvoke: vi.fn(),
  listPluginCategories: vi.fn(),
  listPluginGroups: vi.fn(),
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
  revision: 3,
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
  downloadTeamPlugin: vi.fn(),
  getTeamPlugin: mocks.getTeamPlugin,
  importTeamPlugins: vi.fn(),
  listPluginCategories: mocks.listPluginCategories,
  listPluginGroups: mocks.listPluginGroups,
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
  YakitModal: ({ children, footer, okText = '确定', cancelText = '取消', onCancel, onOk, title, visible }) =>
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
            <button type="button" onClick={onOk}>
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
  Table: ({ columns, dataSource = [] as MockTableRecord[], pagination, rowSelection }) => (
    <>
      <span data-testid="plugin-total">{pagination?.total}</span>
      <table>
        <tbody>
          {dataSource.map((record) => (
            <tr key={record.id}>
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
  Upload: ({ children }) => <div>{children}</div>,
}))

vi.mock('@/utils/notification', () => ({
  success: mocks.success,
  yakitFailed: mocks.yakitFailed,
}))

vi.mock('@/pages/plugins/utils', () => ({
  apiFetchSaveYakScriptGroupLocal: vi.fn(),
  apiQueryYakScriptBase: vi.fn(),
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
    vi.clearAllMocks()
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: () => ({ ipcRenderer: { invoke: mocks.ipcInvoke } }),
    })
    mocks.listTeams.mockResolvedValue({ data: [{ id: 3, name: '研发团队' }] })
    mocks.listPluginCategories.mockResolvedValue({
      data: [{ id: 4, name: 'Web', description: 'Web 插件', sort_order: 1, status: 'active' }],
    })
    mocks.listPluginGroups.mockResolvedValue({
      data: [{ id: 9, name: '基线', description: '基线插件', sort_order: 2, status: 'active' }],
    })
    mocks.listTeamPlugins.mockResolvedValue(createPluginListResponse())
    mocks.getTeamPlugin.mockResolvedValue({ data: createPluginRecord() })
    for (const mock of [
      mocks.createPluginCategory,
      mocks.createPluginGroup,
      mocks.createTeamPlugin,
      mocks.deletePluginCategory,
      mocks.deletePluginGroup,
      mocks.deleteTeamPlugin,
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

  it('删除分类前清除全部分页插件引用', async () => {
    mocks.listTeamPlugins.mockImplementation((_teamId, params = {}) => {
      if (params.category_id !== 4) return Promise.resolve(createPluginListResponse())
      return Promise.resolve({
        data: [createPluginRecord({ id: params.page === 1 ? 5 : 6, revision: params.page === 1 ? 3 : 7 })],
        paging: { total: 2 },
      })
    })
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })

    fireEvent.click(within(manager).getByRole('button', { name: '删除分类 Web' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '删除分类' })).getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(mocks.deletePluginCategory).toHaveBeenCalledWith(3, 4, { cascade: true }))
    expect(mocks.updateTeamPlugin).toHaveBeenCalledWith(3, 5, { category_id: 0, revision: 3 })
    expect(mocks.updateTeamPlugin).toHaveBeenCalledWith(3, 6, { category_id: 0, revision: 7 })
    expect(mocks.updateTeamPlugin.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.deletePluginCategory.mock.invocationCallOrder[0],
    )
  })

  it('删除分组前清除全部分页插件引用', async () => {
    mocks.listTeamPlugins.mockImplementation((_teamId, params = {}) => {
      if (params.group_id !== 9) return Promise.resolve(createPluginListResponse())
      return Promise.resolve({
        data: [createPluginRecord({ id: params.page === 1 ? 5 : 6, revision: params.page === 1 ? 3 : 7 })],
        paging: { total: 2 },
      })
    })
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })

    fireEvent.click(within(manager).getByRole('button', { name: '删除分组 基线' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '删除分组' })).getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(mocks.deletePluginGroup).toHaveBeenCalledWith(3, 9, { cascade: true }))
    expect(mocks.unbindPluginGroup).toHaveBeenCalledWith(3, 5, 9)
    expect(mocks.unbindPluginGroup).toHaveBeenCalledWith(3, 6, 9)
    expect(mocks.unbindPluginGroup.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.deletePluginGroup.mock.invocationCallOrder[0],
    )
  })

  it.each([
    {
      kind: '分类',
      itemName: 'Web',
      failCleanup: () => mocks.updateTeamPlugin.mockRejectedValueOnce(new Error('解除引用失败')),
      deleteResource: () => mocks.deletePluginCategory,
    },
    {
      kind: '分组',
      itemName: '基线',
      failCleanup: () => mocks.unbindPluginGroup.mockRejectedValueOnce(new Error('解除引用失败')),
      deleteResource: () => mocks.deletePluginGroup,
    },
  ])('清除$kind引用失败时不删除目标资源', async ({ deleteResource, failCleanup, itemName, kind }) => {
    await renderPage()
    failCleanup()
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })

    fireEvent.click(within(manager).getByRole('button', { name: `删除${kind} ${itemName}` }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: `删除${kind}` })).getByRole('button', { name: '确认删除' }),
    )

    await waitFor(() => expect(mocks.yakitFailed).toHaveBeenCalledWith(`删除${kind}失败：解除引用失败`))
    expect(deleteResource()).not.toHaveBeenCalled()
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
      failingList: () => mocks.listPluginCategories,
    },
    {
      kind: '分组',
      itemName: '基线',
      failingList: () => mocks.listPluginGroups,
    },
  ])(
    '删除$kind后的筛选刷新失败可通过重新打开管理窗口恢复',
    async ({ failingList, itemName, kind }) => {
      mocks.listTeamPlugins.mockResolvedValue(createPluginListResponse({ category_id: 0, group_ids: [] }))
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
      const manager = screen.getByRole('dialog', { name: '管理分类与分组' })
      failingList().mockRejectedValueOnce(new Error('管理数据刷新失败'))

      fireEvent.click(within(manager).getByRole('button', { name: `删除${kind} ${itemName}` }))
      fireEvent.click(
        within(screen.getByRole('dialog', { name: `删除${kind}` })).getByRole('button', { name: '确认删除' }),
      )

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(`删除${kind}已提交，但分类与分组刷新失败`),
      )
      fireEvent.click(within(manager).getByRole('button', { name: '关闭' }))
      fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))

      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    },
    10000,
  )

  it('双重刷新失败时只清除已成功刷新的错误状态', async () => {
    mocks.listTeamPlugins.mockResolvedValue(createPluginListResponse({ category_id: 0, group_ids: [] }))
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
    const manager = screen.getByRole('dialog', { name: '管理分类与分组' })
    mocks.listPluginCategories.mockRejectedValueOnce(new Error('筛选刷新失败'))
    let rejectPluginRefresh = true
    mocks.listTeamPlugins.mockImplementation((_teamId, params = {}) => {
      if (params.category_id === 4) return Promise.resolve({ data: [], paging: { total: 0 } })
      if (rejectPluginRefresh) {
        rejectPluginRefresh = false
        return Promise.reject(new Error('插件刷新失败'))
      }
      return Promise.resolve(createPluginListResponse({ category_id: 0, group_ids: [] }))
    })

    fireEvent.click(within(manager).getByRole('button', { name: '删除分类 Web' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '删除分类' })).getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('删除分类已提交，但页面数据刷新失败'))
    fireEvent.click(within(manager).getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('删除分类已提交，但插件列表刷新失败'))
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  }, 10000)

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

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('更新远端插件已提交，但插件列表刷新失败')
      expect(screen.getByRole('status')).toHaveTextContent('创建分类已提交，但分类与分组刷新失败')
    })

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('创建分类已提交，但分类与分组刷新失败')
      expect(screen.getByRole('status')).not.toHaveTextContent('更新远端插件已提交')
    })

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
    },
    {
      kind: '分组',
      filterLabel: '全部分组',
      itemName: '基线',
      queryField: 'group_id',
      value: 9,
    },
  ])(
    '删除当前$kind后清除筛选并使用新查询刷新插件',
    async ({ filterLabel, itemName, kind, queryField, value }) => {
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

      fireEvent.click(screen.getByRole('button', { name: '管理分类与分组' }))
      const manager = screen.getByRole('dialog', { name: '管理分类与分组' })
      fireEvent.click(within(manager).getByRole('button', { name: `删除${kind} ${itemName}` }))
      const deleteDialog = screen.getByRole('dialog', { name: `删除${kind}` })
      fireEvent.click(within(deleteDialog).getByRole('button', { name: '确认删除' }))

      await waitFor(() => expect(mocks.listTeamPlugins).toHaveBeenLastCalledWith(3, { page: 1, limit: 20 }))
      expect(screen.getByLabelText(filterLabel)).toHaveValue('')
    },
    10000,
  )

  it('为十一项工具栏和管理表单提供响应式样式', () => {
    const source = readFileSync(
      'app/renderer/src/main/src/pages/pluginHub/pluginHubList/HubListTeam.module.scss',
      'utf8',
    )

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
