import React from 'react'
import classNames from 'classnames'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import styles from './RenyanStatusBar.module.scss'
import { RenyanTaskCenter } from './RenyanTaskCenter'

interface RenyanStatusBarProps {
  engineLink: boolean
  projectName?: string
  teamConnected: boolean
}

export const RenyanStatusBar: React.FC<RenyanStatusBarProps> = React.memo((props) => {
  const { engineLink, projectName, teamConnected } = props
  const { t } = useI18nNamespaces(['layout'])

  return (
    <footer className={styles['status-bar']} data-testid="renyan-status-bar">
      <div className={styles['status-group']}>
        <span
          className={classNames(styles['status-dot'], {
            [styles['status-dot-online']]: engineLink,
            [styles['status-dot-offline']]: !engineLink,
          })}
        />
        <span>{engineLink ? t('Layout.RenyanShell.engineConnected') : t('Layout.RenyanShell.engineOffline')}</span>
      </div>
      <div className={styles['status-divider']} />
      <div className={styles['status-group']}>
        <span className={styles['status-label']}>当前项目</span>
        <strong>{projectName || '未选择'}</strong>
      </div>
      <div className={styles['status-divider']} />
      <div className={styles['status-group']}>
        <span className={styles['status-label']}>{t('Layout.RenyanShell.teamService')}</span>
        <strong className={classNames({ [styles['team-connected']]: teamConnected })}>
          {teamConnected ? '已登录' : '未登录'}
        </strong>
      </div>
      <span className={styles['status-spacer']} />
      <RenyanTaskCenter enabled={teamConnected} />
    </footer>
  )
})
