import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  OutlineArrowrightIcon,
  OutlineBugIcon,
  OutlineChartbarIcon,
  OutlineCodeIcon,
  OutlineCollectionIcon,
  OutlineDatabaseIcon,
  OutlineDesktopcomputerIcon,
  OutlineLightningboltIcon,
  OutlineRefreshIcon,
  OutlineServerIcon,
  OutlineShieldcheckIcon,
  OutlineStatusonlineIcon,
  OutlineSwitchhorizontalIcon,
  OutlineUsersIcon,
} from '@/assets/icon/outline'
import { YakitRoute } from '@/enums/yakitRoute'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import emiter from '@/utils/eventBus/eventBus'
import { getEnvTypeByProjects } from '../softwareSettings/ProjectManage'
import type { ProjectDescription } from '../softwareSettings/ProjectManage'
import type { YakQueryHTTPFlowResponse } from '@/components/HTTPFlowTable/HTTPFlowTable'
import type { Fields } from '../risks/RiskTable'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import { RenyanState } from '@/components/yakitUI/RenyanState/RenyanState'
import { RENYAN_SHELL_EVENTS } from '@/routes/renyanMenu'
import { mapRenyanHomeMetrics, RenyanHomeMetricSnapshot } from './homeMetrics'
import styles from './home.module.scss'

const { ipcRenderer } = window.require('electron')

type QueryStatus = 'loading' | 'ready' | 'error'

interface DashboardState {
  metrics: RenyanHomeMetricSnapshot
  projectStatus: QueryStatus
  trafficStatus: QueryStatus
  riskStatus: QueryStatus
}

interface QuickEntry {
  key: string
  title: string
  description: string
  route: YakitRoute
  icon: React.ReactNode
}

const EMPTY_METRICS = mapRenyanHomeMetrics({})

const Home: React.FC = () => {
  const { t } = useI18nNamespaces(['home'])
  const requestIdRef = useRef(0)
  const [dashboard, setDashboard] = useState<DashboardState>({
    metrics: EMPTY_METRICS,
    projectStatus: 'loading',
    trafficStatus: 'loading',
    riskStatus: 'loading',
  })

  const openRoute = useCallback((route: YakitRoute) => {
    emiter.emit('menuOpenPage', JSON.stringify({ route }))
  }, [])

  const loadDashboard = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setDashboard((current) => ({
      ...current,
      projectStatus: 'loading',
      trafficStatus: 'loading',
      riskStatus: 'loading',
    }))

    const [projectResult, trafficResult, riskResult] = await Promise.allSettled([
      ipcRenderer.invoke('GetCurrentProjectEx', { Type: getEnvTypeByProjects() }) as Promise<ProjectDescription>,
      ipcRenderer.invoke('QueryHTTPFlows', {
        SourceType: 'mitm,scan,basic-crawler',
        WithPayload: false,
        Pagination: {
          Page: 1,
          Limit: 1,
          Order: 'desc',
          OrderBy: 'Id',
        },
      }) as Promise<YakQueryHTTPFlowResponse>,
      ipcRenderer.invoke('QueryAvailableRiskLevel', {}) as Promise<Fields>,
    ])

    if (requestIdRef.current !== requestId) return

    const project = projectResult.status === 'fulfilled' ? projectResult.value : null
    const trafficTotal = trafficResult.status === 'fulfilled' ? trafficResult.value.Total : undefined
    const riskLevels = riskResult.status === 'fulfilled' ? riskResult.value.Values : null

    setDashboard({
      metrics: mapRenyanHomeMetrics({ project, trafficTotal, riskLevels }),
      projectStatus: projectResult.status === 'fulfilled' ? 'ready' : 'error',
      trafficStatus: trafficResult.status === 'fulfilled' ? 'ready' : 'error',
      riskStatus: riskResult.status === 'fulfilled' ? 'ready' : 'error',
    })
  }, [])

  useEffect(() => {
    loadDashboard()
    return () => {
      requestIdRef.current += 1
    }
  }, [loadDashboard])

  const trafficEntries = useMemo<QuickEntry[]>(
    () => [
      {
        key: 'traffic-proxy',
        title: t('Home.Renyan.interactiveProxy'),
        description: t('Home.Renyan.interactiveProxyDescription'),
        route: YakitRoute.MITMHacker,
        icon: <OutlineSwitchhorizontalIcon />,
      },
      {
        key: 'traffic-history',
        title: t('Home.Renyan.trafficHistory'),
        description: t('Home.Renyan.trafficHistoryDescription'),
        route: YakitRoute.DB_HTTPHistory,
        icon: <OutlineDatabaseIcon />,
      },
      {
        key: 'packet-replay',
        title: t('Home.Renyan.packetReplay'),
        description: t('Home.Renyan.packetReplayDescription'),
        route: YakitRoute.HTTPFuzzer,
        icon: <OutlineLightningboltIcon />,
      },
      {
        key: 'packet-diff',
        title: t('Home.Renyan.packetDiff'),
        description: t('Home.Renyan.packetDiffDescription'),
        route: YakitRoute.DataCompare,
        icon: <OutlineCollectionIcon />,
      },
    ],
    [t],
  )

  const securityEntries = useMemo<QuickEntry[]>(
    () => [
      {
        key: 'general-scan',
        title: t('Home.Renyan.generalScan'),
        description: t('Home.Renyan.generalScanDescription'),
        route: YakitRoute.BatchExecutorPage,
        icon: <OutlineShieldcheckIcon />,
      },
      {
        key: 'targeted-scan',
        title: t('Home.Renyan.targetedScan'),
        description: t('Home.Renyan.targetedScanDescription'),
        route: YakitRoute.PoC,
        icon: <OutlineBugIcon />,
      },
      {
        key: 'brute-test',
        title: t('Home.Renyan.bruteTest'),
        description: t('Home.Renyan.bruteTestDescription'),
        route: YakitRoute.Mod_Brute,
        icon: <OutlineCodeIcon />,
      },
      {
        key: 'scan-results',
        title: t('Home.Renyan.scanResults'),
        description: t('Home.Renyan.scanResultsDescription'),
        route: YakitRoute.YakRunner_ScanHistory,
        icon: <OutlineChartbarIcon />,
      },
    ],
    [t],
  )

  const renderQuickEntries = (entries: QuickEntry[]) => (
    <div className={styles['quick-grid']}>
      {entries.map((entry) => (
        <button
          type="button"
          key={entry.key}
          className={styles['quick-entry']}
          data-home-entry={entry.key}
          onClick={() => openRoute(entry.route)}
        >
          <span className={styles['quick-icon']}>{entry.icon}</span>
          <span className={styles['quick-copy']}>
            <strong>{entry.title}</strong>
            <small>{entry.description}</small>
          </span>
          <OutlineArrowrightIcon className={styles['quick-arrow']} />
        </button>
      ))}
    </div>
  )

  const renderProjectOverview = () => {
    if (dashboard.projectStatus === 'loading') return <RenyanState type="loading" compact />
    if (dashboard.projectStatus === 'error') {
      return (
        <RenyanState
          type="error"
          compact
          title={t('Home.Renyan.projectLoadFailed')}
          actionLabel={t('Home.Renyan.retry')}
          onAction={loadDashboard}
        />
      )
    }
    if (!dashboard.metrics.projectName) {
      return <RenyanState type="empty" compact title={t('Home.Renyan.noProject')} />
    }

    return (
      <div className={styles['metric-content']}>
        <div className={styles['project-name']}>{dashboard.metrics.projectName}</div>
        <div className={styles['metric-detail']}>
          <span>{t('Home.Renyan.projectStorage')}</span>
          <strong>{dashboard.metrics.projectFileSize || t('Home.Renyan.notReported')}</strong>
        </div>
      </div>
    )
  }

  const renderTrafficOverview = () => {
    if (dashboard.trafficStatus === 'loading') return <RenyanState type="loading" compact />
    if (dashboard.trafficStatus === 'error') {
      return (
        <RenyanState
          type="error"
          compact
          title={t('Home.Renyan.trafficLoadFailed')}
          actionLabel={t('Home.Renyan.retry')}
          onAction={loadDashboard}
        />
      )
    }
    if (dashboard.metrics.trafficTotal === 0) {
      return <RenyanState type="empty" compact title={t('Home.Renyan.noTraffic')} />
    }

    return (
      <div className={styles['metric-content']}>
        <div className={styles['metric-number']}>
          {dashboard.metrics.trafficTotal === null
            ? t('Home.Renyan.notReported')
            : new Intl.NumberFormat('zh-CN').format(dashboard.metrics.trafficTotal)}
        </div>
        <div className={styles['metric-detail']}>{t('Home.Renyan.trafficSource')}</div>
      </div>
    )
  }

  const renderRiskOverview = () => {
    if (dashboard.riskStatus === 'loading') return <RenyanState type="loading" compact />
    if (dashboard.riskStatus === 'error') {
      return (
        <RenyanState
          type="error"
          compact
          title={t('Home.Renyan.riskLoadFailed')}
          actionLabel={t('Home.Renyan.retry')}
          onAction={loadDashboard}
        />
      )
    }
    if (dashboard.metrics.riskTotal === 0) {
      return <RenyanState type="empty" compact title={t('Home.Renyan.noRisk')} />
    }

    return (
      <div className={styles['metric-content']}>
        <div className={styles['metric-number']}>
          {dashboard.metrics.riskTotal === null
            ? t('Home.Renyan.notReported')
            : new Intl.NumberFormat('zh-CN').format(dashboard.metrics.riskTotal)}
        </div>
        <div className={styles['risk-levels']}>
          {dashboard.metrics.riskLevels.map((item) => (
            <span key={item.key}>
              {item.label}
              <strong>{item.total}</strong>
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={styles['workbench']} data-testid="renyan-workbench">
      <section className={styles['workbench-hero']}>
        <div>
          <span className={styles['eyebrow']}>{t('Home.Renyan.commandCenter')}</span>
          <h2>{t('Home.Renyan.workbenchTitle')}</h2>
          <p>{t('Home.Renyan.workbenchDescription')}</p>
        </div>
        <YakitButton type="secondary2" icon={<OutlineRefreshIcon />} onClick={loadDashboard}>
          {t('Home.Renyan.refreshData')}
        </YakitButton>
      </section>

      <section className={styles['entry-section']} data-testid="renyan-traffic-entries">
        <div className={styles['section-heading']}>
          <div>
            <span>01</span>
            <h3>{t('Home.Renyan.trafficAnalysis')}</h3>
          </div>
          <p>{t('Home.Renyan.trafficAnalysisDescription')}</p>
        </div>
        {renderQuickEntries(trafficEntries)}
      </section>

      <section className={styles['entry-section']} data-testid="renyan-security-entries">
        <div className={styles['section-heading']}>
          <div>
            <span>02</span>
            <h3>{t('Home.Renyan.securityTesting')}</h3>
          </div>
          <p>{t('Home.Renyan.securityTestingDescription')}</p>
        </div>
        {renderQuickEntries(securityEntries)}
      </section>

      <section className={styles['overview-section']}>
        <div className={styles['section-heading']}>
          <div>
            <span>03</span>
            <h3>{t('Home.Renyan.workspaceOverview')}</h3>
          </div>
          <p>{t('Home.Renyan.workspaceOverviewDescription')}</p>
        </div>
        <div className={styles['overview-grid']}>
          <article className={styles['overview-card']} data-testid="renyan-project-overview">
            <div className={styles['card-heading']}>
              <span className={styles['card-icon']}>
                <OutlineDesktopcomputerIcon />
              </span>
              <div>
                <h4>{t('Home.Renyan.localProject')}</h4>
                <small>{t('Home.Renyan.currentProject')}</small>
              </div>
              <button type="button" onClick={() => emiter.emit('onUIOpSettingMenuSelect', 'changeProject')}>
                {t('Home.Renyan.manage')}
              </button>
            </div>
            {renderProjectOverview()}
          </article>

          <article className={styles['overview-card']} data-testid="renyan-traffic-overview">
            <div className={styles['card-heading']}>
              <span className={styles['card-icon']}>
                <OutlineDatabaseIcon />
              </span>
              <div>
                <h4>{t('Home.Renyan.trafficOverview')}</h4>
                <small>{t('Home.Renyan.currentProject')}</small>
              </div>
              <button type="button" onClick={() => openRoute(YakitRoute.DB_HTTPHistory)}>
                {t('Home.Renyan.view')}
              </button>
            </div>
            {renderTrafficOverview()}
          </article>

          <article className={styles['overview-card']} data-testid="renyan-risk-overview">
            <div className={styles['card-heading']}>
              <span className={styles['card-icon']}>
                <OutlineBugIcon />
              </span>
              <div>
                <h4>{t('Home.Renyan.riskOverview')}</h4>
                <small>{t('Home.Renyan.currentProject')}</small>
              </div>
              <button type="button" onClick={() => openRoute(YakitRoute.DB_Risk)}>
                {t('Home.Renyan.view')}
              </button>
            </div>
            {renderRiskOverview()}
          </article>

          <article className={styles['overview-card']} data-testid="renyan-engine-overview">
            <div className={styles['card-heading']}>
              <span className={styles['card-icon']}>
                <OutlineServerIcon />
              </span>
              <div>
                <h4>{t('Home.Renyan.engineStatus')}</h4>
                <small>{t('Home.Renyan.currentSession')}</small>
              </div>
              <button
                type="button"
                onClick={() => emiter.emit('onUIOpSettingMenuSelect', RENYAN_SHELL_EVENTS.openEngineUpdate)}
              >
                {t('Home.Renyan.engineUpdate')}
              </button>
            </div>
            <div className={styles['service-status']}>
              <OutlineStatusonlineIcon />
              <div>
                <strong>{t('Home.Renyan.engineConnected')}</strong>
                <span>{t('Home.Renyan.engineConnectedDescription')}</span>
              </div>
            </div>
          </article>

          <article className={styles['overview-card']} data-testid="renyan-team-overview">
            <div className={styles['card-heading']}>
              <span className={styles['card-icon']}>
                <OutlineUsersIcon />
              </span>
              <div>
                <h4>{t('Home.Renyan.teamService')}</h4>
                <small>{t('Home.Renyan.deliveryStatus')}</small>
              </div>
            </div>
            <RenyanState
              type="empty"
              compact
              title={t('Home.Renyan.teamPlanned')}
              description={t('Home.Renyan.teamPlannedDescription')}
            />
          </article>
        </div>
      </section>
    </div>
  )
}

export default Home
