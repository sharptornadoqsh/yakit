import { YakitRoute } from '@/enums/yakitRoute'

export type RenyanDeliveryStatus = 'available' | 'planned'

export type RenyanCapability =
  | 'workbench'
  | 'interactiveProxy'
  | 'trafficCenter'
  | 'vulnerabilityDetection'
  | 'bruteForce'
  | 'packetTools'
  | 'pluginCenter'
  | 'teamCollaboration'
  | 'projectSecurity'
  | 'systemSettings'

export type RenyanFeatureFlag =
  | 'teamPreview'
  | 'reportExport'
  | 'domesticCrypto'
  | 'pluginPipeline'
  | 'managedClientOverview'

export type RenyanShellAction = 'changeProject' | 'serviceConnection' | 'engineUpdate' | 'diagnostics' | 'about'

export interface RenyanMenuItem {
  key: string
  route: YakitRoute | null
  title: string
  titleKey: string
  group: string
  order: number
  requiredCapability: RenyanCapability | null
  deliveryStatus: RenyanDeliveryStatus
  featureFlag: RenyanFeatureFlag | null
  action?: RenyanShellAction
  children: RenyanMenuItem[]
}

export interface BuildRenyanMenuOptions {
  featureFlags?: Partial<Record<RenyanFeatureFlag, boolean>>
  capabilities?: readonly RenyanCapability[]
}

interface RenyanMenuSeed {
  key: string
  title: string
  route?: YakitRoute
  action?: RenyanShellAction
  deliveryStatus?: RenyanDeliveryStatus
  featureFlag?: RenyanFeatureFlag
  children?: RenyanMenuSeed[]
}

export const RENYAN_SHELL_ENABLED = true

export const RENYAN_SHELL_EVENTS = {
  openAbout: 'openRenyanAbout',
  openEngineUpdate: 'openRenyanEngineUpdate',
  selectNavigationGroup: 'selectRenyanNavigationGroup',
} as const

export const DEFAULT_RENYAN_FEATURE_FLAGS: Record<RenyanFeatureFlag, boolean> = {
  teamPreview: true,
  reportExport: false,
  domesticCrypto: false,
  pluginPipeline: false,
  managedClientOverview: false,
}

export const DEFAULT_RENYAN_CAPABILITIES: readonly RenyanCapability[] = [
  'workbench',
  'interactiveProxy',
  'trafficCenter',
  'vulnerabilityDetection',
  'bruteForce',
  'packetTools',
  'pluginCenter',
  'teamCollaboration',
  'projectSecurity',
  'systemSettings',
]

const createItem = (
  seed: RenyanMenuSeed,
  group: string,
  order: number,
  capability: RenyanCapability,
): RenyanMenuItem => ({
  key: seed.key,
  route: seed.route || null,
  title: seed.title,
  titleKey: `Layout.RenyanShell.menu.${seed.key}`,
  group,
  order,
  requiredCapability: capability,
  deliveryStatus: seed.deliveryStatus || 'available',
  featureFlag: seed.featureFlag || null,
  action: seed.action,
  children: (seed.children || []).map((child, index) => createItem(child, group, (index + 1) * 10, capability)),
})

const createGroup = (seed: RenyanMenuSeed, order: number, capability: RenyanCapability): RenyanMenuItem => {
  const group = createItem(seed, 'root', order, capability)
  return {
    ...group,
    group: 'root',
    children: (seed.children || []).map((child, index) => createItem(child, seed.key, (index + 1) * 10, capability)),
  }
}

export const RENYAN_MENU_MODEL: readonly RenyanMenuItem[] = [
  createGroup(
    {
      key: 'workbench',
      title: '工作台',
      children: [
        { key: 'security-overview', title: '安全概览', route: YakitRoute.NewHome },
        { key: 'recent-tasks', title: '最近任务' },
        { key: 'team-activity', title: '团队动态', deliveryStatus: 'planned', featureFlag: 'teamPreview' },
        { key: 'risk-trend', title: '风险趋势' },
      ],
    },
    10,
    'workbench',
  ),
  createGroup(
    {
      key: 'interactive-proxy',
      title: '交互代理',
      children: [
        { key: 'proxy-console', title: '代理控制台', route: YakitRoute.MITMHacker },
        { key: 'proxy-hijack', title: '劫持会话' },
        { key: 'proxy-rules', title: '拦截规则' },
        { key: 'proxy-certificates', title: '证书与代理设置' },
      ],
    },
    20,
    'interactiveProxy',
  ),
  createGroup(
    {
      key: 'traffic-center',
      title: '流量中心',
      children: [
        { key: 'traffic-history', title: '历史流量', route: YakitRoute.DB_HTTPHistory },
        { key: 'traffic-request', title: '请求详情' },
        { key: 'traffic-response', title: '响应详情' },
        { key: 'traffic-filter', title: '流量筛选' },
      ],
    },
    30,
    'trafficCenter',
  ),
  createGroup(
    {
      key: 'vulnerability-detection',
      title: '漏洞检测',
      children: [
        {
          key: 'general-vulnerability',
          title: '通用检测',
          route: YakitRoute.BatchExecutorPage,
          children: [{ key: 'general-scan-config', title: '检测配置' }],
        },
        {
          key: 'targeted-vulnerability',
          title: '专项检测',
          route: YakitRoute.PoC,
          children: [
            { key: 'target-plugin-select', title: '插件选择' },
            { key: 'target-execution-log', title: '执行日志' },
          ],
        },
        { key: 'detection-tasks', title: '检测任务' },
        { key: 'risk-results', title: '风险结果' },
        {
          key: 'security-report',
          title: '安全测试报告',
          route: YakitRoute.DB_Report,
          deliveryStatus: 'planned',
          featureFlag: 'reportExport',
        },
      ],
    },
    40,
    'vulnerabilityDetection',
  ),
  createGroup(
    {
      key: 'brute-force',
      title: '爆破测试',
      children: [
        {
          key: 'brute-console',
          title: '爆破任务',
          route: YakitRoute.Mod_Brute,
          children: [{ key: 'brute-protocols', title: '协议配置' }],
        },
        { key: 'dictionary-management', title: '字典管理', route: YakitRoute.ConfigManagement },
        { key: 'brute-results', title: '命中结果' },
        { key: 'brute-log', title: '执行日志' },
      ],
    },
    50,
    'bruteForce',
  ),
  createGroup(
    {
      key: 'packet-tools',
      title: '报文工具',
      children: [
        { key: 'packet-replay', title: '报文重放', route: YakitRoute.HTTPFuzzer },
        { key: 'packet-diff', title: '报文差异', route: YakitRoute.DataCompare },
        { key: 'packet-codec', title: '编解码', route: YakitRoute.Codec },
        { key: 'packet-history', title: '操作历史' },
        {
          key: 'domestic-crypto',
          title: '高级国密工具',
          deliveryStatus: 'planned',
          featureFlag: 'domesticCrypto',
        },
      ],
    },
    60,
    'packetTools',
  ),
  createGroup(
    {
      key: 'plugin-center',
      title: '插件中心',
      children: [
        {
          key: 'plugin-hub',
          title: '插件仓库',
          route: YakitRoute.Plugin_Hub,
          children: [{ key: 'plugin-batch-import', title: '批量导入' }],
        },
        { key: 'plugin-installed', title: '已安装插件' },
        { key: 'plugin-local', title: '本地插件' },
        {
          key: 'plugin-development',
          title: '插件开发',
          route: YakitRoute.AddYakitScript,
          children: [{ key: 'plugin-debug', title: '调试控制台' }],
        },
        { key: 'plugin-run-log', title: '插件日志' },
        { key: 'plugin-config', title: '插件配置' },
        {
          key: 'plugin-pipeline',
          title: '插件链路编排',
          deliveryStatus: 'planned',
          featureFlag: 'pluginPipeline',
        },
      ],
    },
    70,
    'pluginCenter',
  ),
  createGroup(
    {
      key: 'team-collaboration',
      title: '团队协作',
      children: [
        { key: 'service-connection', title: '服务连接', action: 'serviceConnection' },
        {
          key: 'account-administration',
          title: '用户管理',
          route: YakitRoute.AccountAdminPage,
        },
        { key: 'role-administration', title: '角色权限', route: YakitRoute.RoleAdminPage },
        { key: 'organization-administration', title: '组织管理' },
        {
          key: 'collaboration-activity',
          title: '团队动态',
          deliveryStatus: 'planned',
          featureFlag: 'teamPreview',
        },
      ],
    },
    80,
    'teamCollaboration',
  ),
  createGroup(
    {
      key: 'project-security',
      title: '项目与安全',
      children: [
        {
          key: 'project-management',
          title: '项目管理',
          action: 'changeProject',
        },
        { key: 'project-security-overview', title: '安全概览' },
        { key: 'risk-overview', title: '风险与漏洞', route: YakitRoute.DB_Risk },
        { key: 'scan-results', title: '扫描结果', route: YakitRoute.YakRunner_ScanHistory },
        { key: 'project-import-export', title: '项目导入导出' },
        {
          key: 'managed-client-overview',
          title: '客户端测试总览',
          route: YakitRoute.Data_Statistics,
          deliveryStatus: 'planned',
          featureFlag: 'managedClientOverview',
        },
      ],
    },
    90,
    'projectSecurity',
  ),
  createGroup(
    {
      key: 'system-settings',
      title: '系统设置',
      children: [
        { key: 'engine-update', title: '引擎与更新', action: 'engineUpdate' },
        { key: 'network-dns', title: '网络与 DNS' },
        { key: 'tls-client', title: 'TLS 客户端' },
        {
          key: 'security-settings',
          title: '安全设置',
          route: YakitRoute.Beta_ConfigNetwork,
        },
        { key: 'password-policy', title: '密码策略' },
        { key: 'third-party-settings', title: '第三方应用' },
        { key: 'diagnostics', title: '日志和诊断', action: 'diagnostics' },
        { key: 'about', title: '关于', action: 'about' },
      ],
    },
    100,
    'systemSettings',
  ),
]

const sortMenu = (items: RenyanMenuItem[]) => [...items].sort((a, b) => a.order - b.order)

export const buildRenyanMenu = (options: BuildRenyanMenuOptions = {}): RenyanMenuItem[] => {
  const featureFlags = { ...DEFAULT_RENYAN_FEATURE_FLAGS, ...options.featureFlags }
  const capabilities = new Set(options.capabilities || DEFAULT_RENYAN_CAPABILITIES)

  const filterItem = (item: RenyanMenuItem): RenyanMenuItem | null => {
    if (item.featureFlag && !featureFlags[item.featureFlag]) return null
    if (item.requiredCapability && !capabilities.has(item.requiredCapability)) return null

    const children = sortMenu(item.children.map(filterItem).filter((child): child is RenyanMenuItem => child !== null))
    if (!item.route && !item.action && item.children.length > 0 && children.length === 0) return null

    return { ...item, children }
  }

  return sortMenu(
    RENYAN_MENU_MODEL.map((item) => filterItem(item)).filter((item): item is RenyanMenuItem => item !== null),
  )
}

export const flattenRenyanMenu = (items: readonly RenyanMenuItem[]): RenyanMenuItem[] =>
  items.flatMap((item) => [item, ...flattenRenyanMenu(item.children)])

export const buildRenyanRouteLabelMap = (items: readonly RenyanMenuItem[] = buildRenyanMenu()) => {
  const labels = new Map<string, string>()
  flattenRenyanMenu(items).forEach((item) => {
    if (item.route) labels.set(item.route, item.title)
  })
  return labels
}

export const findRenyanMenuPath = (
  route: YakitRoute | string,
  items: readonly RenyanMenuItem[] = buildRenyanMenu(),
): RenyanMenuItem[] => {
  for (const item of items) {
    if (item.route === route) return [item]
    const childPath = findRenyanMenuPath(route, item.children)
    if (childPath.length > 0) return [item, ...childPath]
  }
  return []
}

export const isRenyanMenuItemNavigable = (item: RenyanMenuItem) =>
  item.deliveryStatus === 'available' && Boolean(item.route || item.action)

export const renyanRouteDisplayMap = flattenRenyanMenu(buildRenyanMenu()).reduce<Partial<Record<YakitRoute, string>>>(
  (labels, item) => {
    if (item.route) labels[item.route] = item.title
    return labels
  },
  {},
)
