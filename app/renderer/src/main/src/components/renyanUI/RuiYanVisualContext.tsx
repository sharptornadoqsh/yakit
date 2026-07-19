import React, { createContext, useContext, useMemo } from 'react'
import { YakitRoute } from '@/enums/yakitRoute'
import emptyTraffic from '@/assets/renyan/empty-traffic.svg'
import emptyRequest from '@/assets/renyan/empty-request.svg'
import emptyScan from '@/assets/renyan/empty-scan.svg'
import emptyPlugin from '@/assets/renyan/empty-plugin.svg'
import emptyRisk from '@/assets/renyan/empty-risk.svg'
import errorState from '@/assets/renyan/error-state.svg'
import offlineState from '@/assets/renyan/offline-state.svg'

export type RuiYanLayout =
  | 'security-dashboard'
  | 'proxy-console'
  | 'query-detail'
  | 'request-response'
  | 'diff-studio'
  | 'scan-workbench'
  | 'protocol-workbench'
  | 'transform-workbench'
  | 'plugin-catalog'
  | 'plugin-studio'
  | 'risk-center'
  | 'scan-results'
  | 'settings-center'
  | 'configuration-center'
  | 'team-administration'
  | 'role-administration'

export interface RuiYanRouteVisual {
  layout: RuiYanLayout
  emptyAsset: string
}

const routeVisuals: Partial<Record<YakitRoute, RuiYanRouteVisual>> = {
  [YakitRoute.NewHome]: {
    layout: 'security-dashboard',
    emptyAsset: emptyRisk,
  },
  [YakitRoute.MITMHacker]: {
    layout: 'proxy-console',
    emptyAsset: emptyTraffic,
  },
  [YakitRoute.DB_HTTPHistory]: {
    layout: 'query-detail',
    emptyAsset: emptyTraffic,
  },
  [YakitRoute.HTTPFuzzer]: {
    layout: 'request-response',
    emptyAsset: emptyRequest,
  },
  [YakitRoute.DataCompare]: {
    layout: 'diff-studio',
    emptyAsset: emptyRequest,
  },
  [YakitRoute.BatchExecutorPage]: {
    layout: 'scan-workbench',
    emptyAsset: emptyScan,
  },
  [YakitRoute.PoC]: {
    layout: 'scan-workbench',
    emptyAsset: emptyScan,
  },
  [YakitRoute.Mod_Brute]: {
    layout: 'protocol-workbench',
    emptyAsset: emptyScan,
  },
  [YakitRoute.Codec]: {
    layout: 'transform-workbench',
    emptyAsset: emptyRequest,
  },
  [YakitRoute.Plugin_Hub]: {
    layout: 'plugin-catalog',
    emptyAsset: emptyPlugin,
  },
  [YakitRoute.AddYakitScript]: {
    layout: 'plugin-studio',
    emptyAsset: emptyPlugin,
  },
  [YakitRoute.DB_Risk]: {
    layout: 'risk-center',
    emptyAsset: emptyRisk,
  },
  [YakitRoute.YakRunner_ScanHistory]: {
    layout: 'scan-results',
    emptyAsset: emptyScan,
  },
  [YakitRoute.Beta_ConfigNetwork]: {
    layout: 'settings-center',
    emptyAsset: emptyRequest,
  },
  [YakitRoute.ConfigManagement]: {
    layout: 'configuration-center',
    emptyAsset: emptyRequest,
  },
  [YakitRoute.AccountAdminPage]: {
    layout: 'team-administration',
    emptyAsset: emptyPlugin,
  },
  [YakitRoute.RoleAdminPage]: {
    layout: 'role-administration',
    emptyAsset: emptyPlugin,
  },
}

const targetRoutes = new Set(Object.keys(routeVisuals))

interface RuiYanVisualValue {
  route: YakitRoute | string
  visual?: RuiYanRouteVisual
  stateAssets: {
    error: string
    offline: string
    empty?: string
  }
}

const RuiYanVisualContext = createContext<RuiYanVisualValue | undefined>(undefined)

export const isRuiYanTargetRoute = (route?: YakitRoute | string) => Boolean(route && targetRoutes.has(route))

export const getRuiYanRouteVisual = (route?: YakitRoute | string) =>
  route ? routeVisuals[route as YakitRoute] : undefined

export const RuiYanVisualProvider: React.FC<React.PropsWithChildren<{ route: YakitRoute | string }>> = (props) => {
  const { route, children } = props
  const visual = getRuiYanRouteVisual(route)
  const value = useMemo<RuiYanVisualValue>(
    () => ({
      route,
      visual,
      stateAssets: { error: errorState, offline: offlineState, empty: visual?.emptyAsset },
    }),
    [route, visual],
  )

  return <RuiYanVisualContext.Provider value={value}>{children}</RuiYanVisualContext.Provider>
}

export const useRuiYanVisual = () => useContext(RuiYanVisualContext)
