import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { YakitRoute } from '@/enums/yakitRoute'
import { RenyanNavigation } from '../RenyanNavigation'

vi.mock('@/components/renyanUI/RuiYanUI.module.scss', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}))

vi.mock('@/components/renyanUI/RuiYanPage.module.scss', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}))

const testState = vi.hoisted(() => ({
  currentRoute: '' as YakitRoute | string,
  isLogin: false,
}))
const emit = vi.hoisted(() => vi.fn())
const apiFetchQueryMessage = vi.hoisted(() => vi.fn())

vi.mock('@/store/pageInfo', () => ({
  usePageInfo: (selector: (state: { currentPageTabRouteKey: YakitRoute | string }) => unknown) =>
    selector({ currentPageTabRouteKey: testState.currentRoute }),
}))

vi.mock('@/store', () => ({
  useStore: (selector: (state: { userInfo: Record<string, unknown> }) => unknown) =>
    selector({
      userInfo: {
        isLogin: testState.isLogin,
        role: '',
        companyName: null,
        githubName: null,
        wechatName: null,
        qqName: null,
      },
    }),
}))

vi.mock('@/components/MessageCenter/utils', () => ({ apiFetchQueryMessage }))

vi.mock('@/i18n/useI18nNamespaces', () => ({
  useI18nNamespaces: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' },
  }),
}))

vi.mock('@/utils/eventBus/eventBus', () => ({
  default: { emit },
}))

describe('睿眼顶部导航', () => {
  beforeEach(() => {
    testState.currentRoute = YakitRoute.NewHome
    testState.isLogin = false
    emit.mockReset()
    apiFetchQueryMessage.mockReset()
    apiFetchQueryMessage.mockResolvedValue({ data: [], pagemeta: { total: 0 } })
    window.sessionStorage.clear()
  })

  it('活动路由变化时同步一级菜单高亮', () => {
    const { rerender } = render(
      <RenyanNavigation defaultExpand={true} onMenuSelect={vi.fn()} setRouteToLabel={vi.fn()} />,
    )

    const workbench = screen.getByRole('button', { name: '工作台' })
    const systemManagement = screen.getByRole('button', { name: '系统设置' })
    const trafficAnalysis = screen.getByRole('button', { name: '流量中心' })

    expect(workbench).toHaveAttribute('aria-current', 'page')
    fireEvent.click(systemManagement)
    expect(systemManagement).toHaveAttribute('aria-current', 'page')

    testState.currentRoute = YakitRoute.DB_HTTPHistory
    rerender(<RenyanNavigation defaultExpand={true} onMenuSelect={vi.fn()} setRouteToLabel={vi.fn()} />)

    expect(trafficAnalysis).toHaveAttribute('aria-current', 'page')
    expect(systemManagement).not.toHaveAttribute('aria-current')
  })

  it('二级导航保持单层结构且仅展示具有真实路由或事件的条目', () => {
    const onMenuSelect = vi.fn()
    render(<RenyanNavigation defaultExpand={true} onMenuSelect={onMenuSelect} setRouteToLabel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '交互代理' }))

    expect(screen.getByRole('button', { name: '代理控制台' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '劫持会话' })).toBeEnabled()
    expect(screen.queryByText('页内')).not.toBeInTheDocument()
    expect(screen.queryByText(/MODULE/)).not.toBeInTheDocument()
    expect(onMenuSelect).toHaveBeenCalledWith({ route: YakitRoute.MITMHacker })
  })

  it('二级导航保留直属父入口且不展示其三级节点', () => {
    render(<RenyanNavigation defaultExpand={true} onMenuSelect={vi.fn()} setRouteToLabel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '漏洞检测' }))

    expect(screen.getByRole('button', { name: '通用检测' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '专项检测' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '检测配置' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '插件选择' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '执行日志' })).not.toBeInTheDocument()
  })

  it('系统设置写入目标分区并打开真实网络诊断页面', () => {
    const onMenuSelect = vi.fn()
    render(<RenyanNavigation defaultExpand={true} onMenuSelect={onMenuSelect} setRouteToLabel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '系统设置' }))
    fireEvent.click(screen.getByRole('button', { name: '网络与 DNS' }))

    expect(window.sessionStorage.getItem('ruiyan:settings-section')).toBe('network-dns')
    expect(onMenuSelect).toHaveBeenCalledWith({ route: YakitRoute.Beta_ConfigNetwork })

    onMenuSelect.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '日志诊断' }))
    expect(onMenuSelect).toHaveBeenCalledWith({ route: YakitRoute.Beta_DiagnoseNetwork })
  })

  it('顶部消息入口展示真实未读状态并响应消息中心更新', async () => {
    testState.isLogin = true
    apiFetchQueryMessage.mockResolvedValue({ data: [], pagemeta: { total: 2 } })

    render(<RenyanNavigation defaultExpand={true} onMenuSelect={vi.fn()} setRouteToLabel={vi.fn()} />)

    const notificationButton = screen.getByRole('button', { name: /消息通知/ })
    await waitFor(() => expect(notificationButton).toHaveAttribute('aria-label', '消息通知，有未读消息'))

    window.dispatchEvent(new CustomEvent('ruiyan:message-unread-change', { detail: false }))
    await waitFor(() => expect(notificationButton).toHaveAttribute('aria-label', '消息通知'))
  })
})
