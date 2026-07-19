import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { YakitRoute } from '@/enums/yakitRoute'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import emiter from '@/utils/eventBus/eventBus'
import { getEnvTypeByProjects } from '../softwareSettings/ProjectManage'
import type { ProjectDescription } from '../softwareSettings/ProjectManage'
import type { HTTPFlow, YakQueryHTTPFlowResponse } from '@/components/HTTPFlowTable/HTTPFlowTable'
import type { Fields } from '../risks/RiskTable'
import type { HybridScanTask } from '@/models/HybridScan'
import type { QueryHybridScanTaskResponse } from '../plugins/pluginBatchExecutor/utils'
import { RENYAN_SHELL_EVENTS } from '@/routes/renyanMenu'
import {
  RuiYanButton,
  RuiYanCard,
  RuiYanEmptyState,
  RuiYanErrorState,
  RuiYanIcon,
  RuiYanLoadingState,
  RuiYanStatusBadge,
} from '@/components/renyanUI'
import { buildRenyanTrafficTrend, mapRenyanHomeMetrics, type RenyanHomeMetricSnapshot } from './homeMetrics'
import styles from './home.module.scss'

const { ipcRenderer } = window.require('electron')

type QueryStatus = 'loading' | 'ready' | 'error'

interface DashboardState {
  metrics: RenyanHomeMetricSnapshot
  trafficSamples: HTTPFlow[]
  recentTasks: HybridScanTask[]
  projectStatus: QueryStatus
  trafficStatus: QueryStatus
  riskStatus: QueryStatus
  taskStatus: QueryStatus
}

const EMPTY_METRICS = mapRenyanHomeMetrics({})

const taskStatusPresentation: Record<
  HybridScanTask['Status'],
  { label: string; tone: 'info' | 'warning' | 'success' | 'danger' }
> = {
  executing: { label: '执行中', tone: 'info' },
  paused: { label: '已暂停', tone: 'warning' },
  done: { label: '已结束', tone: 'success' },
  error: { label: '异常', tone: 'danger' },
}

const formatTaskTime = (timestamp: number) => {
  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '时间未报告'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(milliseconds)
}

const Home: React.FC = () => {
  const { t } = useI18nNamespaces(['home'])
  const requestIdRef = useRef(0)
  const [dashboard, setDashboard] = useState<DashboardState>({
    metrics: EMPTY_METRICS,
    trafficSamples: [],
    recentTasks: [],
    projectStatus: 'loading',
    trafficStatus: 'loading',
    riskStatus: 'loading',
    taskStatus: 'loading',
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
      taskStatus: 'loading',
    }))

    const [projectResult, trafficResult, riskResult, taskResult] = await Promise.allSettled([
      ipcRenderer.invoke('GetCurrentProjectEx', { Type: getEnvTypeByProjects() }) as Promise<ProjectDescription>,
      ipcRenderer.invoke('QueryHTTPFlows', {
        SourceType: 'mitm,scan,basic-crawler',
        WithPayload: false,
        Pagination: {
          Page: 1,
          Limit: 240,
          Order: 'desc',
          OrderBy: 'Id',
        },
      }) as Promise<YakQueryHTTPFlowResponse>,
      ipcRenderer.invoke('QueryAvailableRiskLevel', {}) as Promise<Fields>,
      ipcRenderer.invoke('QueryHybridScanTask', {
        Pagination: {
          Page: 1,
          Limit: 5,
          Order: 'desc',
          OrderBy: 'updated_at',
        },
        Filter: {},
      }) as Promise<QueryHybridScanTaskResponse>,
    ])

    if (requestIdRef.current !== requestId) return

    const project = projectResult.status === 'fulfilled' ? projectResult.value : null
    const trafficTotal = trafficResult.status === 'fulfilled' ? trafficResult.value.Total : undefined
    const riskLevels = riskResult.status === 'fulfilled' ? riskResult.value.Values : null
    const trafficSamples = trafficResult.status === 'fulfilled' ? trafficResult.value.Data || [] : []
    const recentTasks = taskResult.status === 'fulfilled' ? taskResult.value.Data || [] : []

    setDashboard({
      metrics: mapRenyanHomeMetrics({ project, trafficTotal, riskLevels }),
      trafficSamples,
      recentTasks,
      projectStatus: projectResult.status === 'fulfilled' ? 'ready' : 'error',
      trafficStatus: trafficResult.status === 'fulfilled' ? 'ready' : 'error',
      riskStatus: riskResult.status === 'fulfilled' ? 'ready' : 'error',
      taskStatus: taskResult.status === 'fulfilled' ? 'ready' : 'error',
    })
  }, [])

  useEffect(() => {
    loadDashboard()
    return () => {
      requestIdRef.current += 1
    }
  }, [loadDashboard])

  const trafficTrend = useMemo(() => buildRenyanTrafficTrend(dashboard.trafficSamples), [dashboard.trafficSamples])
  const trafficTrendMaximum = Math.max(1, ...trafficTrend.map((item) => item.total))

  const renderProjectOverview = () => {
    if (dashboard.projectStatus === 'loading') return <RuiYanLoadingState compact title="项目读取中" />
    if (dashboard.projectStatus === 'error') {
      return (
        <RuiYanErrorState
          compact
          title={t('Home.Renyan.projectLoadFailed')}
          action={
            <RuiYanButton size="small" onClick={loadDashboard}>
              {t('Home.Renyan.retry')}
            </RuiYanButton>
          }
        />
      )
    }
    if (!dashboard.metrics.projectName) {
      return <RuiYanEmptyState compact title={t('Home.Renyan.noProject')} />
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
    if (dashboard.trafficStatus === 'loading') return <RuiYanLoadingState compact title="流量读取中" />
    if (dashboard.trafficStatus === 'error') {
      return (
        <RuiYanErrorState
          compact
          title={t('Home.Renyan.trafficLoadFailed')}
          action={
            <RuiYanButton size="small" onClick={loadDashboard}>
              {t('Home.Renyan.retry')}
            </RuiYanButton>
          }
        />
      )
    }
    if (dashboard.metrics.trafficTotal === 0) {
      return <RuiYanEmptyState compact title={t('Home.Renyan.noTraffic')} />
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
    if (dashboard.riskStatus === 'loading') return <RuiYanLoadingState compact title="风险读取中" />
    if (dashboard.riskStatus === 'error') {
      return (
        <RuiYanErrorState
          compact
          title={t('Home.Renyan.riskLoadFailed')}
          action={
            <RuiYanButton size="small" onClick={loadDashboard}>
              {t('Home.Renyan.retry')}
            </RuiYanButton>
          }
        />
      )
    }
    if (dashboard.metrics.riskTotal === 0) {
      return <RuiYanEmptyState compact title={t('Home.Renyan.noRisk')} />
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

  const renderTaskOverview = () => {
    if (dashboard.taskStatus === 'loading') return <RuiYanLoadingState compact title="任务读取中" />
    if (dashboard.taskStatus === 'error') {
      return (
        <RuiYanErrorState
          compact
          title="最近任务读取失败"
          action={
            <RuiYanButton size="small" onClick={loadDashboard}>
              {t('Home.Renyan.retry')}
            </RuiYanButton>
          }
        />
      )
    }
    if (dashboard.recentTasks.length === 0) {
      return <RuiYanEmptyState compact title="暂无检测任务" />
    }

    const latestTask = dashboard.recentTasks[0]
    const latestStatus = taskStatusPresentation[latestTask.Status] || taskStatusPresentation.error

    return (
      <div className={styles['metric-content']}>
        <div className={styles['metric-number']}>{dashboard.recentTasks.length}</div>
        <div className={styles['metric-detail']}>
          <span>最近记录，最多五条</span>
          <strong>{latestStatus.label}</strong>
        </div>
        <div className={styles['metric-detail']}>
          <span>最近更新时间</span>
          <strong>{formatTaskTime(latestTask.UpdatedAt || latestTask.CreatedAt)}</strong>
        </div>
      </div>
    )
  }

  return (
    <div className={styles['workbench']} data-testid="renyan-workbench">
      <header className={styles['workbench-header']}>
        <div>
          <h2>{t('Home.Renyan.workbenchTitle')}</h2>
          <p>{t('Home.Renyan.workbenchDescription')}</p>
        </div>
        <div className={styles['header-actions']}>
          <RuiYanButton
            variant="secondary"
            icon={<RuiYanIcon name="environment" />}
            onClick={() => emiter.emit('onUIOpSettingMenuSelect', RENYAN_SHELL_EVENTS.openEngineUpdate)}
          >
            引擎与更新
          </RuiYanButton>
          <RuiYanButton variant="ghost" onClick={loadDashboard}>
            {t('Home.Renyan.refreshData')}
          </RuiYanButton>
        </div>
      </header>

      <section className={styles['kpi-section']}>
        <div className={styles['section-heading']}>
          <div>
            <h3>{t('Home.Renyan.workspaceOverview')}</h3>
            <p>{t('Home.Renyan.workspaceOverviewDescription')}</p>
          </div>
        </div>
        <div className={styles['kpi-grid']}>
          <RuiYanCard className={styles['kpi-card']} data-testid="renyan-project-overview">
            <div className={styles['card-heading']}>
              <span className={styles['card-icon']}>
                <RuiYanIcon name="project" />
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
          </RuiYanCard>

          <RuiYanCard className={styles['kpi-card']} data-testid="renyan-traffic-overview">
            <div className={styles['card-heading']}>
              <span className={styles['card-icon']}>
                <RuiYanIcon name="traffic" />
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
          </RuiYanCard>

          <RuiYanCard className={styles['kpi-card']} data-testid="renyan-risk-overview">
            <div className={styles['card-heading']}>
              <span className={styles['card-icon']}>
                <RuiYanIcon name="vulnerability" />
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
          </RuiYanCard>

          <RuiYanCard className={styles['kpi-card']} data-testid="renyan-task-overview">
            <div className={styles['card-heading']}>
              <span className={styles['card-icon']}>
                <RuiYanIcon name="project" />
              </span>
              <div>
                <h4>近期任务</h4>
                <small>本地检测记录</small>
              </div>
              <button type="button" onClick={() => openRoute(YakitRoute.BatchExecutorPage)}>
                查看检测
              </button>
            </div>
            {renderTaskOverview()}
          </RuiYanCard>
        </div>
      </section>

      <section className={styles['insight-grid']}>
        <RuiYanCard className={styles['insight-card']}>
          <div className={styles['insight-heading']}>
            <div>
              <h3>最近七日流量趋势</h3>
              <small>按流量创建日期统计，最多读取二百四十条真实样本</small>
            </div>
            <RuiYanStatusBadge tone="info">样本 {dashboard.trafficSamples.length}</RuiYanStatusBadge>
          </div>
          {dashboard.trafficStatus === 'loading' ? (
            <RuiYanLoadingState compact title="流量样本读取中" />
          ) : dashboard.trafficStatus === 'error' ? (
            <RuiYanErrorState compact title="流量趋势读取失败" />
          ) : dashboard.trafficSamples.length === 0 ? (
            <RuiYanEmptyState compact title="暂无流量趋势" description="当前项目没有可统计的流量样本。" />
          ) : (
            <div className={styles['trend-chart']} role="img" aria-label="最近七日流量趋势">
              {trafficTrend.map((item) => (
                <div className={styles['trend-column']} key={item.key}>
                  <span>{item.total}</span>
                  <div className={styles['trend-track']}>
                    <i style={{ height: `${(item.total / trafficTrendMaximum) * 100}%` }} />
                  </div>
                  <small>{item.label}</small>
                </div>
              ))}
            </div>
          )}
        </RuiYanCard>

        <RuiYanCard className={styles['insight-card']}>
          <div className={styles['insight-heading']}>
            <div>
              <h3>风险分布</h3>
              <small>来自当前项目已报告的真实风险等级</small>
            </div>
            {dashboard.metrics.riskTotal !== null && (
              <RuiYanStatusBadge tone="warning">合计 {dashboard.metrics.riskTotal}</RuiYanStatusBadge>
            )}
          </div>
          {dashboard.riskStatus === 'loading' ? (
            <RuiYanLoadingState compact title="风险统计读取中" />
          ) : dashboard.riskStatus === 'error' ? (
            <RuiYanErrorState compact title="风险分布读取失败" />
          ) : dashboard.metrics.riskLevels.length === 0 ? (
            <RuiYanEmptyState compact title="暂无风险分布" description="当前项目没有已报告的风险等级。" />
          ) : (
            <div className={styles['risk-distribution']}>
              {dashboard.metrics.riskLevels.map((item) => {
                const ratio = dashboard.metrics.riskTotal ? item.total / dashboard.metrics.riskTotal : 0
                return (
                  <div className={styles['risk-distribution-item']} key={item.key}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.total}</span>
                    </div>
                    <div className={styles['risk-distribution-track']}>
                      <i style={{ width: `${ratio * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </RuiYanCard>
      </section>

      <section className={styles['activity-section']}>
        <div className={styles['section-heading']}>
          <div>
            <h3>任务与团队动态</h3>
            <p>任务来自本地检测记录，团队区域不生成模拟活动</p>
          </div>
        </div>
        <div className={styles['activity-grid']}>
          <RuiYanCard className={styles['activity-card']}>
            <div className={styles['insight-heading']}>
              <div>
                <h4>最近任务</h4>
                <small>混合检测任务最近更新时间</small>
              </div>
              <RuiYanButton variant="ghost" size="small" onClick={() => openRoute(YakitRoute.BatchExecutorPage)}>
                查看检测
              </RuiYanButton>
            </div>
            {dashboard.taskStatus === 'loading' ? (
              <RuiYanLoadingState compact title="任务读取中" />
            ) : dashboard.taskStatus === 'error' ? (
              <RuiYanErrorState
                compact
                title="最近任务读取失败"
                action={
                  <RuiYanButton size="small" onClick={loadDashboard}>
                    {t('Home.Renyan.retry')}
                  </RuiYanButton>
                }
              />
            ) : dashboard.recentTasks.length === 0 ? (
              <RuiYanEmptyState compact title="暂无检测任务" description="本地任务库没有可展示的检测记录。" />
            ) : (
              <ul className={styles['task-list']}>
                {dashboard.recentTasks.map((task) => {
                  const status = taskStatusPresentation[task.Status] || taskStatusPresentation.error
                  return (
                    <li key={task.TaskId || task.Id}>
                      <div className={styles['task-copy']}>
                        <strong>{task.FirstTarget || '目标未报告'}</strong>
                        <small>{task.TaskId || `任务 ${task.Id}`}</small>
                      </div>
                      <div className={styles['task-progress']}>
                        <span>
                          {task.FinishedTasks}/{task.TotalTasks}
                        </span>
                        <small>{formatTaskTime(task.UpdatedAt || task.CreatedAt)}</small>
                      </div>
                      <RuiYanStatusBadge tone={status.tone}>{status.label}</RuiYanStatusBadge>
                    </li>
                  )
                })}
              </ul>
            )}
          </RuiYanCard>

          <RuiYanCard className={styles['activity-card']}>
            <div className={styles['insight-heading']}>
              <div>
                <h4>团队动态</h4>
                <small>外部协作服务数据边界</small>
              </div>
            </div>
            <RuiYanEmptyState
              compact
              title="暂无可验证的团队动态"
              description="当前外部服务未提供团队动态查询契约，界面不生成固定活动记录。"
              action={
                <RuiYanButton
                  variant="secondary"
                  size="small"
                  onClick={() => emiter.emit('onUIOpSettingMenuSelect', 'store')}
                >
                  服务连接
                </RuiYanButton>
              }
            />
          </RuiYanCard>
        </div>
      </section>
    </div>
  )
}

export default Home
