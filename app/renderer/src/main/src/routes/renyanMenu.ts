import { YakitRoute } from '@/enums/yakitRoute'

export type RenyanDeliveryStatus = 'available' | 'planned'

export type RenyanCapability =
  | 'workbench'
  | 'trafficAnalysis'
  | 'securityTesting'
  | 'toolbox'
  | 'projectManagement'
  | 'collaborationPreview'
  | 'resultCenter'
  | 'systemManagement'

export type RenyanFeatureFlag =
  | 'teamPreview'
  | 'reportExport'
  | 'domesticCrypto'
  | 'pluginPipeline'
  | 'managedClientOverview'

export type RenyanShellAction = 'changeProject' | 'engineUpdate' | 'about'

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
  'trafficAnalysis',
  'securityTesting',
  'toolbox',
  'projectManagement',
  'collaborationPreview',
  'resultCenter',
  'systemManagement',
]

export const RENYAN_MENU_MODEL: readonly RenyanMenuItem[] = [
  {
    key: 'workbench',
    route: YakitRoute.NewHome,
    title: '工作台',
    titleKey: 'Layout.RenyanShell.menu.workbench',
    group: 'root',
    order: 10,
    requiredCapability: 'workbench',
    deliveryStatus: 'available',
    featureFlag: null,
    children: [],
  },
  {
    key: 'traffic-analysis',
    route: null,
    title: '流量分析',
    titleKey: 'Layout.RenyanShell.menu.trafficAnalysis',
    group: 'root',
    order: 20,
    requiredCapability: 'trafficAnalysis',
    deliveryStatus: 'available',
    featureFlag: null,
    children: [
      {
        key: 'interactive-proxy',
        route: YakitRoute.MITMHacker,
        title: '交互代理',
        titleKey: 'Layout.RenyanShell.menu.interactiveProxy',
        group: 'traffic-analysis',
        order: 10,
        requiredCapability: 'trafficAnalysis',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
      {
        key: 'traffic-history',
        route: YakitRoute.DB_HTTPHistory,
        title: '历史流量',
        titleKey: 'Layout.RenyanShell.menu.trafficHistory',
        group: 'traffic-analysis',
        order: 20,
        requiredCapability: 'trafficAnalysis',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
      {
        key: 'packet-replay',
        route: YakitRoute.HTTPFuzzer,
        title: '报文重放',
        titleKey: 'Layout.RenyanShell.menu.packetReplay',
        group: 'traffic-analysis',
        order: 30,
        requiredCapability: 'trafficAnalysis',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
      {
        key: 'packet-diff',
        route: YakitRoute.DataCompare,
        title: '报文差异分析',
        titleKey: 'Layout.RenyanShell.menu.packetDiff',
        group: 'traffic-analysis',
        order: 40,
        requiredCapability: 'trafficAnalysis',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
    ],
  },
  {
    key: 'security-testing',
    route: null,
    title: '安全测试',
    titleKey: 'Layout.RenyanShell.menu.securityTesting',
    group: 'root',
    order: 30,
    requiredCapability: 'securityTesting',
    deliveryStatus: 'available',
    featureFlag: null,
    children: [
      {
        key: 'general-vulnerability',
        route: YakitRoute.BatchExecutorPage,
        title: '通用漏洞检测',
        titleKey: 'Layout.RenyanShell.menu.generalVulnerability',
        group: 'security-testing',
        order: 10,
        requiredCapability: 'securityTesting',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
      {
        key: 'targeted-vulnerability',
        route: YakitRoute.PoC,
        title: '专项漏洞检测',
        titleKey: 'Layout.RenyanShell.menu.targetedVulnerability',
        group: 'security-testing',
        order: 20,
        requiredCapability: 'securityTesting',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
      {
        key: 'brute-force',
        route: YakitRoute.Mod_Brute,
        title: '爆破测试',
        titleKey: 'Layout.RenyanShell.menu.bruteForce',
        group: 'security-testing',
        order: 30,
        requiredCapability: 'securityTesting',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
    ],
  },
  {
    key: 'toolbox',
    route: null,
    title: '工具箱',
    titleKey: 'Layout.RenyanShell.menu.toolbox',
    group: 'root',
    order: 40,
    requiredCapability: 'toolbox',
    deliveryStatus: 'available',
    featureFlag: null,
    children: [
      {
        key: 'codec',
        route: YakitRoute.Codec,
        title: '编解码工具',
        titleKey: 'Layout.RenyanShell.menu.codec',
        group: 'toolbox',
        order: 10,
        requiredCapability: 'toolbox',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
      {
        key: 'plugin-center',
        route: YakitRoute.Plugin_Hub,
        title: '插件中心',
        titleKey: 'Layout.RenyanShell.menu.pluginCenter',
        group: 'toolbox',
        order: 20,
        requiredCapability: 'toolbox',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
      {
        key: 'plugin-development',
        route: YakitRoute.AddYakitScript,
        title: '插件开发',
        titleKey: 'Layout.RenyanShell.menu.pluginDevelopment',
        group: 'toolbox',
        order: 30,
        requiredCapability: 'toolbox',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
      {
        key: 'domestic-crypto',
        route: YakitRoute.Codec,
        title: '国密算法',
        titleKey: 'Layout.RenyanShell.menu.domesticCrypto',
        group: 'toolbox',
        order: 40,
        requiredCapability: 'toolbox',
        deliveryStatus: 'planned',
        featureFlag: 'domesticCrypto',
        children: [],
      },
      {
        key: 'plugin-pipeline',
        route: YakitRoute.Plugin_Hub,
        title: '插件链路编排',
        titleKey: 'Layout.RenyanShell.menu.pluginPipeline',
        group: 'toolbox',
        order: 50,
        requiredCapability: 'toolbox',
        deliveryStatus: 'planned',
        featureFlag: 'pluginPipeline',
        children: [],
      },
    ],
  },
  {
    key: 'project-collaboration',
    route: null,
    title: '项目与协作',
    titleKey: 'Layout.RenyanShell.menu.projectCollaboration',
    group: 'root',
    order: 50,
    requiredCapability: 'projectManagement',
    deliveryStatus: 'available',
    featureFlag: null,
    children: [
      {
        key: 'local-project',
        route: null,
        title: '本地项目',
        titleKey: 'Layout.RenyanShell.menu.localProject',
        group: 'project-collaboration',
        order: 10,
        requiredCapability: 'projectManagement',
        deliveryStatus: 'available',
        featureFlag: null,
        action: 'changeProject',
        children: [],
      },
      {
        key: 'team-workspace',
        route: null,
        title: '团队工作区',
        titleKey: 'Layout.RenyanShell.menu.teamWorkspace',
        group: 'project-collaboration',
        order: 20,
        requiredCapability: 'collaborationPreview',
        deliveryStatus: 'planned',
        featureFlag: 'teamPreview',
        children: [],
      },
      {
        key: 'member-roles',
        route: null,
        title: '成员与角色',
        titleKey: 'Layout.RenyanShell.menu.memberRoles',
        group: 'project-collaboration',
        order: 30,
        requiredCapability: 'collaborationPreview',
        deliveryStatus: 'planned',
        featureFlag: 'teamPreview',
        children: [],
      },
    ],
  },
  {
    key: 'result-center',
    route: null,
    title: '结果中心',
    titleKey: 'Layout.RenyanShell.menu.resultCenter',
    group: 'root',
    order: 60,
    requiredCapability: 'resultCenter',
    deliveryStatus: 'available',
    featureFlag: null,
    children: [
      {
        key: 'risk-vulnerability',
        route: YakitRoute.DB_Risk,
        title: '风险与漏洞',
        titleKey: 'Layout.RenyanShell.menu.riskVulnerability',
        group: 'result-center',
        order: 10,
        requiredCapability: 'resultCenter',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
      {
        key: 'scan-results',
        route: YakitRoute.YakRunner_ScanHistory,
        title: '扫描结果',
        titleKey: 'Layout.RenyanShell.menu.scanResults',
        group: 'result-center',
        order: 20,
        requiredCapability: 'resultCenter',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
      {
        key: 'security-report',
        route: YakitRoute.DB_Report,
        title: '安全测试报告',
        titleKey: 'Layout.RenyanShell.menu.securityReport',
        group: 'result-center',
        order: 30,
        requiredCapability: 'resultCenter',
        deliveryStatus: 'planned',
        featureFlag: 'reportExport',
        children: [],
      },
      {
        key: 'managed-client-overview',
        route: YakitRoute.Data_Statistics,
        title: '客户端测试总览',
        titleKey: 'Layout.RenyanShell.menu.managedClientOverview',
        group: 'result-center',
        order: 40,
        requiredCapability: 'resultCenter',
        deliveryStatus: 'planned',
        featureFlag: 'managedClientOverview',
        children: [],
      },
    ],
  },
  {
    key: 'system-management',
    route: null,
    title: '系统管理',
    titleKey: 'Layout.RenyanShell.menu.systemManagement',
    group: 'root',
    order: 70,
    requiredCapability: 'systemManagement',
    deliveryStatus: 'available',
    featureFlag: null,
    children: [
      {
        key: 'engine-update',
        route: null,
        title: '引擎与更新',
        titleKey: 'Layout.RenyanShell.menu.engineUpdate',
        group: 'system-management',
        order: 10,
        requiredCapability: 'systemManagement',
        deliveryStatus: 'available',
        featureFlag: null,
        action: 'engineUpdate',
        children: [],
      },
      {
        key: 'security-settings',
        route: YakitRoute.Beta_ConfigNetwork,
        title: '安全设置',
        titleKey: 'Layout.RenyanShell.menu.securitySettings',
        group: 'system-management',
        order: 20,
        requiredCapability: 'systemManagement',
        deliveryStatus: 'available',
        featureFlag: null,
        children: [],
      },
      {
        key: 'about',
        route: null,
        title: '关于',
        titleKey: 'Layout.RenyanShell.menu.about',
        group: 'system-management',
        order: 30,
        requiredCapability: 'systemManagement',
        deliveryStatus: 'available',
        featureFlag: null,
        action: 'about',
        children: [],
      },
    ],
  },
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

export const flattenRenyanMenu = (items: readonly RenyanMenuItem[]): RenyanMenuItem[] => {
  return items.flatMap((item) => [item, ...flattenRenyanMenu(item.children)])
}

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

export const isRenyanMenuItemNavigable = (item: RenyanMenuItem) => {
  return item.deliveryStatus === 'available' && Boolean(item.route || item.action)
}

export const renyanRouteDisplayMap = flattenRenyanMenu(buildRenyanMenu()).reduce<Partial<Record<YakitRoute, string>>>(
  (labels, item) => {
    if (item.route) labels[item.route] = item.title
    return labels
  },
  {},
)
