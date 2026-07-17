import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { YakitRoute } from '@/enums/yakitRoute'
import { RenyanNavigation } from '../RenyanNavigation'

const testState = vi.hoisted(() => ({
  currentRoute: '' as YakitRoute | string,
}))

vi.mock('@/store/pageInfo', () => ({
  usePageInfo: (selector: (state: { currentPageTabRouteKey: YakitRoute | string }) => unknown) =>
    selector({ currentPageTabRouteKey: testState.currentRoute }),
}))

vi.mock('@/store', () => ({
  useStore: (selector: (state: { userInfo: Record<string, unknown> }) => unknown) =>
    selector({
      userInfo: { isLogin: false, role: '', companyName: null, githubName: null, wechatName: null, qqName: null },
    }),
}))

vi.mock('@/i18n/useI18nNamespaces', () => ({
  useI18nNamespaces: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' },
  }),
}))

vi.mock('@/utils/eventBus/eventBus', () => ({
  default: { emit: vi.fn() },
}))

describe('睿眼顶部导航', () => {
  beforeEach(() => {
    testState.currentRoute = YakitRoute.NewHome
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
})
