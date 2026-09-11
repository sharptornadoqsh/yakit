import React, { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginHubList } from '../PluginHubList'
import emiter from '@/utils/eventBus/eventBus'

const state = vi.hoisted(() => ({
  pageInfo: undefined as any,
  detail: vi.fn(),
  queryPagesDataById: vi.fn(),
  removePagesDataCacheById: vi.fn(),
}))

vi.mock('@/store', () => ({ useStore: (selector: any) => selector({ userInfo: { isLogin: true } }) }))
vi.mock('@/store/pageInfo', () => ({
  usePageInfo: (selector: any) => selector(state),
}))
vi.mock('@/utils/tool', () => ({ JSONParseLog: JSON.parse }))
vi.mock('@/i18n/useI18nNamespaces', () => ({
  useI18nNamespaces: () => ({ t: (key: string) => key }),
}))
vi.mock('../PluginHubList.module.scss', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}))
vi.mock('../../defaultConstant', () => ({
  HubSideBarList: ['online', 'local', 'own', 'setting', 'recycle'].map((value) => ({ value, label: value })),
}))
vi.mock('../HubListOnline', () => ({
  HubListOnline: ({ hiddenFilter, onPluginDetail, onChangeLocal }: any) => (
    <section aria-label="online-list">
      <div hidden={hiddenFilter}>online-filter</div>
      <button onClick={() => onPluginDetail({ type: 'online', name: 'sample-plugin' })}>plugin-detail</button>
      <button onClick={() => onChangeLocal({ keyword: 'sample-plugin' })}>search-local</button>
    </section>
  ),
}))
vi.mock('../HubListLocal', () => ({
  HubListLocal: ({ hiddenFilter, externalSearchParams }: any) => (
    <section aria-label="local-list">
      <div hidden={hiddenFilter}>local-filter</div>
      <span>{externalSearchParams?.keyword}</span>
    </section>
  ),
}))
vi.mock('../HubListOwn', () => ({ HubListOwn: () => null }))
vi.mock('../HubListTeam', () => ({ HubListTeam: () => null }))
vi.mock('../HubListRecycle', () => ({ HubListRecycle: () => null }))
vi.mock('../../pluginEnvVariables/PluginEnvVariables', () => ({ PluginEnvVariables: () => null }))

const Harness = () => {
  const [active, setActive] = useState<any>()
  return (
    <PluginHubList
      active={active}
      setActive={setActive}
      isDetail={false}
      toPluginDetail={state.detail}
      setHiddenDetailPage={() => {}}
    />
  )
}

const expand = () => screen.getByRole('button', { name: 'PluginHubList.expandAdvancedFilter' })
const collapse = () => screen.getByRole('button', { name: 'PluginHubList.collapseAdvancedFilter' })

beforeEach(() => {
  vi.clearAllMocks()
  state.pageInfo = undefined
  state.queryPagesDataById.mockImplementation(() => state.pageInfo)
})
afterEach(cleanup)

describe('插件仓库高级筛选', () => {
  it('首次进入时收起筛选并保留插件列表', () => {
    render(<Harness />)
    expect(expand()).toBeInTheDocument()
    expect(screen.getByText('online-filter')).not.toBeVisible()
    expect(screen.getByRole('button', { name: 'plugin-detail' })).toBeVisible()
  })

  it('支持用户主动展开后再次收起', () => {
    render(<Harness />)
    fireEvent.click(expand())
    expect(screen.getByText('online-filter')).toBeVisible()
    fireEvent.click(collapse())
    expect(screen.getByText('online-filter')).not.toBeVisible()
  })

  it('切换插件来源时使用收起状态', () => {
    render(<Harness />)
    if (screen.queryByRole('button', { name: 'PluginHubList.expandAdvancedFilter' })) fireEvent.click(expand())
    fireEvent.click(screen.getByRole('tab', { name: 'local' }))
    expect(expand()).toBeInTheDocument()
    expect(screen.getByText('local-filter')).not.toBeVisible()
  })

  it('从设置返回插件来源时不会自动展开', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('tab', { name: 'setting' }))
    fireEvent.click(screen.getByRole('tab', { name: 'online' }))
    expect(expand()).toBeInTheDocument()
    expect(screen.getByText('online-filter')).not.toBeVisible()
  })

  it('点击插件详情时保持已收起状态', () => {
    render(<Harness />)
    const opened = screen.queryByRole('button', { name: 'PluginHubList.collapseAdvancedFilter' })
    if (opened) fireEvent.click(opened)
    fireEvent.click(screen.getByRole('button', { name: 'plugin-detail' }))
    expect(state.detail).toHaveBeenCalledWith({ type: 'online', name: 'sample-plugin' })
    expect(screen.getByText('online-filter')).not.toBeVisible()
    expect(expand()).toBeInTheDocument()
  })

  it('点击详情不会撤销用户主动展开的筛选', () => {
    render(<Harness />)
    const closed = screen.queryByRole('button', { name: 'PluginHubList.expandAdvancedFilter' })
    if (closed) fireEvent.click(closed)
    fireEvent.click(screen.getByRole('button', { name: 'plugin-detail' }))
    expect(screen.getByText('online-filter')).toBeVisible()
  })

  it('带条件跳转到本地时保留查询条件且收起筛选', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'search-local' }))
    expect(screen.getByText('sample-plugin')).toBeInTheDocument()
    expect(screen.getByText('local-filter')).not.toBeVisible()
    expect(expand()).toBeInTheDocument()
  })

  it('通过缓存恢复指定列表时默认收起', () => {
    state.pageInfo = { pageParamsInfo: { pluginHubPageInfo: { tabActive: 'local' } } }
    render(<Harness />)
    expect(screen.getByRole('tab', { name: 'local' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('local-filter')).not.toBeVisible()
    expect(expand()).toBeInTheDocument()
  })

  it('外部打开列表事件不会展开高级筛选', () => {
    render(<Harness />)
    act(() => emiter.emit('openPluginHubListAndDetail', JSON.stringify({ tabActive: 'local' })))
    expect(screen.getByText('local-filter')).not.toBeVisible()
    expect(expand()).toBeInTheDocument()
  })
})
