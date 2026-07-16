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

export interface RuiYanRouteVisual {
  serial: string
  modeLabel: string
  signals: string[]
  layout: RuiYanLayout
  emptyAsset: string
}

const routeVisuals: Partial<Record<YakitRoute, RuiYanRouteVisual>> = {
  [YakitRoute.MITMHacker]: {
    serial: 'TRA-01',
    modeLabel: '代理控制台',
    signals: ['会话监听', '插件策略', '流量审阅'],
    layout: 'proxy-console',
    emptyAsset: emptyTraffic,
  },
  [YakitRoute.DB_HTTPHistory]: {
    serial: 'TRA-02',
    modeLabel: '流量档案',
    signals: ['组合查询', '请求详情', '响应详情'],
    layout: 'query-detail',
    emptyAsset: emptyTraffic,
  },
  [YakitRoute.HTTPFuzzer]: {
    serial: 'TRA-03',
    modeLabel: '报文实验室',
    signals: ['请求编辑', '响应分析', '任务序列'],
    layout: 'request-response',
    emptyAsset: emptyRequest,
  },
  [YakitRoute.DataCompare]: {
    serial: 'TRA-04',
    modeLabel: '差异工作台',
    signals: ['双栏文本', '变更定位', '内容交换'],
    layout: 'diff-studio',
    emptyAsset: emptyRequest,
  },
  [YakitRoute.BatchExecutorPage]: {
    serial: 'TST-01',
    modeLabel: '通用检测',
    signals: ['目标配置', '插件编排', '执行结果'],
    layout: 'scan-workbench',
    emptyAsset: emptyScan,
  },
  [YakitRoute.PoC]: {
    serial: 'TST-02',
    modeLabel: '专项检测',
    signals: ['漏洞分类', '插件筛选', '检测任务'],
    layout: 'scan-workbench',
    emptyAsset: emptyScan,
  },
  [YakitRoute.Mod_Brute]: {
    serial: 'TST-03',
    modeLabel: '协议认证',
    signals: ['协议选择', '凭据配置', '执行结果'],
    layout: 'protocol-workbench',
    emptyAsset: emptyScan,
  },
  [YakitRoute.Codec]: {
    serial: 'BOX-01',
    modeLabel: '数据变换',
    signals: ['算子库', '处理链', '输入输出'],
    layout: 'transform-workbench',
    emptyAsset: emptyRequest,
  },
  [YakitRoute.Plugin_Hub]: {
    serial: 'BOX-02',
    modeLabel: '插件资源',
    signals: ['资源检索', '插件详情', '本地管理'],
    layout: 'plugin-catalog',
    emptyAsset: emptyPlugin,
  },
  [YakitRoute.AddYakitScript]: {
    serial: 'BOX-03',
    modeLabel: '插件开发',
    signals: ['基础信息', '代码编辑', '执行调试'],
    layout: 'plugin-studio',
    emptyAsset: emptyPlugin,
  },
  [YakitRoute.DB_Risk]: {
    serial: 'RES-01',
    modeLabel: '风险中心',
    signals: ['分级过滤', '风险列表', '处置详情'],
    layout: 'risk-center',
    emptyAsset: emptyRisk,
  },
  [YakitRoute.YakRunner_ScanHistory]: {
    serial: 'RES-02',
    modeLabel: '扫描档案',
    signals: ['项目索引', '任务历史', '风险统计'],
    layout: 'scan-results',
    emptyAsset: emptyScan,
  },
  [YakitRoute.Beta_ConfigNetwork]: {
    serial: 'SYS-01',
    modeLabel: '安全设置',
    signals: ['网络策略', '证书配置', '运行参数'],
    layout: 'settings-center',
    emptyAsset: emptyRequest,
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
