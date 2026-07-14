import React, { useMemo } from 'react'
import { yakitLogs } from '@/utils/electronBridge'
import type { EngineLifecycleState } from '../../engineLifecycle'
import type { LoadingClickExtra, YakitStatusType, YaklangEngineMode } from '../../types'
import styles from './EngineLifecyclePanel.module.scss'

interface EngineLifecyclePanelProps {
  lifecycle: EngineLifecycleState
  yakitStatus: YakitStatusType
  logs: string[]
  busy: boolean
  buildInEngineVersion: string
  countdown: number
  onAction: (type: YaklangEngineMode | YakitStatusType, extra?: LoadingClickExtra) => void
  onManualInstall: () => void
}

const stateLabels: Record<EngineLifecycleState['state'], string> = {
  'checking-local': '检查本地环境',
  'ready-local': '本地引擎可用',
  'extracting-bundled': '提取预置引擎',
  missing: '需要选择引擎',
  incompatible: '引擎版本不兼容',
  'update-available': '发现推荐版本',
  downloading: '下载引擎',
  verifying: '验证文件',
  installing: '安装引擎',
  starting: '启动引擎',
  connected: '引擎已连接',
  remote: '远程引擎',
  error: '启动失败',
  'recoverable-error': '可恢复错误',
}

const missingStatuses: YakitStatusType[] = ['installNetWork', 'skipAgreement_InstallNetWork']
const errorStatuses: YakitStatusType[] = [
  'check_timeout',
  'start_timeout',
  'error',
  'allow-secret-error',
  'antivirus_blocked',
  'check_yak_version_error',
  'fix_database_error',
  'reclaimDatabaseSpace_error',
]

export const EngineLifecyclePanel: React.FC<EngineLifecyclePanelProps> = React.memo((props) => {
  const { lifecycle, yakitStatus, logs, busy, buildInEngineVersion, countdown, onAction, onManualInstall } = props
  const showMissingActions = missingStatuses.includes(yakitStatus) || lifecycle.state === 'missing'
  const showRecoveryActions =
    errorStatuses.includes(yakitStatus) ||
    yakitStatus === 'old_version' ||
    yakitStatus === 'skipAgreement_Install' ||
    lifecycle.state === 'incompatible' ||
    lifecycle.state === 'recoverable-error' ||
    lifecycle.state === 'error'

  const visibleLogs = useMemo(() => logs.filter(Boolean).slice(-4), [logs])

  const retry = () => {
    if (yakitStatus === 'database_error' || yakitStatus === 'fix_database_timeout') {
      onAction(yakitStatus)
      return
    }
    if (yakitStatus === 'port_occupied_prev' || yakitStatus === 'port_occupied') {
      onAction('check_timeout')
      return
    }
    if (yakitStatus === 'break') {
      onAction('break', { linkAgain: true })
      return
    }
    if (yakitStatus === 'start_timeout') {
      onAction('start_timeout')
      return
    }
    onAction('check_timeout')
  }

  return (
    <section className={styles['lifecycle-panel']} aria-live="polite">
      <header className={styles['lifecycle-header']}>
        <span className={styles['state-mark']} data-state={lifecycle.state} />
        <div>
          <div className={styles['state-label']}>{stateLabels[lifecycle.state]}</div>
          <div className={styles['state-message']}>{lifecycle.message}</div>
        </div>
      </header>

      {lifecycle.progress !== undefined && (
        <div className={styles['progress-block']}>
          <div className={styles['progress-track']}>
            <span style={{ width: `${lifecycle.progress}%` }} />
          </div>
          <span>{Math.round(lifecycle.progress)}%</span>
        </div>
      )}

      <div className={styles['step-list']}>
        {visibleLogs.length > 0 ? (
          visibleLogs.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)
        ) : (
          <div>等待引擎状态信息</div>
        )}
        {lifecycle.error && <div className={styles['error-message']}>{lifecycle.error}</div>}
      </div>

      <div className={styles['action-grid']}>
        {(showMissingActions || showRecoveryActions) && (
          <button
            type="button"
            className={styles['primary-action']}
            disabled={busy}
            onClick={() => onAction('installNetWork')}
          >
            安装引擎
          </button>
        )}
        {(showMissingActions || showRecoveryActions) && (
          <button type="button" disabled={busy} onClick={() => onAction('remote')}>
            选择远程引擎
          </button>
        )}
        {(showMissingActions || showRecoveryActions) && (
          <button type="button" disabled={busy} onClick={onManualInstall}>
            手工安装
          </button>
        )}
        {yakitStatus === 'old_version' && buildInEngineVersion && (
          <button
            type="button"
            className={styles['primary-action']}
            disabled={busy}
            onClick={() => onAction('install')}
          >
            使用预置引擎
          </button>
        )}
        {(showRecoveryActions || yakitStatus === 'break') && (
          <button type="button" className={styles['primary-action']} disabled={busy} onClick={retry}>
            重试启动
          </button>
        )}
        {(yakitStatus === 'database_error' || yakitStatus === 'fix_database_timeout') && (
          <button type="button" className={styles['primary-action']} disabled={busy} onClick={retry}>
            修复数据库
          </button>
        )}
        {yakitStatus === 'link_countdown' && (
          <>
            <button
              type="button"
              className={styles['primary-action']}
              onClick={() => onAction('link_countdown', { enterNow: true })}
            >
              立即进入（{countdown}）
            </button>
            <button type="button" onClick={() => onAction('link_countdown', { enterNow: false })}>
              取消
            </button>
          </>
        )}
        <button type="button" onClick={() => yakitLogs.openEngineLog()}>
          打开诊断日志
        </button>
      </div>
    </section>
  )
})
