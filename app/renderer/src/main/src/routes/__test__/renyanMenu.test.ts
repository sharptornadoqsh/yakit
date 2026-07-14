import { describe, expect, it } from 'vitest'
import { YakitRoute } from '@/enums/yakitRoute'
import {
  RENYAN_MENU_MODEL,
  buildRenyanMenu,
  buildRenyanRouteLabelMap,
  flattenRenyanMenu,
  isRenyanMenuItemNavigable,
  renyanRouteDisplayMap,
} from '../renyanMenu'

describe('睿眼菜单模型', () => {
  it('为每个菜单节点提供完整配置字段', () => {
    flattenRenyanMenu(RENYAN_MENU_MODEL).forEach((item) => {
      expect(item).toHaveProperty('key')
      expect(item).toHaveProperty('route')
      expect(item).toHaveProperty('title')
      expect(item).toHaveProperty('group')
      expect(item).toHaveProperty('order')
      expect(item).toHaveProperty('requiredCapability')
      expect(item).toHaveProperty('deliveryStatus')
      expect(item).toHaveProperty('featureFlag')
      expect(item).toHaveProperty('children')
    })
  })

  it('按目标顺序生成七个一级菜单', () => {
    expect(buildRenyanMenu().map((item) => item.key)).toEqual([
      'workbench',
      'traffic-analysis',
      'security-testing',
      'toolbox',
      'project-collaboration',
      'result-center',
      'system-management',
    ])
  })

  it('默认隐藏序号十一、十五、十七和二十四对应入口', () => {
    const keys = flattenRenyanMenu(buildRenyanMenu()).map((item) => item.key)
    expect(keys).not.toContain('security-report')
    expect(keys).not.toContain('domestic-crypto')
    expect(keys).not.toContain('plugin-pipeline')
    expect(keys).not.toContain('managed-client-overview')
  })

  it('功能标志开启后保留待交付状态且不可导航', () => {
    const menu = buildRenyanMenu({
      featureFlags: {
        reportExport: true,
        domesticCrypto: true,
        pluginPipeline: true,
        managedClientOverview: true,
      },
    })
    const plannedItems = flattenRenyanMenu(menu).filter((item) =>
      ['security-report', 'domestic-crypto', 'plugin-pipeline', 'managed-client-overview'].includes(item.key),
    )
    expect(plannedItems).toHaveLength(4)
    plannedItems.forEach((item) => {
      expect(item.deliveryStatus).toBe('planned')
      expect(isRenyanMenuItemNavigable(item)).toBe(false)
    })
  })

  it('团队工作区和成员角色显示为待交付状态', () => {
    const items = flattenRenyanMenu(buildRenyanMenu())
    const teamItems = items.filter((item) => ['team-workspace', 'member-roles'].includes(item.key))
    expect(teamItems).toHaveLength(2)
    teamItems.forEach((item) => {
      expect(item.deliveryStatus).toBe('planned')
      expect(isRenyanMenuItemNavigable(item)).toBe(false)
    })
  })

  it('能力过滤不会保留空的一级菜单', () => {
    const menu = buildRenyanMenu({ capabilities: ['workbench', 'trafficAnalysis'] })
    expect(menu.map((item) => item.key)).toEqual(['workbench', 'traffic-analysis'])
  })

  it('所有配置路由均保持为现有枚举值', () => {
    const routes = Object.values(YakitRoute)
    const configuredRoutes = flattenRenyanMenu(RENYAN_MENU_MODEL)
      .map((item) => item.route)
      .filter((route): route is YakitRoute => route !== null)
    expect(configuredRoutes.every((route) => routes.includes(route))).toBe(true)
  })

  it('通过独立显示映射重命名旧路由', () => {
    const labels = buildRenyanRouteLabelMap()
    expect(labels.get(YakitRoute.MITMHacker)).toBe('交互代理')
    expect(labels.get(YakitRoute.HTTPFuzzer)).toBe('报文重放')
    expect(labels.get(YakitRoute.DB_Risk)).toBe('风险与漏洞')
    expect(renyanRouteDisplayMap[YakitRoute.Codec]).toBe('编解码工具')
  })

  it('可靠性序号二十五不建立菜单节点', () => {
    const keys = flattenRenyanMenu(RENYAN_MENU_MODEL).map((item) => item.key)
    expect(keys).not.toContain('reliability')
    expect(keys).not.toContain('requirement-25')
  })
})
