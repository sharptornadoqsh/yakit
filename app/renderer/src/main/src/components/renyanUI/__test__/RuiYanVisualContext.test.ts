import { describe, expect, it } from 'vitest'
import { YakitRoute } from '@/enums/yakitRoute'
import { getRuiYanRouteVisual, isRuiYanTargetRoute } from '../RuiYanVisualContext'

describe('RuiYanVisualContext', () => {
  it.each([
    [YakitRoute.DB_Report, 'query-detail'],
    [YakitRoute.Mod_ScanPort, 'scan-workbench'],
    [YakitRoute.Plugin_Audit, 'plugin-catalog'],
    [YakitRoute.YakRunner_Audit_Hole, 'risk-center'],
    [YakitRoute.Beta_DiagnoseNetwork, 'settings-center'],
    [YakitRoute.ShortcutKey, 'configuration-center'],
  ])('为真实业务路由提供统一视觉上下文', (route, layout) => {
    expect(isRuiYanTargetRoute(route)).toBe(true)
    expect(getRuiYanRouteVisual(route)?.layout).toBe(layout)
  })

  it('不为未知路由创建视觉上下文', () => {
    expect(isRuiYanTargetRoute('unknown-route')).toBe(false)
    expect(getRuiYanRouteVisual('unknown-route')).toBeUndefined()
  })
})
