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

  it('按目标顺序生成十个一级菜单', () => {
    expect(buildRenyanMenu().map((item) => item.key)).toEqual([
      'workbench',
      'interactive-proxy',
      'traffic-center',
      'vulnerability-detection',
      'brute-force',
      'packet-tools',
      'plugin-center',
      'team-collaboration',
      'project-security',
      'system-settings',
    ])
  })

  it('按产品信息架构生成规定的二级区域', () => {
    const groups = Object.fromEntries(
      buildRenyanMenu().map((group) => [group.key, group.children.map((item) => item.title)]),
    )

    expect(groups['workbench']).toEqual(['安全概览', '最近任务', '风险趋势'])
    expect(groups['interactive-proxy']).toEqual(['代理控制台'])
    expect(groups['traffic-center']).toEqual(['历史流量'])
    expect(groups['vulnerability-detection']).toEqual([
      '通用检测',
      '专项检测',
      '端口检测',
      '扫描结果',
      '风险结果',
      '安全测试报告',
    ])
    expect(groups['brute-force']).toEqual(['爆破任务', '字典管理'])
    expect(groups['packet-tools']).toEqual(['报文重放', 'WebSocket 调试', '报文差异', '编解码'])
    expect(groups['plugin-center']).toEqual(['插件仓库', '批量导入', '插件开发'])
    expect(groups['team-collaboration']).toEqual(['服务连接', '用户管理', '角色权限'])
    expect(groups['project-security']).toEqual(['项目管理', '安全概览', '风险与漏洞', '扫描结果', '客户端测试总览'])
    expect(groups['system-settings']).toEqual([
      '引擎',
      '网络与 DNS',
      'TLS',
      '安全设置',
      '密码策略',
      '第三方应用',
      '日志诊断',
      '快捷键帮助',
      '关于',
    ])
  })

  it('同一一级分组内不出现指向同一目的地的重复入口', () => {
    buildRenyanMenu().forEach((group) => {
      const signatures = flattenRenyanMenu(group.children)
        .filter(isRenyanMenuItemNavigable)
        .map((item) =>
          item.route ? `route:${item.route}:${item.settingsSection ?? ''}` : `action:${item.action ?? ''}`,
        )
      expect(new Set(signatures).size).toBe(signatures.length)
    })
  })

  it('公开已有真实页面并隐藏尚未交付能力', () => {
    const keys = flattenRenyanMenu(buildRenyanMenu()).map((item) => item.key)
    expect(keys).toContain('security-report')
    expect(keys).toContain('managed-client-overview')
    expect(keys).toContain('plugin-batch-import')
    expect(keys).toContain('shortcut-help')
    expect(keys).not.toContain('domestic-crypto')
    expect(keys).not.toContain('plugin-pipeline')
  })

  it('功能标志开启后仍阻止待交付能力导航', () => {
    const menu = buildRenyanMenu({
      featureFlags: {
        domesticCrypto: true,
        pluginPipeline: true,
      },
    })
    const plannedItems = flattenRenyanMenu(menu).filter((item) =>
      ['domestic-crypto', 'plugin-pipeline'].includes(item.key),
    )
    expect(plannedItems).toHaveLength(2)
    plannedItems.forEach((item) => {
      expect(item.deliveryStatus).toBe('planned')
      expect(isRenyanMenuItemNavigable(item)).toBe(false)
    })
  })

  it('用户与角色入口映射到真实页面', () => {
    const items = flattenRenyanMenu(buildRenyanMenu())
    const teamItems = items.filter((item) => ['account-administration', 'role-administration'].includes(item.key))
    expect(teamItems).toHaveLength(2)
    expect(teamItems.map((item) => item.route)).toEqual([YakitRoute.AccountAdminPage, YakitRoute.RoleAdminPage])
    teamItems.forEach((item) => expect(isRenyanMenuItemNavigable(item)).toBe(true))
  })

  it('能力过滤不会保留空的一级菜单', () => {
    const menu = buildRenyanMenu({ capabilities: ['workbench', 'trafficCenter'] })
    expect(menu.map((item) => item.key)).toEqual(['workbench', 'traffic-center'])
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
    expect(labels.get(YakitRoute.MITMHacker)).toBe('代理控制台')
    expect(labels.get(YakitRoute.HTTPFuzzer)).toBe('报文重放')
    expect(labels.get(YakitRoute.DB_HTTPHistory)).toBe('历史流量')
    expect(labels.get(YakitRoute.BatchExecutorPage)).toBe('通用检测')
    expect(labels.get(YakitRoute.Mod_Brute)).toBe('爆破任务')
    expect(labels.get(YakitRoute.DB_Risk)).toBe('风险与漏洞')
    expect(labels.get(YakitRoute.Beta_ConfigNetwork)).toBe('网络与 DNS')
    expect(renyanRouteDisplayMap[YakitRoute.Codec]).toBe('编解码')
    expect(renyanRouteDisplayMap[YakitRoute.DataCompare]).toBe('报文差异')
  })

  it('可靠性序号二十五不建立菜单节点', () => {
    const keys = flattenRenyanMenu(RENYAN_MENU_MODEL).map((item) => item.key)
    expect(keys).not.toContain('reliability')
    expect(keys).not.toContain('requirement-25')
  })
})
