import React from 'react'
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

vi.mock('@/i18n/useI18nNamespaces', () => ({
  useI18nNamespaces: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' },
  }),
}))

vi.mock('@/utils/eventBus/eventBus', () => ({
  default: { emit: vi.fn() },
}))

vi.mock('@/assets/icon/outline', () => ({
  OutlineChevrondoubleleftIcon: () => React.createElement('span'),
  OutlineChevrondoublerightIcon: () => React.createElement('span'),
  OutlineChevrondownIcon: () => React.createElement('span'),
}))

vi.mock('../RenyanNavigation.module.scss', () => ({
  default: new Proxy({}, { get: (_target, property) => String(property) }),
}))

describe('睿眼顶部导航', () => {
  beforeEach(() => {
    testState.currentRoute = YakitRoute.NewHome
  })

  it('活动路由变化时同步一级菜单高亮', () => {
    const { rerender } = render(
      <RenyanNavigation defaultExpand={true} onMenuSelect={vi.fn()} setRouteToLabel={vi.fn()} />,
    )

    const workbench = screen.getByRole('button', { name: '01 工作台' })
    const systemManagement = screen.getByRole('button', { name: '07 系统管理' })
    const trafficAnalysis = screen.getByRole('button', { name: '02 流量分析' })

    expect(workbench).toHaveClass('primary-button-active')
    fireEvent.click(systemManagement)
    expect(systemManagement).toHaveClass('primary-button-active')

    testState.currentRoute = YakitRoute.DB_HTTPHistory
    rerender(<RenyanNavigation defaultExpand={true} onMenuSelect={vi.fn()} setRouteToLabel={vi.fn()} />)

    expect(trafficAnalysis).toHaveClass('primary-button-active')
    expect(systemManagement).not.toHaveClass('primary-button-active')
  })
})
