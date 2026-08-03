export const RUIYAN_UI_POLICY = {
  mitm: {
    showRulePluginPanel: false,
    showContentRules: false,
    showDownstreamProxy: false,
    showNoConfigStart: true,
    showAdvancedFilter: false,
    showProcessFilter: false,
    showRowQuickActions: false,
  },
  vulnerabilityDetection: {
    showGroupSelection: false,
  },
  pluginRepository: {
    author: 'RuiYan-Admin',
  },
  projectWorkspace: {
    showStoragePath: false,
  },
} as const

export const resolveRuiYanPluginAuthor = (_author?: string): string => RUIYAN_UI_POLICY.pluginRepository.author

export const resolveRuiYanPluginLogUserName = (userName: string | undefined, isAuthor?: boolean): string =>
  isAuthor ? resolveRuiYanPluginAuthor(userName) : userName || ''

export const getRuiYanMitmDefaultExcludeColumns = (): string[] =>
  RUIYAN_UI_POLICY.mitm.showRowQuickActions ? [] : ['action']

export const resolveRuiYanVulnerabilitySelectionType = (hasSavedGroupSelection: boolean): 'keyword' | 'group' =>
  RUIYAN_UI_POLICY.vulnerabilityDetection.showGroupSelection && hasSavedGroupSelection ? 'group' : 'keyword'
